"""Diagnostic script for K=1 training — unbuffered, step-by-step."""
from __future__ import annotations
import sys, os
sys.stdout = open(sys.stdout.fileno(), mode='w', buffering=1, encoding='utf-8', errors='replace')
sys.stderr = open(sys.stderr.fileno(), mode='w', buffering=1, encoding='utf-8', errors='replace')

print("[diag] starting imports...", flush=True)
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

print("[diag] importing config...", flush=True)
from rarhmm.config import Config

print("[diag] importing data...", flush=True)
from rarhmm.data import load_split

print("[diag] importing train...", flush=True)
from rarhmm.train import fit

print("[diag] importing inference...", flush=True)
from rarhmm.inference import initialize, gibbs_step, empirical_dyn_prior

print("[diag] all imports done", flush=True)

# Build K=1 config with only 3 iterations for speed
cfg = Config(
    K=1,
    obs_repr="sincos_omega",
    recurrence_mode="ro",
    ar_lag=1,
    n_iter=3,        # VERY short
    n_burnin=1,
    n_thin=1,
    n_warmup_dyn=2,   # VERY short warmup
    n_warmup_trans=2,
    init_seed=20260518,
    out_dir="runs/K1_debug",
    log_every=1,
)
print(f"[diag] config: K={cfg.K}, n_iter={cfg.n_iter}", flush=True)

print("[diag] loading data (max_trajs=5)...", flush=True)
data_root = r"..\data\pendulum"
trajs = load_split(data_root, "train", cfg, max_trajs=5)
print(f"[diag] loaded {len(trajs)} trajectories, "
      f"{sum(t.x.shape[0] for t in trajs)} time-points", flush=True)

print("[diag] calling fit()...", flush=True)
try:
    ckpt = fit(cfg, trajs, verbose=True)
    print(f"[diag] fit() returned successfully! "
          f"{len(ckpt['samples'])} samples", flush=True)
except Exception as e:
    import traceback
    print(f"[diag] fit() FAILED: {e}", flush=True)
    traceback.print_exc()

print("[diag] DONE", flush=True)
