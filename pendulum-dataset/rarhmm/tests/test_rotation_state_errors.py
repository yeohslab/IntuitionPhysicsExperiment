"""Rotation state-error attribution test.

Runs a 400-step deterministic rollout on a rotation trajectory and categorises
every step where the rollout's state differs from the oracle's state.

Categories:
  1. WRAP   – the error was triggered at/near the +/-pi boundary
  2. DRIFT  – cumulative phase drift pushed theta into the wrong state
  3. BORDER – the true point is near a state boundary (within half a state width)
  4. FEEDBACK – state was already wrong in the previous step (cascading)

Usage:
    python -m tests.test_rotation_state_errors ^
        --run runs/K18_theta_allE_wrap_vi --data-root ..\\data\\pendulum
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
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def get_state(params: ModelParams, x: np.ndarray, z_prev: int) -> tuple[int, np.ndarray]:
    """Return (argmax state, full probability vector) for a single point."""
    nu = params.recurrence_logits(x[None, :], np.array([z_prev]))[0]
    log_pi = stick_breaking_log_probs(nu)
    log_pi -= log_pi.max()
    pi = np.exp(log_pi)
    pi /= pi.sum()
    return int(np.argmax(pi)), pi


def state_boundaries(params: ModelParams, n_grid: int = 2000) -> np.ndarray:
    """Return approximate theta values where the dominant state changes (at omega=0)."""
    thetas = np.linspace(-np.pi, np.pi, n_grid)
    states = []
    z_prev = 0
    for th in thetas:
        x = np.array([th, 0.0])
        z, _ = get_state(params, x, z_prev)
        states.append(z)
        z_prev = z
    states = np.array(states)
    # boundaries = positions where state changes
    change_idx = np.where(np.diff(states) != 0)[0]
    return thetas[change_idx], states


# ---------------------------------------------------------------------------
# main rollout + attribution
# ---------------------------------------------------------------------------

def run_test(cfg: Config, params: ModelParams, tr, horizon: int):
    P, M = cfg.ar_lag, cfg.obs_dim
    K = params.K
    T0 = 100  # prefix length
    rng = np.random.default_rng(0)

    # --- init from prefix via FFBS ---
    prefix_x = tr.x[:T0]
    tr_prefix = Trajectory(id="prefix", regime="", E_bar=np.nan,
                           theta=np.zeros(T0), omega=np.zeros(T0), x=prefix_x)
    log_init = np.full(K, -np.log(K))
    bundle = _per_traj_logobs_logtrans(tr_prefix, params, cfg)
    if bundle is None:
        z_prev_rollout = int(rng.choice(K))
    else:
        log_obs, log_trans, _ = bundle
        z_seq = ffbs_single(log_init, log_trans, log_obs, rng)
        z_prev_rollout = int(z_seq[-1])

    # also get oracle's initial z_prev
    z_prev_oracle = z_prev_rollout

    # --- compute state boundaries ---
    boundaries, _ = state_boundaries(params)
    state_width = 2 * np.pi / K  # approximate

    # --- rollout ---
    x_hist = list(prefix_x[-P:])
    gt_x = tr.x[T0:T0 + horizon]

    results = []
    prev_mismatch = False

    for h in range(horizon):
        x_rollout = x_hist[-1]
        x_true = gt_x[h] if h < len(gt_x) else None
        if x_true is None:
            break

        # Oracle state (from true data)
        if h == 0:
            x_oracle_input = prefix_x[-1]
        else:
            x_oracle_input = gt_x[h - 1]
        z_oracle, pi_oracle = get_state(params, x_oracle_input, z_prev_oracle)

        # Rollout state (from predicted data)
        z_rollout, pi_rollout = get_state(params, x_rollout, z_prev_rollout)

        # --- Prediction step ---
        lagged = np.concatenate(list(x_hist[-P:]) + [[1.0]])
        mu = params.A[z_rollout] @ lagged
        x_pred = mu

        # --- Compute diagnostics ---
        theta_rollout = x_rollout[0]
        theta_true = x_oracle_input[0] if h > 0 else prefix_x[-1, 0]
        theta_err = abs(x_pred[0] - x_true[0])
        phase_err = abs(theta_rollout - (x_oracle_input[0] if h > 0 else prefix_x[-1, 0]))

        mismatch = (z_rollout != z_oracle)

        # --- Attribute cause ---
        cause = "OK"
        if mismatch:
            # Distance to +/-pi
            dist_to_wrap_rollout = min(abs(theta_rollout - np.pi),
                                       abs(theta_rollout + np.pi))
            dist_to_wrap_true = min(abs(theta_true - np.pi),
                                    abs(theta_true + np.pi))

            # Distance to nearest state boundary
            if len(boundaries) > 0:
                dist_to_boundary = np.min(np.abs(theta_rollout - boundaries))
            else:
                dist_to_boundary = np.inf

            # Classification logic
            if dist_to_wrap_rollout < state_width or dist_to_wrap_true < state_width:
                cause = "WRAP"
            elif prev_mismatch:
                cause = "FEEDBACK"
            elif dist_to_boundary < state_width * 0.5:
                cause = "BORDER"
            else:
                cause = "DRIFT"

        results.append({
            'h': h,
            'z_rollout': z_rollout,
            'z_oracle': z_oracle,
            'theta_rollout': theta_rollout,
            'theta_true': theta_true,
            'theta_err': theta_err,
            'phase_err': phase_err,
            'mismatch': mismatch,
            'cause': cause,
            'pi_rollout_max': pi_rollout[z_rollout],
            'pi_oracle_at_rollout_z': pi_rollout[z_oracle] if z_oracle < len(pi_rollout) else 0,
        })

        prev_mismatch = mismatch
        x_hist.append(x_pred)
        z_prev_rollout = z_rollout
        z_prev_oracle = z_oracle

    return results


def print_report(results: list[dict]):
    total = len(results)
    mismatches = [r for r in results if r['mismatch']]
    n_mm = len(mismatches)

    print("=" * 90)
    print(f"ROTATION STATE-ERROR ATTRIBUTION REPORT")
    print(f"  Total steps:        {total}")
    print(f"  State mismatches:   {n_mm} ({100*n_mm/total:.1f}%)")
    print(f"  Correct states:     {total - n_mm} ({100*(total-n_mm)/total:.1f}%)")
    print("=" * 90)

    if n_mm == 0:
        print("No state mismatches found.")
        return

    # Cause breakdown
    causes = {}
    for r in mismatches:
        c = r['cause']
        causes[c] = causes.get(c, 0) + 1

    print(f"\n--- Cause Breakdown ({n_mm} mismatches) ---")
    for c in ['WRAP', 'DRIFT', 'BORDER', 'FEEDBACK']:
        cnt = causes.get(c, 0)
        pct = 100 * cnt / n_mm if n_mm > 0 else 0
        desc = {
            'WRAP': 'Near +/-pi wrap boundary',
            'DRIFT': 'Cumulative phase drift (not near boundary)',
            'BORDER': 'Near internal state boundary (theta within 0.5*state_width)',
            'FEEDBACK': 'Cascading from previous mismatch',
        }[c]
        print(f"  {c:10s}: {cnt:4d} ({pct:5.1f}%)  -- {desc}")

    # When do mismatches start?
    first_mm = mismatches[0]
    print(f"\n--- Timing ---")
    print(f"  First mismatch at step h={first_mm['h']} "
          f"(t={first_mm['h']*0.05:.2f}s)")
    print(f"    theta_rollout={first_mm['theta_rollout']:.4f}  "
          f"theta_true={first_mm['theta_true']:.4f}  "
          f"phase_err={first_mm['phase_err']:.6f}")
    print(f"    z_rollout={first_mm['z_rollout']}  z_oracle={first_mm['z_oracle']}")

    # Phase error at mismatch onset
    mm_phases = [r['phase_err'] for r in mismatches]
    print(f"\n  Phase error at mismatches:")
    print(f"    mean = {np.mean(mm_phases):.4f} rad")
    print(f"    min  = {np.min(mm_phases):.4f} rad")
    print(f"    max  = {np.max(mm_phases):.4f} rad")

    # Consecutive runs of mismatches
    runs = []
    current_run = 0
    for r in results:
        if r['mismatch']:
            current_run += 1
        else:
            if current_run > 0:
                runs.append(current_run)
            current_run = 0
    if current_run > 0:
        runs.append(current_run)

    print(f"\n  Mismatch runs (consecutive wrong states):")
    print(f"    Number of runs: {len(runs)}")
    if runs:
        print(f"    Run lengths: min={min(runs)}, max={max(runs)}, "
              f"mean={np.mean(runs):.1f}")

    # Which states are most often wrong?
    wrong_pairs = {}
    for r in mismatches:
        pair = (r['z_oracle'], r['z_rollout'])
        wrong_pairs[pair] = wrong_pairs.get(pair, 0) + 1

    print(f"\n  Top 10 state confusions (oracle->rollout: count):")
    sorted_pairs = sorted(wrong_pairs.items(), key=lambda x: -x[1])[:10]
    for (zo, zr), cnt in sorted_pairs:
        print(f"    state {zo:2d} -> {zr:2d}: {cnt:3d} times")

    # Mismatch rate by theta region
    print(f"\n  Mismatch rate by theta region:")
    regions = [
        ("near 0", -0.5, 0.5),
        ("near pi/2", 1.0, 2.0),
        ("near pi", 2.5, 3.15),
        ("near -pi", -3.15, -2.5),
        ("near -pi/2", -2.0, -1.0),
    ]
    for name, lo, hi in regions:
        in_region = [r for r in results if lo <= r['theta_rollout'] <= hi]
        mm_in_region = [r for r in in_region if r['mismatch']]
        n_region = len(in_region)
        n_mm_region = len(mm_in_region)
        rate = 100 * n_mm_region / n_region if n_region > 0 else 0
        print(f"    {name:12s} (theta in [{lo:.1f}, {hi:.1f}]): "
              f"{n_mm_region:3d}/{n_region:3d} = {rate:5.1f}%")


def plot_report(results: list[dict], out_path: Path):
    fig, axes = plt.subplots(4, 1, figsize=(16, 14), sharex=True)

    hs = [r['h'] for r in results]
    ts = [h * 0.05 for h in hs]

    # Panel 1: theta trajectory
    ax = axes[0]
    ax.plot(ts, [r['theta_true'] for r in results], 'k-', lw=1.5, label='true theta')
    ax.plot(ts, [r['theta_rollout'] for r in results], 'r--', lw=1.2, label='rollout theta')
    ax.axhline(np.pi, color='orange', ls=':', lw=1, label='+/-pi')
    ax.axhline(-np.pi, color='orange', ls=':', lw=1)
    ax.set_ylabel('theta (rad)')
    ax.legend(loc='best', fontsize=8)
    ax.set_title('Rotation rollout: theta trajectory')
    ax.grid(True, alpha=0.3)

    # Panel 2: phase error
    ax = axes[1]
    ax.semilogy(ts, [max(r['phase_err'], 1e-8) for r in results], 'b-', lw=1)
    ax.set_ylabel('|phase error| (rad)')
    ax.set_title('Cumulative phase error')
    ax.grid(True, alpha=0.3)

    # Panel 3: state assignment
    ax = axes[2]
    ax.plot(ts, [r['z_oracle'] for r in results], 'bo-', ms=2, lw=0.8, label='oracle state')
    ax.plot(ts, [r['z_rollout'] for r in results], 'rs-', ms=2, lw=0.8, label='rollout state')
    # Color mismatches
    for r in results:
        if r['mismatch']:
            color = {'WRAP': 'orange', 'DRIFT': 'red', 'BORDER': 'purple',
                     'FEEDBACK': 'pink'}.get(r['cause'], 'gray')
            ax.axvspan(r['h'] * 0.05 - 0.025, r['h'] * 0.05 + 0.025,
                       alpha=0.4, color=color)
    ax.set_ylabel('State z')
    ax.legend(loc='best', fontsize=8)
    ax.set_title('State assignment (colored bars = error cause: '
                 'orange=WRAP, red=DRIFT, purple=BORDER, pink=FEEDBACK)')
    ax.grid(True, alpha=0.3)

    # Panel 4: cause timeline
    ax = axes[3]
    cause_map = {'OK': 0, 'WRAP': 1, 'BORDER': 2, 'DRIFT': 3, 'FEEDBACK': 4}
    cause_colors = {'OK': 'green', 'WRAP': 'orange', 'BORDER': 'purple',
                    'DRIFT': 'red', 'FEEDBACK': 'pink'}
    for r in results:
        c = r['cause']
        ax.bar(r['h'] * 0.05, cause_map[c], width=0.05,
               color=cause_colors[c], alpha=0.7)
    ax.set_yticks(list(cause_map.values()))
    ax.set_yticklabels(list(cause_map.keys()))
    ax.set_xlabel('Time (s)')
    ax.set_title('Error cause per step')
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches='tight')
    print(f"\n[plot] saved {out_path}")
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--data-root", required=True)
    ap.add_argument("--traj-id", default="traj_003140")
    ap.add_argument("--split", default="val")
    ap.add_argument("--horizon", type=int, default=400)
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()

    ckpt = load_checkpoint(Path(args.run) / "chain.pkl")
    cfg: Config = ckpt["cfg"]
    p = ckpt["samples"][0]

    trajs = load_split(args.data_root, args.split, cfg)
    tr = next((t for t in trajs if t.id == args.traj_id), None)
    if tr is None:
        raise ValueError(f"traj {args.traj_id} not found")

    print(f"Trajectory: {tr.id}, regime={tr.regime}, E_bar={tr.E_bar:.4f}")
    print(f"Prefix=100, Horizon={args.horizon}")
    print()

    results = run_test(cfg, p, tr, args.horizon)
    print_report(results)

    out = Path(args.out or Path(args.run) / f"test_rotation_state_errors.png")
    plot_report(results, out)


if __name__ == "__main__":
    main()
