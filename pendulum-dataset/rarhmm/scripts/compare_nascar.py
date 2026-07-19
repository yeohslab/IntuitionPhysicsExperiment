"""Compare NASCAR ground truth vs rarhmm recovered states.

Produces a side-by-side plot:
  Left:  ground truth trajectory colored by true states
  Right: trajectory colored by rarhmm recovered states (permuted)
"""
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from scipy.optimize import linear_sum_assignment

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rarhmm.train import load_checkpoint

COLORS = [
    (0.214, 0.467, 0.659),  # windows blue
    (0.890, 0.102, 0.110),  # red
    (0.992, 0.749, 0.000),  # amber
    (0.506, 0.694, 0.341),  # faded green
]


def plot_trajectory(ax, x, z, title, colors):
    zcps = np.concatenate(([0], np.where(np.diff(z))[0] + 1, [z.size]))
    for start, stop in zip(zcps[:-1], zcps[1:]):
        ax.plot(x[start:stop + 1, 0], x[start:stop + 1, 1],
                lw=0.5, color=colors[z[start] % len(colors)], alpha=0.8)
    ax.set_xlabel("$x_1$")
    ax.set_ylabel("$x_2$")
    ax.set_title(title, fontsize=12)
    ax.set_aspect("equal")


def main():
    run_dir = Path("runs/nascar")

    # Load data
    data = np.load(run_dir / "nascar_data.npz")
    x, z_true = data["x"], data["z_true"]

    # Load model
    ckpt = load_checkpoint(run_dir / "chain.pkl")
    z_fit = ckpt["z_last"][0]
    K = ckpt["cfg"].K

    # Find best permutation
    overlap = np.zeros((K, K))
    for k1 in range(K):
        for k2 in range(K):
            overlap[k1, k2] = np.sum((z_fit == k1) & (z_true == k2))
    _, perm = linear_sum_assignment(-overlap)
    z_fit_perm = np.array([perm[z] for z in z_fit])
    acc = np.mean(z_fit_perm == z_true)

    # ---- Figure: 2×2 layout ----
    fig, axes = plt.subplots(2, 2, figsize=(12, 11))

    # Top row: trajectory comparison
    plot_trajectory(axes[0, 0], x, z_true, "Ground Truth States", COLORS)
    plot_trajectory(axes[0, 1], x, z_fit_perm, f"rAR-HMM Recovered (acc={acc:.2%})", COLORS)

    # Bottom left: state accuracy per state
    ax = axes[1, 0]
    state_acc = []
    for k in range(K):
        mask = z_true == k
        if mask.sum() > 0:
            state_acc.append(np.mean(z_fit_perm[mask] == k))
        else:
            state_acc.append(0)
    bars = ax.bar(range(K), state_acc, color=COLORS[:K], edgecolor="black", linewidth=0.5)
    ax.set_xlabel("True State")
    ax.set_ylabel("Recovery Accuracy")
    ax.set_title("Per-State Accuracy")
    ax.set_ylim(0, 1.05)
    ax.set_xticks(range(K))
    for i, v in enumerate(state_acc):
        ax.text(i, v + 0.02, f"{v:.1%}", ha="center", fontsize=10)

    # Bottom right: confusion matrix
    ax = axes[1, 1]
    conf = np.zeros((K, K))
    for k1 in range(K):
        for k2 in range(K):
            conf[k1, k2] = np.sum((z_true == k1) & (z_fit_perm == k2))
    # Normalize rows
    row_sums = conf.sum(axis=1, keepdims=True)
    conf_norm = np.where(row_sums > 0, conf / row_sums, 0)
    im = ax.imshow(conf_norm, cmap="Blues", vmin=0, vmax=1)
    ax.set_xlabel("Predicted State")
    ax.set_ylabel("True State")
    ax.set_title("Confusion Matrix (normalized)")
    ax.set_xticks(range(K))
    ax.set_yticks(range(K))
    for i in range(K):
        for j in range(K):
            color = "white" if conf_norm[i, j] > 0.5 else "black"
            ax.text(j, i, f"{conf_norm[i, j]:.2f}", ha="center", va="center",
                    color=color, fontsize=11)
    fig.colorbar(im, ax=ax, shrink=0.8)

    fig.suptitle("NASCAR Validation: rAR-HMM vs Ground Truth", fontsize=14, y=0.98)
    fig.tight_layout()
    out = run_dir / "nascar_comparison.png"
    fig.savefig(out, dpi=150, bbox_inches="tight")
    print(f"[compare] saved {out}")
    print(f"[compare] Overall accuracy: {acc:.4f}")


if __name__ == "__main__":
    main()
