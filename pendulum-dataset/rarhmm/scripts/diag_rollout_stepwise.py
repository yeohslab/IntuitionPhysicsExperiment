"""Step-by-step rollout diagnostic: find exactly when and why error explodes.

Prints per-step: state, predicted vs true (θ, ω), cumulative error, and flags
any step where error jumps significantly.

Usage:
    python -m scripts.diag_rollout_stepwise ^
        --run runs/K18_theta_allE_wrap_vi --data-root ..\data\pendulum ^
        --traj-id traj_002973 --prefix 100 --horizon 50
"""
from __future__ import annotations
import argparse, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.config import Config
from rarhmm.data import load_split, Trajectory
from rarhmm.train import load_checkpoint
from rarhmm.model import ModelParams
from rarhmm.stick_breaking import stick_breaking_log_probs
from rarhmm.inference import _per_traj_logobs_logtrans, ffbs_single
import matplotlib.pyplot as plt


def diag_rollout(cfg: Config, params: ModelParams, prefix_x: np.ndarray,
                 gt_future_x: np.ndarray, gt_theta: np.ndarray, gt_omega: np.ndarray,
                 horizon: int):
    """Deterministic rollout with full diagnostics."""
    P, M = cfg.ar_lag, cfg.obs_dim
    T0 = prefix_x.shape[0]
    K = params.K
    rng = np.random.default_rng(0)

    # Get last state via FFBS on prefix
    tr_prefix = Trajectory(id="prefix", regime="", E_bar=np.nan,
                           theta=np.zeros(T0), omega=np.zeros(T0), x=prefix_x)
    log_init = np.full(K, -np.log(K))
    bundle = _per_traj_logobs_logtrans(tr_prefix, params, cfg)
    if bundle is None:
        z_prev = int(rng.choice(K))
    else:
        log_obs, log_trans, _ = bundle
        z = ffbs_single(log_init, log_trans, log_obs, rng)
        z_prev = int(z[-1])

    x_hist = list(prefix_x[-P:])
    
    # Also compute one-step predictions from true data (oracle)
    print("=" * 120)
    print(f"{'h':>3}  {'z':>3}  {'θ_pred':>9}  {'θ_true':>9}  {'θ_err':>9}  "
          f"{'ω_pred':>9}  {'ω_true':>9}  {'ω_err':>9}  "
          f"{'|Δ|':>9}  {'oracle_z':>8}  {'oracle_θerr':>11}  {'flag'}")
    print("-" * 120)

    results = []
    for h in range(horizon):
        x_now = x_hist[-1]
        
        # State assignment from predicted trajectory
        nu = params.recurrence_logits(x_now[None, :], np.array([z_prev]))[0]
        log_pi = stick_breaking_log_probs(nu)
        log_pi -= log_pi.max()
        pi = np.exp(log_pi); pi /= pi.sum()
        z_new = int(np.argmax(pi))
        
        # Predicted next step (deterministic)
        lagged = np.concatenate(list(x_hist[-P:]) + [[1.0]])
        mu = params.A[z_new] @ lagged
        x_pred = mu
        
        # True next step
        x_true = gt_future_x[h] if h < len(gt_future_x) else np.full(M, np.nan)
        theta_true = gt_theta[h] if h < len(gt_theta) else np.nan
        omega_true_norm = gt_omega[h] / cfg.omega0 if h < len(gt_omega) else np.nan
        
        # Oracle: what state would the TRUE data assign?
        if h < len(gt_future_x):
            if h == 0:
                x_oracle_prev = prefix_x[-1]
            else:
                x_oracle_prev = gt_future_x[h-1]
            nu_oracle = params.recurrence_logits(x_oracle_prev[None, :], np.array([z_prev]))[0]
            log_pi_oracle = stick_breaking_log_probs(nu_oracle)
            log_pi_oracle -= log_pi_oracle.max()
            pi_oracle = np.exp(log_pi_oracle); pi_oracle /= pi_oracle.sum()
            z_oracle = int(np.argmax(pi_oracle))
            
            # Oracle one-step prediction from TRUE x
            lagged_oracle = np.concatenate([x_oracle_prev, [1.0]])
            mu_oracle = params.A[z_oracle] @ lagged_oracle
            oracle_theta_err = abs(mu_oracle[0] - x_true[0])
        else:
            z_oracle = -1
            oracle_theta_err = np.nan
        
        # Errors
        theta_err = abs(x_pred[0] - x_true[0]) if not np.isnan(x_true[0]) else np.nan
        omega_err = abs(x_pred[1] - x_true[1]) if not np.isnan(x_true[1]) else np.nan
        total_err = np.sqrt(theta_err**2 + omega_err**2) if not np.isnan(theta_err) else np.nan
        
        # Flag sudden jumps
        flag = ""
        if h > 0 and not np.isnan(theta_err):
            prev_err = results[-1]['theta_err']
            if not np.isnan(prev_err) and theta_err > 3 * max(prev_err, 1e-6):
                flag = "** JUMP!"
            if z_new != results[-1]['z_pred']:
                flag += f" state:{results[-1]['z_pred']}->{z_new}"
        
        print(f"{h:3d}  {z_new:3d}  {x_pred[0]:9.5f}  {x_true[0]:9.5f}  {theta_err:9.6f}  "
              f"{x_pred[1]:9.5f}  {x_true[1]:9.5f}  {omega_err:9.6f}  "
              f"{total_err:9.6f}  {z_oracle:8d}  {oracle_theta_err:11.6f}  {flag}")
        
        results.append({
            'h': h, 'z_pred': z_new, 'z_oracle': z_oracle,
            'theta_pred': x_pred[0], 'theta_true': x_true[0],
            'theta_err': theta_err, 'omega_err': omega_err,
            'total_err': total_err, 'oracle_theta_err': oracle_theta_err,
            'pi_top3': sorted(enumerate(pi), key=lambda x: -x[1])[:3],
        })
        
        x_hist.append(x_pred)
        z_prev = z_new

    # Plot
    fig, axes = plt.subplots(3, 1, figsize=(14, 10), sharex=True)
    
    hs = [r['h'] for r in results]
    theta_errs = [r['theta_err'] for r in results]
    oracle_errs = [r['oracle_theta_err'] for r in results]
    z_preds = [r['z_pred'] for r in results]
    z_oracles = [r['z_oracle'] for r in results]
    
    # Panel 1: θ error (rollout vs oracle)
    axes[0].semilogy(hs, theta_errs, 'r.-', label='rollout θ error', lw=1.5)
    axes[0].semilogy(hs, oracle_errs, 'b.-', label='oracle 1-step θ error', lw=1.5, alpha=0.7)
    axes[0].set_ylabel('|θ error| (rad)')
    axes[0].legend()
    axes[0].set_title('Rollout error vs Oracle one-step error')
    axes[0].grid(True, alpha=0.3)
    
    # Panel 2: State assignment comparison
    axes[1].plot(hs, z_preds, 'rs-', label='rollout state', ms=4)
    axes[1].plot(hs, z_oracles, 'bo-', label='oracle state (from true data)', ms=4, alpha=0.7)
    # Highlight mismatches
    for r in results:
        if r['z_pred'] != r['z_oracle'] and r['z_oracle'] >= 0:
            axes[1].axvline(r['h'], color='red', alpha=0.2, lw=3)
    axes[1].set_ylabel('State z')
    axes[1].legend()
    axes[1].set_title('State assignment: rollout vs oracle')
    axes[1].grid(True, alpha=0.3)
    
    # Panel 3: θ trajectory
    theta_preds = [r['theta_pred'] for r in results]
    theta_trues = [r['theta_true'] for r in results]
    axes[2].plot(hs, theta_trues, 'k-', label='true θ', lw=2)
    axes[2].plot(hs, theta_preds, 'r--', label='rollout θ', lw=1.5)
    axes[2].set_ylabel('θ (rad)')
    axes[2].set_xlabel('Rollout step h')
    axes[2].legend()
    axes[2].set_title('θ trajectory')
    axes[2].grid(True, alpha=0.3)
    
    plt.tight_layout()
    return fig, results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, type=str)
    ap.add_argument("--data-root", required=True, type=str)
    ap.add_argument("--traj-id", required=True, type=str)
    ap.add_argument("--split", default="val")
    ap.add_argument("--prefix", type=int, default=100)
    ap.add_argument("--horizon", type=int, default=50)
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()

    ckpt = load_checkpoint(Path(args.run) / "chain.pkl")
    cfg: Config = ckpt["cfg"]
    p = ckpt["samples"][0]

    trajs = load_split(args.data_root, args.split, cfg)
    tr = next((t for t in trajs if t.id == args.traj_id), None)
    if tr is None:
        raise ValueError(f"traj-id {args.traj_id} not found in {args.split}")

    T0 = min(args.prefix, tr.x.shape[0] - 2)
    H = min(args.horizon, tr.x.shape[0] - T0)

    fig, results = diag_rollout(
        cfg, p, tr.x[:T0],
        gt_future_x=tr.x[T0:T0+H],
        gt_theta=tr.theta[T0:T0+H],
        gt_omega=tr.omega[T0:T0+H],
        horizon=H
    )

    out = Path(args.out or Path(args.run) / f"diag_rollout_{tr.id}.png")
    fig.savefig(out, dpi=150, bbox_inches='tight')
    print(f"\n[diag] saved {out}")


if __name__ == "__main__":
    main()
