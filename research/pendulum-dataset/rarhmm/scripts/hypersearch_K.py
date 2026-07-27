"""Hyperparameter search: compare K=10..20 models and select the best.

After all models are trained, run:
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -m scripts.hypersearch_K --mode compare
"""
from __future__ import annotations

import argparse
import sys
import json
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def compare_models(ks: list[int], base_dir: str = "runs"):
    """Load all trained models and compare metrics."""
    from rarhmm.config import Config
    from rarhmm.data import load_split
    from rarhmm.train import load_checkpoint
    from rarhmm.stick_breaking import stick_breaking_probs
    from rarhmm.predict import rollout_posterior

    results = []
    for K in ks:
        run_dir = Path(base_dir) / f"K{K}_theta_allE_wrap_vi"
        chain_path = run_dir / "chain.pkl"
        if not chain_path.exists():
            print(f"[SKIP] K={K}: {chain_path} not found")
            continue

        ckpt = load_checkpoint(chain_path)
        cfg = ckpt["cfg"]
        p = ckpt["samples"][0]
        meta = ckpt.get("metadata", {})

        # 1) ELBO from training
        elbo = meta.get("elbo", float("nan"))
        r_loss = meta.get("R_loss", float("nan"))

        # 2) Single-step error on test_in_dist
        R_w, r_b = p.R[0], p.r[0]
        trajs = load_split("../data/pendulum", "test_in_dist", cfg)
        errs = []
        for tr in trajs:
            T = tr.x.shape[0]
            if T < 2:
                continue
            nu = tr.x @ R_w.T + r_b
            pi = stick_breaking_probs(nu)
            z_R = pi.argmax(axis=1)
            for t in range(T - 1):
                x_aug = np.array([tr.x[t, 0], tr.x[t, 1], 1.0])
                pred = p.A[z_R[t]] @ x_aug
                err = abs(pred[0] - tr.x[t + 1, 0])
                # Exclude theta-wrapping outliers
                if err < 1.0:
                    errs.append(err)
        errs = np.array(errs)
        mean_err = errs.mean()
        p95_err = np.percentile(errs, 95)

        # 3) Rollout errors (quick: 3 trials each, 3 trajectories)
        rng = np.random.default_rng(42)
        trajs_val = load_split("../data/pendulum", "val", cfg)

        # Pick one small, one large, one rotation
        traj_ids = {"small": None, "large": None, "rotation": None}
        for tr in trajs_val:
            if tr.regime == "libration_small" and traj_ids["small"] is None:
                traj_ids["small"] = tr
            elif tr.regime == "libration_large" and traj_ids["large"] is None:
                traj_ids["large"] = tr
            elif tr.regime == "rotation" and traj_ids["rotation"] is None:
                traj_ids["rotation"] = tr

        rollout_errs = {}
        for regime, tr in traj_ids.items():
            if tr is None:
                continue
            T = tr.x.shape[0]
            T0 = min(100, T - 2)
            H = min(200, T - T0)
            Xs, Zs = rollout_posterior(cfg, ckpt["samples"], tr.x[:T0], H, 3, rng)
            # Mean absolute error at final step
            final_errs = []
            for d in range(3):
                pred_th = Xs[d, -1, 0]
                true_th = tr.x[T0 + H - 1, 0]
                final_errs.append(abs(pred_th - true_th))
            rollout_errs[regime] = np.mean(final_errs)

        row = {
            "K": K,
            "elbo": float(elbo),
            "R_loss": float(r_loss),
            "onestep_mean": float(mean_err),
            "onestep_p95": float(p95_err),
            **{f"rollout_{k}": float(v) for k, v in rollout_errs.items()},
        }
        results.append(row)
        print(f"  K={K:2d}  elbo={elbo:>10.0f}  R_loss={r_loss:.4f}  "
              f"1step={mean_err:.6f}  p95={p95_err:.6f}  "
              f"roll_small={rollout_errs.get('small', float('nan')):.4f}  "
              f"roll_large={rollout_errs.get('large', float('nan')):.4f}  "
              f"roll_rot={rollout_errs.get('rotation', float('nan')):.4f}")

    # Save and print ranking
    if results:
        # Rank by single-step error (lower is better)
        results.sort(key=lambda r: r["onestep_mean"])
        print("\n=== RANKING (by one-step error) ===")
        for i, r in enumerate(results):
            marker = " ★ BEST" if i == 0 else ""
            print(f"  #{i+1}  K={r['K']:2d}  1step={r['onestep_mean']:.6f}  "
                  f"p95={r['onestep_p95']:.6f}{marker}")

        best = results[0]
        print(f"\n=== BEST MODEL: K={best['K']} ===")
        for k, v in best.items():
            print(f"  {k}: {v}")

        out = Path(base_dir) / "hypersearch_results.json"
        with open(out, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nSaved results to {out}")
        return best["K"]
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["compare"], default="compare")
    ap.add_argument("--ks", type=str, default="10,12,14,16,18,20",
                    help="Comma-separated K values")
    args = ap.parse_args()

    ks = [int(k) for k in args.ks.split(",")]

    if args.mode == "compare":
        best_K = compare_models(ks)
        if best_K:
            print(f"\nTo run full viz on best model (K={best_K}):")
            print(f'  python -m scripts.viz_dynamics --run runs/K{best_K}_theta_allE_wrap_vi')


if __name__ == "__main__":
    main()
