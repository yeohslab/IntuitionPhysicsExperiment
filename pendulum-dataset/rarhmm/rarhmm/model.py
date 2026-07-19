"""Parameter container, log-likelihoods, and forward simulation for rAR-HMM."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Tuple, List
import numpy as np

from .config import Config
from .stick_breaking import stick_breaking_log_probs


@dataclass
class ModelParams:
    """All parameters of an rAR-HMM (single sample from posterior)."""
    K: int
    M: int                            # obs dim
    D_in_ar: int                      # M*P + 1
    D_in_rec: int                     # M  (+ K if include_lagged_z_in_recurrence)

    # AR dynamics:  x_t = A_k [x_{t-P..t-1}, 1] + e ;  e ~ N(0, Q_k)
    A: np.ndarray          # (K, M, D_in_ar)   includes bias column
    Q: np.ndarray          # (K, M, M)

    # Stick-breaking recurrence:  nu_{t+1} = R_k x_t + r_k   (R_k may be shared)
    #   stored densely as (K, K-1, D_in_rec) for uniformity; when recurrence_mode
    #   is "shared" or "ro" the K leading slices are identical (kept in sync).
    R: np.ndarray          # (K, K-1, D_in_rec)
    r: np.ndarray          # (K, K-1)

    mode: str = "ro"        # "full" | "shared" | "ro"

    def AR_predict(self, x_lagged: np.ndarray, k: int) -> np.ndarray:
        """x_lagged: (..., D_in_ar) -> mean prediction (..., M)."""
        return x_lagged @ self.A[k].T

    def recurrence_logits(self, x: np.ndarray, z_prev: np.ndarray) -> np.ndarray:
        """nu_{t+1} = R_{z_t} x_t + r_{z_t}.  x:(T,M), z_prev:(T,) -> (T, K-1)."""
        T = x.shape[0]
        K_m1 = self.R.shape[1]
        out = np.empty((T, K_m1))
        if self.mode in ("shared", "ro"):
            R0 = self.R[0]                                # (K-1, D_in_rec)
            out[:] = x @ R0.T
            if self.mode == "shared":
                out += self.r[z_prev]                     # per-state bias
            else:  # "ro"
                out += self.r[0]                          # single bias
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
            mu = X_in @ self.A[k].T                        # (N, M)
            diff = X_out - mu
            try:
                L = np.linalg.cholesky(self.Q[k])
            except np.linalg.LinAlgError:
                L = np.linalg.cholesky(self.Q[k] + 1e-6 * np.eye(self.M))
            # log det = 2 sum log diag(L)
            half_logdet = np.sum(np.log(np.diag(L)))
            sol = np.linalg.solve(L, diff.T)              # (M, N)
            quad = np.sum(sol ** 2, axis=0)
            out[:, k] = -0.5 * quad - half_logdet - 0.5 * self.M * np.log(2 * np.pi)
        return out

    def log_transition(self, x_t: np.ndarray, z_prev: np.ndarray) -> np.ndarray:
        """log p(z_{t+1}=k | z_t, x_t) via stick-breaking.  Returns (T, K)."""
        nu = self.recurrence_logits(x_t, z_prev)          # (T, K-1)
        return stick_breaking_log_probs(nu)


class RecurrentARHMM:
    """Top-level model object.  Holds the *current* sample of parameters."""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.params: ModelParams | None = None

    # ------------- initialization helpers -------------
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
            R[:] = R[0]                                    # shared R
            if cfg.recurrence_mode == "ro":
                r[:] = r[0]                                # single r

        self.params = ModelParams(K=K, M=M, D_in_ar=D_in_ar, D_in_rec=D_in_rec,
                                  A=A, Q=Q, R=R, r=r, mode=cfg.recurrence_mode)
        return self.params

    # ------------- forward simulation -------------
    def simulate(self, x0: np.ndarray, T: int, rng: np.random.Generator,
                 z0: int | None = None) -> Tuple[np.ndarray, np.ndarray]:
        """Roll out T steps starting from x0:(P, M).  Returns (x:(P+T,M), z:(P+T,))."""
        assert self.params is not None
        p = self.params
        P = self.cfg.ar_lag
        M = self.cfg.obs_dim
        x = np.empty((P + T, M))
        z = np.empty(P + T, dtype=np.int64)
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
        return x, z
