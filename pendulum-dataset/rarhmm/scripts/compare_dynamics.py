"""Compare estimated dynamics (A_k, b_k) vs ground truth for NASCAR.

Produces a detailed table + vector field side-by-side comparison.
"""
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from scipy.optimize import linear_sum_assignment

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rarhmm.train import load_checkpoint

# Import ground truth params
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_nascar import make_nascar_params

COLORS = [
    (0.214, 0.467, 0.659),
    (0.890, 0.102, 0.110),
    (0.992, 0.749, 0.000),
    (0.506, 0.694, 0.341),
]
STATE_NAMES = ["Right turn", "Left turn", "Rightward drift", "Leftward drift"]


def main():
    run_dir = Path("runs/nascar")

    # Load ground truth
    data = np.load(run_dir / "nascar_data.npz")
    x, z_true = data["x"], data["z_true"]
    As_true, bs_true = data["As"], data["bs"]  # (K,2,2), (K,2)
    Rs_true, r_true = data["Rs"], data["r"]    # (K,2), (K,)

    # Load model
    ckpt = load_checkpoint(run_dir / "chain.pkl")
    z_fit = ckpt["z_last"][0]
    K = ckpt["cfg"].K
    samples = ckpt["samples"]

    # Average posterior dynamics over all kept samples
    n_samples = len(samples)
    A_fit_all = np.array([s.A for s in samples])   # (n_samples, K, M, D_in)
    # A_fit_all[:, k] is (M, M*P+1) = (2, 3) where last col is bias
    # So A_k = A_fit_all[:, k, :, :2], b_k = A_fit_all[:, k, :, 2]
    A_fit_mean = A_fit_all.mean(axis=0)  # (K, 2, 3)

    # Find best permutation using z assignments
    overlap = np.zeros((K, K))
    for k1 in range(K):
        for k2 in range(K):
            overlap[k1, k2] = np.sum((z_fit == k1) & (z_true == k2))
    _, perm = linear_sum_assignment(-overlap)

    # ---- Print detailed comparison ----
    print("=" * 80)
    print("NASCAR Dynamics Comparison: Ground Truth vs rAR-HMM Posterior Mean")
    print("=" * 80)
    print(f"Posterior samples used: {n_samples}")
    print(f"Permutation (fit -> true): {dict(enumerate(perm))}")
    print()

    # Accuracy
    z_fit_perm = np.array([perm[z] for z in z_fit])
    acc = np.mean(z_fit_perm == z_true)
    print(f"Overall state recovery accuracy: {acc:.4f} ({acc:.2%})")
    print()

    errs_A = []
    errs_b = []
    for k_fit in range(K):
        k_true = perm[k_fit]
        A_est = A_fit_mean[k_fit, :, :2]   # (2, 2)
        b_est = A_fit_mean[k_fit, :, 2]    # (2,)
        A_gt = As_true[k_true]              # (2, 2)
        b_gt = bs_true[k_true]             # (2,)

        err_A = np.linalg.norm(A_est - A_gt, 'fro')
        err_b = np.linalg.norm(b_est - b_gt)
        errs_A.append(err_A)
        errs_b.append(err_b)

        print(f"--- State {k_true} ({STATE_NAMES[k_true]}) ---")
        print(f"  fit_state={k_fit} -> true_state={k_true}")
        print()
        print(f"  A_true = [[{A_gt[0,0]:+.6f}, {A_gt[0,1]:+.6f}],")
        print(f"            [{A_gt[1,0]:+.6f}, {A_gt[1,1]:+.6f}]]")
        print(f"  A_est  = [[{A_est[0,0]:+.6f}, {A_est[0,1]:+.6f}],")
        print(f"            [{A_est[1,0]:+.6f}, {A_est[1,1]:+.6f}]]")
        print(f"  ||A_est - A_true||_F = {err_A:.6f}")
        print()
        print(f"  b_true = [{b_gt[0]:+.6f}, {b_gt[1]:+.6f}]")
        print(f"  b_est  = [{b_est[0]:+.6f}, {b_est[1]:+.6f}]")
        print(f"  ||b_est - b_true||   = {err_b:.6f}")

        # Eigenvalues of A (characterize rotation)
        eig_gt = np.linalg.eigvals(A_gt)
        eig_est = np.linalg.eigvals(A_est)
        print(f"  eig(A_true) = {eig_gt[0]:.4f}, {eig_gt[1]:.4f}")
        print(f"  eig(A_est)  = {eig_est[0]:.4f}, {eig_est[1]:.4f}")
        print()

    print(f"Mean ||A_est - A_true||_F = {np.mean(errs_A):.6f}")
    print(f"Mean ||b_est - b_true||   = {np.mean(errs_b):.6f}")

    # ---- Recurrence comparison ----
    print()
    print("=" * 80)
    print("Recurrence Weights Comparison (R, r)")
    print("=" * 80)
    # Model recurrence: R is (K-1, 1, M), r is (K-1,) or (K-1, 1)
    R_fit_all = np.array([s.R for s in samples])  # (n, K-1, ...)
    r_fit_all = np.array([s.r for s in samples])  # (n, K-1, ...)
    R_fit_mean = R_fit_all.mean(axis=0)
    r_fit_mean = r_fit_all.mean(axis=0)

    print(f"\nNote: rAR-HMM uses K-1={K-1} stick-breaking logits, not K={K} softmax logits.")
    print(f"Ground truth uses K={K} softmax logits. Direct comparison is approximate.")
    print(f"\nR shape: {R_fit_mean.shape}, r shape: {r_fit_mean.shape}")
    print(f"\nGround truth recurrence (softmax logits):")
    for k in range(K):
        print(f"  State {k}: R=[{Rs_true[k,0]:+.1f}, {Rs_true[k,1]:+.1f}], r={r_true[k]:+.1f}")

    print(f"\nEstimated recurrence (stick-breaking, K-1 logits, posterior mean):")
    for j in range(min(K - 1, R_fit_mean.shape[0])):
        R_j = R_fit_mean[j].ravel()
        r_j = r_fit_mean[j] if r_fit_mean.ndim > 1 else r_fit_mean[j]
        r_j = float(np.asarray(r_j).ravel()[0]) if hasattr(r_j, '__len__') else float(r_j)
        w_str = ", ".join(f"{v:+.4f}" for v in R_j[:2])
        print(f"  Logit {j}: R=[{w_str}], r={r_j:+.4f}")

    # ---- Figure: side-by-side vector fields ----
    fig, axes = plt.subplots(2, K, figsize=(4 * K, 8))
    fig.suptitle("Dynamics Comparison: Ground Truth (top) vs rAR-HMM (bottom)",
                 fontsize=14, y=1.02)

    lim = 6
    grid = np.linspace(-lim, lim, 20)
    X1, X2 = np.meshgrid(grid, grid)
    pts = np.column_stack([X1.ravel(), X2.ravel()])

    for k_fit in range(K):
        k_true = perm[k_fit]
        A_gt = As_true[k_true]
        b_gt = bs_true[k_true]
        A_est = A_fit_mean[k_fit, :, :2]
        b_est = A_fit_mean[k_fit, :, 2]

        # Ground truth vector field
        dx_gt = (pts @ A_gt.T + b_gt) - pts
        U_gt = dx_gt[:, 0].reshape(X1.shape)
        V_gt = dx_gt[:, 1].reshape(X1.shape)

        ax = axes[0, k_true]
        ax.quiver(X1, X2, U_gt, V_gt, color=COLORS[k_true], alpha=0.7, scale=3, width=0.004)
        # Fixed point
        try:
            fp = np.linalg.solve(A_gt - np.eye(2), -b_gt)
            if np.all(np.abs(fp) < lim * 2):
                ax.plot(*fp, 'o', color=COLORS[k_true], markersize=8,
                        markeredgecolor='black', zorder=5)
        except np.linalg.LinAlgError:
            pass
        ax.set_xlim(-lim, lim)
        ax.set_ylim(-lim, lim)
        ax.set_title(f"True State {k_true}\n{STATE_NAMES[k_true]}", fontsize=10)
        ax.set_aspect("equal")
        if k_true == 0:
            ax.set_ylabel("Ground Truth", fontsize=12)

        # Estimated vector field
        dx_est = (pts @ A_est.T + b_est) - pts
        U_est = dx_est[:, 0].reshape(X1.shape)
        V_est = dx_est[:, 1].reshape(X1.shape)

        ax = axes[1, k_true]
        ax.quiver(X1, X2, U_est, V_est, color=COLORS[k_true], alpha=0.7, scale=3, width=0.004)
        try:
            fp = np.linalg.solve(A_est - np.eye(2), -b_est)
            if np.all(np.abs(fp) < lim * 2):
                ax.plot(*fp, 'o', color=COLORS[k_true], markersize=8,
                        markeredgecolor='black', zorder=5)
        except np.linalg.LinAlgError:
            pass
        ax.set_xlim(-lim, lim)
        ax.set_ylim(-lim, lim)
        err_A = np.linalg.norm(A_est - A_gt, 'fro')
        err_b = np.linalg.norm(b_est - b_gt)
        ax.set_title(f"Fit (→State {k_true})\n‖ΔA‖={err_A:.4f}, ‖Δb‖={err_b:.4f}",
                     fontsize=10)
        ax.set_aspect("equal")
        if k_true == 0:
            ax.set_ylabel("rAR-HMM Estimate", fontsize=12)

    fig.tight_layout()
    out = run_dir / "nascar_dynamics_compare.png"
    fig.savefig(out, dpi=150, bbox_inches="tight")
    print(f"\n[saved] {out}")

    # ---- Figure 2: A matrix element-wise comparison ----
    fig2, axes2 = plt.subplots(1, 2, figsize=(10, 5))

    # Scatter: A elements
    ax = axes2[0]
    a_gt_all, a_est_all = [], []
    for k_fit in range(K):
        k_true = perm[k_fit]
        a_gt_all.extend(As_true[k_true].ravel().tolist())
        a_est_all.extend(A_fit_mean[k_fit, :, :2].ravel().tolist())
    a_gt_all, a_est_all = np.array(a_gt_all), np.array(a_est_all)
    ax.scatter(a_gt_all, a_est_all, c='steelblue', s=60, edgecolors='black', linewidth=0.5, zorder=3)
    lim_a = max(np.abs(a_gt_all).max(), np.abs(a_est_all).max()) * 1.1
    ax.plot([-lim_a, lim_a], [-lim_a, lim_a], 'k--', lw=1, alpha=0.5)
    ax.set_xlabel("Ground Truth")
    ax.set_ylabel("Estimated")
    ax.set_title(f"A matrix elements (4 states × 4 entries = 16 points)")
    ax.set_aspect("equal")
    ax.grid(True, alpha=0.3)
    r2_A = 1 - np.sum((a_est_all - a_gt_all)**2) / np.sum((a_gt_all - a_gt_all.mean())**2)
    ax.text(0.05, 0.95, f"R² = {r2_A:.6f}", transform=ax.transAxes, fontsize=11,
            va='top', ha='left', bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    # Scatter: b elements
    ax = axes2[1]
    b_gt_all, b_est_all = [], []
    for k_fit in range(K):
        k_true = perm[k_fit]
        b_gt_all.extend(bs_true[k_true].tolist())
        b_est_all.extend(A_fit_mean[k_fit, :, 2].tolist())
    b_gt_all, b_est_all = np.array(b_gt_all), np.array(b_est_all)
    ax.scatter(b_gt_all, b_est_all, c='tomato', s=60, edgecolors='black', linewidth=0.5, zorder=3)
    lim_b = max(np.abs(b_gt_all).max(), np.abs(b_est_all).max()) * 1.3
    ax.plot([-lim_b, lim_b], [-lim_b, lim_b], 'k--', lw=1, alpha=0.5)
    ax.set_xlabel("Ground Truth")
    ax.set_ylabel("Estimated")
    ax.set_title(f"b bias elements (4 states × 2 entries = 8 points)")
    ax.set_aspect("equal")
    ax.grid(True, alpha=0.3)
    r2_b = 1 - np.sum((b_est_all - b_gt_all)**2) / np.sum((b_gt_all - b_gt_all.mean())**2)
    ax.text(0.05, 0.95, f"R² = {r2_b:.6f}", transform=ax.transAxes, fontsize=11,
            va='top', ha='left', bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    fig2.suptitle("Element-wise Parameter Recovery", fontsize=13)
    fig2.tight_layout()
    out2 = run_dir / "nascar_params_scatter.png"
    fig2.savefig(out2, dpi=150, bbox_inches="tight")
    print(f"[saved] {out2}")


if __name__ == "__main__":
    main()
