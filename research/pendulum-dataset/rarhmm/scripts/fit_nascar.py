"""Train rAR-HMM on NASCAR data and compare with ground truth.

Usage:
    python scripts/fit_nascar.py
"""
from __future__ import annotations

import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.config import Config
from rarhmm.data import Trajectory
from rarhmm.train import fit


def load_nascar_as_trajectories(npz_path: str) -> list[Trajectory]:
    """Wrap NASCAR data as Trajectory objects for rarhmm."""
    data = np.load(npz_path)
    x = data["x"]  # (T, 2)
    # Treat the 2D data as "theta_omega" representation directly.
    # theta = x[:,0], omega = x[:,1], and x = np.column_stack([theta, omega])
    # (no omega0 normalization needed since this is synthetic data)
    traj = Trajectory(
        id="nascar",
        regime="synthetic",
        E_bar=0.0,
        theta=x[:, 0],
        omega=x[:, 1],
        x=x.astype(np.float64),
        split="train",
    )
    return [traj]


def main():
    npz_path = Path("runs/nascar/nascar_data.npz")
    if not npz_path.exists():
        print(f"ERROR: {npz_path} not found. Run gen_nascar.py first.")
        return

    trajs = load_nascar_as_trajectories(str(npz_path))
    print(f"Loaded NASCAR data: T={trajs[0].x.shape[0]}, D={trajs[0].x.shape[1]}")

    cfg = Config(
        K=4,
        obs_repr="theta_omega",  # 2D direct
        ar_lag=1,
        recurrence_mode="ro",    # recurrence-only (paper model)
        # Priors tuned for synthetic data
        nu_dyn=4.0,              # M + 2 = 2 + 2
        psi_dyn_scale=1e-3,      # small noise expected
        K_dyn_eye_scale=1.0,
        spectral_radius_target=0.95,
        nu_rec=5.0,              # K - 1 + 2 = 3 + 2
        psi_rec_scale=1.0,
        K_rec_eye_scale=1e-4,
        use_empirical_priors=True,
        # Gibbs sampler
        n_iter=500,
        n_burnin=200,
        n_thin=2,
        n_warmup_dyn=100,
        n_warmup_trans=100,
        log_every=50,
        init_seed=42,
        # Don't normalize omega by omega0 since this is synthetic
        g=9.8, L=1.0, dt=0.05,
        out_dir="runs/nascar",
    )

    print(f"Config: K={cfg.K}, n_iter={cfg.n_iter}, recurrence_mode={cfg.recurrence_mode}")
    ckpt = fit(cfg, trajs, verbose=True)

    # Quick accuracy check
    z_fit = ckpt["z_last"][0]  # state assignments for traj 0
    z_true = np.load(str(npz_path))["z_true"]

    # Find best permutation
    from scipy.optimize import linear_sum_assignment
    K = cfg.K
    overlap = np.zeros((K, K))
    for k1 in range(K):
        for k2 in range(K):
            overlap[k1, k2] = np.sum((z_fit == k1) & (z_true == k2))
    _, perm = linear_sum_assignment(-overlap)
    z_fit_perm = np.array([perm[z] for z in z_fit])
    acc = np.mean(z_fit_perm == z_true)
    print(f"\n[result] State recovery accuracy (after permutation): {acc:.4f}")
    print(f"  Permutation: fit -> true = {dict(enumerate(perm))}")


if __name__ == "__main__":
    main()
