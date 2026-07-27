"""Make large-angle rollout GIFs for the rSLDS model (K=10), near E≈2.

These are near-separatrix libration trajectories: theta reaches close to ±π,
making them the hardest case to predict.

Usage (PowerShell from slds/ root):
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.viz_slds_largeangle_gif
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.animation as anim
import matplotlib.gridspec as gridspec

from slds.config import Config
from slds.data import load_split, _wrap_to_pi, _init_x_from_y
from slds.train import load_checkpoint
from slds.inference import (
    _per_traj_logobs_logtrans, ffbs_single, kalman_smoother_mean,
)
from slds.predict import rollout_posterior
from slds.stick_breaking import stick_breaking_probs


# ─── Paper-style colour palette (10 colours for K=10) ────────────────────────
PAPER_COLORS = [
    (0.214, 0.467, 0.659),
    (0.890, 0.102, 0.110),
    (0.992, 0.749, 0.000),
    (0.506, 0.694, 0.341),
    (0.576, 0.471, 0.376),
    (0.553, 0.427, 0.714),
    (0.980, 0.502, 0.447),
    (0.400, 0.761, 0.647),
    (0.200, 0.200, 0.200),
    (0.800, 0.200, 0.600),
]


def _get_color(k):
    return PAPER_COLORS[k % len(PAPER_COLORS)]


def posterior_mean_params(samples):
    A = np.mean([s.A for s in samples], axis=0)
    Q = np.mean([s.Q for s in samples], axis=0)
    R = np.mean([s.R for s in samples], axis=0)
    r = np.mean([s.r for s in samples], axis=0)
    C = samples[-1].C.copy()
    S = np.mean([s.S for s in samples], axis=0)
    return A, Q, R, r, C, S


def _infer_z_and_x(tr, p, cfg, log_init, rng):
    """FFBS + Kalman smoother to get best z and x for a trajectory."""
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
    z_full[:P - 1] = z_hmm[0]
    z_full[P - 1:] = z_hmm

    # Refine x via Kalman smoother
    tr.x = kalman_smoother_mean(tr.y, z_full, p, cfg)
    return z_full


def make_large_angle_gif(
    run_dir: str,
    data_root: str,
    traj_id: str,
    split: str = "val",
    prefix: int = 60,
    horizon: int = 200,
    n_samples: int = 15,
    fps: int = 25,
    out_name: str | None = None,
):
    """Create an animated rollout GIF for a large-angle trajectory.

    Layout:
      Left:   pendulum animation (GT black, model red)
      Middle: θ(t) time-series with posterior predictive fan
      Right:  Phase portrait (θ, ω/ω₀) showing energy contours + trajectory
    """
    RUN = Path(run_dir)

    ckpt = load_checkpoint(RUN / "chain.pkl")
    cfg = ckpt["cfg"]
    samples = ckpt["samples"]
    if not samples:
        print("[WARN] No posterior samples.")
        return

    K = cfg.K
    P = cfg.ar_lag
    log_init = ckpt.get("log_init", np.full(K, -np.log(K)))

    # ── Load trajectory ──
    trajs = load_split(data_root, split, cfg)
    tr = next((t for t in trajs if t.id == traj_id), None)
    if tr is None:
        print(f"[WARN] Trajectory {traj_id} not found in {split}, skipping.")
        return

    E_bar = tr.E_bar
    print(f"[gif] Trajectory {traj_id}  regime={tr.regime}  E={E_bar:.4f}")
    print(f"      max |θ_true| = {np.abs(tr.x_true[:,0]).max():.4f} rad "
          f"({np.degrees(np.abs(tr.x_true[:,0]).max()):.1f}°)")

    T_total = tr.x.shape[0]
    T0 = min(prefix, T_total - 2)
    H = min(horizon, T_total - T0)

    # ── Posterior predictive rollout ──
    rng = np.random.default_rng(0)
    Xs, Zs = rollout_posterior(cfg, samples, tr.y[:T0], H, n_samples, rng)

    theta_s = _wrap_to_pi(Xs[..., 0])   # (n_samples, H)
    omega_s = Xs[..., 1]                 # (n_samples, H)

    theta_gt_pre = tr.x_true[:T0, 0]
    theta_gt_fut = tr.x_true[T0:T0 + H, 0]
    omega_gt_pre = tr.x_true[:T0, 1]
    omega_gt_fut = tr.x_true[T0:T0 + H, 1]
    t_pre = np.arange(T0) * cfg.dt
    t_fut = np.arange(T0, T0 + H) * cfg.dt

    theta_full_gt = np.concatenate([theta_gt_pre, theta_gt_fut])
    omega_full_gt = np.concatenate([omega_gt_pre, omega_gt_fut])
    theta_full_md = np.concatenate(
        [np.tile(theta_gt_pre, (n_samples, 1)), theta_s], axis=1)  # (n_samples, T0+H)

    # ── Infer z for GT trajectory (for phase-portrait coloring) ──
    rng2 = np.random.default_rng(42)
    p_mean = samples[-1]
    A, Q, R, r, C, S = posterior_mean_params(samples)
    from slds.model import ModelParams
    p_vis = ModelParams(
        K=K, M=cfg.obs_dim, D_in_ar=cfg.obs_dim * P + 1, D_in_rec=cfg.obs_dim,
        A=A, Q=Q, R=R, r=r, C=C, S=S, mode=cfg.recurrence_mode,
    )
    z_full = _infer_z_and_x(tr, p_vis, cfg, log_init, rng2)

    # ── Set up figure ──────────────────────────────────────────────────
    Lp = cfg.L
    fig = plt.figure(figsize=(16, 5.5), facecolor="#0d0d0d")
    gs = gridspec.GridSpec(
        1, 3, width_ratios=[1.0, 1.6, 1.4], wspace=0.35, left=0.05, right=0.97,
        top=0.88, bottom=0.12,
    )
    ax_p  = fig.add_subplot(gs[0])   # pendulum panel
    ax_th = fig.add_subplot(gs[1])   # θ(t) time-series
    ax_ph = fig.add_subplot(gs[2])   # phase portrait

    for ax in (ax_p, ax_th, ax_ph):
        ax.set_facecolor("#0d0d0d")
        for spine in ax.spines.values():
            spine.set_color("#555")

    GOLD = "#f5c542"
    RED  = "#ff4444"
    CYAN = "#44d9ff"
    GREY = "#888888"

    # ── Pendulum panel ─────────────────────────────────────────────────
    pad = 1.25 * Lp
    ax_p.set_xlim(-pad, pad); ax_p.set_ylim(-pad, pad)
    ax_p.set_aspect("equal"); ax_p.set_xticks([]); ax_p.set_yticks([])
    ax_p.set_title("Pendulum", color="white", fontsize=11, pad=6)

    # Circular arc for "wall"
    arc_th = np.linspace(0, 2 * np.pi, 200)
    ax_p.plot(Lp * np.cos(arc_th), Lp * np.sin(arc_th),
              color="#333", lw=0.5, zorder=0)
    ax_p.plot(0, 0, "+", color="#666", ms=8)

    rod_gt, = ax_p.plot([], [], "-", color=GOLD,  lw=2.8, zorder=4)
    bob_gt, = ax_p.plot([], [], "o", color=GOLD,  ms=13,  zorder=5)
    rod_md, = ax_p.plot([], [], "--", color=RED,  lw=1.8, alpha=0.9, zorder=3)
    bob_md, = ax_p.plot([], [], "o", color=RED,   ms=10,  alpha=0.9, zorder=3)
    time_txt = ax_p.text(0, pad * 0.88, "", color="white",
                          ha="center", va="center", fontsize=9)

    # ── θ(t) time-series ───────────────────────────────────────────────
    ax_th.set_facecolor("#0d0d0d")
    ax_th.axvline(T0 * cfg.dt, color="#555", ls=":", lw=0.8)
    # Posterior fan
    for d in range(n_samples):
        ax_th.plot(t_fut, theta_s[d], color=RED, lw=0.5, alpha=0.18)
    ax_th.plot(t_pre, theta_gt_pre, color=GREY, lw=1.3,
               label="prefix (observed)")
    ax_th.plot(t_fut, theta_gt_fut, color=GOLD, lw=1.5, label="ground truth")

    # π reference lines
    for yref, lab in [(np.pi, r"$+\pi$"), (-np.pi, r"$-\pi$")]:
        ax_th.axhline(yref, color="#444", ls="--", lw=0.6)
        ax_th.text(t_pre[0], yref + 0.05, lab, color="#666", fontsize=7)

    now_line = ax_th.axvline(0, color="orange", lw=1.2, zorder=10)
    ax_th.set_xlabel("t [s]", color="white", fontsize=9)
    ax_th.set_ylabel(r"$\theta$ (rad)", color="white", fontsize=9)
    ax_th.set_title(
        f"θ(t) — prefix + GT + posterior predictive\n"
        f"(E = {E_bar:.3f}, near-separatrix large-angle libration)",
        color="white", fontsize=9, pad=6,
    )
    ax_th.tick_params(colors="white", labelsize=7)
    leg = ax_th.legend(loc="upper right", fontsize=7,
                        facecolor="#1a1a1a", labelcolor="white", edgecolor="#555")

    # ── Phase portrait ─────────────────────────────────────────────────
    th_grid = np.linspace(-np.pi, np.pi, 300)
    om_grid = np.linspace(-4.5, 4.5, 300)
    TH, OM = np.meshgrid(th_grid, om_grid)
    E_field = 0.5 * OM ** 2 + 1 - np.cos(TH)

    # Energy contours
    contour_levels = [0.5, 1.0, 1.5, 1.9, 2.0, 2.1, 2.5, 3.0, 4.0]
    cs = ax_ph.contour(TH, OM, E_field, levels=contour_levels,
                        colors=["#444"] * len(contour_levels), linewidths=0.5, alpha=0.6)
    # Highlight separatrix (E=2)
    ax_ph.contour(TH, OM, E_field, levels=[2.0],
                   colors=["#ff8800"], linewidths=1.2, alpha=0.9)
    ax_ph.text(0, 3.0, "E = 2 (separatrix)", color="#ff8800", fontsize=7,
               ha="center", va="bottom")

    # Full GT trajectory, colored by discrete state
    theta_ph = tr.x_true[:, 0]
    omega_ph = tr.x_true[:, 1]
    for k in range(K):
        m = (z_full == k)
        if m.any():
            ax_ph.scatter(theta_ph[m], omega_ph[m], s=1.5,
                          color=_get_color(k), alpha=0.5, zorder=2)

    # Moving dot (GT and model)
    ph_dot_gt, = ax_ph.plot([], [], "o", color=GOLD, ms=7, zorder=6)
    ph_dot_md, = ax_ph.plot([], [], "o", color=RED,  ms=6, alpha=0.85, zorder=5)
    ph_tail_gt, = ax_ph.plot([], [], "-", color=GOLD, lw=0.8, alpha=0.5, zorder=4)
    ph_tail_md, = ax_ph.plot([], [], "-", color=RED,  lw=0.8, alpha=0.4, zorder=4)
    TAIL = 25  # tail length in frames

    ax_ph.set_xlim(-np.pi, np.pi)
    ax_ph.set_ylim(-4.5, 4.5)
    ax_ph.set_xlabel(r"$\theta$ (rad)", color="white", fontsize=9)
    ax_ph.set_ylabel(r"$\omega / \omega_0$", color="white", fontsize=9)
    ax_ph.set_title("Phase portrait (colored by inferred state)",
                     color="white", fontsize=9, pad=6)
    ax_ph.tick_params(colors="white", labelsize=7)

    fig.suptitle(
        f"rSLDS (K={K})  ·  Large-angle libration  ·  traj {traj_id}  ·  E={E_bar:.3f}",
        color="white", fontsize=12, fontweight="bold", y=0.97,
    )

    # ── Animation update ───────────────────────────────────────────────
    sample_pick = 0  # show first posterior sample on pendulum

    def update(frame):
        t_now = frame * cfg.dt

        # Pendulum (ground truth)
        th_gt = theta_full_gt[frame]
        x_gt = Lp * np.sin(th_gt)
        y_gt = -Lp * np.cos(th_gt)
        rod_gt.set_data([0, x_gt], [0, y_gt])
        bob_gt.set_data([x_gt], [y_gt])

        # Pendulum (model, only after prefix)
        if frame >= T0:
            th_md = theta_full_md[sample_pick, frame]
            x_md = Lp * np.sin(th_md)
            y_md = -Lp * np.cos(th_md)
            rod_md.set_data([0, x_md], [0, y_md])
            bob_md.set_data([x_md], [y_md])
        else:
            rod_md.set_data([], [])
            bob_md.set_data([], [])

        phase = "prefix" if frame < T0 else "forecast"
        time_txt.set_text(f"t={t_now:.2f}s  [{phase}]")

        # θ(t) timeline
        now_line.set_xdata([t_now, t_now])

        # Phase portrait dots + tails
        i0 = max(0, frame - TAIL)
        ph_tail_gt.set_data(theta_full_gt[i0:frame + 1],
                             omega_full_gt[i0:frame + 1])
        ph_dot_gt.set_data([theta_full_gt[frame]], [omega_full_gt[frame]])

        if frame >= T0:
            fi = frame - T0  # forecast index
            full_om_md = np.concatenate(
                [omega_gt_pre, omega_s[sample_pick]])
            i0m = max(0, frame - TAIL)
            ph_tail_md.set_data(theta_full_md[sample_pick, i0m:frame + 1],
                                 full_om_md[i0m:frame + 1])
            ph_dot_md.set_data([theta_full_md[sample_pick, frame]],
                                [full_om_md[frame]])
        else:
            ph_dot_md.set_data([], [])
            ph_tail_md.set_data([], [])

        return (rod_gt, bob_gt, rod_md, bob_md, time_txt,
                now_line, ph_dot_gt, ph_dot_md, ph_tail_gt, ph_tail_md)

    nframes = T0 + H
    ani = anim.FuncAnimation(fig, update, frames=nframes,
                              interval=1000 / fps, blit=False)
    fname = out_name or f"rollout_largeangle_{traj_id}_E{E_bar:.2f}_T0={T0}_H={H}.gif"
    out_path = RUN / fname
    print(f"[gif] Saving {nframes} frames @ {fps}fps → {out_path} ...")
    ani.save(str(out_path), writer=anim.PillowWriter(fps=fps))
    plt.close(fig)
    print(f"[gif] Saved  ({out_path.stat().st_size / 1024**2:.1f} MB)")
    return str(out_path)


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    DATA_ROOT = r"d:\intuitive physics\pendulum_dataset\data\pendulum"
    RUN_DIR   = str(Path(__file__).resolve().parents[1] / "runs" / "K10_slds_vi")

    # Near-separatrix trajectory IDs (E close to 2, large-angle libration)
    # Discovered by inspection: these are libration_large regime with E ~ 1.9–2.1
    # Try several candidates; use first one found in val split
    candidates_E2 = [
        "traj_002810",  # placeholder – will be replaced from search
        "traj_002815",
        "traj_002820",
        "traj_002825",
        "traj_002830",
    ]

    # Better: auto-find in val split
    print("[main] Scanning val split for near-separatrix trajectories (E≈2)...")
    cfg = Config(K=10, obs_repr="theta_omega", recurrence_mode="ro", ar_lag=1)
    trajs_val = load_split(DATA_ROOT, "val", cfg)
    near_sep = sorted(
        [(tr.id, tr.E_bar, tr.regime) for tr in trajs_val
         if 1.75 <= tr.E_bar <= 2.25 and tr.regime != "rotation"],
        key=lambda x: abs(x[1] - 2.0),
    )
    if not near_sep:
        # Widen search
        near_sep = sorted(
            [(tr.id, tr.E_bar, tr.regime) for tr in trajs_val
             if 1.5 <= tr.E_bar <= 2.5],
            key=lambda x: abs(x[1] - 2.0),
        )

    print(f"[main] Found {len(near_sep)} near-separatrix trajectories:")
    for tid, E, reg in near_sep[:8]:
        print(f"       {tid}  E={E:.4f}  {reg}")

    if not near_sep:
        print("[WARN] No near-separatrix trajectories found.")
        return

    # Make GIF for best 2 candidates
    for tid, E, reg in near_sep[:2]:
        print(f"\n[main] Generating large-angle GIF for {tid} (E={E:.4f}, {reg})...")
        make_large_angle_gif(
            run_dir=RUN_DIR,
            data_root=DATA_ROOT,
            traj_id=tid,
            split="val",
            prefix=60,
            horizon=200,
            n_samples=15,
            fps=25,
        )

    print("\n[main] Done.")


if __name__ == "__main__":
    main()
