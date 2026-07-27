"""EM-based training for rSLDS (variational alternative to Gibbs).

Extends the rAR-HMM EM trainer with:
  - After E-step (forward-backward for gamma), run Kalman smoother to infer x
  - M-step for observation noise S
  - All other M-step logic (dynamics A,Q and transitions R,r) is identical.
"""
from __future__ import annotations

import time
import pickle
from pathlib import Path
from typing import Sequence, List, Dict, Any, Optional

import numpy as np
from scipy.special import logsumexp

from .config import Config
from .data import Trajectory, stack_for_ar
from .model import RecurrentSLDS, ModelParams
from .inference import (
    _per_traj_logobs_logtrans, initialize,
    kalman_smoother_mean, m_step_obs_noise,
)
from .stick_breaking import stick_breaking_log_probs


# ─────────────────────────────────────────────────────────────────────────────
# E-step: forward-backward  (specialised for "ro" mode)
# ─────────────────────────────────────────────────────────────────────────────

def _forward_backward_ro(log_init: np.ndarray,
                         log_obs: np.ndarray,
                         log_trans: np.ndarray) -> np.ndarray:
    """Compute posterior gamma via forward-backward for 'ro' mode.

    In "ro" mode the transition P(z_{t+1}|x_t) does NOT depend on z_t.
    """
    S, K = log_obs.shape
    log_pi_trans = log_trans[:, 0, :]

    log_alpha = np.empty((S, K))
    log_alpha[0] = log_init + log_obs[0]
    log_alpha[0] -= logsumexp(log_alpha[0])

    for s in range(1, S):
        log_alpha[s] = log_obs[s] + log_pi_trans[s - 1]
        log_alpha[s] -= logsumexp(log_alpha[s])

    gamma = np.exp(log_alpha)
    gamma = np.clip(gamma, 1e-10, None)
    gamma /= gamma.sum(axis=1, keepdims=True)
    return gamma


# ─────────────────────────────────────────────────────────────────────────────
# M-step: dynamics  A_k, Q_k  via weighted least squares
# ─────────────────────────────────────────────────────────────────────────────

def _m_step_dynamics(trajs: Sequence[Trajectory],
                     gammas: List[np.ndarray],
                     cfg: Config,
                     params: ModelParams,
                     reg: float = 1e-4) -> None:
    """Update A_k, Q_k with soft assignments (weighted regression)."""
    K, M, P = cfg.K, cfg.obs_dim, cfg.ar_lag
    D = M * P + 1

    for k in range(K):
        XtX = np.zeros((D, D))
        XtY = np.zeros((D, M))
        YtY = np.zeros((M, M))
        w_total = 0.0

        for i, tr in enumerate(trajs):
            T = tr.x.shape[0]
            if T <= P:
                continue
            gamma = gammas[i]
            w = gamma[1:, k]
            S = w.shape[0]

            lagged = np.concatenate(
                [tr.x[P - j - 1 : T - j - 1] for j in range(P)], axis=1)
            X_in = np.concatenate([lagged, np.ones((S, 1))], axis=1)
            X_out = tr.x[P:]

            wX = X_in * w[:, None]
            XtX += wX.T @ X_in
            XtY += wX.T @ X_out
            YtY += (X_out * w[:, None]).T @ X_out
            w_total += w.sum()

        if w_total < D + 2:
            continue

        XtX += reg * np.eye(D)
        A_new = np.linalg.solve(XtX, XtY).T
        Q_new = (YtY - A_new @ XtY) / max(w_total, 1.0)
        Q_new = 0.5 * (Q_new + Q_new.T) + cfg.Q_jitter * np.eye(M)

        eigvals = np.linalg.eigvalsh(Q_new)
        if eigvals.min() < 1e-6:
            Q_new += (1e-6 - eigvals.min() + 1e-7) * np.eye(M)

        params.A[k] = A_new
        params.Q[k] = Q_new


# ─────────────────────────────────────────────────────────────────────────────
# M-step: transitions R, r  via gradient descent
# ─────────────────────────────────────────────────────────────────────────────

def _m_step_transitions_gd(trajs: Sequence[Trajectory],
                           gammas: List[np.ndarray],
                           cfg: Config,
                           params: ModelParams,
                           n_steps: int = 100,
                           lr: float = 0.01) -> float:
    """Update R, r via gradient descent on transition cross-entropy."""
    K, M = cfg.K, cfg.obs_dim
    P = cfg.ar_lag
    if K <= 1:
        return 0.0

    X_list, G_list = [], []
    for i, tr in enumerate(trajs):
        T = tr.x.shape[0]
        if T <= P + 1:
            continue
        gamma = gammas[i]
        S = gamma.shape[0]
        x_rec = tr.x[P - 1 : T - 1]
        X_list.append(x_rec)
        G_list.append(gamma[1:])

    if not X_list:
        return 0.0

    X_all = np.concatenate(X_list, 0)
    G_all = np.concatenate(G_list, 0)
    N = X_all.shape[0]

    R = params.R[0].copy()
    r_bias = params.r[0].copy()

    m_R, v_R = np.zeros_like(R), np.zeros_like(R)
    m_r, v_r = np.zeros_like(r_bias), np.zeros_like(r_bias)
    beta1, beta2, eps = 0.9, 0.999, 1e-8

    loss_final = 0.0

    for step in range(n_steps):
        nu = X_all @ R.T + r_bias[None, :]
        nu_clip = np.clip(nu, -20, 20)
        sigma_nu = 1.0 / (1.0 + np.exp(-nu_clip))

        log_pi = stick_breaking_log_probs(nu_clip)
        loss = -np.sum(G_all * log_pi) / N

        n_geq = np.cumsum(G_all[:, ::-1], axis=1)[:, ::-1][:, :K-1]
        grad_nu = G_all[:, :K-1] - sigma_nu * n_geq

        gR = grad_nu.T @ X_all / N
        gr = grad_nu.mean(axis=0)

        t_ = step + 1
        m_R = beta1 * m_R + (1 - beta1) * gR
        v_R = beta2 * v_R + (1 - beta2) * gR ** 2
        m_R_hat = m_R / (1 - beta1 ** t_)
        v_R_hat = v_R / (1 - beta2 ** t_)
        R += lr * m_R_hat / (np.sqrt(v_R_hat) + eps)

        m_r = beta1 * m_r + (1 - beta1) * gr
        v_r = beta2 * v_r + (1 - beta2) * gr ** 2
        m_r_hat = m_r / (1 - beta1 ** t_)
        v_r_hat = v_r / (1 - beta2 ** t_)
        r_bias += lr * m_r_hat / (np.sqrt(v_r_hat) + eps)

        loss_final = loss

    params.R[:] = R[None, :, :]
    params.r[:] = r_bias[None, :]
    return float(loss_final)


# ─────────────────────────────────────────────────────────────────────────────
# Kalman inference step: infer x given gamma (soft z) and y
# ─────────────────────────────────────────────────────────────────────────────

def _kalman_step(trajs: Sequence[Trajectory],
                 gammas: List[np.ndarray],
                 params: ModelParams,
                 cfg: Config) -> None:
    """Infer latent x for each trajectory via Kalman smoother.

    Uses hard z = argmax(gamma) for the Kalman smoother dynamics selection.
    Updates tr.x in place.
    """
    P = cfg.ar_lag
    for i, tr in enumerate(trajs):
        T = tr.x.shape[0]
        if T <= P:
            continue
        gamma = gammas[i]
        # Convert soft gamma to hard z for Kalman smoother
        z_hmm = np.argmax(gamma, axis=1)                  # (S,) S = T-P+1
        z_full = np.empty(T, dtype=np.int64)
        z_full[: P - 1] = z_hmm[0]
        z_full[P - 1 :] = z_hmm

        # Run Kalman smoother with hard z
        x_smooth = kalman_smoother_mean(tr.y, z_full, params, cfg)
        tr.x = x_smooth


# ─────────────────────────────────────────────────────────────────────────────
# Main EM loop
# ─────────────────────────────────────────────────────────────────────────────

def fit_vi(cfg: Config,
           trajs: Sequence[Trajectory],
           n_em_iter: int = 100,
           n_r_steps: int = 100,
           r_lr: float = 0.01,
           verbose: bool = True,
           warm_start_path: Optional[str] = None) -> Dict[str, Any]:
    """Train rSLDS via Expectation-Maximisation.

    The EM loop is:
      1. E-step: forward-backward for gamma (soft z) given current x estimates
      2. Kalman step: infer x given gamma and observed y
      3. M-step dynamics: update A, Q
      4. M-step transitions: update R, r
      5. M-step observation noise: update S
    """
    assert cfg.recurrence_mode == "ro", \
        "VI training currently only supports 'ro' mode"

    rng = np.random.default_rng(cfg.init_seed)
    model = RecurrentSLDS(cfg)
    K = cfg.K
    P = cfg.ar_lag

    # ── Initialisation ──
    if warm_start_path is not None:
        with open(warm_start_path, "rb") as f:
            ckpt_old = pickle.load(f)
        p_init = ckpt_old["samples"][-1]
        model.params.A[:] = p_init.A
        model.params.Q[:] = p_init.Q
        model.params.R[:] = p_init.R
        model.params.r[:] = p_init.r
        if hasattr(p_init, 'C') and p_init.C is not None:
            model.params.C[:] = p_init.C
        if hasattr(p_init, 'S') and p_init.S is not None:
            model.params.S[:] = p_init.S
        if verbose:
            print(f"[vi] warm-started from {warm_start_path}")
    else:
        z_state = initialize(model, trajs, rng)
        if verbose:
            print(f"[vi] initialised via k-means + AR-EM")

    p = model.params
    log_init = np.full(K, -np.log(K))
    elbo_history: List[float] = []
    t0 = time.time()

    for it in range(n_em_iter):
        # ── E-step: forward-backward for gamma ──
        gammas: List[np.ndarray] = []
        total_elbo = 0.0
        for tr in trajs:
            T = tr.x.shape[0]
            if T <= P:
                gammas.append(np.ones((1, K)) / K)
                continue
            bundle = _per_traj_logobs_logtrans(tr, p, cfg)
            if bundle is None:
                gammas.append(np.ones((1, K)) / K)
                continue
            log_obs, log_trans, _ = bundle
            gamma = _forward_backward_ro(log_init, log_obs, log_trans)
            gammas.append(gamma)
            total_elbo += float(np.sum(gamma[1:] * log_obs[1:]))

        # ── Kalman step: infer x given gamma and y ──
        _kalman_step(trajs, gammas, p, cfg)

        # ── M-step: dynamics A, Q ──
        _m_step_dynamics(trajs, gammas, cfg, p)

        # ── M-step: transitions R, r ──
        r_loss = _m_step_transitions_gd(
            trajs, gammas, cfg, p, n_steps=n_r_steps, lr=r_lr)

        # ── M-step: observation noise S ──
        m_step_obs_noise(trajs, p, cfg)

        # ── Update initial-state distribution ──
        z0_counts = np.zeros(K)
        for g in gammas:
            if g.shape[0] > 0:
                z0_counts += g[0]
        log_init = np.log(z0_counts + 1.0) - np.log(z0_counts.sum() + K)

        elbo_history.append(total_elbo)
        if verbose and (it % 5 == 0 or it == n_em_iter - 1):
            elapsed = time.time() - t0
            print(f"[vi] iter {it:4d}/{n_em_iter}  ELBO≈{total_elbo: .2f}  "
                  f"R_loss={r_loss:.4f}  S={p.S[0,0]:.6f}  "
                  f"elapsed={elapsed:.1f}s")

    # ── Build checkpoint (compatible with Gibbs format) ──
    final_params = _copy_params(p)
    z_last = []
    for i, g in enumerate(gammas):
        z_last.append(np.argmax(g, axis=1) if g.shape[0] > 0
                      else np.array([], dtype=np.int64))

    ckpt = {
        "cfg": cfg,
        "samples": [final_params],
        "z_last": z_last,
        "log_init": log_init,
        "loglik_history": np.asarray(elbo_history),
    }

    out_dir = Path(cfg.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg.save(out_dir / "config.json")
    with open(out_dir / "chain.pkl", "wb") as f:
        pickle.dump(ckpt, f)
    np.save(out_dir / "loglik_history.npy", ckpt["loglik_history"])
    if verbose:
        print(f"[vi] saved to {out_dir / 'chain.pkl'}")
    return ckpt


def _copy_params(p: ModelParams) -> ModelParams:
    return ModelParams(
        K=p.K, M=p.M, D_in_ar=p.D_in_ar, D_in_rec=p.D_in_rec,
        A=p.A.copy(), Q=p.Q.copy(), R=p.R.copy(), r=p.r.copy(),
        C=p.C.copy(), S=p.S.copy(),
        mode=p.mode,
    )
