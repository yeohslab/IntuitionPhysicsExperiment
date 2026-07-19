"""Visualize K=10 rSLDS training results.

Replicates all visualizations from rarhmm's train_and_viz_K5_theta_allE.py:
  1. viz_dynamics       — vector fields + transition probabilities
  2. viz_subspace_error — one-step prediction error heatmap
  3. viz_trajectory     — log-lik curve + vector fields + colored trajectory
  4. viz_rollout_gif    — animated rollout GIF
  5. analyze_K          — A matrix analysis

Adapted for rSLDS where only theta is observed and omega is inferred
via Kalman smoother.

Usage (PowerShell):
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.viz_slds_K10
"""
from __future__ import annotations

import sys
import pickle
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import matplotlib.animation as anim
from matplotlib.colors import LinearSegmentedColormap

from slds.config import Config
from slds.data import load_split, Trajectory, _wrap_to_pi, _init_x_from_y
from slds.train import load_checkpoint
from slds.model import ModelParams
from slds.stick_breaking import stick_breaking_probs
from slds.inference import (
    _per_traj_logobs_logtrans, ffbs_single,
    kalman_smoother_mean,
)
from slds.predict import rollout_posterior


# ---- Paper-style color palette ----
PAPER_COLORS = [
    (0.214, 0.467, 0.659),   # windows blue
    (0.890, 0.102, 0.110),   # red
    (0.992, 0.749, 0.000),   # amber
    (0.506, 0.694, 0.341),   # faded green
    (0.576, 0.471, 0.376),   # brown
    (0.553, 0.427, 0.714),   # medium purple
    (0.980, 0.502, 0.447),   # salmon
    (0.400, 0.761, 0.647),   # medium aquamarine
    (0.200, 0.200, 0.200),   # dark grey
    (0.800, 0.200, 0.600),   # magenta-ish
]


def _get_color(k: int):
    return PAPER_COLORS[k % len(PAPER_COLORS)]


def _make_cmap(k: int):
    c = _get_color(k)
    return LinearSegmentedColormap.from_list(f"state_{k}", [(1, 1, 1), c], N=256)


def posterior_mean_params(samples):
    A = np.mean([s.A for s in samples], axis=0)
    Q = np.mean([s.Q for s in samples], axis=0)
    R = np.mean([s.R for s in samples], axis=0)
    r = np.mean([s.r for s in samples], axis=0)
    C = samples[-1].C.copy()
    S = np.mean([s.S for s in samples], axis=0)
    return A, Q, R, r, C, S


def _make_mean_params(ckpt):
    """Build a single ModelParams with posterior-mean A, Q, R, r."""
    samples = ckpt["samples"]
    cfg = ckpt["cfg"]
    A, Q, R, r, C, S = posterior_mean_params(samples)
    p = ModelParams(
        K=cfg.K, M=cfg.obs_dim,
        D_in_ar=cfg.obs_dim * cfg.ar_lag + 1,
        D_in_rec=cfg.obs_dim,
        A=A, Q=Q, R=R, r=r, C=C, S=S,
        mode=cfg.recurrence_mode,
    )
    return p


def _load_and_wrap_test(data_root, split, cfg):
    """Load test trajectories — they already have y = wrapped theta."""
    trajs = load_split(data_root, split, cfg)
    return trajs


def _compute_fixed_point(A_k, M):
    A_dyn = A_k[:, :M]
    b_k = A_k[:, M]
    try:
        return np.linalg.solve(np.eye(M) - A_dyn, b_k)
    except np.linalg.LinAlgError:
        return None


def _infer_z(tr, p, cfg, log_init, rng):
    """Run FFBS to get z for a trajectory, using its current x estimate."""
    P = cfg.ar_lag
    T = tr.x.shape[0]
    K = p.K
    if T <= P:
        return np.zeros(T, dtype=np.int64)
    bundle = _per_traj_logobs_logtrans(tr, p, cfg)
    if bundle is None:
        return np.zeros(T, dtype=np.int64)
    log_obs, log_trans, _ = bundle
    z_hmm = ffbs_single(log_init, log_trans, log_obs, rng)
    z_full = np.empty(T, dtype=np.int64)
    z_full[: P - 1] = z_hmm[0]
    z_full[P - 1 :] = z_hmm
    return z_full


def _update_x_via_kalman(tr, z, p, cfg):
    """Update tr.x via Kalman smoother given z and y."""
    tr.x = kalman_smoother_mean(tr.y, z, p, cfg)


# =========================================================================
# VIZ 1: viz_dynamics
# =========================================================================
def run_viz_dynamics(run_dir: str):
    print("\n" + "="*60)
    print("  VISUALIZATION 1: viz_dynamics")
    print("="*60)

    ckpt = load_checkpoint(Path(run_dir) / "chain.pkl")
    cfg = ckpt["cfg"]
    samples = ckpt["samples"]
    if len(samples) == 0:
        print("[WARN] No posterior samples, skipping"); return

    A, Q, R, r, C, S = posterior_mean_params(samples)
    K, M = cfg.K, cfg.obs_dim

    theta_range = [-np.pi, np.pi]
    omega_range = [-3.0, 3.0]
    grid = 20

    thetas = np.linspace(*theta_range, grid)
    omegas = np.linspace(*omega_range, grid)
    TH, OM = np.meshgrid(thetas, omegas)
    XY = np.stack([TH.ravel(), OM.ravel()], axis=-1)
    N = XY.shape[0]
    lagged = np.concatenate([XY, np.ones((N, 1))], axis=1)

    nu = XY @ R[0].T + r[0]
    pi = stick_breaking_probs(nu)

    fig, axes = plt.subplots(2, K, figsize=(3.4 * K, 7.0),
                             sharex='col', sharey='row')
    if K == 1:
        axes = axes.reshape(2, 1)

    for k in range(K):
        ax_top = axes[0, k]
        ax_bot = axes[1, k]
        color = _get_color(k)

        mu = lagged @ A[k].T
        dx = mu - XY
        U = dx[:, 0].reshape(TH.shape)
        V = dx[:, 1].reshape(OM.shape)

        ax_top.quiver(TH, OM, U, V, color=color, alpha=0.8,
                      scale=None, width=0.004)

        x_star = _compute_fixed_point(A[k], M)
        if x_star is not None:
            fp_theta, fp_omega = x_star[0], x_star[1]
            if (theta_range[0] <= fp_theta <= theta_range[1] and
                    omega_range[0] <= fp_omega <= omega_range[1]):
                ax_top.plot(fp_theta, fp_omega, 'o', color=color,
                            markersize=8, markeredgecolor='black',
                            markeredgewidth=0.8, zorder=5)

        ax_top.set_title(f"$A_{k+1} x_t + b_{k+1} - x_t$", fontsize=10)
        ax_top.set_ylabel(r"$\omega/\omega_0$" if k == 0 else "")
        ax_top.set_xlim(theta_range); ax_top.set_ylim(omega_range)

        prob_k = pi[:, k].reshape(TH.shape)
        cmap_k = _make_cmap(k)
        ax_bot.pcolormesh(TH, OM, prob_k, cmap=cmap_k,
                          vmin=0.0, vmax=1.0, shading="auto")
        ax_bot.set_title(f"$\\Pr(z_{{t+1}} = {k+1} \\mid x_t)$", fontsize=10)
        ax_bot.set_xlabel(r"$\theta$")
        ax_bot.set_ylabel(r"$\omega/\omega_0$" if k == 0 else "")
        ax_bot.set_xlim(theta_range); ax_bot.set_ylim(omega_range)

    fig.suptitle(f"rSLDS dynamics per discrete state (posterior mean, K={K})",
                 fontsize=13, y=1.01)
    fig.tight_layout()
    out = Path(run_dir) / "viz_dynamics.png"
    fig.savefig(out, dpi=160, bbox_inches="tight")
    plt.close(fig)
    print(f"[viz_dynamics] saved {out}")


# =========================================================================
# VIZ 2: viz_subspace_error
# =========================================================================
def run_viz_subspace_error(run_dir: str, data_root: str):
    print("\n" + "="*60)
    print("  VISUALIZATION 2: viz_subspace_error")
    print("="*60)

    ckpt = load_checkpoint(Path(run_dir) / "chain.pkl")
    cfg = ckpt["cfg"]
    p = _make_mean_params(ckpt)
    K = cfg.K
    P = cfg.ar_lag
    log_init = ckpt.get("log_init", np.full(K, -np.log(K)))

    splits_to_plot = ["test_in_dist", "test_energy_oos"]
    results = {}

    for split_name in splits_to_plot:
        print(f"[viz_subspace_error] loading split: {split_name}")
        try:
            trajs = _load_and_wrap_test(data_root, split_name, cfg)
        except Exception as e:
            print(f"[WARN] Could not load {split_name}: {e}, skipping")
            continue
        print(f"[viz_subspace_error]   {len(trajs)} trajectories")

        all_theta, all_omega, all_error, all_regime = [], [], [], []
        rng = np.random.default_rng(42)

        for tr in trajs:
            T = tr.x.shape[0]
            if T <= P:
                continue
            # Infer z and x via Kalman smoother
            z_full = _infer_z(tr, p, cfg, log_init, rng)
            _update_x_via_kalman(tr, z_full, p, cfg)

            lagged = np.concatenate(
                [tr.x[P - k - 1: T - k - 1] for k in range(P)], axis=1)
            lagged = np.concatenate([lagged, np.ones((T - P, 1))], axis=1)

            for s in range(T - P):
                t_idx = s + P
                k = z_full[t_idx]
                mu = p.A[k] @ lagged[s]
                x_true = tr.x_true[t_idx]
                err = float(abs(mu[0] - x_true[0]))
                all_theta.append(tr.x_true[t_idx, 0])
                all_omega.append(tr.x_true[t_idx, 1])
                all_error.append(err)
                all_regime.append(tr.regime)

        if not all_theta:
            continue
        theta = np.array(all_theta)
        omega = np.array(all_omega)
        error = np.array(all_error)
        regime = np.array(all_regime)
        results[split_name] = (theta, omega, error, regime)
        print(f"[viz_subspace_error]   {len(theta)} evaluation points, "
              f"error: mean={error.mean():.4f}, median={np.median(error):.4f}, "
              f"p95={np.percentile(error, 95):.4f}, max={error.max():.4f}")

    if not results:
        print("[WARN] No data for viz_subspace_error, skipping")
        return

    all_errors = np.concatenate([r[2] for r in results.values()])
    vmax = np.percentile(all_errors, 97)

    fig, axes = plt.subplots(1, len(results), figsize=(7 * len(results), 6))
    if len(results) == 1:
        axes = [axes]

    for ax, split_name in zip(axes, results.keys()):
        theta, omega, error, regime = results[split_name]
        label = split_name.replace("_", " ")
        cmap = plt.get_cmap("hot_r")
        norm = mcolors.Normalize(vmin=0.0, vmax=vmax)
        order = np.argsort(error)
        sc = ax.scatter(theta[order], omega[order], c=error[order],
                        cmap=cmap, norm=norm, s=1.2, alpha=0.65,
                        edgecolors="none", rasterized=True)
        ax.set_xlabel(r"$\theta$ (rad)")
        ax.set_ylabel(r"$\omega / \omega_0$")
        ax.set_title(f"One-step prediction error — {label}\n(K={K}, n_pts={len(theta):,})",
                      fontsize=11)
        th_grid = np.linspace(-np.pi, np.pi, 200)
        om_grid = np.linspace(-3.5, 3.5, 200)
        TH, OM = np.meshgrid(th_grid, om_grid)
        E = 0.5 * OM ** 2 + 1 - np.cos(TH)
        ax.contour(TH, OM, E, levels=[0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
                   colors="grey", linewidths=0.4, alpha=0.4)

    cbar = fig.colorbar(sc, ax=list(axes), shrink=0.75, pad=0.02)
    cbar.set_label(r"$| \hat{\theta}_{t+1} - \theta_{t+1} |$  (one-step error, rad)")
    fig.suptitle(
        f"rSLDS per-point prediction accuracy in (θ, ω/ω₀) subspace  "
        f"(K={K}, mode={cfg.recurrence_mode})",
        fontsize=12, fontweight="bold")
    fig.tight_layout(rect=[0, 0, 1, 0.94])
    out = Path(run_dir) / "viz_subspace_error.png"
    fig.savefig(out, dpi=180, bbox_inches="tight")
    plt.close(fig)
    print(f"[viz_subspace_error] saved {out}")


# =========================================================================
# VIZ 3: viz_trajectory
# =========================================================================
def run_viz_trajectory(run_dir: str, data_root: str, traj_ids: list,
                       split: str = "val"):
    print("\n" + "="*60)
    print("  VISUALIZATION 3: viz_trajectory")
    print("="*60)

    ckpt = load_checkpoint(Path(run_dir) / "chain.pkl")
    cfg = ckpt["cfg"]
    p = _make_mean_params(ckpt)
    hist = ckpt["loglik_history"]
    K = cfg.K
    P = cfg.ar_lag
    log_init = ckpt.get("log_init", np.full(K, -np.log(K)))

    try:
        trajs = _load_and_wrap_test(data_root, split, cfg)
    except Exception as e:
        print(f"[WARN] Could not load {split}: {e}, skipping")
        return

    for traj_id in traj_ids:
        tr = next((t for t in trajs if t.id == traj_id), None)
        if tr is None:
            print(f"[WARN] traj {traj_id} not found in {split}, skipping")
            continue

        rng = np.random.default_rng(0)
        z_full = _infer_z(tr, p, cfg, log_init, rng)
        _update_x_via_kalman(tr, z_full, p, cfg)

        theta_range = [-np.pi, np.pi]
        omega_range = [-3.0, 3.0]
        grid = 22
        A_mean = p.A

        # Layout: top row = loglik curve, 2nd row = true fields, 3rd = learned
        n_cols = max(K, 2)
        fig = plt.figure(figsize=(3.0 * min(K, 10), 9.5))
        gs = fig.add_gridspec(3, n_cols, height_ratios=[1, 1.1, 1.1])

        ax_ll = fig.add_subplot(gs[0, :])
        ax_ll.plot(hist, lw=1.2, label="ELBO")
        ax_ll.set_xlabel("iteration"); ax_ll.set_ylabel("ELBO (a.u.)")
        ax_ll.set_title("(a) training curve")
        ax_ll.legend(loc="lower right", fontsize=8)

        thetas = np.linspace(*theta_range, grid)
        omegas = np.linspace(*omega_range, grid)
        TH, OM = np.meshgrid(thetas, omegas)
        cmap = plt.get_cmap("tab10")

        def true_pendulum_field(TH, OM, g=9.8, L=1.0, omega0=None):
            omega0 = omega0 or np.sqrt(g / L)
            U = OM * omega0
            V = -(g / L) * np.sin(TH) / omega0
            return U, V

        Utrue, Vtrue = true_pendulum_field(TH, OM, cfg.g, cfg.L, cfg.omega0)

        # Only show first 5 and last 5 states to keep figure readable
        show_k = list(range(min(K, n_cols)))

        for idx, k in enumerate(show_k):
            if idx >= n_cols:
                break
            ax = fig.add_subplot(gs[1, idx])
            ax.streamplot(TH, OM, Utrue, Vtrue, density=1.0, color="0.4", linewidth=0.8)
            ax.set_title(f"true | k={k}", fontsize=9)
            ax.set_xlim(theta_range); ax.set_ylim(omega_range)
            if idx == 0:
                ax.set_ylabel(r"$\omega/\omega_0$")
            ax.set_xticklabels([])

            ax2 = fig.add_subplot(gs[2, idx])
            XY = np.stack([TH.ravel(), OM.ravel()], axis=-1)
            lagged = np.concatenate([XY, np.ones((XY.shape[0], 1))], axis=1)
            mu = lagged @ A_mean[k].T
            U = ((mu[:, 0] - XY[:, 0]).reshape(TH.shape)) / cfg.dt
            V = ((mu[:, 1] - XY[:, 1]).reshape(TH.shape)) / cfg.dt
            ax2.streamplot(TH, OM, U, V, density=1.0, color=cmap(k % 10), linewidth=0.9)
            ax2.set_title(f"inferred | k={k}", fontsize=9)
            ax2.set_xlabel(r"$\theta$"); ax2.set_xlim(theta_range); ax2.set_ylim(omega_range)
            if idx == 0:
                ax2.set_ylabel(r"$\omega/\omega_0$")

        # Trajectory overlay
        ax_tr = fig.add_axes([0.7, 0.04, 0.27, 0.27])
        theta_plot = tr.x_true[:, 0]
        om_plot = tr.x_true[:, 1]
        ax_tr.plot(theta_plot, om_plot, color="0.7", lw=0.5, alpha=0.7, zorder=1)
        for k in range(K):
            m = (z_full == k)
            if m.any():
                ax_tr.scatter(theta_plot[m], om_plot[m], s=6, color=cmap(k % 10),
                              label=f"k={k}", zorder=2)
        ax_tr.set_title(f"(c) trajectory {tr.id} colored by inferred state")
        ax_tr.set_xlabel(r"$\theta$"); ax_tr.set_ylabel(r"$\omega/\omega_0$")
        ax_tr.legend(fontsize=6, loc="best", ncol=2)

        fig.suptitle(f"rSLDS diagnostics  (K={K}, mode={cfg.recurrence_mode})")
        fig.tight_layout(rect=[0, 0, 0.68, 0.96])
        out = Path(run_dir) / f"viz_trajectory_{tr.id}.png"
        fig.savefig(out, dpi=160)
        plt.close(fig)
        print(f"[viz_trajectory] saved {out}")


# =========================================================================
# VIZ 4: viz_rollout_gif
# =========================================================================
def run_viz_rollout_gif(run_dir: str, data_root: str, traj_ids: list,
                        split: str = "val", prefix: int = 100, horizon: int = 250):
    print("\n" + "="*60)
    print("  VISUALIZATION 4: viz_rollout_gif")
    print("="*60)

    ckpt = load_checkpoint(Path(run_dir) / "chain.pkl")
    cfg = ckpt["cfg"]
    samples = ckpt["samples"]

    try:
        trajs = _load_and_wrap_test(data_root, split, cfg)
    except Exception as e:
        print(f"[WARN] Could not load {split}: {e}, skipping")
        return

    for traj_id in traj_ids:
        tr = next((t for t in trajs if t.id == traj_id), None)
        if tr is None:
            print(f"[WARN] traj {traj_id} not found in {split}, skipping")
            continue

        T_total = tr.x.shape[0]
        T0 = min(prefix, T_total - 2)
        H = min(horizon, T_total - T0)
        assert T0 + H <= T_total

        n_samples = 12
        rng = np.random.default_rng(0)
        # rSLDS rollout: takes y prefix (theta only), not x
        Xs, Zs = rollout_posterior(cfg, samples, tr.y[:T0], H, n_samples, rng)

        theta_s = _wrap_to_pi(Xs[..., 0])
        omega_s = Xs[..., 1]

        # Ground truth from x_true
        theta_gt_pre = tr.x_true[:T0, 0]
        theta_gt_fut = tr.x_true[T0: T0 + H, 0]
        omega_gt_pre = tr.x_true[:T0, 1]
        omega_gt_fut = tr.x_true[T0: T0 + H, 1]
        t_pre = np.arange(T0) * cfg.dt
        t_fut = np.arange(T0, T0 + H) * cfg.dt

        fig, axes = plt.subplots(1, 3, figsize=(13, 4.2),
                                 gridspec_kw={"width_ratios": [1, 1.4, 1.4]})
        ax_p, ax_th, ax_om = axes

        Lp = cfg.L
        ax_p.set_xlim(-1.2 * Lp, 1.2 * Lp)
        ax_p.set_ylim(-1.2 * Lp, 1.2 * Lp)
        ax_p.set_aspect("equal"); ax_p.set_xticks([]); ax_p.set_yticks([])
        ax_p.set_title("pendulum")
        rod_gt, = ax_p.plot([], [], "-", color="k", lw=2.5)
        bob_gt, = ax_p.plot([], [], "o", color="k", ms=12)
        rod_md, = ax_p.plot([], [], "--", color="tab:red", lw=1.5, alpha=0.85)
        bob_md, = ax_p.plot([], [], "o", color="tab:red", ms=9, alpha=0.85)
        ax_p.plot(0, 0, "+", color="grey")

        for ax, ylab, gt_pre, gt_fut, sam in [
            (ax_th, r"$\theta$ (rad)", theta_gt_pre, theta_gt_fut, theta_s),
            (ax_om, r"$\omega/\omega_0$", omega_gt_pre, omega_gt_fut, omega_s),
        ]:
            ax.plot(t_pre, gt_pre, color="0.55", lw=1.2, label="prefix (observed)")
            ax.plot(t_fut, gt_fut, color="black", lw=1.4, label="ground truth")
            for d in range(n_samples):
                ax.plot(t_fut, sam[d], color="tab:red", lw=0.6, alpha=0.35)
            ax.set_xlabel("t [s]"); ax.set_ylabel(ylab)
            ax.axvline(T0 * cfg.dt, color="grey", ls=":", lw=0.8)
            ax.legend(loc="best", fontsize=8)
        ax_th.set_title("θ(t): prefix + ground truth + posterior predictive")
        ax_om.set_title("ω(t)/ω0: prefix + ground truth + posterior predictive")

        now_lines = [ax_th.axvline(0, color="orange", lw=1.2),
                     ax_om.axvline(0, color="orange", lw=1.2)]

        theta_full_gt = np.concatenate([theta_gt_pre, theta_gt_fut])
        theta_full_md = np.concatenate([np.tile(theta_gt_pre, (n_samples, 1)),
                                        theta_s], axis=1)
        sample_pick = 0

        def update(frame):
            th_gt = theta_full_gt[frame]
            th_md = theta_full_md[sample_pick, frame]
            x_gt, y_gt = Lp * np.sin(th_gt), -Lp * np.cos(th_gt)
            x_md, y_md = Lp * np.sin(th_md), -Lp * np.cos(th_md)
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
        fps = 20
        ani = anim.FuncAnimation(fig, update, frames=nframes,
                                 interval=1000 / fps, blit=False)
        out = Path(run_dir) / f"rollout_{traj_id}_T0={T0}_H={H}.gif"
        ani.save(out, writer=anim.PillowWriter(fps=fps))
        plt.close(fig)
        print(f"[viz_rollout_gif] saved {out}")


# =========================================================================
# VIZ 5: analyze_K
# =========================================================================
def run_analyze_K(run_dir: str):
    print("\n" + "="*60)
    print("  ANALYSIS: A matrices")
    print("="*60)

    ckpt = load_checkpoint(Path(run_dir) / "chain.pkl")
    samples = ckpt["samples"]
    cfg = ckpt["cfg"]
    A = np.mean([s.A for s in samples], axis=0)
    K = A.shape[0]

    z = ckpt["z_last"]
    all_z = np.concatenate([zi for zi in z if len(zi) > 0])
    print(f"State distribution: {Counter(all_z.tolist())}")
    for k in range(K):
        pct = (all_z == k).sum() / len(all_z) * 100
        print(f"  State {k}: {pct:.1f}%")
    print()

    for k in range(K):
        A_k = A[k, :, :2]
        b_k = A[k, :, 2]
        evals = np.linalg.eigvals(A_k)
        sr = max(abs(evals))
        print(f"=== State {k} ===")
        print(f"A = [{A_k[0,0]:+.4f}, {A_k[0,1]:+.4f}]")
        print(f"    [{A_k[1,0]:+.4f}, {A_k[1,1]:+.4f}]")
        print(f"b = [{b_k[0]:+.4f}, {b_k[1]:+.4f}]")
        print(f"Spectral radius = {sr:.6f}")
        for v in evals:
            if np.isreal(v):
                print(f"  eigenvalue: {v.real:.6f}")
            else:
                print(f"  eigenvalue: {v.real:.6f} +/- {abs(v.imag):.6f}j  (|λ|={abs(v):.6f})")
        print()

    # Observation noise
    S_mean = np.mean([s.S for s in samples], axis=0)
    print(f"=== Learned observation noise S ===")
    print(f"S = {S_mean}")
    print()

    print("=== Frobenius distances between A matrices ===")
    for i in range(K):
        for j in range(i+1, K):
            d = np.linalg.norm(A[i] - A[j])
            print(f"  State {i} vs {j}: {d:.4f}")


# =========================================================================
# Main
# =========================================================================
def main():
    DATA_ROOT = r"d:\intuitive physics\pendulum_dataset\data\pendulum"
    RUN_DIR = str(Path(__file__).resolve().parents[1] / "runs" / "K10_slds_vi")

    print(f"[viz] Run directory: {RUN_DIR}")
    print(f"[viz] Data root: {DATA_ROOT}")

    # --- Load config to get K ---
    ckpt = load_checkpoint(Path(RUN_DIR) / "chain.pkl")
    cfg = ckpt["cfg"]
    print(f"[viz] K={cfg.K}, mode={cfg.recurrence_mode}")

    # --- Pick val trajectories for viz ---
    print("\n[viz] Loading val data to pick trajectories...")
    try:
        val_trajs = _load_and_wrap_test(DATA_ROOT, "val", cfg)
        viz_ids = []
        seen_regimes = set()
        for tr in val_trajs:
            if tr.regime not in seen_regimes and len(viz_ids) < 3:
                viz_ids.append(tr.id)
                seen_regimes.add(tr.regime)
        for tr in val_trajs:
            if len(viz_ids) >= 3:
                break
            if tr.id not in viz_ids:
                viz_ids.append(tr.id)
        print(f"[viz] Selected trajectories: {viz_ids}")
    except Exception as e:
        print(f"[WARN] Could not load val split: {e}")
        viz_ids = []

    # --- Run all visualizations ---
    # 1. viz_dynamics
    run_viz_dynamics(RUN_DIR)

    # 2. viz_subspace_error
    run_viz_subspace_error(RUN_DIR, DATA_ROOT)

    # 3. viz_trajectory
    if viz_ids:
        run_viz_trajectory(RUN_DIR, DATA_ROOT, viz_ids, split="val")

    # 4. viz_rollout_gif
    if viz_ids:
        run_viz_rollout_gif(RUN_DIR, DATA_ROOT, viz_ids, split="val",
                            prefix=100, horizon=250)

    # 5. Analysis
    run_analyze_K(RUN_DIR)

    print("\n" + "="*60)
    print("  ALL DONE!")
    print("="*60)
    print(f"  Output directory: {RUN_DIR}")
    print(f"  Files generated:")
    out_dir = Path(RUN_DIR)
    for f in sorted(out_dir.iterdir()):
        print(f"    {f.name}  ({f.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
