"""EM-based training for rAR-HMM (variational alternative to Gibbs).

Key difference from Gibbs+FFBS
------------------------------
In Gibbs training, FFBS uses *emission likelihood* (from A,Q) to correct R's
mistakes when assigning states.  R is only updated via noisy PG augmentation on
hard z samples, so it never learns to be accurate on its own.

In EM training:
  E-step  : forward-backward computes soft state assignments gamma_t(k)
            that combine R's transition prior AND A's emission likelihood.
  M-step  : R is updated via gradient descent to maximise
            sum_t gamma_t(k) * log P(z_t=k | x_{t-1}; R, r).
            This pushes R toward matching the emission-informed assignments,
            so R alone becomes accurate enough for rollout.

The checkpoint format is identical to the Gibbs version, so all existing
visualisation scripts (viz_dynamics, viz_subspace_error, viz_rollout) work
without modification.
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
from .model import RecurrentARHMM, ModelParams
from .inference import _per_traj_logobs_logtrans, initialize
from .stick_breaking import stick_breaking_log_probs


# ─────────────────────────────────────────────────────────────────────────────
# E-step: forward-backward  (specialised for "ro" mode)
# ─────────────────────────────────────────────────────────────────────────────

def _forward_backward_ro(log_init: np.ndarray,
                         log_obs: np.ndarray,
                         log_trans: np.ndarray) -> np.ndarray:
    """Compute posterior gamma via forward-backward for 'ro' mode.

    In "ro" mode the transition P(z_{t+1}|x_t) does NOT depend on z_t.
    Consequence: backward messages are state-independent, so the posterior
    equals the (normalised) forward-filtered distribution.

    Parameters
    ----------
    log_init  : (K,)
    log_obs   : (S, K)    log p(x_t | z_t=k, x_{t-1})   [row 0 is a dummy]
    log_trans : (S-1, K, K)  log p(z_{t+1}=k | z_t=j, x_t)
                              In 'ro' mode every row of the (K,K) is identical.

    Returns
    -------
    gamma : (S, K)  posterior  p(z_t=k | x_{1:T})
    """
    S, K = log_obs.shape

    # In "ro" mode log_trans[s, j, k] is the same for all j.
    # Extract the shared row:  log_pi_trans[s, k] = log P(z_{s+1}=k | x_s)
    log_pi_trans = log_trans[:, 0, :]            # (S-1, K)

    # Forward pass (log-space, normalised at each step)
    log_alpha = np.empty((S, K))
    log_alpha[0] = log_init + log_obs[0]
    log_alpha[0] -= logsumexp(log_alpha[0])

    for s in range(1, S):
        # In "ro" mode:
        #   alpha[s,k] ∝ p(x_s|z=k) * P(z=k|x_{s-1}) * (sum_j alpha[s-1,j])
        # Since alpha is normalised, sum_j alpha = 1.
        log_alpha[s] = log_obs[s] + log_pi_trans[s - 1]
        log_alpha[s] -= logsumexp(log_alpha[s])

    # In "ro" mode backward messages are state-independent ⇒ gamma = alpha
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
            gamma = gammas[i]  # (S, K) where S = T-P+1
            # gamma row 0 is the dummy "seed" row; AR data starts at row 1
            w = gamma[1:, k]   # (T-P,)
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
        A_new = np.linalg.solve(XtX, XtY).T                     # (M, D)
        Q_new = (YtY - A_new @ XtY) / max(w_total, 1.0)         # (M, M)
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
    """Update R, r via gradient descent on transition cross-entropy.

    Objective  (to maximise):
        L(R,r) = sum_t sum_k  gamma_{t+1}(k) * log P(z_{t+1}=k | x_t; R, r)

    Gradient w.r.t. stick logit  nu_j = R_j · x + r_j:
        dL/dnu_j = gamma_j - sigma(nu_j) * n_j
    where  n_j = sum_{k>=j} gamma_k  (prob mass at or above stick j).
    """
    K, M = cfg.K, cfg.obs_dim
    P = cfg.ar_lag
    if K <= 1:
        return 0.0

    # Collect all (x_t, gamma_{t+1}) pairs across trajectories
    X_list, G_list = [], []
    for i, tr in enumerate(trajs):
        T = tr.x.shape[0]
        if T <= P + 1:
            continue
        gamma = gammas[i]        # (S, K) where S = T-P+1
        # HMM-time s → data-time s + P - 1
        # Transition s → s+1 uses x at data-time s+P-1  i.e. tr.x[s+P-1]
        # gamma for state at HMM-time s+1 is gamma[s+1]
        S = gamma.shape[0]
        x_rec = tr.x[P - 1 : T - 1]    # (T-P, M) = (S-1, M)
        X_list.append(x_rec)
        G_list.append(gamma[1:])         # (S-1, K)

    if not X_list:
        return 0.0

    X_all = np.concatenate(X_list, 0)    # (N, M)
    G_all = np.concatenate(G_list, 0)    # (N, K)
    N = X_all.shape[0]

    # Working copies of parameters
    R = params.R[0].copy()               # (K-1, M)
    r_bias = params.r[0].copy()          # (K-1,)

    # Adam optimiser state
    m_R, v_R = np.zeros_like(R), np.zeros_like(R)
    m_r, v_r = np.zeros_like(r_bias), np.zeros_like(r_bias)
    beta1, beta2, eps = 0.9, 0.999, 1e-8

    loss_final = 0.0

    for step in range(n_steps):
        # Logits  (N, K-1)
        nu = X_all @ R.T + r_bias[None, :]
        nu_clip = np.clip(nu, -20, 20)
        sigma_nu = 1.0 / (1.0 + np.exp(-nu_clip))        # (N, K-1)

        # Log-probs via stick-breaking
        log_pi = stick_breaking_log_probs(nu_clip)        # (N, K)
        loss = -np.sum(G_all * log_pi) / N

        # Gradient of objective w.r.t. nu_j:
        #   dL/dnu_j = gamma_j - sigma(nu_j) * n_j
        # where n_j = sum_{k >= j} gamma_k
        n_geq = np.cumsum(G_all[:, ::-1], axis=1)[:, ::-1][:, :K-1]  # (N, K-1)
        grad_nu = G_all[:, :K-1] - sigma_nu * n_geq                  # (N, K-1)

        # Gradient w.r.t. R, r (ascent ⇒ positive)
        gR = grad_nu.T @ X_all / N      # (K-1, M)
        gr = grad_nu.mean(axis=0)        # (K-1,)

        # Adam update (maximise ⇒ add)
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

    # Write back (broadcast to all K for "ro" mode)
    params.R[:] = R[None, :, :]
    params.r[:] = r_bias[None, :]
    return float(loss_final)


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
    """Train rAR-HMM via Expectation-Maximisation.

    Parameters
    ----------
    cfg           : model / data config (same as Gibbs).
    trajs         : training trajectories.
    n_em_iter     : number of EM iterations.
    n_r_steps     : gradient-descent steps per M-step for R.
    r_lr          : Adam learning rate for R.
    warm_start_path : optional path to a Gibbs chain.pkl to warm-start from.

    Returns
    -------
    ckpt : dict with keys 'cfg', 'samples', 'z_last', 'log_init',
           'loglik_history'.  Compatible with load_checkpoint().
    """
    assert cfg.recurrence_mode == "ro", \
        "VI training currently only supports 'ro' mode"

    rng = np.random.default_rng(cfg.init_seed)
    model = RecurrentARHMM(cfg)
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
        # ── E-step: forward-backward ──
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
            # rough ELBO proxy: weighted emission log-likelihood
            total_elbo += float(np.sum(gamma[1:] * log_obs[1:]))

        # ── M-step: dynamics A, Q ──
        _m_step_dynamics(trajs, gammas, cfg, p)

        # ── M-step: transitions R, r ──
        r_loss = _m_step_transitions_gd(
            trajs, gammas, cfg, p, n_steps=n_r_steps, lr=r_lr)

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
                  f"R_loss={r_loss:.4f}  elapsed={elapsed:.1f}s")

    # ── Build checkpoint (compatible with Gibbs format) ──
    final_params = _copy_params(p)
    # hard z from gamma
    z_last = []
    for i, g in enumerate(gammas):
        z_last.append(np.argmax(g, axis=1) if g.shape[0] > 0
                      else np.array([], dtype=np.int64))

    ckpt = {
        "cfg": cfg,
        "samples": [final_params],          # single "sample" = EM point estimate
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
        A=p.A.copy(), Q=p.Q.copy(), R=p.R.copy(), r=p.r.copy(), mode=p.mode,
    )
