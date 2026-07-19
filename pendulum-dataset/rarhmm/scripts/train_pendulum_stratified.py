"""Train rAR-HMM on an energy-stratified 100-trajectory subset of train.npz.

This is a thin driver around `rarhmm.train.fit` that does NOT modify any model
code.  It only changes how the training subset is selected: instead of taking
the first N trajectories of train.npz (which is sorted by energy bin and would
yield an all-low-energy sample), it draws a stratified sample so every allowed
energy bin (74 of them after separatrix and holdout exclusion) contributes at
least one trajectory, then fills the remaining slots uniformly at random.

Usage (PowerShell):
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.train_pendulum_stratified `
        --data-root ..\\data\\pendulum --K 5 --obs-repr sincos_omega --mode ro `
        --n-iter 100 --n-burnin 40 --n-thin 3 --target-n 100 --out runs\\K5_strat
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
from rarhmm.train import fit


def stratified_subset(trajs, target_n: int, seed: int):
    """Return a stratified subset of `trajs` of size ~target_n.

    Strategy: group trajectories by their E_bar; take one per group first (so
    every energy bin is covered), then top up uniformly at random from the
    remaining pool until reaching target_n.  Sort the final result by E_bar so
    the training-time ordering is energy-monotone (loaders downstream don't care,
    but it makes manual inspection easier).
    """
    rng = np.random.default_rng(seed)
    by_E = defaultdict(list)
    for i, tr in enumerate(trajs):
        by_E[round(tr.E_bar, 6)].append(i)

    picked = []
    pool = []
    for E, idxs in by_E.items():
        idxs = list(idxs)
        rng.shuffle(idxs)
        picked.append(idxs[0])
        pool.extend(idxs[1:])

    n_bins = len(by_E)
    if target_n < n_bins:
        # downsample bins themselves if budget is smaller than #bins
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
    p.add_argument("--out",       default="runs/K5_strat", type=str)
    p.add_argument("--K",         type=int, default=5)
    p.add_argument("--obs-repr",  choices=["theta_omega", "sincos_omega"], default="sincos_omega")
    p.add_argument("--mode",      choices=["full", "shared", "ro"], default="ro")
    p.add_argument("--ar-lag",    type=int, default=1)
    p.add_argument("--n-iter",    type=int, default=100)
    p.add_argument("--n-burnin",  type=int, default=40)
    p.add_argument("--n-thin",    type=int, default=3)
    p.add_argument("--seed",      type=int, default=20260518)
    p.add_argument("--target-n",  type=int, default=100,
                   help="Size of the stratified training subset.")
    p.add_argument("--exclude-regime", type=str, nargs="*", default=[],
                   help="Regime(s) to exclude, e.g. 'rotation'.")
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

    # 1) load FULL training split (no prefix truncation here)
    trajs_all = load_split(args.data_root, "train", cfg, max_trajs=None)
    print(f"[data] full train split: {len(trajs_all)} trajectories")

    # 1b) optionally exclude regimes
    if args.exclude_regime:
        before = len(trajs_all)
        trajs_all = [t for t in trajs_all if t.regime not in args.exclude_regime]
        print(f"[filter] excluded regimes {args.exclude_regime}: {before} → {len(trajs_all)} trajectories")

    # 2) stratified sample by E_bar
    trajs = stratified_subset(trajs_all, args.target_n, seed=args.seed)
    print(f"[strat] selected {len(trajs)} trajectories "
          f"({sum(t.x.shape[0] for t in trajs)} time-points) covering "
          f"{len({round(t.E_bar,6) for t in trajs})} unique energy bins")

    # 3) print a compact regime/energy histogram
    by_reg = defaultdict(int); by_E = defaultdict(int)
    for t in trajs:
        by_reg[t.regime] += 1
        by_E[round(t.E_bar, 6)] += 1
    print(f"[strat] regime counts: {dict(by_reg)}")
    print(f"[strat] energy span: min={min(by_E):.3f}  max={max(by_E):.3f}  "
          f"n_unique_E={len(by_E)}")
    print(f"[strat] first/last 5 picks:")
    for t in trajs[:5] + trajs[-5:]:
        print(f"   {t.id}  regime={t.regime:<16s} E_bar={t.E_bar:.3f}  T={t.x.shape[0]}")

    # 4) hand off to the standard fit() — no model code is modified
    fit(cfg, trajs, verbose=True)


if __name__ == "__main__":
    main()
