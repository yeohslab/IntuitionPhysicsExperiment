"""Entry point: load pendulum data, fit rAR-HMM, save chain.

Usage (Windows / PowerShell):
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.train_pendulum `
        --data-root ..\\data\\pendulum --K 5 --n-iter 1000 --out runs\\K5

NOTE: no data exists yet.  Run only after the dataset of docs/pendulum-dataset-spec.md
is generated.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# allow `python scripts/train_pendulum.py` from package root
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.config import Config
from rarhmm.data import load_split
from rarhmm.train import fit


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--data-root", required=True, type=str)
    p.add_argument("--out",       default="runs/default", type=str)
    p.add_argument("--K",         type=int, default=5)
    p.add_argument("--obs-repr",  choices=["theta_omega", "sincos_omega"], default="theta_omega")
    p.add_argument("--mode",      choices=["full", "shared", "ro"], default="ro")
    p.add_argument("--ar-lag",    type=int, default=1)
    p.add_argument("--n-iter",    type=int, default=1000)
    p.add_argument("--n-burnin",  type=int, default=300)
    p.add_argument("--n-thin",    type=int, default=5)
    p.add_argument("--seed",      type=int, default=20260518)
    p.add_argument("--max-trajs", type=int, default=None,
                   help="Limit train trajectories (debug).")
    return p.parse_args()


def main():
    args = parse_args()
    cfg = Config(
        K=args.K,
        obs_repr=args.obs_repr,
        recurrence_mode=args.mode,
        ar_lag=args.ar_lag,
        n_iter=args.n_iter,
        n_burnin=args.n_burnin,
        n_thin=args.n_thin,
        init_seed=args.seed,
        out_dir=args.out,
    )
    print(f"[cfg] {cfg}")
    trajs = load_split(args.data_root, "train", cfg, max_trajs=args.max_trajs)
    print(f"[data] loaded {len(trajs)} train trajectories "
          f"({sum(t.x.shape[0] for t in trajs)} time points)")
    fit(cfg, trajs, verbose=True)


if __name__ == "__main__":
    main()
