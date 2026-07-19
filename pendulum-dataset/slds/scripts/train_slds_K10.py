"""Train rSLDS (K=10) via EM on energy-stratified 100 trajectories.

The rSLDS extends rAR-HMM by adding an observation layer:
  y_t = C x_t + noise,  C = [1, 0]  (observe theta only)
  x_t = (theta_t, omega_t/omega0) is latent
  omega is inferred via Kalman smoother

Usage (PowerShell):
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.train_slds_K10
"""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from slds.config import Config
from slds.data import load_split
from slds.train_vi import fit_vi


def stratified_subset(trajs, target_n: int, seed: int):
    """Return a stratified subset of `trajs` of size ~target_n."""
    rng = np.random.default_rng(seed)
    by_E = defaultdict(list)
    for i, tr in enumerate(trajs):
        by_E[round(tr.E_bar, 6)].append(i)

    picked, pool = [], []
    for E, idxs in by_E.items():
        idxs = list(idxs)
        rng.shuffle(idxs)
        picked.append(idxs[0])
        pool.extend(idxs[1:])

    n_bins = len(by_E)
    if target_n < n_bins:
        rng.shuffle(picked)
        picked = picked[:target_n]
    else:
        remainder = target_n - n_bins
        if remainder > 0:
            rng.shuffle(pool)
            picked.extend(pool[:remainder])

    picked.sort(key=lambda i: trajs[i].E_bar)
    return [trajs[i] for i in picked]


def main():
    DATA_ROOT = r"d:\intuitive physics\pendulum_dataset\data\pendulum"
    RUN_DIR = r"runs\K10_slds_vi"
    TARGET_N = 100
    SEED = 20260518

    # ---------- Config ----------
    cfg = Config(
        K=10,
        obs_repr="theta_omega",
        recurrence_mode="ro",
        ar_lag=1,
        obs_noise_scale=0.01,       # initial observation noise (will be learned)
        kalman_init_omega_var=10.0,  # initial omega uncertainty
        init_seed=SEED,
        out_dir=RUN_DIR,
    )
    print(f"[cfg] K={cfg.K}, obs_repr={cfg.obs_repr}, mode={cfg.recurrence_mode}")
    print(f"[cfg] obs_noise_scale={cfg.obs_noise_scale}, "
          f"kalman_init_omega_var={cfg.kalman_init_omega_var}")

    # ---------- Load data ----------
    print("\n[data] Loading full training split...")
    trajs_all = load_split(DATA_ROOT, "train", cfg, max_trajs=None)
    print(f"[data] Full train split: {len(trajs_all)} trajectories")

    # ---------- Regime stats ----------
    by_reg = defaultdict(int)
    for t in trajs_all:
        by_reg[t.regime] += 1
    print(f"[data] Regime counts (full): {dict(by_reg)}")

    # ---------- Stratified subset ----------
    trajs = stratified_subset(trajs_all, TARGET_N, seed=SEED)
    print(f"\n[strat] Selected {len(trajs)} trajectories "
          f"({sum(t.x.shape[0] for t in trajs)} time-points) covering "
          f"{len({round(t.E_bar, 6) for t in trajs})} unique energy bins")

    by_reg = defaultdict(int)
    for t in trajs:
        by_reg[t.regime] += 1
    print(f"[strat] Regime counts: {dict(by_reg)}")

    # ---------- Show initial x estimate quality ----------
    omega_rmse = []
    for tr in trajs[:5]:
        if tr.x_true.shape[1] >= 2:
            err = np.sqrt(np.mean((tr.x[:, 1] - tr.x_true[:, 1]) ** 2))
            omega_rmse.append(err)
            print(f"  [{tr.id}] initial omega RMSE = {err:.4f} "
                  f"(true range [{tr.x_true[:,1].min():.2f}, {tr.x_true[:,1].max():.2f}])")
    if omega_rmse:
        print(f"  Mean initial omega RMSE = {np.mean(omega_rmse):.4f}")

    # ---------- Train ----------
    print("\n" + "="*60)
    print("  TRAINING rSLDS (K=10) via EM")
    print("  Observation: y_t = theta_t only (omega latent)")
    print("="*60)
    ckpt = fit_vi(
        cfg, trajs,
        n_em_iter=100,
        n_r_steps=100,
        r_lr=0.01,
        verbose=True,
    )

    # ---------- Post-training diagnostics ----------
    print("\n" + "="*60)
    print("  POST-TRAINING DIAGNOSTICS")
    print("="*60)

    p = ckpt["samples"][-1]
    print(f"\n[result] Learned observation noise S = {p.S[0,0]:.8f}")

    # Check inferred omega quality
    omega_rmse_post = []
    for tr in trajs[:5]:
        if tr.x_true.shape[1] >= 2:
            err = np.sqrt(np.mean((tr.x[:, 1] - tr.x_true[:, 1]) ** 2))
            omega_rmse_post.append(err)
            print(f"  [{tr.id}] post-training omega RMSE = {err:.4f}")
    if omega_rmse_post:
        print(f"  Mean post-training omega RMSE = {np.mean(omega_rmse_post):.4f}")

    # State usage
    z_last = ckpt["z_last"]
    all_z = np.concatenate([z for z in z_last if len(z) > 0])
    from collections import Counter
    counts = Counter(all_z.tolist())
    print(f"\n[result] State distribution:")
    for k in range(cfg.K):
        pct = counts.get(k, 0) / len(all_z) * 100
        print(f"  State {k}: {pct:.1f}% ({counts.get(k, 0)} time-points)")

    # A matrices
    print(f"\n[result] A matrix spectral radii:")
    for k in range(cfg.K):
        A_k = p.A[k, :, :2]
        evals = np.linalg.eigvals(A_k)
        sr = max(abs(evals))
        print(f"  State {k}: spectral_radius = {sr:.4f}")

    print(f"\n[done] Output directory: {Path(RUN_DIR).resolve()}")
    out_dir = Path(RUN_DIR)
    if out_dir.exists():
        for f in sorted(out_dir.iterdir()):
            print(f"  {f.name}  ({f.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
