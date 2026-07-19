"""All hyper-parameters of the rSLDS live here.

Extends the rAR-HMM Config with observation-layer parameters:
  - obs_noise_scale: initial observation noise variance (learned during EM)
  - C = [1, 0]: only theta is observed, omega is latent
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Literal
import json
from pathlib import Path


@dataclass
class Config:
    # ---------- structural ----------
    K: int = 5                                  # number of discrete states (main HP)
    obs_repr: Literal["theta_omega", "sincos_omega"] = "theta_omega"
    #   "theta_omega"   ->  x_t = (theta, omega/omega0),         M = 2
    #   "sincos_omega"  ->  x_t = (sin(theta), cos(theta), omega/omega0), M = 3
    ar_lag: int = 1                              # AR order P (paper uses 1)
    recurrence_mode: Literal["full", "shared", "ro"] = "ro"
    #   "full"   ->  nu_{t+1} = R_{z_t} x_t + r_{z_t}      (per-state R)
    #   "shared" ->  nu_{t+1} = R x_t + r_{z_t}            (shared R)
    #   "ro"     ->  nu_{t+1} = R x_t + r                  (recurrence-only, paper Fig. 1)
    include_lagged_z_in_recurrence: bool = False  # add z_t one-hot to R input (rarely needed)

    # ---------- observation layer (SLDS extension) ----------
    # C = [1, 0]: observe theta only, omega is latent
    # y_t = C x_t + e,  e ~ N(0, S),  S is learned
    obs_noise_scale: float = 0.01     # initial diagonal scale of S (learned during EM)
    kalman_init_omega_var: float = 10.0  # initial variance for latent omega in Kalman filter

    # ---------- physics constants (mirror docs/pendulum-dataset-spec.md) ----------
    g: float = 9.8
    L: float = 1.0
    dt: float = 0.05                              # data sample step (s)

    # ---------- MNIW prior on dynamics (A_k, b_k), Q_k ----------
    nu_dyn: float = None         # IW dof; default = M + 2 (set in __post_init__)
    psi_dyn_scale: float = 1e-2  # diagonal scale of IW scale matrix Psi_dyn = psi * I_M
    M_dyn_bias_init: float = 0.0 # mean of bias b_k in matrix-normal prior
    K_dyn_eye_scale: float = 1.0 # diagonal scale of input-covariance K_dyn = K * I_{M*P+1}
    spectral_radius_target: float = 0.95  # bias A_k init toward ||A_k|| < 1

    # ---------- MNIW prior on recurrence (R_k, r_k) ----------
    #   nu_t+1 in R^{K-1}; regressor is [x_t (; one_hot(z_t)?)] in R^{D_rec}
    nu_rec: float = None          # default = (K-1) + 2
    psi_rec_scale: float = 1.0
    M_rec_bias_init: float = 0.0  # bias r so that states are equiprobable in expectation
    K_rec_eye_scale: float = 1e-4 # weaker prior on R (officially sigmasq_A=10000 in nascar.py)

    # ---------- Stickiness prior (mirrors official `StickyInputHMMTransitions`) ----------
    stickiness_kappa: float = 0.0
    sigmasq_stickiness: float = 1.0

    # ---------- Polya-Gamma sampler ----------
    pg_backend: Literal["auto", "polyagamma", "devroye"] = "auto"
    pg_truncation: int = 200      # series truncation for Devroye fallback

    # ---------- initialization ----------
    init_kmeans_n_init: int = 10
    init_arhmm_em_iter: int = 30
    init_decision_list: bool = True
    init_seed: int = 20260518
    use_empirical_priors: bool = True

    # ---------- Gibbs sampling ----------
    n_iter: int = 1000
    n_burnin: int = 300
    n_thin: int = 2
    n_chains: int = 1
    log_every: int = 25
    n_warmup_dyn: int = 100
    n_warmup_trans: int = 100

    # ---------- numerical stability ----------
    Q_jitter: float = 1e-6
    pg_clip_nu_abs: float = 50.0

    # ---------- posterior predictive ----------
    rollout_horizon: int = 600
    rollout_n_samples: int = 32

    # ---------- IO ----------
    out_dir: str = "runs/default"

    def __post_init__(self):
        M = 2 if self.obs_repr == "theta_omega" else 3
        if self.nu_dyn is None:
            self.nu_dyn = float(M + 2)
        if self.nu_rec is None:
            self.nu_rec = float(max(self.K - 1, 1) + 2)

    @property
    def obs_dim(self) -> int:
        """Dimension of latent state x_t."""
        return 2 if self.obs_repr == "theta_omega" else 3

    @property
    def obs_dim_y(self) -> int:
        """Dimension of observation y_t (= 1 for theta-only)."""
        return 1

    @property
    def omega0(self) -> float:
        import math
        return math.sqrt(self.g / self.L)

    # ---------- serialization ----------
    def save(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(asdict(self), f, indent=2)

    @classmethod
    def load(cls, path: str | Path) -> "Config":
        with open(path, "r", encoding="utf-8") as f:
            return cls(**json.load(f))
