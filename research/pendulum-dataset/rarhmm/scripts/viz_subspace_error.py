"""Visualization — per-point one-step prediction error in the (θ, ω/ω0) subspace.

For every point in the test set (test_in_dist + test_energy_oos), compute the
one-step-ahead prediction error using the posterior-mean AR dynamics and the
MAP discrete state assignment.  Then scatter-plot every (θ, ω/ω0) point,
coloring by prediction error magnitude (RMSE of x_{t+1} prediction vs truth).

The error is:
    err_t = || A_{z_t} [x_t; 1] - x_{t+1} ||_2

where z_t = argmax_k log N(x_t | ...) from FFBS using posterior-mean parameters.

Outputs a PNG with two panels:
  (a) test_in_dist error heatmap in (θ, ω/ω0) subspace
  (b) test_energy_oos error heatmap in (θ, ω/ω0) subspace

Usage:
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.viz_subspace_error `
        --run runs\\K5 --data-root ..\\data\\pendulum
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.config import Config
from rarhmm.data import load_split
from rarhmm.train import load_checkpoint
from rarhmm.model import ModelParams
from rarhmm.inference import _per_traj_logobs_logtrans, ffbs_single


def posterior_mean_params(samples):
    """Compute element-wise mean over posterior samples."""
    A = np.mean([s.A for s in samples], axis=0)
    Q = np.mean([s.Q for s in samples], axis=0)
    R = np.mean([s.R for s in samples], axis=0)
    r = np.mean([s.r for s in samples], axis=0)
    return A, Q, R, r


def compute_per_point_error(trajs, params, cfg, log_init):
    """Compute one-step prediction error for every time point across trajectories.

    Uses the same AR regressor convention as rarhmm.data.stack_for_ar:
        regressor at time t (for predicting x_t) uses x_{t-P} .. x_{t-1}
        so the lagged block is [x_{t-P}, x_{t-P+1}, ..., x_{t-1}, 1].

    We compute the prediction error at time t as:
        err_t = || A_{z_t} [x_{t-P}..x_{t-1}; 1] - x_t ||_2

    Returns
    -------
    thetas : np.ndarray, shape (N,)  — raw theta values at the *predicted* point
    omegas : np.ndarray, shape (N,)  — omega / omega0 values at the *predicted* point
    errors : np.ndarray, shape (N,)  — ||predicted - true||_2
    regimes : np.ndarray, shape (N,) — regime labels (str)
    """
    P = cfg.ar_lag
    K = params.K
    M = cfg.obs_dim
    rng = np.random.default_rng(42)

    all_theta, all_omega, all_error, all_regime = [], [], [], []

    for tr in trajs:
        T = tr.x.shape[0]
        if T <= P:
            continue

        # Infer discrete states via FFBS with posterior-mean params
        if K == 1:
            # K=1: only one state, no transitions needed
            z_full = np.zeros(T, dtype=np.int64)
        else:
            bundle = _per_traj_logobs_logtrans(tr, params, cfg)
            if bundle is None:
                continue
            log_obs, log_trans, _ = bundle
            z_hmm = ffbs_single(log_init, log_trans, log_obs, rng)  # (T-P+1,)
            z_full = np.empty(T, dtype=np.int64)
            z_full[:P - 1] = z_hmm[0]
            z_full[P - 1:] = z_hmm

        # Build AR lagged matrix (same as stack_for_ar):
        #   For each t = P..T-1, regressor = [x_{t-P}, ..., x_{t-1}, 1]
        #   target = x_t
        lagged = np.concatenate(
            [tr.x[P - k - 1 : T - k - 1] for k in range(P)], axis=1
        )  # (T-P, M*P)
        lagged = np.concatenate([lagged, np.ones((T - P, 1))], axis=1)  # (T-P, M*P+1)

        for s in range(T - P):
            t = s + P  # data time index
            k = z_full[t]
            mu = params.A[k] @ lagged[s]  # predicted x_t
            x_true = tr.x[t]

            # Compute error
            if cfg.obs_repr == "theta_omega":
                # θ prediction error in radians
                err = float(abs(mu[0] - x_true[0]))
            else:
                err = float(np.linalg.norm(mu - x_true))

            # store (theta, omega/omega0, error) at the predicted point
            if cfg.obs_repr == "theta_omega":
                all_theta.append(tr.x[t, 0])
                all_omega.append(tr.x[t, 1])
            else:
                # sincos_omega: recover theta from (sin, cos)
                all_theta.append(np.arctan2(tr.x[t, 0], tr.x[t, 1]))
                all_omega.append(tr.x[t, 2])
            all_error.append(err)
            all_regime.append(tr.regime)

    return (np.array(all_theta), np.array(all_omega),
            np.array(all_error), np.array(all_regime))


def plot_subspace_error(ax, theta, omega, error, title, cfg,
                        vmin=None, vmax=None, cmap_name="hot_r"):
    """Scatter plot each point in (θ, ω/ω0) colored by prediction error."""
    if vmin is None:
        vmin = 0.0
    if vmax is None:
        vmax = np.percentile(error, 97)

    # Use a perceptually uniform sequential colormap: low error = cool, high error = hot
    cmap = plt.get_cmap(cmap_name)
    norm = mcolors.Normalize(vmin=vmin, vmax=vmax)

    # Sort by error so that high-error points are drawn on top
    order = np.argsort(error)
    sc = ax.scatter(theta[order], omega[order], c=error[order],
                    cmap=cmap, norm=norm, s=1.2, alpha=0.65,
                    edgecolors="none", rasterized=True)
    ax.set_xlabel(r"$\theta$ (rad)")
    ax.set_ylabel(r"$\omega / \omega_0$")
    ax.set_title(title, fontsize=11)

    # Draw energy contours for reference
    th_grid = np.linspace(-np.pi, np.pi, 200)
    om_grid = np.linspace(-3.5, 3.5, 200)
    TH, OM = np.meshgrid(th_grid, om_grid)
    E = 0.5 * OM ** 2 + 1 - np.cos(TH)
    ax.contour(TH, OM, E, levels=[0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
               colors="grey", linewidths=0.4, alpha=0.4)

    return sc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, type=str)
    ap.add_argument("--data-root", required=True, type=str)
    ap.add_argument("--out", type=str, default=None)
    ap.add_argument("--exclude-regime", type=str, nargs="*", default=[],
                   help="Regime(s) to exclude from evaluation, e.g. 'rotation'.")
    args = ap.parse_args()

    ckpt = load_checkpoint(Path(args.run) / "chain.pkl")
    cfg: Config = ckpt["cfg"]
    samples = ckpt["samples"]
    if len(samples) == 0:
        raise RuntimeError("No posterior samples in chain; was burn-in > n_iter?")

    # Build posterior-mean parameters
    A, Q, R, r = posterior_mean_params(samples)
    p = samples[-1]  # use last sample as shell, replace with means
    p.A = A; p.Q = Q; p.R = R; p.r = r
    K = cfg.K
    log_init = ckpt.get("log_init", np.full(K, -np.log(K)))

    # Load test splits
    splits_to_plot = ["test_in_dist", "test_energy_oos"]
    results = {}
    for split_name in splits_to_plot:
        print(f"[viz_subspace_error] loading split: {split_name}")
        trajs = load_split(args.data_root, split_name, cfg)
        if args.exclude_regime:
            trajs = [t for t in trajs if t.regime not in args.exclude_regime]
        print(f"[viz_subspace_error]   {len(trajs)} trajectories, "
              f"{sum(t.x.shape[0] for t in trajs)} time-points")
        theta, omega, error, regime = compute_per_point_error(trajs, p, cfg, log_init)
        results[split_name] = (theta, omega, error, regime)
        print(f"[viz_subspace_error]   {len(theta)} evaluation points, "
              f"error: mean={error.mean():.4f}, median={np.median(error):.4f}, "
              f"p95={np.percentile(error, 95):.4f}, max={error.max():.4f}")

    # Find global vmax for consistent color scale
    all_errors = np.concatenate([r[2] for r in results.values()])
    vmax = np.percentile(all_errors, 97)

    # Create figure
    fig, axes = plt.subplots(1, len(splits_to_plot), figsize=(7 * len(splits_to_plot), 6))
    if len(splits_to_plot) == 1:
        axes = [axes]

    for ax, split_name in zip(axes, splits_to_plot):
        theta, omega, error, regime = results[split_name]
        label = split_name.replace("_", " ")
        sc = plot_subspace_error(
            ax, theta, omega, error,
            f"One-step prediction error — {label}\n(K={K}, n_pts={len(theta):,})",
            cfg, vmin=0.0, vmax=vmax)

    # Shared colorbar
    cbar = fig.colorbar(sc, ax=axes, shrink=0.75, pad=0.02)
    if cfg.obs_repr == "theta_omega":
        cbar.set_label(r"$| \hat{\theta}_{t+1} - \theta_{t+1} |$  (one-step error, rad)")
    else:
        cbar.set_label(r"$\| \hat{x}_{t+1} - x_{t+1} \|_2$  (one-step RMSE)")

    fig.suptitle(
        f"rAR-HMM per-point prediction accuracy in (θ, ω/ω₀) subspace  "
        f"(K={K}, mode={cfg.recurrence_mode})",
        fontsize=12, fontweight="bold")
    fig.tight_layout(rect=[0, 0, 1, 0.94])

    out = Path(args.out or Path(args.run) / "viz_subspace_error.png")
    fig.savefig(out, dpi=180, bbox_inches="tight")
    plt.close(fig)
    print(f"[viz_subspace_error] saved {out}")


if __name__ == "__main__":
    main()
