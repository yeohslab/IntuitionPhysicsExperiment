"""K5 Pendulum: NASCAR-style trajectory visualization + per-state density.

Layout:
  Top:    Trajectory in (theta, omega) phase space, colored by discrete state
  Bottom: K subplots showing 2D density of each state's occurrences

Usage:
    python scripts/viz_k5_trajectories.py --run runs/K5_prefix100_backup
"""
from __future__ import annotations

import argparse, sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.train import load_checkpoint
from rarhmm.config import Config
from rarhmm.data import load_split

PAPER_COLORS = [
    (0.214, 0.467, 0.659),   # windows blue
    (0.890, 0.102, 0.110),   # red
    (0.992, 0.749, 0.000),   # amber
    (0.506, 0.694, 0.341),   # faded green
    (0.576, 0.471, 0.376),   # brown
    (0.553, 0.427, 0.714),   # medium purple
    (0.980, 0.502, 0.447),   # salmon
    (0.400, 0.761, 0.647),   # medium aquamarine
]


def _get_color(k): return PAPER_COLORS[k % len(PAPER_COLORS)]


def _make_cmap(k):
    c = _get_color(k)
    return LinearSegmentedColormap.from_list(f"s{k}", [(1, 1, 1), c], N=256)


def plot_trajectory_colored(ax, theta, omega, z, K, lw=0.6, alpha=0.8):
    """Plot trajectory segments colored by state assignment."""
    zcps = np.concatenate(([0], np.where(np.diff(z))[0] + 1, [z.size]))
    for start, stop in zip(zcps[:-1], zcps[1:]):
        ax.plot(theta[start:stop + 1], omega[start:stop + 1],
                lw=lw, color=_get_color(z[start] % len(PAPER_COLORS)),
                alpha=alpha)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, type=str)
    ap.add_argument("--data", type=str, default="data/pendulum")
    ap.add_argument("--theta-range", type=float, nargs=2, default=[-np.pi, np.pi])
    ap.add_argument("--omega-range", type=float, nargs=2, default=[-8.0, 8.0])
    ap.add_argument("--regime", type=str, default=None,
                    help="Filter by regime: libration_small, libration_large, rotation")
    ap.add_argument("--max-trajs", type=int, default=20,
                    help="Max trajectories to plot in top panel")
    ap.add_argument("--density-bins", type=int, default=50)
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()

    run_dir = Path(args.run)
    ckpt = load_checkpoint(run_dir / "chain.pkl")
    cfg = ckpt["cfg"]
    samples = ckpt["samples"]
    z_last = ckpt["z_last"]
    K = cfg.K
    omega0 = cfg.omega0

    # Load training trajectories
    trajs = load_split(args.data, "train", cfg, max_trajs=len(z_last))
    print(f"Loaded {len(trajs)} training trajectories, K={K}")

    # Filter by regime if specified
    if args.regime:
        indices = [i for i, tr in enumerate(trajs) if tr.regime == args.regime]
        print(f"Filtered to regime='{args.regime}': {len(indices)} trajectories")
    else:
        indices = list(range(len(trajs)))

    # Limit trajectories for top panel
    plot_indices = indices[:args.max_trajs]

    # ---- Collect all data points with state info ----
    all_theta = []
    all_omega = []
    all_z = []

    for i in indices:
        tr = trajs[i]
        z_i = z_last[i]
        T_i = min(len(tr.theta), len(z_i))
        all_theta.append(tr.theta[:T_i])
        all_omega.append(tr.omega[:T_i])
        all_z.append(z_i[:T_i])

    all_theta = np.concatenate(all_theta)
    all_omega = np.concatenate(all_omega)
    all_z = np.concatenate(all_z)

    print(f"Total data points: {len(all_z)}")
    for k in range(K):
        print(f"  State {k+1}: {np.sum(all_z == k)} ({100*np.mean(all_z == k):.1f}%)")

    # ---- Figure layout: trajectory on top, K density plots on bottom ----
    fig = plt.figure(figsize=(max(3.4 * K, 10), 10))

    # Top panel: full-width trajectory plot
    ax_top = fig.add_axes([0.08, 0.55, 0.88, 0.38])

    for i in plot_indices:
        tr = trajs[i]
        z_i = z_last[i]
        T_i = min(len(tr.theta), len(z_i))
        plot_trajectory_colored(ax_top, tr.theta[:T_i], tr.omega[:T_i],
                                z_i[:T_i], K, lw=0.5, alpha=0.7)

    # Legend
    from matplotlib.lines import Line2D
    legend_handles = [Line2D([0], [0], color=_get_color(k), lw=2,
                              label=f"State {k+1}")
                      for k in range(K)]
    ax_top.legend(handles=legend_handles, loc='upper right', fontsize=9,
                  ncol=min(K, 3), framealpha=0.8)

    ax_top.set_xlabel(r"$\theta$ (rad)", fontsize=11)
    ax_top.set_ylabel(r"$\omega$ (rad/s)", fontsize=11)
    regime_str = f" ({args.regime})" if args.regime else ""
    ax_top.set_title(f"Trajectory colored by state{regime_str} "
                     f"({len(plot_indices)} trajs)", fontsize=12)
    ax_top.set_xlim(args.theta_range)
    ax_top.set_ylim(args.omega_range)

    # Bottom panels: per-state density
    bottom_y = 0.05
    bottom_h = 0.38
    panel_w = 0.88 / K
    gap = 0.02

    for k in range(K):
        left = 0.08 + k * panel_w
        ax = fig.add_axes([left + gap/2, bottom_y, panel_w - gap, bottom_h])

        mask_k = all_z == k
        if mask_k.sum() > 10:
            # 2D histogram / density
            H, xedges, yedges = np.histogram2d(
                all_theta[mask_k], all_omega[mask_k],
                bins=args.density_bins,
                range=[args.theta_range, args.omega_range]
            )
            # Normalize to density
            H = H.T  # transpose for imshow/pcolormesh
            H_norm = H / H.max() if H.max() > 0 else H

            xc = 0.5 * (xedges[:-1] + xedges[1:])
            yc = 0.5 * (yedges[:-1] + yedges[1:])
            XC, YC = np.meshgrid(xc, yc)

            cmap_k = _make_cmap(k)
            ax.pcolormesh(XC, YC, H_norm, cmap=cmap_k, vmin=0, vmax=1,
                          shading="auto")

            n_k = mask_k.sum()
            ax.set_title(f"State {k+1} (n={n_k}, {100*n_k/len(all_z):.0f}%)",
                         fontsize=10, color=_get_color(k))
        else:
            ax.set_title(f"State {k+1}: N/A", fontsize=10)
            ax.text(0.5, 0.5, "N/A", transform=ax.transAxes,
                    ha='center', va='center', fontsize=14, color='gray')

        ax.set_xlabel(r"$\theta$", fontsize=9)
        if k == 0:
            ax.set_ylabel(r"$\omega$", fontsize=9)
        ax.set_xlim(args.theta_range)
        ax.set_ylim(args.omega_range)

    fig.suptitle(r"rAR-HMM state assignments on pendulum data (K=5)",
                 fontsize=14, y=0.98)
    out = Path(args.out or run_dir / "viz_k5_trajectories.png")
    fig.savefig(out, dpi=160, bbox_inches="tight")
    print(f"[saved] {out}")


if __name__ == "__main__":
    main()
