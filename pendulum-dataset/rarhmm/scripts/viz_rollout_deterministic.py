"""Deterministic rollout GIF — same as viz_rollout_gif but without process noise.

Compares stochastic (original, with Q noise) vs deterministic (no Q noise) rollouts.

Usage:
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.viz_rollout_deterministic ^
        --run runs/K10_theta_allE_wrap_vi --data-root ..\data\pendulum ^
        --traj-id traj_002973 --prefix 100 --horizon 250 --n-samples 12
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
from rarhmm.data import load_split, Trajectory
from rarhmm.train import load_checkpoint
from rarhmm.predict import rollout_posterior
from rarhmm.model import ModelParams
from rarhmm.stick_breaking import stick_breaking_log_probs
from rarhmm.inference import _per_traj_logobs_logtrans, ffbs_single


def rollout_deterministic(cfg: Config, params: ModelParams, prefix_x: np.ndarray,
                          horizon: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Deterministic rollout: x_next = A·x (no process noise Q)."""
    P, M = cfg.ar_lag, cfg.obs_dim
    T0 = prefix_x.shape[0]

    # Get last state via FFBS on prefix
    tr_prefix = Trajectory(id="prefix", regime="", E_bar=np.nan,
                           theta=np.zeros(T0), omega=np.zeros(T0), x=prefix_x)
    K = params.K
    log_init = np.full(K, -np.log(K))
    bundle = _per_traj_logobs_logtrans(tr_prefix, params, cfg)
    if bundle is None:
        z_prev = int(rng.choice(K))
    else:
        log_obs, log_trans, _ = bundle
        z = ffbs_single(log_init, log_trans, log_obs, rng)
        z_prev = int(z[-1])

    x_hist = list(prefix_x[-P:])
    x_pred = np.empty((horizon, M))
    z_pred = np.empty(horizon, dtype=np.int64)

    for h in range(horizon):
        x_now = x_hist[-1]
        nu = params.recurrence_logits(x_now[None, :], np.array([z_prev]))[0]
        log_pi = stick_breaking_log_probs(nu)
        log_pi -= log_pi.max()
        pi = np.exp(log_pi)
        pi /= pi.sum()
        # Deterministic state selection: argmax instead of sampling
        z_new = int(np.argmax(pi))
        # Deterministic dynamics: just the mean, NO noise
        lagged = np.concatenate(list(x_hist[-P:]) + [[1.0]])
        mu = params.A[z_new] @ lagged
        x_new = mu  # <-- NO L @ rng.standard_normal(M)
        x_pred[h] = x_new
        z_pred[h] = z_new
        x_hist.append(x_new)
        z_prev = z_new

    return x_pred, z_pred


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, type=str)
    ap.add_argument("--data-root", required=True, type=str)
    ap.add_argument("--traj-id", required=True, type=str)
    ap.add_argument("--split", default="val",
                    choices=["train", "val", "test_in_dist", "test_energy_oos"])
    ap.add_argument("--prefix", type=int, default=200)
    ap.add_argument("--horizon", type=int, default=400)
    ap.add_argument("--n-samples", type=int, default=12, help="stochastic samples for comparison")
    ap.add_argument("--fps", type=int, default=20)
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()

    ckpt = load_checkpoint(Path(args.run) / "chain.pkl")
    cfg: Config = ckpt["cfg"]
    samples = ckpt["samples"]
    p = samples[0]

    trajs = load_split(args.data_root, args.split, cfg)
    tr = next((t for t in trajs if t.id == args.traj_id), None)
    if tr is None:
        raise ValueError(f"traj-id {args.traj_id} not found in {args.split}")

    T_total = tr.x.shape[0]
    T0 = min(args.prefix, T_total - 2)
    H = min(args.horizon, T_total - T0)
    assert T0 + H <= T_total

    rng = np.random.default_rng(0)

    # --- Deterministic rollout (single trajectory, no noise) ---
    X_det, Z_det = rollout_deterministic(cfg, p, tr.x[:T0], H, rng)
    theta_det = X_det[:, 0]
    omega_det = X_det[:, 1]

    # --- Stochastic rollouts for comparison ---
    rng2 = np.random.default_rng(42)
    Xs_stoch, Zs_stoch = rollout_posterior(cfg, samples, tr.x[:T0], H, args.n_samples, rng2)
    theta_stoch = Xs_stoch[..., 0]
    omega_stoch = Xs_stoch[..., 1]

    # Ground truth
    theta_gt_pre = tr.theta[:T0]
    theta_gt_fut = tr.theta[T0: T0 + H]
    omega_gt_pre = tr.omega[:T0] / cfg.omega0
    omega_gt_fut = tr.omega[T0: T0 + H] / cfg.omega0
    t_pre = np.arange(T0) * cfg.dt
    t_fut = np.arange(T0, T0 + H) * cfg.dt

    # Print errors
    for label, th_pred in [("Deterministic", theta_det),
                           ("Stochastic[0]", theta_stoch[0])]:
        for h_step in [10, 50, 100, min(H-1, 249)]:
            if h_step < H:
                err = abs(th_pred[h_step] - theta_gt_fut[h_step])
                print(f"  {label:15s} h={h_step:3d}: err={err:.6f} rad")
        print()

    # --- Create GIF ---
    fig, axes = plt.subplots(1, 3, figsize=(14, 4.5),
                             gridspec_kw={"width_ratios": [1, 1.4, 1.4]})
    ax_p, ax_th, ax_om = axes

    Lp = cfg.L
    ax_p.set_xlim(-1.2 * Lp, 1.2 * Lp)
    ax_p.set_ylim(-1.2 * Lp, 1.2 * Lp)
    ax_p.set_aspect("equal"); ax_p.set_xticks([]); ax_p.set_yticks([])
    rod_gt, = ax_p.plot([], [], "-", color="k", lw=2.5)
    bob_gt, = ax_p.plot([], [], "o", color="k", ms=12)
    rod_det, = ax_p.plot([], [], "-", color="tab:blue", lw=2, alpha=0.9)
    bob_det, = ax_p.plot([], [], "o", color="tab:blue", ms=10, alpha=0.9)
    ax_p.plot(0, 0, "+", color="grey")

    for ax, ylab, gt_pre, gt_fut, det_data, stoch_data in [
        (ax_th, r"$\theta$ (rad)", theta_gt_pre, theta_gt_fut, theta_det, theta_stoch),
        (ax_om, r"$\omega/\omega_0$", omega_gt_pre, omega_gt_fut, omega_det, omega_stoch),
    ]:
        ax.plot(t_pre, gt_pre, color="0.55", lw=1.2, label="prefix")
        ax.plot(t_fut, gt_fut, color="black", lw=1.8, label="ground truth")
        # Stochastic samples (faint red)
        for d in range(args.n_samples):
            ax.plot(t_fut, stoch_data[d], color="tab:red", lw=0.4, alpha=0.25,
                    label="stochastic" if d == 0 else None)
        # Deterministic rollout (solid blue, prominent)
        ax.plot(t_fut, det_data, color="tab:blue", lw=2.0, alpha=0.9,
                label="deterministic (no Q)")
        ax.set_xlabel("t [s]"); ax.set_ylabel(ylab)
        ax.axvline(T0 * cfg.dt, color="grey", ls=":", lw=0.8)
        ax.legend(loc="best", fontsize=7)

    ax_th.set_title("θ(t): deterministic (blue) vs stochastic (red)")
    ax_om.set_title("ω(t)/ω₀")

    now_lines = [ax_th.axvline(0, color="orange", lw=1.2),
                 ax_om.axvline(0, color="orange", lw=1.2)]

    theta_full_gt = np.concatenate([theta_gt_pre, theta_gt_fut])
    theta_full_det = np.concatenate([theta_gt_pre, theta_det])

    def update(frame):
        th_gt = theta_full_gt[frame]
        th_det = theta_full_det[frame]
        x_gt, y_gt = Lp * np.sin(th_gt), -Lp * np.cos(th_gt)
        x_det, y_det = Lp * np.sin(th_det), -Lp * np.cos(th_det)
        rod_gt.set_data([0, x_gt], [0, y_gt]); bob_gt.set_data([x_gt], [y_gt])
        if frame >= T0:
            rod_det.set_data([0, x_det], [0, y_det])
            bob_det.set_data([x_det], [y_det])
        else:
            rod_det.set_data([], []); bob_det.set_data([], [])
        for nl in now_lines:
            nl.set_xdata([frame * cfg.dt, frame * cfg.dt])
        ax_p.set_title(f"t={frame*cfg.dt:.2f}s  "
                       f"({'prefix' if frame < T0 else 'forecast'})")
        return rod_gt, bob_gt, rod_det, bob_det, *now_lines

    nframes = T0 + H
    ani = anim.FuncAnimation(fig, update, frames=nframes,
                             interval=1000 / args.fps, blit=False)
    out = Path(args.out or
               Path(args.run) / f"rollout_det_{tr.id}_T0={T0}_H={H}.gif")
    ani.save(out, writer=anim.PillowWriter(fps=args.fps))
    print(f"[viz_rollout_det] saved {out}")


if __name__ == "__main__":
    main()
