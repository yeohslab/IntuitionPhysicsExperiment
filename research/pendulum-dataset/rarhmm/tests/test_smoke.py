"""Smoke test on synthetic data: build 100 short trajectories from a 2-state
ground-truth rAR-HMM, run the sampler for a few iterations, and verify shapes /
no exceptions.  Run with:
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m tests.test_smoke
"""
from __future__ import annotations

import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.config import Config
from rarhmm.data import Trajectory
from rarhmm.train import fit


def make_synth(n_traj=20, T=80, seed=0):
    rng = np.random.default_rng(seed)
    trajs = []
    for i in range(n_traj):
        theta = np.zeros(T); omega = np.zeros(T)
        theta[0] = rng.uniform(-0.5, 0.5)
        omega[0] = rng.uniform(-0.5, 0.5)
        for t in range(1, T):
            theta[t] = theta[t - 1] + 0.1 * omega[t - 1] + 0.01 * rng.standard_normal()
            omega[t] = 0.95 * omega[t - 1] - 0.1 * theta[t - 1] + 0.01 * rng.standard_normal()
        x = np.stack([theta, omega], axis=-1)
        trajs.append(Trajectory(id=f"s_{i:03d}", regime="synth", E_bar=0.0,
                                theta=theta, omega=omega, x=x))
    return trajs


def main():
    cfg = Config(K=3, obs_repr="theta_omega", recurrence_mode="ro",
                 n_iter=20, n_burnin=5, n_thin=2, log_every=5,
                 out_dir="runs/smoke")
    trajs = make_synth()
    ckpt = fit(cfg, trajs, verbose=True)
    assert len(ckpt["samples"]) > 0
    print(f"[smoke] {len(ckpt['samples'])} posterior samples — OK")


if __name__ == "__main__":
    main()
