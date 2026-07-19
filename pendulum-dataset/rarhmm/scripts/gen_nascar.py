"""Generate NASCAR rAR-HMM data (pure numpy, no SSM dependency).

Reproduces the NASCAR synthetic experiment from
Linderman et al. (2017) "Bayesian Learning and Inference in
Recurrent Switching Linear Dynamical Systems" — Figure 2.

This script creates data using the EXACT same parameters as the
official SSM notebook (4-Recurrent-SLDS.ipynb), but strips away
the emission layer to produce a pure rAR-HMM dataset:
    x_t = A_{z_t} x_{t-1} + b_{z_t} + ε_t
    p(z_t | x_{t-1}) via stick-breaking logistic regression on x_{t-1}

Saves:  nascar_data.npz  with keys:
    x         (T, 2)     trajectory
    z_true    (T,)       ground truth discrete states
    As        (K, 2, 2)  dynamics matrices
    bs        (K, 2)     bias vectors
    Rs        (K, 2)     recurrence weights
    r         (K,)       recurrence biases
    Q_diag    (K, 2)     dynamics noise (diagonal)

Usage:
    python scripts/gen_nascar.py --out runs/nascar/nascar_data.npz
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np


# ---------- helpers from ssm.util ----------
def random_rotation(n: int, theta: float | None = None):
    """Exact copy of ssm.util.random_rotation.

    Uses numpy's legacy RNG (same as autograd.numpy.random)
    so that with the right seed we get the same matrices as the notebook.
    """
    if theta is None:
        theta = 0.5 * np.pi * np.random.rand()

    if n == 1:
        return np.random.rand() * np.eye(1)

    rot = np.array([[np.cos(theta), -np.sin(theta)],
                    [np.sin(theta),  np.cos(theta)]])
    out = np.eye(n)
    out[:2, :2] = rot
    q = np.linalg.qr(np.random.randn(n, n))[0]
    return q.dot(out).dot(q.T)



def stick_breaking_logits_to_probs(logits: np.ndarray) -> np.ndarray:
    """Convert (K,) logits to (K,) stick-breaking probabilities.

    Uses the softmax formulation: π = softmax(logits).
    In SSM's recurrent_only mode the transition probs are just
    softmax(R x + r) — no dependence on previous z.
    """
    logits = logits - logits.max()
    exp_l = np.exp(logits)
    return exp_l / exp_l.sum()


def make_nascar_params():
    """Exact parameters from SSM notebook 4-Recurrent-SLDS.

    Returns As, bs, Rs, r, Q_diag.
    """
    # Use legacy RNG with same seed as the notebook: npr.seed(12345)
    np.random.seed(12345)
    D = 2
    K = 4

    # ---- Dynamics ----
    # Two rotation states around centers
    A0 = random_rotation(D, np.pi / 24.0)
    A1 = random_rotation(D, np.pi / 48.0)
    centers = [np.array([+2.0, 0.0]), np.array([-2.0, 0.0])]
    b0 = -(A0 - np.eye(D)) @ centers[0]
    b1 = -(A1 - np.eye(D)) @ centers[1]

    # Two translation states (identity dynamics + constant drift)
    A2 = np.eye(D)
    b2 = np.array([+0.1, 0.0])    # "right"
    A3 = np.eye(D)
    b3 = np.array([-0.25, 0.0])   # "left"

    As = np.array([A0, A1, A2, A3])
    bs = np.array([b0, b1, b2, b3])

    # ---- Recurrence (transition logistic regression) ----
    #   logits_k = R_k · x + r_k    for each state k
    #   then  π = softmax(logits)
    w1, bias1 = np.array([+1.0, 0.0]), -2.0   # x1 > 2
    w2, bias2 = np.array([-1.0, 0.0]), -2.0   # x1 < -2
    w3, bias3 = np.array([0.0, +1.0]),  0.0   # x2 > 0
    w4, bias4 = np.array([0.0, -1.0]),  0.0   # x2 < 0

    Rs = np.array([100 * w1, 100 * w2, 10 * w3, 10 * w4])  # (K, D)
    r  = np.array([100 * bias1, 100 * bias2, 10 * bias3, 10 * bias4])  # (K,)

    # ---- Dynamics noise ----
    Q_diag = 1e-4 * np.ones((K, D))

    return As, bs, Rs, r, Q_diag


def simulate_nascar(T: int = 10000, seed: int = 12345):
    """Sample a trajectory from the NASCAR rAR-HMM.

    Returns x (T, 2), z_true (T,).
    """
    As, bs, Rs, r, Q_diag = make_nascar_params()
    K, D = As.shape[0], As.shape[1]

    rng = np.random.default_rng(seed)

    x = np.zeros((T, D))
    z = np.zeros(T, dtype=int)

    # Initial state
    x[0] = np.array([0.0, 1.0])    # same as notebook: mu_init = [0, 1]
    logits0 = Rs @ x[0] + r
    z[0] = rng.choice(K, p=stick_breaking_logits_to_probs(logits0))

    for t in range(1, T):
        # Transition: p(z_t | x_{t-1})
        logits = Rs @ x[t - 1] + r
        probs = stick_breaking_logits_to_probs(logits)
        z[t] = rng.choice(K, p=probs)

        # Dynamics: x_t = A_{z_t} x_{t-1} + b_{z_t} + ε
        noise = rng.normal(0, np.sqrt(Q_diag[z[t]]))
        x[t] = As[z[t]] @ x[t - 1] + bs[z[t]] + noise

    return x, z, As, bs, Rs, r, Q_diag


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--T", type=int, default=10000)
    ap.add_argument("--seed", type=int, default=12345)
    ap.add_argument("--out", type=str, default="runs/nascar/nascar_data.npz")
    args = ap.parse_args()

    x, z, As, bs, Rs, r, Q_diag = simulate_nascar(args.T, args.seed)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(out_path, x=x, z_true=z, As=As, bs=bs, Rs=Rs, r=r, Q_diag=Q_diag)
    print(f"[gen_nascar] saved {out_path}  (T={args.T}, K=4, D=2)")
    print(f"  state counts: {dict(zip(*np.unique(z, return_counts=True)))}")


if __name__ == "__main__":
    main()
