"""K5 Pendulum: vector field + one-step prediction error heatmap.

Two-row layout in (theta, omega) phase space:
  Top row:    Per-state linear vector field A_k x + b_k - x (same as viz_dynamics)
  Bottom row: One-step prediction error heatmap — color intensity shows
              mean |x_{t+1} - A_{z_t}[x_t; 1]|^2 for actual data near each grid point

Usage:
    python scripts/viz_k5_dynamics.py --run runs/K5_prefix100_backup
"""
from __future__ import annotations

import argparse, sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from scipy.stats import binned_statistic_2d

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.train import load_checkpoint
from rarhmm.config import Config
from rarhmm.data import load_split
from rarhmm.stick_breaking import stick_breaking_probs

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


def posterior_mean_params(samples):
    A = np.mean([s.A for s in samples], axis=0)
    Q = np.mean([s.Q for s in samples], axis=0)
    R = np.mean([s.R for s in samples], axis=0)
    r = np.mean([s.r for s in samples], axis=0)
    return A, Q, R, r


def _compute_fixed_point(A_k, M):
    A_dyn = A_k[:, :M]
    b_k = A_k[:, M]
    try:
        return np.linalg.solve(np.eye(M) - A_dyn, b_k)
    except np.linalg.LinAlgError:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, type=str)
    ap.add_argument("--data", type=str, default="data/pendulum")
    ap.add_argument("--theta-range", type=float, nargs=2, default=[-np.pi, np.pi])
    ap.add_argument("--omega-range", type=float, nargs=2, default=[-8.0, 8.0])
    ap.add_argument("--grid", type=int, default=25)
    ap.add_argument("--err-bins", type=int, default=40,
                    help="Number of bins for prediction error heatmap")
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()

    run_dir = Path(args.run)
    ckpt = load_checkpoint(run_dir / "chain.pkl")
    cfg = ckpt["cfg"]
    samples = ckpt["samples"]
    z_last = ckpt["z_last"]  # list of z arrays, one per trajectory
    A, Q, R, r = posterior_mean_params(samples)
    K, M = cfg.K, cfg.obs_dim
    omega0 = cfg.omega0

    print(f"Loaded K={K}, M={M}, omega0={omega0:.4f}, obs_repr={cfg.obs_repr}")
    print(f"Posterior samples: {len(samples)}")

    # Load training trajectories
    trajs = load_split(args.data, "train", cfg, max_trajs=len(z_last))
    print(f"Loaded {len(trajs)} training trajectories (matched to z_last)")

    # ---- Build grid in (theta, omega) ----
    thetas = np.linspace(*args.theta_range, args.grid)
    omegas = np.linspace(*args.omega_range, args.grid)
    TH, OM = np.meshgrid(thetas, omegas)

    # Model-space coordinates at each grid point
    if cfg.obs_repr == "sincos_omega":
        XY = np.stack([np.sin(TH.ravel()), np.cos(TH.ravel()),
                       OM.ravel() / omega0], axis=-1)
    else:
        XY = np.stack([TH.ravel(), OM.ravel() / omega0], axis=-1)

    N = XY.shape[0]
    ones = np.ones((N, 1))
    lagged = np.concatenate([XY, ones], axis=1)

    # State probabilities
    nu = XY @ R[0].T + r[0]
    pi = stick_breaking_probs(nu)

    # ---- Collect actual prediction errors from training data ----
    all_theta_t = []
    all_omega_t = []
    all_err = []       # one-step prediction error per data point
    all_z = []         # state assignment per data point

    for i, tr in enumerate(trajs):
        z_i = z_last[i]  # state assignments for trajectory i
        T_i = tr.x.shape[0]
        for t in range(T_i - 1):
            zt = z_i[t]
            x_t = tr.x[t]
            x_next = tr.x[t + 1]
            x_in = np.concatenate([x_t, [1.0]])
            x_pred = A[zt] @ x_in
            err = np.sum((x_next - x_pred) ** 2)

            all_theta_t.append(tr.theta[t])
            all_omega_t.append(tr.omega[t])
            all_err.append(err)
            all_z.append(zt)

    all_theta_t = np.array(all_theta_t)
    all_omega_t = np.array(all_omega_t)
    all_err = np.array(all_err)
    all_z = np.array(all_z)

    print(f"Collected {len(all_err)} data points for error analysis")
    print(f"Mean prediction error: {all_err.mean():.6f}")
    print(f"Median prediction error: {np.median(all_err):.6f}")

    # ---- Create figure: 2 rows, K columns ----
    fig, axes = plt.subplots(2, K, figsize=(3.4 * K, 7.5),
                             sharex='col', sharey='row')
    if K == 1:
        axes = axes.reshape(2, 1)

    for k in range(K):
        ax_top = axes[0, k]
        ax_bot = axes[1, k]
        color = _get_color(k)

        # ============ TOP ROW: vector field ============
        mu = lagged @ A[k].T
        dx = mu - XY

        if cfg.obs_repr == "sincos_omega":
            sin_new = np.sin(TH.ravel()) + dx[:, 0]
            cos_new = np.cos(TH.ravel()) + dx[:, 1]
            theta_new = np.arctan2(sin_new, cos_new)
            d_theta = theta_new - TH.ravel()
            d_theta = (d_theta + np.pi) % (2 * np.pi) - np.pi
            U = d_theta.reshape(TH.shape)
            V = (dx[:, 2] * omega0).reshape(OM.shape)
        else:
            U = dx[:, 0].reshape(TH.shape)
            V = (dx[:, 1] * omega0).reshape(OM.shape)

        ax_top.quiver(TH, OM, U, V, color=color, alpha=0.8,
                      scale=None, width=0.004)

        x_star = _compute_fixed_point(A[k], M)
        if x_star is not None:
            if cfg.obs_repr == "sincos_omega":
                fp_theta = np.arctan2(x_star[0], x_star[1])
                fp_omega = x_star[2] * omega0
            else:
                fp_theta, fp_omega = x_star[0], x_star[1] * omega0

            if (args.theta_range[0] <= fp_theta <= args.theta_range[1] and
                    args.omega_range[0] <= fp_omega <= args.omega_range[1]):
                ax_top.plot(fp_theta, fp_omega, 'o', color=color,
                            markersize=8, markeredgecolor='black',
                            markeredgewidth=0.8, zorder=5)

        ax_top.set_title(f"State {k+1}: $A_{k+1}x + b_{k+1} - x$", fontsize=10)
        if k == 0:
            ax_top.set_ylabel(r"$\omega$ (rad/s)", fontsize=10)
        ax_top.set_xlim(args.theta_range)
        ax_top.set_ylim(args.omega_range)

        # ============ BOTTOM ROW: prediction error heatmap ============
        mask_k = all_z == k
        if mask_k.sum() > 10:
            stat, xedges, yedges, _ = binned_statistic_2d(
                all_theta_t[mask_k], all_omega_t[mask_k], all_err[mask_k],
                statistic='mean', bins=args.err_bins,
                range=[args.theta_range, args.omega_range]
            )
            # stat is (err_bins, err_bins), need to transpose for pcolormesh
            xc = 0.5 * (xedges[:-1] + xedges[1:])
            yc = 0.5 * (yedges[:-1] + yedges[1:])
            XC, YC = np.meshgrid(xc, yc)

            cmap_k = _make_cmap(k)
            vmax = np.nanpercentile(stat, 95) if np.any(~np.isnan(stat)) else 1.0
            im = ax_bot.pcolormesh(XC, YC, stat.T, cmap=cmap_k,
                                   vmin=0, vmax=vmax, shading="auto")
            n_k = mask_k.sum()
            ax_bot.set_title(f"State {k+1}: pred error (n={n_k})", fontsize=10)
        else:
            ax_bot.set_title(f"State {k+1}: no data", fontsize=10)
            ax_bot.text(0.5, 0.5, "N/A", transform=ax_bot.transAxes,
                        ha='center', va='center', fontsize=14, color='gray')

        ax_bot.set_xlabel(r"$\theta$ (rad)", fontsize=10)
        if k == 0:
            ax_bot.set_ylabel(r"$\omega$ (rad/s)", fontsize=10)
        ax_bot.set_xlim(args.theta_range)
        ax_bot.set_ylim(args.omega_range)

    fig.suptitle(r"rAR-HMM dynamics (K5 pendulum): vector fields + prediction error",
                 fontsize=13, y=1.02)
    fig.tight_layout()
    out = Path(args.out or run_dir / "viz_k5_dynamics.png")
    fig.savefig(out, dpi=160, bbox_inches="tight")
    print(f"[saved] {out}")


if __name__ == "__main__":
    main()
