"""Train K=5 rAR-HMM on energy-stratified 100 trajectories with theta-omega repr.

Key differences from K5_theta:
  * Includes ALL energy segments (libration_small, libration_large, rotation)
  * For rotation trajectories, theta is wrapped to [-pi, pi] so the model
    sees a bounded phase space
  * Uses theta_omega observation representation (M=2)
  * Energy-stratified sampling: 100 trajectories covering all energy bins

After training, runs ALL visualizations matching the K5_theta run:
  1. viz_dynamics       — vector fields + transition probabilities
  2. viz_subspace_error — one-step prediction error heatmap
  3. viz_trajectory     — log-lik curve + vector fields + colored trajectory
  4. viz_rollout_gif    — animated rollout GIF

Usage:
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.train_and_viz_K5_theta_allE
"""
from __future__ import annotations

import argparse
import sys
import pickle
from collections import defaultdict, Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.config import Config
from rarhmm.data import load_split, Trajectory, _to_x
from rarhmm.train import fit, load_checkpoint


# =========================================================================
# Theta wrapping utility
# =========================================================================
def wrap_to_pi(theta: np.ndarray) -> np.ndarray:
    """Wrap angle array to [-pi, pi]."""
    return (theta + np.pi) % (2 * np.pi) - np.pi


def wrap_trajectory(tr: Trajectory, cfg: Config) -> Trajectory:
    """Return a new Trajectory with theta wrapped to [-pi, pi],
    and x recomputed from the wrapped theta."""
    theta_wrapped = wrap_to_pi(tr.theta)
    x_new = _to_x(theta_wrapped, tr.omega, cfg)
    return Trajectory(
        id=tr.id,
        regime=tr.regime,
        E_bar=tr.E_bar,
        theta=theta_wrapped,
        omega=tr.omega,
        x=x_new,
        split=tr.split,
    )


# =========================================================================
# Energy-stratified subset selection
# =========================================================================
def stratified_subset(trajs, target_n: int, seed: int):
    """Return a stratified subset of `trajs` of size ~target_n.

    Strategy: group trajectories by their E_bar; take one per group first (so
    every energy bin is covered), then top up uniformly at random from the
    remaining pool until reaching target_n.
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
        rng.shuffle(picked)
        picked = picked[:target_n]
    else:
        remainder = target_n - n_bins
        if remainder > 0:
            rng.shuffle(pool)
            picked.extend(pool[:remainder])

    picked.sort(key=lambda i: trajs[i].E_bar)
    return [trajs[i] for i in picked]


# =========================================================================
# Visualization runners
# =========================================================================
def run_viz_dynamics(run_dir: str):
    """Run viz_dynamics.py"""
    print("\n" + "="*60)
    print("  VISUALIZATION 1: viz_dynamics")
    print("="*60)
    import scripts.viz_dynamics as vd
    sys.argv = ["viz_dynamics", "--run", run_dir]
    vd.main()


def run_viz_subspace_error(run_dir: str, data_root: str):
    """Run viz_subspace_error.py — but with theta-wrapped test data."""
    print("\n" + "="*60)
    print("  VISUALIZATION 2: viz_subspace_error")
    print("="*60)
    # We need to wrap test data too, so we'll do it inline
    from rarhmm.train import load_checkpoint as lc
    from rarhmm.model import ModelParams
    from rarhmm.inference import _per_traj_logobs_logtrans, ffbs_single
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.colors as mcolors

    ckpt = lc(Path(run_dir) / "chain.pkl")
    cfg = ckpt["cfg"]
    samples = ckpt["samples"]
    if len(samples) == 0:
        print("[WARN] No posterior samples, skipping viz_subspace_error")
        return

    A = np.mean([s.A for s in samples], axis=0)
    Q = np.mean([s.Q for s in samples], axis=0)
    R = np.mean([s.R for s in samples], axis=0)
    r = np.mean([s.r for s in samples], axis=0)
    p = samples[-1]
    p.A = A; p.Q = Q; p.R = R; p.r = r
    K = cfg.K
    log_init = ckpt.get("log_init", np.full(K, -np.log(K)))

    splits_to_plot = ["test_in_dist", "test_energy_oos"]
    results = {}
    P = cfg.ar_lag

    for split_name in splits_to_plot:
        print(f"[viz_subspace_error] loading split: {split_name}")
        trajs = load_split(data_root, split_name, cfg)
        # Wrap theta for all test trajectories
        trajs = [wrap_trajectory(t, cfg) for t in trajs]
        print(f"[viz_subspace_error]   {len(trajs)} trajectories, "
              f"{sum(t.x.shape[0] for t in trajs)} time-points")

        all_theta, all_omega, all_error, all_regime = [], [], [], []
        rng = np.random.default_rng(42)

        for tr in trajs:
            T = tr.x.shape[0]
            if T <= P:
                continue
            if K == 1:
                z_full = np.zeros(T, dtype=np.int64)
            else:
                bundle = _per_traj_logobs_logtrans(tr, p, cfg)
                if bundle is None:
                    continue
                log_obs, log_trans, _ = bundle
                z_hmm = ffbs_single(log_init, log_trans, log_obs, rng)
                z_full = np.empty(T, dtype=np.int64)
                z_full[:P - 1] = z_hmm[0]
                z_full[P - 1:] = z_hmm

            lagged = np.concatenate(
                [tr.x[P - k - 1: T - k - 1] for k in range(P)], axis=1
            )
            lagged = np.concatenate([lagged, np.ones((T - P, 1))], axis=1)

            for s in range(T - P):
                t_idx = s + P
                k = z_full[t_idx]
                mu = p.A[k] @ lagged[s]
                x_true = tr.x[t_idx]
                err = float(abs(mu[0] - x_true[0]))
                all_theta.append(tr.x[t_idx, 0])
                all_omega.append(tr.x[t_idx, 1])
                all_error.append(err)
                all_regime.append(tr.regime)

        theta = np.array(all_theta)
        omega = np.array(all_omega)
        error = np.array(all_error)
        regime = np.array(all_regime)
        results[split_name] = (theta, omega, error, regime)
        print(f"[viz_subspace_error]   {len(theta)} evaluation points, "
              f"error: mean={error.mean():.4f}, median={np.median(error):.4f}, "
              f"p95={np.percentile(error, 95):.4f}, max={error.max():.4f}")

    all_errors = np.concatenate([r[2] for r in results.values()])
    vmax = np.percentile(all_errors, 97)

    fig, axes = plt.subplots(1, len(splits_to_plot), figsize=(7 * len(splits_to_plot), 6))
    if len(splits_to_plot) == 1:
        axes = [axes]

    for ax, split_name in zip(axes, splits_to_plot):
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

    cbar = fig.colorbar(sc, ax=axes, shrink=0.75, pad=0.02)
    cbar.set_label(r"$| \hat{\theta}_{t+1} - \theta_{t+1} |$  (one-step error, rad)")
    fig.suptitle(
        f"rAR-HMM per-point prediction accuracy in (θ, ω/ω₀) subspace  "
        f"(K={K}, mode={cfg.recurrence_mode})",
        fontsize=12, fontweight="bold")
    fig.tight_layout(rect=[0, 0, 1, 0.94])
    out = Path(run_dir) / "viz_subspace_error.png"
    fig.savefig(out, dpi=180, bbox_inches="tight")
    plt.close(fig)
    print(f"[viz_subspace_error] saved {out}")


def run_viz_trajectory(run_dir: str, data_root: str, traj_ids: list, split: str = "val"):
    """Run viz_trajectory for each traj_id, wrapping theta."""
    print("\n" + "="*60)
    print("  VISUALIZATION 3: viz_trajectory")
    print("="*60)
    from rarhmm.train import load_checkpoint as lc
    from rarhmm.inference import _per_traj_logobs_logtrans, ffbs_single
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    ckpt = lc(Path(run_dir) / "chain.pkl")
    cfg = ckpt["cfg"]
    samples = ckpt["samples"]
    hist = ckpt["loglik_history"]
    K = cfg.K

    A_mean = np.mean([s.A for s in samples], axis=0)
    Q_mean = np.mean([s.Q for s in samples], axis=0)
    R_mean = np.mean([s.R for s in samples], axis=0)
    r_mean = np.mean([s.r for s in samples], axis=0)
    p_last = samples[-1]
    p_last.A = A_mean; p_last.Q = Q_mean; p_last.R = R_mean; p_last.r = r_mean

    trajs = load_split(data_root, split, cfg)
    trajs = [wrap_trajectory(t, cfg) for t in trajs]

    for traj_id in traj_ids:
        tr = next((t for t in trajs if t.id == traj_id), None)
        if tr is None:
            print(f"[WARN] traj {traj_id} not found in {split}, skipping")
            continue

        bundle = _per_traj_logobs_logtrans(tr, p_last, cfg)
        log_obs, log_trans, _ = bundle
        rng = np.random.default_rng(0)
        log_init = ckpt.get("log_init", np.full(K, -np.log(K)))
        z_hmm = ffbs_single(log_init, log_trans, log_obs, rng)
        P = cfg.ar_lag
        z_full = np.empty(tr.x.shape[0], dtype=np.int64)
        z_full[: P - 1] = z_hmm[0]; z_full[P - 1:] = z_hmm

        theta_range = [-np.pi, np.pi]
        omega_range = [-3.0, 3.0]
        grid = 22

        fig = plt.figure(figsize=(4.5 + 3.0 * K, 9.5))
        gs = fig.add_gridspec(3, max(K, 2), height_ratios=[1, 1.1, 1.1])

        ax_ll = fig.add_subplot(gs[0, :])
        ax_ll.plot(hist, lw=1.2, label="Gibbs log-lik proxy")
        if cfg.n_burnin > 0:
            ax_ll.axvline(cfg.n_burnin, color="grey", ls=":", lw=0.8, label="end of burn-in")
        ax_ll.set_xlabel("iteration"); ax_ll.set_ylabel("log-likelihood (a.u.)")
        ax_ll.set_title("(a) training curve")
        ax_ll.legend(loc="lower right", fontsize=8)

        thetas = np.linspace(*theta_range, grid)
        omegas = np.linspace(*omega_range, grid)
        TH, OM = np.meshgrid(thetas, omegas)

        def true_pendulum_field(TH, OM, g=9.8, L=1.0, omega0=None):
            omega0 = omega0 or np.sqrt(g / L)
            U = OM * omega0
            V = -(g / L) * np.sin(TH) / omega0
            return U, V

        Utrue, Vtrue = true_pendulum_field(TH, OM, cfg.g, cfg.L, cfg.omega0)
        cmap = plt.get_cmap("tab10")

        for k in range(K):
            ax = fig.add_subplot(gs[1, k])
            ax.streamplot(TH, OM, Utrue, Vtrue, density=1.0, color="0.4", linewidth=0.8)
            ax.set_title(f"true | state slice k={k}")
            ax.set_xlim(theta_range); ax.set_ylim(omega_range)
            if k == 0:
                ax.set_ylabel(r"$\omega/\omega_0$")
            ax.set_xticklabels([])

            ax2 = fig.add_subplot(gs[2, k])
            XY = np.stack([TH.ravel(), OM.ravel()], axis=-1)
            lagged = np.concatenate([XY, np.ones((XY.shape[0], 1))], axis=1)
            mu = lagged @ A_mean[k].T
            U = ((mu[:, 0] - XY[:, 0]).reshape(TH.shape)) / cfg.dt
            V = ((mu[:, 1] - XY[:, 1]).reshape(TH.shape)) / cfg.dt
            ax2.streamplot(TH, OM, U, V, density=1.0, color=cmap(k), linewidth=0.9)
            ax2.set_title(f"inferred | state k={k}")
            ax2.set_xlabel(r"$\theta$"); ax2.set_xlim(theta_range); ax2.set_ylim(omega_range)
            if k == 0:
                ax2.set_ylabel(r"$\omega/\omega_0$")

        ax_tr = fig.add_axes([0.7, 0.04, 0.27, 0.27])
        theta_plot = tr.theta
        om_plot = tr.omega / cfg.omega0
        ax_tr.plot(theta_plot, om_plot, color="0.7", lw=0.5, alpha=0.7, zorder=1)
        for k in range(K):
            m = (z_full == k)
            ax_tr.scatter(theta_plot[m], om_plot[m], s=6, color=cmap(k),
                          label=f"k={k}", zorder=2)
        ax_tr.set_title(f"(c) trajectory {tr.id} colored by inferred state")
        ax_tr.set_xlabel(r"$\theta$"); ax_tr.set_ylabel(r"$\omega/\omega_0$")
        ax_tr.legend(fontsize=7, loc="best", ncol=2)

        fig.suptitle(f"rAR-HMM diagnostics  (K={K}, mode={cfg.recurrence_mode})")
        fig.tight_layout(rect=[0, 0, 0.68, 0.96])
        out = Path(run_dir) / f"viz_trajectory_{tr.id}.png"
        fig.savefig(out, dpi=160)
        plt.close(fig)
        print(f"[viz_trajectory] saved {out}")


def run_viz_rollout_gif(run_dir: str, data_root: str, traj_ids: list,
                        split: str = "val", prefix: int = 100, horizon: int = 250):
    """Run rollout GIF for each traj_id, wrapping theta."""
    print("\n" + "="*60)
    print("  VISUALIZATION 4: viz_rollout_gif")
    print("="*60)
    from rarhmm.train import load_checkpoint as lc
    from rarhmm.predict import rollout_posterior
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.animation as anim

    ckpt = lc(Path(run_dir) / "chain.pkl")
    cfg = ckpt["cfg"]
    samples = ckpt["samples"]

    trajs = load_split(data_root, split, cfg)
    trajs = [wrap_trajectory(t, cfg) for t in trajs]

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
        Xs, Zs = rollout_posterior(cfg, samples, tr.x[:T0], H, n_samples, rng)

        # For theta_omega, x[...,0] is theta, x[...,1] is omega/omega0
        theta_s = Xs[..., 0]
        omega_s = Xs[..., 1]
        # Wrap predicted theta to [-pi, pi] as well
        theta_s = wrap_to_pi(theta_s)

        theta_gt_pre = tr.theta[:T0]
        theta_gt_fut = tr.theta[T0: T0 + H]
        omega_gt_pre = tr.omega[:T0] / cfg.omega0
        omega_gt_fut = tr.omega[T0: T0 + H] / cfg.omega0
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


def run_analyze_k5(run_dir: str):
    """Run analysis of K5 A matrices (like _analyze_k5_theta.py)."""
    print("\n" + "="*60)
    print("  ANALYSIS: K5 A matrices")
    print("="*60)
    ckpt = pickle.load(open(Path(run_dir) / "chain.pkl", "rb"))
    samples = ckpt["samples"]
    A = np.mean([s.A for s in samples], axis=0)
    K = A.shape[0]

    z = ckpt["z_last"]
    all_z = np.concatenate(z)
    print(f"State distribution: {Counter(all_z.tolist())}")
    for k in range(K):
        pct = (all_z == k).sum() / len(all_z) * 100
        print(f"  State {k+1}: {pct:.1f}%")
    print()

    for k in range(K):
        A_k = A[k, :, :2]
        b_k = A[k, :, 2]
        evals = np.linalg.eigvals(A_k)
        sr = max(abs(evals))
        print(f"=== State {k+1} ===")
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

    print("=== Frobenius distances between A matrices ===")
    for i in range(K):
        for j in range(i+1, K):
            d = np.linalg.norm(A[i] - A[j])
            print(f"  State {i+1} vs {j+1}: {d:.4f}")


# =========================================================================
# Main
# =========================================================================
def main():
    DATA_ROOT = r"d:\intuitive physics\pendulum_dataset\data\pendulum"
    RUN_DIR = r"runs\K5_theta_allE"
    TARGET_N = 100
    SEED = 20260518

    # ---------- Config ----------
    cfg = Config(
        K=5,
        obs_repr="theta_omega",
        recurrence_mode="ro",
        ar_lag=1,
        n_iter=100,
        n_burnin=40,
        n_thin=3,
        init_seed=SEED,
        out_dir=RUN_DIR,
    )
    print(f"[cfg] {cfg}")

    # ---------- Load & wrap ----------
    print("\n[data] Loading full training split...")
    trajs_all = load_split(DATA_ROOT, "train", cfg, max_trajs=None)
    print(f"[data] Full train split: {len(trajs_all)} trajectories")

    # Wrap theta to [-pi, pi] for ALL trajectories (including rotation)
    print("[data] Wrapping theta to [-pi, pi] for all trajectories...")
    trajs_all = [wrap_trajectory(t, cfg) for t in trajs_all]

    # Check wrapping worked
    all_theta = np.concatenate([t.theta for t in trajs_all])
    print(f"[data] After wrapping: theta range [{all_theta.min():.4f}, {all_theta.max():.4f}]")

    # ---------- Regime stats ----------
    by_reg = defaultdict(int)
    for t in trajs_all:
        by_reg[t.regime] += 1
    print(f"[data] Regime counts (full): {dict(by_reg)}")

    # ---------- Stratified subset ----------
    trajs = stratified_subset(trajs_all, TARGET_N, seed=SEED)
    print(f"\n[strat] Selected {len(trajs)} trajectories "
          f"({sum(t.x.shape[0] for t in trajs)} time-points) covering "
          f"{len({round(t.E_bar, 6) for t in trajs})} unique energy bins")

    by_reg = defaultdict(int); by_E = defaultdict(int)
    for t in trajs:
        by_reg[t.regime] += 1
        by_E[round(t.E_bar, 6)] += 1
    print(f"[strat] Regime counts: {dict(by_reg)}")
    print(f"[strat] Energy span: min={min(by_E):.3f}  max={max(by_E):.3f}  "
          f"n_unique_E={len(by_E)}")
    print(f"[strat] First/last 5 picks:")
    for t in trajs[:5] + trajs[-5:]:
        print(f"   {t.id}  regime={t.regime:<16s} E_bar={t.E_bar:.3f}  T={t.x.shape[0]}")

    # ---------- Train ----------
    print("\n" + "="*60)
    print("  TRAINING")
    print("="*60)
    ckpt = fit(cfg, trajs, verbose=True)

    # ---------- Identify some trajectories for visualization ----------
    # Pick 3 val trajectories (one from each regime if possible)
    print("\n[viz] Loading val data to pick trajectories for visualization...")
    val_trajs = load_split(DATA_ROOT, "val", cfg)
    val_trajs = [wrap_trajectory(t, cfg) for t in val_trajs]

    # Try to pick one from each regime
    viz_ids = []
    seen_regimes = set()
    for tr in val_trajs:
        if tr.regime not in seen_regimes and len(viz_ids) < 3:
            viz_ids.append(tr.id)
            seen_regimes.add(tr.regime)
    # If we don't have 3 yet, fill up
    for tr in val_trajs:
        if len(viz_ids) >= 3:
            break
        if tr.id not in viz_ids:
            viz_ids.append(tr.id)
    print(f"[viz] Selected trajectories for visualization: {viz_ids}")

    # ---------- Run all visualizations ----------
    run_dir_abs = str(Path(__file__).resolve().parents[1] / RUN_DIR)

    # 1. viz_dynamics
    run_viz_dynamics(run_dir_abs)

    # 2. viz_subspace_error
    run_viz_subspace_error(run_dir_abs, DATA_ROOT)

    # 3. viz_trajectory
    run_viz_trajectory(run_dir_abs, DATA_ROOT, viz_ids, split="val")

    # 4. viz_rollout_gif
    run_viz_rollout_gif(run_dir_abs, DATA_ROOT, viz_ids, split="val",
                        prefix=100, horizon=250)

    # 5. Analysis
    run_analyze_k5(run_dir_abs)

    print("\n" + "="*60)
    print("  ALL DONE!")
    print("="*60)
    print(f"  Output directory: {run_dir_abs}")
    print(f"  Files generated:")
    out_dir = Path(run_dir_abs)
    for f in sorted(out_dir.iterdir()):
        print(f"    {f.name}  ({f.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
