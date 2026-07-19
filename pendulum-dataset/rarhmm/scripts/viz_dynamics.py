"""Visualization — paper Fig. 1 style (Linderman et al. 2017).

Two-row layout:
  Top row:    For each state k, the linear vector field A_k x + b_k − x
              with fixed points marked as colored dots.
  Bottom row: For each state k, the conditional Pr(z_{t+1} = k | x_t)
              as a heatmap (white = 0 → state color = 1).

Fixes the sincos_omega bug from the original implementation (where U did
not depend on k), and replaces streamplot with quiver to match the paper.

Saves a single PNG.

Usage:
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.viz_dynamics --run runs\\K5
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.train import load_checkpoint
from rarhmm.stick_breaking import stick_breaking_probs

# ---- Paper-style color palette (seaborn xkcd) ----
# Matches the official notebook: "windows blue", "red", "amber",
# "faded green", and extras for K > 4.
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


def _get_color(k: int):
    return PAPER_COLORS[k % len(PAPER_COLORS)]


def _make_cmap(k: int):
    """White (prob=0) → state color (prob=1) colormap."""
    c = _get_color(k)
    return LinearSegmentedColormap.from_list(
        f"state_{k}", [(1, 1, 1), c], N=256
    )


def posterior_mean_params(samples):
    """Element-wise mean over posterior samples."""
    A = np.mean([s.A for s in samples], axis=0)
    Q = np.mean([s.Q for s in samples], axis=0)
    R = np.mean([s.R for s in samples], axis=0)
    r = np.mean([s.r for s in samples], axis=0)
    return A, Q, R, r


def _compute_fixed_point(A_k, M):
    """Fixed point x* = (I - A_k[:, :M])^{-1} A_k[:, M] (bias column).

    A_k has shape (M, M+1) where last column is the bias.
    Returns x* of shape (M,), or None if singular.
    """
    A_dyn = A_k[:, :M]
    b_k = A_k[:, M]       # bias column (last column of [A|b])
    try:
        x_star = np.linalg.solve(np.eye(M) - A_dyn, b_k)
        return x_star
    except np.linalg.LinAlgError:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, type=str)
    ap.add_argument("--theta-range", type=float, nargs=2, default=[-np.pi, np.pi])
    ap.add_argument("--omega-range", type=float, nargs=2, default=[-3.0, 3.0])
    ap.add_argument("--grid", type=int, default=20)
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()

    ckpt = load_checkpoint(Path(args.run) / "chain.pkl")
    cfg = ckpt["cfg"]
    samples = ckpt["samples"]
    if len(samples) == 0:
        raise RuntimeError("No posterior samples in chain; was burn-in > n_iter?")
    A, Q, R, r = posterior_mean_params(samples)
    K, M = cfg.K, cfg.obs_dim

    # ---- Build grid ----
    thetas = np.linspace(*args.theta_range, args.grid)
    omegas = np.linspace(*args.omega_range, args.grid)
    TH, OM = np.meshgrid(thetas, omegas)

    # XY: the model-space coordinates at each grid point
    if cfg.obs_repr == "sincos_omega":
        XY = np.stack([np.sin(TH.ravel()), np.cos(TH.ravel()), OM.ravel()], axis=-1)
    else:
        XY = np.stack([TH.ravel(), OM.ravel()], axis=-1)

    N = XY.shape[0]
    ones = np.ones((N, 1))
    lagged = np.concatenate([XY, ones], axis=1)   # (N, M+1)

    # ---- Compute state probabilities at each grid point ----
    # For "ro" mode, R is shared, r is shared: nu = x @ R[0].T + r[0]
    nu = XY @ R[0].T + r[0]                       # (N, K-1)
    pi = stick_breaking_probs(nu)                  # (N, K)

    # ---- Create figure: 2 rows, K columns ----
    fig, axes = plt.subplots(2, K, figsize=(3.4 * K, 7.0),
                             sharex='col', sharey='row')
    if K == 1:
        axes = axes.reshape(2, 1)

    for k in range(K):
        ax_top = axes[0, k]
        ax_bot = axes[1, k]
        color = _get_color(k)

        # ============ TOP ROW: vector field A_k x + b_k − x ============
        mu = lagged @ A[k].T                      # (N, M)
        dx = mu - XY                               # A_k [x;1] - x

        if cfg.obs_repr == "theta_omega":
            # 2D case: plot directly in (θ, ω) space
            U = dx[:, 0].reshape(TH.shape)
            V = dx[:, 1].reshape(OM.shape)
        else:
            # sincos_omega: dx has 3 components (d_sinθ, d_cosθ, d_ω)
            # Convert (sin θ + d_sinθ, cos θ + d_cosθ) back to d_θ:
            sin_new = np.sin(TH.ravel()) + dx[:, 0]
            cos_new = np.cos(TH.ravel()) + dx[:, 1]
            theta_new = np.arctan2(sin_new, cos_new)
            d_theta = theta_new - TH.ravel()
            # Wrap to [-π, π]
            d_theta = (d_theta + np.pi) % (2 * np.pi) - np.pi
            U = d_theta.reshape(TH.shape)
            V = dx[:, 2].reshape(OM.shape)

        ax_top.quiver(TH, OM, U, V, color=color, alpha=0.8,
                      scale=None, width=0.004)

        # Mark the fixed point (I - A_k[:,:M])^{-1} b_k
        x_star = _compute_fixed_point(A[k], M)
        if x_star is not None:
            if cfg.obs_repr == "sincos_omega":
                # Convert 3D fixed point back to (θ, ω)
                fp_theta = np.arctan2(x_star[0], x_star[1])
                fp_omega = x_star[2]
            else:
                fp_theta, fp_omega = x_star[0], x_star[1]

            # Only plot if within range
            if (args.theta_range[0] <= fp_theta <= args.theta_range[1] and
                    args.omega_range[0] <= fp_omega <= args.omega_range[1]):
                ax_top.plot(fp_theta, fp_omega, 'o', color=color,
                            markersize=8, markeredgecolor='black',
                            markeredgewidth=0.8, zorder=5)

        ax_top.set_title(f"$A_{k+1} x_t + b_{k+1} - x_t$", fontsize=11)
        ax_top.set_ylabel(r"$x_{t,\,2}$" if k == 0 else "")
        ax_top.set_xlim(args.theta_range)
        ax_top.set_ylim(args.omega_range)

        # ============ BOTTOM ROW: Pr(z_{t+1} = k | x_t) heatmap ============
        prob_k = pi[:, k].reshape(TH.shape)
        cmap_k = _make_cmap(k)
        ax_bot.pcolormesh(TH, OM, prob_k, cmap=cmap_k,
                          vmin=0.0, vmax=1.0, shading="auto")
        ax_bot.set_title(f"$\\Pr(z_{{t+1}} = {k+1} \\mid x_t)$", fontsize=11)
        ax_bot.set_xlabel(r"$x_{t,\,1}$")
        ax_bot.set_ylabel(r"$x_{t,\,2}$" if k == 0 else "")
        ax_bot.set_xlim(args.theta_range)
        ax_bot.set_ylim(args.omega_range)

    fig.suptitle("rAR-HMM dynamics per discrete state (posterior mean)",
                 fontsize=13, y=1.01)
    fig.tight_layout()
    out = Path(args.out or Path(args.run) / "viz_dynamics.png")
    fig.savefig(out, dpi=160, bbox_inches="tight")
    print(f"[viz_dynamics] saved {out}")


if __name__ == "__main__":
    main()
