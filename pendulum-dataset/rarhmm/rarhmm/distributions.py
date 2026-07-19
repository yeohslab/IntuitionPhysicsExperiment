"""Sampling utilities for Polya-Gamma (PG) and posterior updates for
Matrix-Normal-Inverse-Wishart (MNIW) conjugate models.

These are the two ingredients that make Linderman 2016's Gibbs sampler closed-form.
"""
from __future__ import annotations

import numpy as np
from numpy.random import Generator
from scipy.linalg import cho_factor, cho_solve, solve_triangular
from scipy.stats import invwishart, matrix_normal


# ---------------------------------------------------------------------------
# Polya-Gamma sampling
# ---------------------------------------------------------------------------
try:
    from polyagamma import random_polyagamma as _pg_sample        # exact
    _HAS_PG = True
except Exception:                                                  # pragma: no cover
    _HAS_PG = False


def sample_pg(b: np.ndarray, c: np.ndarray, rng: Generator,
              backend: str = "auto", truncation: int = 200) -> np.ndarray:
    """Draw omega ~ PG(b, c) element-wise.  b, c have the same shape.

    Falls back to a finite-sum representation when the `polyagamma` package
    is unavailable:
        PG(b, c) = sum_{k=1..K_trunc} g_k / (2 pi^2 (k - 0.5)^2 + c^2 / 2),
        g_k ~ Gamma(b, 1).
    """
    b = np.asarray(b, dtype=np.float64)
    c = np.asarray(c, dtype=np.float64)
    use_exact = (backend == "polyagamma") or (backend == "auto" and _HAS_PG)
    if use_exact:
        return _pg_sample(b, c, random_state=rng).astype(np.float64)
    # fallback
    shape = b.shape
    K = truncation
    k = np.arange(1, K + 1, dtype=np.float64)
    denom = (2.0 * np.pi ** 2) * (k - 0.5) ** 2          # (K,)
    # broadcast to (..., K)
    denom = denom.reshape((1,) * b.ndim + (K,)) + (c ** 2 / 2.0)[..., None]
    g = rng.standard_gamma(shape=np.broadcast_to(b[..., None], b.shape + (K,)),
                           size=b.shape + (K,))
    return (g / denom).sum(axis=-1).reshape(shape)


# ---------------------------------------------------------------------------
# Matrix-Normal Inverse-Wishart conjugate update
# ---------------------------------------------------------------------------
#
# Likelihood :  Y_t = B X_t + noise,  noise ~ N(0, Sigma)
#               B in R^{D_out x D_in},  Sigma in R^{D_out x D_out}
# Prior      :  Sigma ~ IW(nu_0, Psi_0)
#               B | Sigma ~ MN(M_0, Sigma, V_0)        (rows ~ Sigma, cols ~ V_0)
# Posterior  :  Sigma ~ IW(nu_n, Psi_n)
#               B | Sigma ~ MN(M_n, Sigma, V_n)
# Sufficient stats:  S_xx = sum X X^T,  S_xy = sum X Y^T,  S_yy = sum Y Y^T

class MNIW:
    """Conjugate Matrix-Normal Inverse-Wishart posterior for B (D_out x D_in)
    and Sigma (D_out x D_out) of a multi-output linear regression Y = B X + e."""

    def __init__(self, D_in: int, D_out: int,
                 nu0: float, Psi0: np.ndarray, M0: np.ndarray, V0_inv: np.ndarray):
        self.D_in, self.D_out = D_in, D_out
        self.nu0 = float(nu0)
        self.Psi0 = np.asarray(Psi0, dtype=np.float64)
        self.M0 = np.asarray(M0, dtype=np.float64)
        self.V0_inv = np.asarray(V0_inv, dtype=np.float64)
        # cached prior natural-parameter pieces
        self._M0_V0inv = self.M0 @ self.V0_inv                          # D_out x D_in
        self._M0_V0inv_M0T = self._M0_V0inv @ self.M0.T                 # D_out x D_out

    @classmethod
    def isotropic(cls, D_in: int, D_out: int,
                  nu0: float, psi_scale: float,
                  M0_diag_value: float = 0.0,
                  V0_eye_scale: float = 1.0) -> "MNIW":
        Psi0 = psi_scale * np.eye(D_out)
        # default mean B = [a*I, 0]  if D_in >= D_out else just zeros
        M0 = np.zeros((D_out, D_in))
        for i in range(min(D_out, D_in)):
            M0[i, i] = M0_diag_value
        V0_inv = (1.0 / V0_eye_scale) * np.eye(D_in)
        return cls(D_in, D_out, nu0, Psi0, M0, V0_inv)

    # ---- posterior given sufficient statistics ----
    def posterior(self, S_xx: np.ndarray, S_xy: np.ndarray, S_yy: np.ndarray,
                  n: int):
        """Return (nu_n, Psi_n, M_n, V_n) given:
            S_xx = sum_t x_t x_t^T  (D_in, D_in)
            S_xy = sum_t x_t y_t^T  (D_in, D_out)
            S_yy = sum_t y_t y_t^T  (D_out, D_out)
        """
        Vn_inv = self.V0_inv + S_xx                                     # D_in x D_in
        # M_n = (M0 V0^{-1} + Y X^T) V_n  ; here S_xy.T = sum y x^T = Y X^T
        rhs = self._M0_V0inv + S_xy.T                                   # D_out x D_in
        # solve M_n Vn_inv = rhs  ->  M_n = rhs Vn_inv^{-1}.  Use Cholesky.
        try:
            L, low = cho_factor(Vn_inv, lower=True)
            Mn = cho_solve((L, low), rhs.T).T                           # D_out x D_in
            Vn = cho_solve((L, low), np.eye(self.D_in))
        except np.linalg.LinAlgError:                                    # pragma: no cover
            Vn = np.linalg.inv(Vn_inv + 1e-8 * np.eye(self.D_in))
            Mn = rhs @ Vn
        Psi_n = (self.Psi0 + S_yy + self._M0_V0inv_M0T - Mn @ Vn_inv @ Mn.T)
        Psi_n = 0.5 * (Psi_n + Psi_n.T)                                 # symmetrize
        nu_n = self.nu0 + n
        return nu_n, Psi_n, Mn, Vn

    # ---- sample from a posterior ----
    @staticmethod
    def sample(nu_n: float, Psi_n: np.ndarray, Mn: np.ndarray, Vn: np.ndarray,
               rng: Generator) -> tuple[np.ndarray, np.ndarray]:
        """Sample (B, Sigma) ~ MNIW posterior."""
        # Sigma ~ IW(nu_n, Psi_n)
        Sigma = invwishart.rvs(df=nu_n, scale=Psi_n, random_state=rng)
        Sigma = np.atleast_2d(Sigma)
        # B | Sigma ~ MN(Mn, Sigma, Vn)
        try:
            B = matrix_normal.rvs(mean=Mn, rowcov=Sigma, colcov=Vn, random_state=rng)
        except np.linalg.LinAlgError:                                   # pragma: no cover
            # Manual: B = Mn + chol(Sigma) @ Z @ chol(Vn)^T
            Lr = np.linalg.cholesky(Sigma + 1e-10 * np.eye(Sigma.shape[0]))
            Lc = np.linalg.cholesky(Vn    + 1e-10 * np.eye(Vn.shape[0]))
            Z = rng.standard_normal(Mn.shape)
            B = Mn + Lr @ Z @ Lc.T
        return np.atleast_2d(B), Sigma


# ---------------------------------------------------------------------------
# Sufficient-statistic accumulator weighted by responsibility
# ---------------------------------------------------------------------------
def weighted_suff_stats(X_in: np.ndarray, X_out: np.ndarray, w: np.ndarray):
    """X_in (N, D_in), X_out (N, D_out), w (N,)  -> (S_xx, S_xy, S_yy, n_eff)."""
    Xw = X_in * w[:, None]
    S_xx = Xw.T @ X_in
    S_xy = Xw.T @ X_out
    S_yy = (X_out * w[:, None]).T @ X_out
    return S_xx, S_xy, S_yy, float(w.sum())
