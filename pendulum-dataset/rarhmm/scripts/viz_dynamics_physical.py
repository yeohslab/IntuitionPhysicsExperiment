"""Visualize K5 dynamics in physical (theta, omega) space.

For each state k, plot:
  - Vector field: (dtheta, domega) at each grid point
  - The numerical A matrix and b vector
  - Fixed point location (if stable)
"""
import sys
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rarhmm.train import load_checkpoint
from rarhmm.config import Config

import argparse
ap = argparse.ArgumentParser()
ap.add_argument("--run", required=True)
args = ap.parse_args()

ckpt = load_checkpoint(Path(args.run) / "chain.pkl")
cfg: Config = ckpt["cfg"]
samples = ckpt["samples"]
A = np.mean([s.A for s in samples], axis=0)  # (K, 3, 4)
K = cfg.K
M = cfg.obs_dim  # 3
omega0 = cfg.omega0

fig, axes = plt.subplots(2, K, figsize=(4.5 * K, 8.5))
if K == 1:
    axes = axes[:, None]

# Grid in (theta, omega/omega0)
th_range = np.linspace(-2.5, 2.5, 18)
om_range = np.linspace(-2.5, 2.5, 18)
TH, OM = np.meshgrid(th_range, om_range)

for k in range(K):
    A_k = A[k, :, :M]  # (3, 3)
    b_k = A[k, :, M]   # (3,)

    # Compute vector field in (theta, omega) by converting through sincos_omega
    dTH = np.zeros_like(TH)
    dOM = np.zeros_like(OM)

    for i in range(TH.shape[0]):
        for j in range(TH.shape[1]):
            th = TH[i, j]
            om = OM[i, j]
            # Current state in model space
            x_now = np.array([np.sin(th), np.cos(th), om])
            # Predicted next state
            x_next = A_k @ x_now + b_k
            # Convert back to (theta, omega)
            th_next = np.arctan2(x_next[0], x_next[1])
            om_next = x_next[2]
            dTH[i, j] = th_next - th
            dOM[i, j] = om_next - om

    # Top row: vector field
    ax = axes[0, k]
    speed = np.sqrt(dTH**2 + dOM**2)
    ax.quiver(TH, OM, dTH, dOM, speed, cmap='coolwarm', alpha=0.8,
              scale=2.0, scale_units='xy')
    
    # Draw energy contours
    E = 0.5 * OM**2 + 1 - np.cos(TH)
    ax.contour(TH, OM, E, levels=[0.5, 1.0, 1.5, 2.0],
               colors='grey', linewidths=0.5, alpha=0.4)

    # Find and mark fixed point: x* = (I-A)^{-1} b
    try:
        fp_model = np.linalg.solve(np.eye(3) - A_k, b_k)
        fp_theta = np.arctan2(fp_model[0], fp_model[1])
        fp_omega = fp_model[2]
        ax.plot(fp_theta, fp_omega, 'k*', ms=12, zorder=5)
    except:
        pass

    ax.set_xlim(-2.5, 2.5)
    ax.set_ylim(-2.5, 2.5)
    ax.set_xlabel(r'$\theta$ (rad)')
    if k == 0:
        ax.set_ylabel(r'$\omega / \omega_0$')
    ax.set_title(f'State {k+1}: vector field', fontsize=10)
    ax.set_aspect('equal')

    # Bottom row: numerical equation
    ax2 = axes[1, k]
    ax2.axis('off')
    
    evals = np.linalg.eigvals(A_k)
    sr = max(abs(evals))
    
    text = f"State {k+1}\n\n"
    text += r"$x_{t+1} = A_k x_t + b_k$" + "\n\n"
    text += "A =\n"
    for row in A_k:
        text += f"  [{row[0]:+.4f}, {row[1]:+.4f}, {row[2]:+.4f}]\n"
    text += f"\nb = [{b_k[0]:+.4f}, {b_k[1]:+.4f}, {b_k[2]:+.4f}]\n"
    text += f"\nSpectral radius = {sr:.4f}\n"
    text += f"Eigenvalues:\n"
    for ev in evals:
        if np.isreal(ev):
            text += f"  {ev.real:.4f}\n"
        else:
            text += f"  {ev.real:.4f} ± {abs(ev.imag):.4f}j\n"
            break  # conjugate pair, only show once
    
    ax2.text(0.05, 0.95, text, transform=ax2.transAxes,
             fontsize=9, verticalalignment='top', fontfamily='monospace',
             bbox=dict(boxstyle='round', facecolor='lightyellow', alpha=0.8))

fig.suptitle(f'rAR-HMM K={K} dynamics in physical (θ, ω/ω₀) space\n'
             f'(★ = fixed point, grey = energy contours)',
             fontsize=13, fontweight='bold')
fig.tight_layout(rect=[0, 0, 1, 0.93])

out = Path(args.run) / "viz_dynamics_physical.png"
fig.savefig(out, dpi=150, bbox_inches='tight')
print(f"Saved {out}")
