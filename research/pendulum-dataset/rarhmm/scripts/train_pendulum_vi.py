"""Train rAR-HMM via EM (variational) on energy-stratified data.

Usage (PowerShell):
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.train_pendulum_vi `
        --data-root ..\data\pendulum --K 5 --obs-repr theta_omega --mode ro `
        --n-em-iter 100 --n-r-steps 100 --r-lr 0.01 --target-n 100 `
        --exclude-regime rotation --out runs/K5_theta_norot_vi
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.config import Config
from rarhmm.data import load_split
from rarhmm.train_vi import fit_vi


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


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--data-root", required=True, type=str)
    p.add_argument("--out",       default="runs/K5_theta_norot_vi", type=str)
    p.add_argument("--K",         type=int, default=5)
    p.add_argument("--obs-repr",  choices=["theta_omega", "sincos_omega"],
                   default="theta_omega")
    p.add_argument("--mode",      choices=["full", "shared", "ro"], default="ro")
    p.add_argument("--ar-lag",    type=int, default=1)
    p.add_argument("--seed",      type=int, default=20260518)
    p.add_argument("--target-n",  type=int, default=100)
    p.add_argument("--exclude-regime", type=str, nargs="*", default=[])
    # VI-specific arguments
    p.add_argument("--n-em-iter", type=int, default=100,
                   help="Number of EM iterations.")
    p.add_argument("--n-r-steps", type=int, default=100,
                   help="Gradient descent steps per M-step for R.")
    p.add_argument("--r-lr",      type=float, default=0.01,
                   help="Adam learning rate for R.")
    p.add_argument("--warm-start", type=str, default=None,
                   help="Path to a Gibbs chain.pkl to warm-start from.")
    return p.parse_args()


def main():
    args = parse_args()
    cfg = Config(
        K=args.K,
        obs_repr=args.obs_repr,
        recurrence_mode=args.mode,
        ar_lag=args.ar_lag,
        init_seed=args.seed,
        out_dir=args.out,
    )
    print(f"[cfg] {cfg}")

    # 1) Load training split
    trajs_all = load_split(args.data_root, "train", cfg, max_trajs=None)
    print(f"[data] full train split: {len(trajs_all)} trajectories")

    # 2) Exclude regimes
    if args.exclude_regime:
        before = len(trajs_all)
        trajs_all = [t for t in trajs_all
                     if t.regime not in args.exclude_regime]
        print(f"[filter] excluded {args.exclude_regime}: "
              f"{before} → {len(trajs_all)}")

    # 3) Stratified sample
    trajs = stratified_subset(trajs_all, args.target_n, seed=args.seed)
    print(f"[strat] selected {len(trajs)} trajectories "
          f"({sum(t.x.shape[0] for t in trajs)} time-points) covering "
          f"{len({round(t.E_bar,6) for t in trajs})} unique energy bins")

    by_reg = defaultdict(int)
    for t in trajs:
        by_reg[t.regime] += 1
    print(f"[strat] regime counts: {dict(by_reg)}")

    # 4) Run EM training
    fit_vi(cfg, trajs,
           n_em_iter=args.n_em_iter,
           n_r_steps=args.n_r_steps,
           r_lr=args.r_lr,
           verbose=True,
           warm_start_path=args.warm_start)


if __name__ == "__main__":
    main()
