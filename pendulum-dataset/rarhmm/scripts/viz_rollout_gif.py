"""Visualization #3 — animated GIF: given a prefix, compare the model's
posterior-predictive continuation to the ground-truth continuation.

Layout (3 panels per frame):
  left  : pendulum stick (rod + bob) showing both ground-truth angle (solid) and
          a model-sampled angle (dashed, lighter).
  mid   : theta(t) curves — prefix (grey) + ground truth (black) + N posterior
          predictive samples (color-faded), with a moving vertical "now" line.
  right : same for omega(t)/omega0.

Usage:
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.viz_rollout_gif `
        --run runs\\K5 --data-root ..\\data\\pendulum `
        --traj-id traj_000123 --prefix 200 --horizon 400 --n-samples 16
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.animation as anim

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.config import Config
from rarhmm.data import load_split
from rarhmm.train import load_checkpoint
from rarhmm.predict import rollout_posterior


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, type=str)
    ap.add_argument("--data-root", required=True, type=str)
    ap.add_argument("--traj-id", required=True, type=str)
    ap.add_argument("--split", default="val", choices=["train", "val", "test_in_dist", "test_energy_oos"])
    ap.add_argument("--prefix", type=int, default=200, help="prefix length in steps")
    ap.add_argument("--horizon", type=int, default=400)
    ap.add_argument("--n-samples", type=int, default=12)
    ap.add_argument("--fps", type=int, default=20)
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()

    ckpt = load_checkpoint(Path(args.run) / "chain.pkl")
    cfg: Config = ckpt["cfg"]
    samples = ckpt["samples"]

    trajs = load_split(args.data_root, args.split, cfg)
    tr = next((t for t in trajs if t.id == args.traj_id), None)
    if tr is None:
        raise ValueError(f"traj-id {args.traj_id} not found in {args.split}")

    T_total = tr.x.shape[0]
    T0 = min(args.prefix, T_total - 2)
    H = min(args.horizon, T_total - T0)
    assert T0 + H <= T_total

    rng = np.random.default_rng(0)
    Xs, Zs = rollout_posterior(cfg, samples, tr.x[:T0], H, args.n_samples, rng)
    # convert back to (theta, omega/omega0)
    if cfg.obs_repr == "theta_omega":
        theta_s = Xs[..., 0]; omega_s = Xs[..., 1]
    else:
        theta_s = np.arctan2(Xs[..., 0], Xs[..., 1])
        omega_s = Xs[..., 2]
    theta_gt_pre = tr.theta[:T0]
    theta_gt_fut = tr.theta[T0 : T0 + H]
    omega_gt_pre = tr.omega[:T0] / cfg.omega0
    omega_gt_fut = tr.omega[T0 : T0 + H] / cfg.omega0
    t_pre = np.arange(T0) * cfg.dt
    t_fut = np.arange(T0, T0 + H) * cfg.dt

    fig, axes = plt.subplots(1, 3, figsize=(13, 4.2),
                             gridspec_kw={"width_ratios": [1, 1.4, 1.4]})
    ax_p, ax_th, ax_om = axes

    # --- pendulum panel static setup ---
    Lp = cfg.L
    ax_p.set_xlim(-1.2 * Lp, 1.2 * Lp); ax_p.set_ylim(-1.2 * Lp, 1.2 * Lp)
    ax_p.set_aspect("equal"); ax_p.set_xticks([]); ax_p.set_yticks([])
    ax_p.set_title("pendulum")
    rod_gt, = ax_p.plot([], [], "-", color="k", lw=2.5)
    bob_gt, = ax_p.plot([], [], "o", color="k", ms=12)
    rod_md, = ax_p.plot([], [], "--", color="tab:red", lw=1.5, alpha=0.85)
    bob_md, = ax_p.plot([], [], "o", color="tab:red", ms=9, alpha=0.85)
    ax_p.plot(0, 0, "+", color="grey")

    # --- theta and omega panels static ---
    for ax, ylab, gt_pre, gt_fut, sam in [
        (ax_th, r"$\theta$ (rad)", theta_gt_pre, theta_gt_fut, theta_s),
        (ax_om, r"$\omega/\omega_0$", omega_gt_pre, omega_gt_fut, omega_s),
    ]:
        ax.plot(t_pre, gt_pre, color="0.55", lw=1.2, label="prefix (observed)")
        ax.plot(t_fut, gt_fut, color="black", lw=1.4, label="ground truth")
        for d in range(args.n_samples):
            ax.plot(t_fut, sam[d], color="tab:red", lw=0.6, alpha=0.35)
        ax.set_xlabel("t [s]"); ax.set_ylabel(ylab)
        ax.axvline(T0 * cfg.dt, color="grey", ls=":", lw=0.8)
        ax.legend(loc="best", fontsize=8)
    ax_th.set_title("θ(t): prefix + ground truth + posterior predictive")
    ax_om.set_title("ω(t)/ω0: prefix + ground truth + posterior predictive")

    now_lines = [ax_th.axvline(0, color="orange", lw=1.2),
                 ax_om.axvline(0, color="orange", lw=1.2)]

    # full time series for the pendulum panel
    theta_full_gt = np.concatenate([theta_gt_pre, theta_gt_fut])
    theta_full_md = np.concatenate([np.tile(theta_gt_pre, (args.n_samples, 1)), theta_s], axis=1)
    sample_pick = 0   # show one specific posterior draw on the pendulum animation

    def update(frame):
        th_gt = theta_full_gt[frame]
        th_md = theta_full_md[sample_pick, frame]
        # pendulum hangs down at theta=0
        x_gt, y_gt =  Lp * np.sin(th_gt), -Lp * np.cos(th_gt)
        x_md, y_md =  Lp * np.sin(th_md), -Lp * np.cos(th_md)
        rod_gt.set_data([0, x_gt], [0, y_gt]); bob_gt.set_data([x_gt], [y_gt])
        if frame >= T0:
            rod_md.set_data([0, x_md], [0, y_md]); bob_md.set_data([x_md], [y_md])
        else:
            rod_md.set_data([], []); bob_md.set_data([], [])
        for nl in now_lines:
            nl.set_xdata([frame * cfg.dt, frame * cfg.dt])
        ax_p.set_title(f"pendulum  (t = {frame*cfg.dt:.2f}s, "
                       f"{'prefix' if frame < T0 else 'forecast'})")
        return rod_gt, bob_gt, rod_md, bob_md, *now_lines

    nframes = T0 + H
    ani = anim.FuncAnimation(fig, update, frames=nframes,
                             interval=1000 / args.fps, blit=False)
    out = Path(args.out or Path(args.run) / f"rollout_{tr.id}_T0={T0}_H={H}.gif")
    ani.save(out, writer=anim.PillowWriter(fps=args.fps))
    print(f"[viz_rollout_gif] saved {out}")


if __name__ == "__main__":
    main()
