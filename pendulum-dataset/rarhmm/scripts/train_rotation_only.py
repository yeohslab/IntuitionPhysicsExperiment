"""Train K=5 on ROTATION-ONLY trajectories, theta_omega representation.

Selects 100 trajectories from the rotation regime (E_bar ∈ [2.10, 4.00]),
stratified by energy bin, and trains a K=5 rAR-HMM.

After training, runs all 4 visualization scripts:
  1. viz_dynamics        - vector field + stick-breaking partition
  2. viz_trajectory      - training curve + true/inferred fields + colored traj
  3. viz_subspace_error  - per-point prediction error heatmap
  4. viz_rollout_gif     - animated rollout comparison

Usage:
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" scripts/train_rotation_only.py
"""
from __future__ import annotations
import sys, time, pickle, subprocess
from pathlib import Path
from collections import defaultdict
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.config import Config
from rarhmm.data import load_split
from rarhmm.train import fit

DATA_ROOT = r"d:\intuitive physics\pendulum_dataset\data\pendulum"
OUT_DIR = "runs/K5_rotation_theta"
PYTHON = r"C:\Users\tonyj\anaconda3\python.exe"
TARGET_N = 100


def stratified_rotation_sample(trajs, target_n, rng):
    """Sample rotation-only trajectories, stratified by energy bin."""
    # Filter to rotation regime only
    rot_trajs = [(i, tr) for i, tr in enumerate(trajs) if tr.regime == "rotation"]
    print(f"  Rotation trajectories available: {len(rot_trajs)}")

    # Group by energy bin
    by_E = defaultdict(list)
    for i, tr in rot_trajs:
        by_E[round(tr.E_bar, 6)].append(i)

    # Stratified: one per bin first, then fill
    picked = []
    pool = []
    for E, idxs in sorted(by_E.items()):
        idxs = list(idxs)
        rng.shuffle(idxs)
        picked.append(idxs[0])
        pool.extend(idxs[1:])

    n_bins = len(by_E)
    print(f"  Rotation energy bins: {n_bins}")
    print(f"  E_bar range: [{min(by_E):.3f}, {max(by_E):.3f}]")

    if target_n > n_bins:
        remainder = target_n - n_bins
        rng.shuffle(pool)
        picked.extend(pool[:remainder])

    picked.sort(key=lambda i: trajs[i].E_bar)
    selected = [trajs[i] for i in picked]
    print(f"  Selected: {len(selected)} trajectories")
    return selected


def main():
    rng = np.random.default_rng(20260526)

    # ---- Config ----
    cfg = Config(
        K=5,
        obs_repr="theta_omega",      # theta-omega representation
        ar_lag=1,
        recurrence_mode="ro",
        n_iter=100,
        n_burnin=40,
        n_thin=3,
        n_warmup_dyn=100,
        n_warmup_trans=100,
        init_seed=20260526,
        use_empirical_priors=True,
        log_every=10,
        out_dir=OUT_DIR,
    )
    print(f"[cfg] K={cfg.K}, obs_repr={cfg.obs_repr}, mode={cfg.recurrence_mode}")
    print(f"[cfg] n_iter={cfg.n_iter}, n_burnin={cfg.n_burnin}, n_thin={cfg.n_thin}")

    # ---- Load and filter data ----
    print("\n[data] Loading full training split...")
    all_trajs = load_split(DATA_ROOT, "train", cfg, max_trajs=None)
    print(f"  Total training trajectories: {len(all_trajs)}")

    # Count regimes
    regime_counts = defaultdict(int)
    for tr in all_trajs:
        regime_counts[tr.regime] += 1
    print(f"  Regime breakdown: {dict(regime_counts)}")

    # Stratified rotation sample
    print("\n[sample] Stratified rotation-only sampling...")
    trajs = stratified_rotation_sample(all_trajs, TARGET_N, rng)

    total_tp = sum(t.x.shape[0] for t in trajs)
    print(f"  Total time points: {total_tp:,}")

    # ---- Train ----
    print(f"\n{'='*60}")
    print(f"  TRAINING K={cfg.K} rAR-HMM (rotation-only, theta_omega)")
    print(f"{'='*60}")
    t0 = time.time()
    fit(cfg, trajs, verbose=True)
    print(f"\n[train] Completed in {time.time()-t0:.1f}s")

    # ---- Run all visualizations ----
    run_dir = OUT_DIR
    scripts_dir = Path(__file__).resolve().parent

    print(f"\n{'='*60}")
    print("  RUNNING VISUALIZATIONS")
    print(f"{'='*60}")

    # 1. viz_dynamics
    print("\n[viz] 1/4: viz_dynamics...")
    subprocess.run([
        PYTHON, "-m", "scripts.viz_dynamics",
        "--run", run_dir,
        "--omega-range", "-4.0", "4.0",
    ], cwd=str(scripts_dir.parent))

    # 2. viz_subspace_error (on rotation trajectories from test splits)
    print("\n[viz] 2/4: viz_subspace_error...")
    subprocess.run([
        PYTHON, "-m", "scripts.viz_subspace_error",
        "--run", run_dir,
        "--data-root", DATA_ROOT,
    ], cwd=str(scripts_dir.parent))

    # 3. viz_trajectory - pick 3 rotation trajectories from val
    print("\n[viz] 3/4: viz_trajectory (3 rotation trajectories)...")
    val_trajs = load_split(DATA_ROOT, "val", cfg)
    rot_val = [tr for tr in val_trajs if tr.regime == "rotation"]
    if len(rot_val) == 0:
        # fallback to test_energy_oos which has holdout rotation
        test_trajs = load_split(DATA_ROOT, "test_energy_oos", cfg)
        rot_val = [tr for tr in test_trajs if tr.regime == "rotation"]
        traj_split = "test_energy_oos"
    else:
        traj_split = "val"

    # Pick 3 spread across energy range
    rot_val.sort(key=lambda t: t.E_bar)
    if len(rot_val) >= 3:
        pick_indices = [0, len(rot_val)//2, len(rot_val)-1]
    else:
        pick_indices = list(range(len(rot_val)))

    traj_ids = [rot_val[i].id for i in pick_indices]
    for tid in traj_ids:
        print(f"  viz_trajectory for {tid}...")
        subprocess.run([
            PYTHON, "-m", "scripts.viz_trajectory",
            "--run", run_dir,
            "--data-root", DATA_ROOT,
            "--traj-id", tid,
            "--split", traj_split,
            "--omega-range", "-4.0", "4.0",
        ], cwd=str(scripts_dir.parent))

    # 4. viz_rollout_gif - for each of the 3 trajectories
    print("\n[viz] 4/4: viz_rollout_gif (3 rotation trajectories)...")
    for tid in traj_ids:
        print(f"  rollout GIF for {tid}...")
        subprocess.run([
            PYTHON, "-m", "scripts.viz_rollout_gif",
            "--run", run_dir,
            "--data-root", DATA_ROOT,
            "--traj-id", tid,
            "--split", traj_split,
            "--prefix", "100",
            "--horizon", "250",
            "--n-samples", "12",
        ], cwd=str(scripts_dir.parent))

    # ---- Analyze A matrices ----
    print(f"\n{'='*60}")
    print("  A MATRIX ANALYSIS")
    print(f"{'='*60}")
    ckpt = pickle.load(open(Path(run_dir) / "chain.pkl", "rb"))
    samples = ckpt["samples"]
    A = np.mean([s.A for s in samples], axis=0)
    K = A.shape[0]
    M = cfg.obs_dim

    from collections import Counter
    z = ckpt["z_last"]
    all_z = np.concatenate(z)
    print(f"\nState distribution:")
    for k in range(K):
        pct = (all_z == k).sum() / len(all_z) * 100
        print(f"  State {k}: {pct:.1f}%")

    print(f"\nPer-state AR dynamics (theta_omega):")
    for k in range(K):
        W_k = A[k, :, :M]
        b_k = A[k, :, M]
        evals = np.linalg.eigvals(W_k)
        sr = max(abs(evals))
        print(f"\n  --- State {k} ---")
        print(f"  W = [{W_k[0,0]:+.4f}, {W_k[0,1]:+.4f}]")
        print(f"      [{W_k[1,0]:+.4f}, {W_k[1,1]:+.4f}]")
        print(f"  b = [{b_k[0]:+.6f}, {b_k[1]:+.6f}]")
        print(f"  Spectral radius = {sr:.6f}")

    print(f"\n[done] All outputs saved to {run_dir}/")


if __name__ == "__main__":
    main()
