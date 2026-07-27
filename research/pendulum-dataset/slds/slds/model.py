"""Parameter container, log-likelihoods, and forward simulation for rSLDS.

Extends the rAR-HMM ModelParams with:
  - C: observation matrix (D_obs, M), fixed at [[1, 0]] (observe theta only)
  - S: observation noise covariance (D_obs, D_obs), learned during EM
  - log_obs_likelihood: log N(y | Cx, S)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Tuple, List
import numpy as np

from .config import Config
from .stick_breaking import stick_breaking_log_probs


@dataclass
class ModelParams:
    """All parameters of an rSLDS (single sample / EM point estimate)."""
    K: int
    M: int                            # latent state dim (= obs_dim, e.g. 2)
    D_in_ar: int                      # M*P + 1
    D_in_rec: int                     # M  (+ K if include_lagged_z_in_recurrence)

    # AR dynamics:  x_t = A_k [x_{t-P..t-1}, 1] + e ;  e ~ N(0, Q_k)
    A: np.ndarray          # (K, M, D_in_ar)   includes bias column
    Q: np.ndarray          # (K, M, M)

    # Stick-breaking recurrence:  nu_{t+1} = R_k x_t + r_k
    R: np.ndarray          # (K, K-1, D_in_rec)
    r: np.ndarray          # (K, K-1)

    # Observation layer:  y_t = C x_t + e_obs ;  e_obs ~ N(0, S)
    C: np.ndarray          # (D_obs, M)  — fixed, e.g. [[1, 0]]
    S: np.ndarray          # (D_obs, D_obs) — learned observation noise

    mode: str = "ro"

    def AR_predict(self, x_lagged: np.ndarray, k: int) -> np.ndarray:
        """x_lagged: (..., D_in_ar) -> mean prediction (..., M)."""
        return x_lagged @ self.A[k].T

    def recurrence_logits(self, x: np.ndarray, z_prev: np.ndarray) -> np.ndarray:
        """nu_{t+1} = R_{z_t} x_t + r_{z_t}.  x:(T,M), z_prev:(T,) -> (T, K-1)."""
        T = x.shape[0]
        K_m1 = self.R.shape[1]
        out = np.empty((T, K_m1))
        if self.mode in ("shared", "ro"):
            R0 = self.R[0]
            out[:] = x @ R0.T
            if self.mode == "shared":
                out += self.r[z_prev]
            else:
                out += self.r[0]
        else:
            for t in range(T):
                k = int(z_prev[t])
                out[t] = self.R[k] @ x[t] + self.r[k]
        return out

    # ------ log-likelihood pieces ------
    def log_ar_likelihood(self, X_in: np.ndarray, X_out: np.ndarray) -> np.ndarray:
        """log N(X_out | A_k X_in, Q_k) for every (t, k).  Returns (N, K)."""
        N = X_in.shape[0]
        K = self.K
        out = np.empty((N, K))
        for k in range(K):
            mu = X_in @ self.A[k].T
            diff = X_out - mu
            try:
                L = np.linalg.cholesky(self.Q[k])
            except np.linalg.LinAlgError:
                L = np.linalg.cholesky(self.Q[k] + 1e-6 * np.eye(self.M))
            half_logdet = np.sum(np.log(np.diag(L)))
            sol = np.linalg.solve(L, diff.T)
            quad = np.sum(sol ** 2, axis=0)
            out[:, k] = -0.5 * quad - half_logdet - 0.5 * self.M * np.log(2 * np.pi)
        return out

    def log_obs_likelihood(self, y: np.ndarray, x: np.ndarray) -> np.ndarray:
        """log N(y_t | C x_t, S) for each time step.

        y : (T,) or (T, D_obs)  observations
        x : (T, M)              latent states

        Returns (T,)  scalar log-likelihood per time step.
        """
        T = x.shape[0]
        C = self.C                                # (D_obs, M)
        S = self.S                                # (D_obs, D_obs)
        D_obs = C.shape[0]

        # y_pred = C x  => (T, D_obs)
        y_pred = (C @ x.T).T                     # (T, D_obs)
        y_arr = np.atleast_2d(y).T if y.ndim == 1 else y  # (T, D_obs)
        if y_arr.shape[0] != T:
            y_arr = y_arr.T
        diff = y_arr - y_pred                     # (T, D_obs)

        try:
            L = np.linalg.cholesky(S)
        except np.linalg.LinAlgError:
            L = np.linalg.cholesky(S + 1e-10 * np.eye(D_obs))
        half_logdet = np.sum(np.log(np.diag(L)))
        sol = np.linalg.solve(L, diff.T)          # (D_obs, T)
        quad = np.sum(sol ** 2, axis=0)            # (T,)
        return -0.5 * quad - half_logdet - 0.5 * D_obs * np.log(2 * np.pi)

    def log_transition(self, x_t: np.ndarray, z_prev: np.ndarray) -> np.ndarray:
        """log p(z_{t+1}=k | z_t, x_t) via stick-breaking.  Returns (T, K)."""
        nu = self.recurrence_logits(x_t, z_prev)
        return stick_breaking_log_probs(nu)


class RecurrentSLDS:
    """Top-level model object.  Holds the *current* parameters."""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.params: ModelParams | None = None

    def init_random(self, rng: np.random.Generator) -> ModelParams:
        cfg = self.cfg
        M = cfg.obs_dim
        P = cfg.ar_lag
        D_in_ar = M * P + 1
        D_in_rec = M + (cfg.K if cfg.include_lagged_z_in_recurrence else 0)
        K = cfg.K

        # AR: identity-ish dynamics on the lag-1 slice + zero bias
        A = np.zeros((K, M, D_in_ar))
        for k in range(K):
            A[k, :M, :M] = cfg.spectral_radius_target * np.eye(M) \
                           + 0.05 * rng.standard_normal((M, M))
        Q = np.tile(0.05 * np.eye(M), (K, 1, 1))

        # Recurrence
        R = 0.1 * rng.standard_normal((K, K - 1, D_in_rec))
        r = np.zeros((K, K - 1))
        if cfg.recurrence_mode in ("shared", "ro"):
            R[:] = R[0]
            if cfg.recurrence_mode == "ro":
                r[:] = r[0]

        # Observation layer: C = [[1, 0]] (observe theta only)
        D_obs = cfg.obs_dim_y
        C = np.zeros((D_obs, M), dtype=np.float64)
        C[0, 0] = 1.0                            # observe theta
        S = cfg.obs_noise_scale * np.eye(D_obs, dtype=np.float64)

        self.params = ModelParams(
            K=K, M=M, D_in_ar=D_in_ar, D_in_rec=D_in_rec,
            A=A, Q=Q, R=R, r=r,
            C=C, S=S,
            mode=cfg.recurrence_mode,
        )
        return self.params

    def simulate(self, x0: np.ndarray, T: int, rng: np.random.Generator,
                 z0: int | None = None) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Roll out T steps starting from x0:(P, M).

        Returns (x:(P+T,M), z:(P+T,), y:(P+T, D_obs)).
        """
        assert self.params is not None
        p = self.params
        P = self.cfg.ar_lag
        M = self.cfg.obs_dim
        D_obs = p.C.shape[0]
        x = np.empty((P + T, M))
        z = np.empty(P + T, dtype=np.int64)
        y = np.empty((P + T, D_obs))
        x[:P] = x0
        z[:P] = 0 if z0 is None else z0
        for t in range(P, P + T):
            # transition
            nu = p.recurrence_logits(x[t - 1 : t], z[t - 1 : t])
            log_pi = stick_breaking_log_probs(nu)[0]
            log_pi -= log_pi.max()
            pi = np.exp(log_pi); pi /= pi.sum()
            z[t] = rng.choice(p.K, p=pi)
            # dynamics
            lagged = np.concatenate([x[t - k - 1] for k in range(P)] + [[1.0]])
            mu = p.A[z[t]] @ lagged
            try:
                L = np.linalg.cholesky(p.Q[z[t]])
            except np.linalg.LinAlgError:
                L = np.linalg.cholesky(p.Q[z[t]] + 1e-6 * np.eye(M))
            x[t] = mu + L @ rng.standard_normal(M)
        # observations
        for t in range(P + T):
            y[t] = p.C @ x[t] + np.linalg.cholesky(p.S) @ rng.standard_normal(D_obs)
        return x, z, y
