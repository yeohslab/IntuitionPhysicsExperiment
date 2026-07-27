"""Stick-breaking logistic transition with Polya-Gamma augmentation.

Following Linderman 2016 eq. (5)-(8):

    pi_SB(nu)_k =   sigma(nu_k)       if k = 1
                  + sigma(nu_k) * prod_{j<k} sigma(-nu_j)      for k = 2..K-1
                  + prod_{j<K-1} sigma(-nu_j)                  for k = K

PG augmentation gives, conditionally Gaussian likelihood for nu:

    p(z_{t+1}=k | nu_{t+1})  ~  prod_{j<=min(k,K-1)} sigma(nu_j)^{I[j=k]} sigma(-nu_j)^{I[j<k]}
                              = prod_j exp(kappa_j nu_j) sigma(nu_j)^{I[z>=j]}

    omega_{t,j} | z, nu  ~  PG( I[z_{t+1} >= j],  nu_{t+1, j} )
    kappa_{t,j}          =  I[z_{t+1} = j] - 0.5 * I[z_{t+1} >= j]

Conditional on omega, the data-log-likelihood is Gaussian in nu:
    log p(kappa | nu, omega) = -0.5 * omega * nu^2 + kappa * nu  + const
"""
from __future__ import annotations

import numpy as np


def stick_breaking_log_probs(nu: np.ndarray) -> np.ndarray:
    """nu : (..., K-1)  ->  log_pi : (..., K)  via stick-breaking logistic link."""
    # K=1 guard: only one state, probability is 1 → log(1) = 0
    if nu.shape[-1] == 0:
        return np.zeros(nu.shape[:-1] + (1,), dtype=np.float64)
    # log sigma(x)  = -log(1+exp(-x))  = -softplus(-x)
    # log sigma(-x) = -log(1+exp(x))   = -softplus(x)
    log_sig_pos = -np.logaddexp(0.0, -nu)         # log sigma(nu_j)
    log_sig_neg = -np.logaddexp(0.0,  nu)         # log sigma(-nu_j)
    # cumulative sum of log(1 - sigma(nu_j)) up to j-1
    cum_neg = np.cumsum(log_sig_neg, axis=-1)     # (..., K-1)
    # build log_pi
    K_minus_1 = nu.shape[-1]
    log_pi = np.empty(nu.shape[:-1] + (K_minus_1 + 1,), dtype=np.float64)
    log_pi[..., 0] = log_sig_pos[..., 0]
    if K_minus_1 > 1:
        log_pi[..., 1:K_minus_1] = log_sig_pos[..., 1:] + cum_neg[..., :-1]
    log_pi[..., K_minus_1] = cum_neg[..., -1]
    return log_pi


def stick_breaking_probs(nu: np.ndarray) -> np.ndarray:
    return np.exp(stick_breaking_log_probs(nu))


def pg_b_indicator(z_next: np.ndarray, K: int) -> np.ndarray:
    """b_{t,j} = I[z_{t+1} >= j+1]   for j = 0..K-2.  Returns (T, K-1) of {0.,1.}."""
    j = np.arange(K - 1)
    return (z_next[:, None] >= (j[None, :] + 1)).astype(np.float64)


def pg_kappa(z_next: np.ndarray, K: int) -> np.ndarray:
    """kappa_{t,j} = I[z_{t+1} = j+1] - 0.5 * I[z_{t+1} >= j+1]  (paper convention)."""
    j = np.arange(K - 1)
    eq  = (z_next[:, None] == (j[None, :] + 1)).astype(np.float64)
    geq = (z_next[:, None] >= (j[None, :] + 1)).astype(np.float64)
    return eq - 0.5 * geq


# Convention note: above the discrete state z_t takes values in {1..K}.  In the
# implementation we will keep z in {0..K-1}; the helper functions handle the
# shift internally (treat the j-th stick as the decision "z == j" vs "z > j").
def pg_b_indicator_zerobased(z_next: np.ndarray, K: int) -> np.ndarray:
    """z in {0..K-1}.  Stick j ∈ {0..K-2} fires whenever z >= j."""
    j = np.arange(K - 1)
    return (z_next[:, None] >= j[None, :]).astype(np.float64)


def pg_kappa_zerobased(z_next: np.ndarray, K: int) -> np.ndarray:
    j = np.arange(K - 1)
    eq  = (z_next[:, None] == j[None, :]).astype(np.float64)
    geq = (z_next[:, None] >= j[None, :]).astype(np.float64)
    return eq - 0.5 * geq
