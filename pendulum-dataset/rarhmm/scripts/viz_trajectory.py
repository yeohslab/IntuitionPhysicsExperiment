"""Visualization #2 — replicate the user-supplied screenshots.

Three panels:
  (a) AR-HMM EM log-likelihood vs Gibbs iteration with a dotted "true" reference,
  (b) 2 x K grid of vector fields: "true dynamics" (analytic pendulum) vs
      "inferred dynamics" (per-state posterior-mean A_k),
  (c) one trajectory in (theta, omega) plane, colored by inferred discrete state,
      with faint lines connecting consecutive points (paper Fig.1c style).

Usage:
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.viz_trajectory `
        --run runs\\K5 --traj-id traj_000123 --data-root ..\\data\\pendulum
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.config import Config
from rarhmm.data import load_split
from rarhmm.train import load_checkpoint
from rarhmm.model import RecurrentARHMM
from rarhmm.inference import _per_traj_logobs_logtrans, ffbs_single


def true_pendulum_field(TH, OM, g=9.8, L=1.0, omega0=None):
    omega0 = omega0 or np.sqrt(g / L)
    U = OM * omega0                                # d theta / dt = omega (un-normalized)
    V = -(g / L) * np.sin(TH) / omega0             # d(omega/omega0)/dt
    return U, V


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, type=str)
    ap.add_argument("--data-root", required=True, type=str)
    ap.add_argument("--traj-id", type=str, default=None,
                    help="Trajectory id (defaults to first val trajectory).")
    ap.add_argument("--split", default="val", choices=["train", "val", "test_in_dist", "test_energy_oos"])
    ap.add_argument("--theta-range", type=float, nargs=2, default=[-np.pi, np.pi])
    ap.add_argument("--omega-range", type=float, nargs=2, default=[-3.0, 3.0])
    ap.add_argument("--grid", type=int, default=22)
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()

    ckpt = load_checkpoint(Path(args.run) / "chain.pkl")
    cfg: Config = ckpt["cfg"]
    samples = ckpt["samples"]
    hist = ckpt["loglik_history"]
    K = cfg.K

    # posterior mean
    A_mean = np.mean([s.A for s in samples], axis=0)
    Q_mean = np.mean([s.Q for s in samples], axis=0)
    R_mean = np.mean([s.R for s in samples], axis=0)
    r_mean = np.mean([s.r for s in samples], axis=0)
    p_last = samples[-1]
    p_last.A = A_mean; p_last.Q = Q_mean; p_last.R = R_mean; p_last.r = r_mean

    # pick a trajectory and infer z via FFBS
    trajs = load_split(args.data_root, args.split, cfg)
    if args.traj_id is not None:
        tr = next((t for t in trajs if t.id == args.traj_id), None)
        if tr is None:
            raise ValueError(f"traj-id {args.traj_id} not found in split {args.split}")
    else:
        tr = trajs[0]
    bundle = _per_traj_logobs_logtrans(tr, p_last, cfg)
    log_obs, log_trans, _ = bundle
    rng = np.random.default_rng(0)
    log_init = ckpt.get("log_init", np.full(K, -np.log(K)))
    z_hmm = ffbs_single(log_init, log_trans, log_obs, rng)
    P = cfg.ar_lag
    z_full = np.empty(tr.x.shape[0], dtype=np.int64)
    z_full[: P - 1] = z_hmm[0]; z_full[P - 1 :] = z_hmm

    # ---------------- figure ----------------
    fig = plt.figure(figsize=(4.5 + 3.0 * K, 9.5))
    gs = fig.add_gridspec(3, max(K, 2), height_ratios=[1, 1.1, 1.1])

    # (a) log-likelihood
    ax_ll = fig.add_subplot(gs[0, :])
    ax_ll.plot(hist, lw=1.2, label="Gibbs log-lik proxy")
    if cfg.n_burnin > 0:
        ax_ll.axvline(cfg.n_burnin, color="grey", ls=":", lw=0.8, label="end of burn-in")
    ax_ll.set_xlabel("iteration"); ax_ll.set_ylabel("log-likelihood (a.u.)")
    ax_ll.set_title("(a) training curve")
    ax_ll.legend(loc="lower right", fontsize=8)

    # (b) true vs inferred vector fields, side-by-side per state
    thetas = np.linspace(*args.theta_range, args.grid)
    omegas = np.linspace(*args.omega_range, args.grid)
    TH, OM = np.meshgrid(thetas, omegas)
    Utrue, Vtrue = true_pendulum_field(TH, OM, cfg.g, cfg.L, cfg.omega0)
    cmap = plt.get_cmap("tab10")

    for k in range(K):
        ax = fig.add_subplot(gs[1, k])
        ax.streamplot(TH, OM, Utrue, Vtrue, density=1.0, color="0.4", linewidth=0.8)
        ax.set_title(f"true | state slice k={k}")
        ax.set_xlim(args.theta_range); ax.set_ylim(args.omega_range)
        if k == 0:
            ax.set_ylabel(r"$\omega/\omega_0$")
        ax.set_xticklabels([])

        ax2 = fig.add_subplot(gs[2, k])
        XY = np.stack([TH.ravel(), OM.ravel()], axis=-1)
        if cfg.obs_repr == "sincos_omega":
            XY = np.stack([np.sin(TH.ravel()), np.cos(TH.ravel()), OM.ravel()], -1)
        lagged = np.concatenate([XY, np.ones((XY.shape[0], 1))], axis=1)
        mu = lagged @ A_mean[k].T
        if cfg.obs_repr == "theta_omega":
            U = ((mu[:, 0] - XY[:, 0]).reshape(TH.shape)) / cfg.dt
            V = ((mu[:, 1] - XY[:, 1]).reshape(TH.shape)) / cfg.dt
        else:
            U = OM
            V = (mu[:, 2].reshape(TH.shape) - XY[:, 2].reshape(TH.shape)) / cfg.dt
        ax2.streamplot(TH, OM, U, V, density=1.0, color=cmap(k), linewidth=0.9)
        ax2.set_title(f"inferred | state k={k}")
        ax2.set_xlabel(r"$\theta$"); ax2.set_xlim(args.theta_range); ax2.set_ylim(args.omega_range)
        if k == 0:
            ax2.set_ylabel(r"$\omega/\omega_0$")

    # (c) the colored trajectory — inset on the rightmost column row 1+2 if room
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
    out = Path(args.out or Path(args.run) / f"viz_trajectory_{tr.id}.png")
    fig.savefig(out, dpi=160)
    print(f"[viz_trajectory] saved {out}")


if __name__ == "__main__":
    main()
