"""Inference for rSLDS:

* Kalman filter + RTS smoother for inferring latent x given z, y.
* HMM forward-filter / backward-sample of z given x.
* Three-stage initializer (k-means warm-start → AR-HMM EM → decision-list permute).

Key difference from rAR-HMM:  x is NOT fully observed.  Only y_t = C x_t + noise
is observed (theta only, omega is latent).  A Kalman smoother infers x.
"""
from __future__ import annotations

from typing import List, Tuple, Sequence
import numpy as np
from scipy.special import logsumexp
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression

from .config import Config
from .data import Trajectory, stack_for_ar
from .model import ModelParams, RecurrentSLDS
from .stick_breaking import (
    stick_breaking_log_probs,
    pg_b_indicator_zerobased,
    pg_kappa_zerobased,
)
from .distributions import MNIW, sample_pg, weighted_suff_stats


# ---------------------------------------------------------------------------
# Kalman filter + RTS smoother for switching linear dynamical system
# ---------------------------------------------------------------------------

def kalman_filter(y: np.ndarray, z: np.ndarray, params: ModelParams,
                  cfg: Config) -> Tuple[np.ndarray, ...]:
    """Forward Kalman filter for a single trajectory.

    Given observed y_{0:T-1} and discrete state z_{0:T-1}, compute
    filtered estimates of x_{0:T-1}.

    Parameters
    ----------
    y : (T,) observed theta
    z : (T,) discrete state assignments
    params : ModelParams  (provides A, Q, C, S)
    cfg : Config

    Returns
    -------
    mu_pred : (T, M)   predicted means
    Sig_pred : (T, M, M) predicted covariances
    mu_filt : (T, M)   filtered means
    Sig_filt : (T, M, M) filtered covariances
    """
    M = params.M
    T = y.shape[0]
    C = params.C                          # (D_obs, M), e.g. (1, 2)
    S = params.S                          # (D_obs, D_obs), e.g. (1, 1)
    c = C[0]                              # (M,) — first (only) row of C

    mu_pred = np.zeros((T, M))
    Sig_pred = np.zeros((T, M, M))
    mu_filt = np.zeros((T, M))
    Sig_filt = np.zeros((T, M, M))

    # --- t = 0: broad prior + observation update ---
    mu0 = np.zeros(M)
    mu0[0] = y[0]                         # theta known from observation
    Sig0 = np.diag([cfg.obs_noise_scale, cfg.kalman_init_omega_var])
    if M > 2:
        Sig0 = np.diag([cfg.obs_noise_scale] + [cfg.kalman_init_omega_var] * (M - 1))

    mu_pred[0] = mu0
    Sig_pred[0] = Sig0

    # Scalar observation update (D_obs = 1):
    s_inn = c @ Sig_pred[0] @ c + S[0, 0]        # scalar innovation variance
    K_gain = (Sig_pred[0] @ c) / s_inn            # (M,)
    v = y[0] - c @ mu_pred[0]                     # scalar innovation
    mu_filt[0] = mu_pred[0] + K_gain * v
    Sig_filt[0] = Sig_pred[0] - np.outer(K_gain, K_gain) * s_inn
    Sig_filt[0] = 0.5 * (Sig_filt[0] + Sig_filt[0].T)

    # --- t = 1, ..., T-1: predict + update ---
    for t in range(1, T):
        k = int(z[t])
        F_k = params.A[k, :, :M]                 # (M, M) dynamics matrix
        b_k = params.A[k, :, M]                  # (M,) bias

        # Predict
        mu_pred[t] = F_k @ mu_filt[t - 1] + b_k
        Sig_pred[t] = F_k @ Sig_filt[t - 1] @ F_k.T + params.Q[k]
        Sig_pred[t] = 0.5 * (Sig_pred[t] + Sig_pred[t].T)

        # Update with y[t]
        s_inn = c @ Sig_pred[t] @ c + S[0, 0]
        K_gain = (Sig_pred[t] @ c) / s_inn
        v = y[t] - c @ mu_pred[t]
        mu_filt[t] = mu_pred[t] + K_gain * v
        Sig_filt[t] = Sig_pred[t] - np.outer(K_gain, K_gain) * s_inn
        Sig_filt[t] = 0.5 * (Sig_filt[t] + Sig_filt[t].T)

    return mu_pred, Sig_pred, mu_filt, Sig_filt


def kalman_smoother_mean(y: np.ndarray, z: np.ndarray, params: ModelParams,
                         cfg: Config) -> np.ndarray:
    """RTS smoother: compute E[x_{0:T-1} | z, y].

    Returns mu_smooth : (T, M).
    """
    M = params.M
    mu_pred, Sig_pred, mu_filt, Sig_filt = kalman_filter(y, z, params, cfg)
    T = y.shape[0]
    mu_smooth = mu_filt.copy()

    for t in range(T - 2, -1, -1):
        k = int(z[t + 1])
        F_k = params.A[k, :, :M]

        # Backward gain
        Sig_pred_tp1 = Sig_pred[t + 1] + 1e-8 * np.eye(M)
        try:
            G = Sig_filt[t] @ F_k.T @ np.linalg.inv(Sig_pred_tp1)
        except np.linalg.LinAlgError:
            G = Sig_filt[t] @ F_k.T @ np.linalg.pinv(Sig_pred_tp1)

        mu_smooth[t] = mu_filt[t] + G @ (mu_smooth[t + 1] - mu_pred[t + 1])

    return mu_smooth


def kalman_smoother_sample(y: np.ndarray, z: np.ndarray, params: ModelParams,
                           cfg: Config, rng: np.random.Generator) -> np.ndarray:
    """Sample x_{0:T-1} | z, y via Kalman filter + RTS backward sampling.

    Returns x : (T, M).
    """
    M = params.M
    mu_pred, Sig_pred, mu_filt, Sig_filt = kalman_filter(y, z, params, cfg)
    T = y.shape[0]
    x = np.zeros((T, M))

    # Sample x_{T-1}
    Sig_T = Sig_filt[-1] + 1e-8 * np.eye(M)
    Sig_T = 0.5 * (Sig_T + Sig_T.T)
    try:
        L = np.linalg.cholesky(Sig_T)
    except np.linalg.LinAlgError:
        eigvals = np.linalg.eigvalsh(Sig_T)
        Sig_T += (abs(eigvals.min()) + 1e-7) * np.eye(M)
        L = np.linalg.cholesky(Sig_T)
    x[-1] = mu_filt[-1] + L @ rng.standard_normal(M)

    # Backward sampling
    for t in range(T - 2, -1, -1):
        k = int(z[t + 1])
        F_k = params.A[k, :, :M]

        Sig_pred_tp1 = Sig_pred[t + 1] + 1e-8 * np.eye(M)
        try:
            G = Sig_filt[t] @ F_k.T @ np.linalg.inv(Sig_pred_tp1)
        except np.linalg.LinAlgError:
            G = Sig_filt[t] @ F_k.T @ np.linalg.pinv(Sig_pred_tp1)

        m = mu_filt[t] + G @ (x[t + 1] - mu_pred[t + 1])
        P_cov = Sig_filt[t] - G @ Sig_pred[t + 1] @ G.T
        P_cov = 0.5 * (P_cov + P_cov.T) + 1e-8 * np.eye(M)

        eigvals = np.linalg.eigvalsh(P_cov)
        if eigvals.min() < 0:
            P_cov += (abs(eigvals.min()) + 1e-7) * np.eye(M)

        try:
            L = np.linalg.cholesky(P_cov)
        except np.linalg.LinAlgError:
            L = np.eye(M) * 1e-4
        x[t] = m + L @ rng.standard_normal(M)

    return x


# ---------------------------------------------------------------------------
# M-step for observation noise S (learned from data)
# ---------------------------------------------------------------------------

def m_step_obs_noise(trajs: Sequence[Trajectory], params: ModelParams,
                     cfg: Config) -> None:
    """Update observation noise S = (1/N) sum_t (y_t - C x_t)(y_t - C x_t)^T."""
    C = params.C
    D_obs = C.shape[0]
    S_acc = np.zeros((D_obs, D_obs))
    n_total = 0
    for tr in trajs:
        y_pred = (C @ tr.x.T).T                   # (T, D_obs)
        y_arr = tr.y[:, None] if tr.y.ndim == 1 else tr.y  # (T, D_obs)
        diff = y_arr - y_pred                      # (T, D_obs)
        S_acc += diff.T @ diff
        n_total += tr.x.shape[0]
    if n_total > 0:
        S_new = S_acc / n_total
        # Ensure positive definite with a floor
        S_new = 0.5 * (S_new + S_new.T)
        eigvals = np.linalg.eigvalsh(S_new)
        if eigvals.min() < 1e-8:
            S_new += (1e-8 - eigvals.min()) * np.eye(D_obs)
        params.S = S_new


# ---------------------------------------------------------------------------
# Stickiness
# ---------------------------------------------------------------------------
def _apply_stickiness(S_xx: np.ndarray, S_xy: np.ndarray, S_yy: np.ndarray,
                      target_bias: float, sigmasq: float, D_in: int):
    if target_bias == 0.0:
        return S_xx, S_xy, S_yy
    w = 1.0 / max(sigmasq, 1e-12)
    e_bias = np.zeros(D_in); e_bias[-1] = 1.0
    S_xx = S_xx + w * np.outer(e_bias, e_bias)
    S_xy = S_xy + w * np.outer(e_bias, np.array([target_bias]))
    S_yy = S_yy + w * (target_bias ** 2)
    return S_xx, S_xy, S_yy


# ---------------------------------------------------------------------------
# Empirical prior estimation for AR dynamics
# ---------------------------------------------------------------------------
def empirical_dyn_prior(trajs: Sequence[Trajectory], cfg: Config
                        ) -> Tuple[np.ndarray, np.ndarray]:
    M, P = cfg.obs_dim, cfg.ar_lag
    D_in = M * P + 1
    X_in, X_out, _, _ = stack_for_ar(trajs, P=P)
    if X_in.shape[0] < D_in + 1:
        M0 = np.zeros((M, D_in)); M0[:M, :M] = cfg.spectral_radius_target * np.eye(M)
        Psi0 = cfg.psi_dyn_scale * np.eye(M)
        return M0, Psi0
    Reg = 1e-4 * np.eye(D_in)
    B = np.linalg.solve(X_in.T @ X_in + Reg, X_in.T @ X_out).T
    resid = X_out - X_in @ B.T
    Psi_emp = resid.T @ resid / max(X_in.shape[0] - D_in, 1)
    Psi0 = cfg.psi_dyn_scale * Psi_emp + 1e-8 * np.eye(M)
    return B, Psi0


# ---------------------------------------------------------------------------
# Forward-filter backward-sample for a single trajectory (for z | x)
# ---------------------------------------------------------------------------
def ffbs_single(log_init: np.ndarray,
                log_trans: np.ndarray,
                log_obs: np.ndarray,
                rng: np.random.Generator) -> np.ndarray:
    """Sample z_{1:T} ~ p(z | x)."""
    T, K = log_obs.shape
    log_alpha = np.empty((T, K))
    log_alpha[0] = log_init + log_obs[0]
    for t in range(1, T):
        log_alpha[t] = logsumexp(log_alpha[t - 1][:, None] + log_trans[t - 1], axis=0) + log_obs[t]
    z = np.empty(T, dtype=np.int64)
    log_p = log_alpha[-1] - logsumexp(log_alpha[-1])
    z[-1] = rng.choice(K, p=np.exp(log_p))
    for t in range(T - 2, -1, -1):
        log_p = log_alpha[t] + log_trans[t, :, z[t + 1]]
        log_p -= logsumexp(log_p)
        z[t] = rng.choice(K, p=np.exp(log_p))
    return z


# ---------------------------------------------------------------------------
# Build per-trajectory log-likelihood and log-transition tensors
# (uses current x estimate, NOT the raw data)
# ---------------------------------------------------------------------------
def _per_traj_logobs_logtrans(tr: Trajectory, params: ModelParams, cfg: Config):
    """Same as rAR-HMM — uses tr.x (which is the *inferred* x, not observed)."""
    P = cfg.ar_lag
    K, M = params.K, params.M
    T = tr.x.shape[0]
    if T <= P:
        return None
    lagged = np.concatenate([tr.x[P - k - 1 : T - k - 1] for k in range(P)], axis=1)
    lagged = np.concatenate([lagged, np.ones((T - P, 1))], axis=1)
    log_ar = params.log_ar_likelihood(lagged, tr.x[P:])
    log_obs = np.concatenate([np.zeros((1, K)), log_ar], axis=0)

    x_for_rec = tr.x[P - 1 : T - 1]
    log_trans = np.empty((T - P, K, K))
    for k in range(K):
        z_prev = np.full(T - P, k, dtype=np.int64)
        nu = params.recurrence_logits(x_for_rec, z_prev)
        log_trans[:, k, :] = stick_breaking_log_probs(nu)
    return log_obs, log_trans, x_for_rec


# ---------------------------------------------------------------------------
# Gibbs step (with Kalman smoother for x)
# ---------------------------------------------------------------------------
def gibbs_step(model: RecurrentSLDS,
               trajs: Sequence[Trajectory],
               z_state: List[np.ndarray],
               rng: np.random.Generator,
               mniw_dyn: MNIW, mniw_rec: MNIW,
               log_init: np.ndarray | None = None,
               phase: str = "full") -> Tuple[float, np.ndarray]:
    """One Gibbs sweep.  Modifies model.params, z_state, and tr.x in place.

    phase:
        "full"  - resample z, x, omega, (R, r), (A, Q), pi_0, S
        "dyn"   - resample only (A, Q) given current z and x
        "trans" - resample only omega and (R, r) given current z and x
    """
    cfg = model.cfg
    p = model.params
    K, M = p.K, p.M
    P = cfg.ar_lag

    if log_init is None:
        log_init = np.full(K, -np.log(K))

    # --- (1) sample z given current x ---
    total_loglik = 0.0
    cached_logtrans = []
    cached_x_for_rec = []
    for i, tr in enumerate(trajs):
        bundle = _per_traj_logobs_logtrans(tr, p, cfg)
        if bundle is None:
            if phase == "full":
                z_state[i] = np.zeros(tr.x.shape[0], dtype=np.int64)
            cached_logtrans.append(None); cached_x_for_rec.append(None)
            continue
        log_obs, log_trans, x_rec = bundle
        if phase == "full":
            z_hmm = ffbs_single(log_init, log_trans, log_obs, rng)
            z_full = np.empty(tr.x.shape[0], dtype=np.int64)
            z_full[: P - 1] = z_hmm[0]
            z_full[P - 1 :] = z_hmm
            z_state[i] = z_full
            total_loglik += float(logsumexp(log_obs.sum(0)))
        cached_logtrans.append(log_trans); cached_x_for_rec.append(x_rec)

    # --- (1.5) sample x given z, y via Kalman smoother ---
    if phase == "full":
        for i, tr in enumerate(trajs):
            if tr.x.shape[0] > P:
                x_new = kalman_smoother_sample(tr.y, z_state[i], p, cfg, rng)
                tr.x = x_new
                # Rebuild cache with updated x
        # Rebuild cached_x_for_rec with updated x
        cached_x_for_rec = []
        for i, tr in enumerate(trajs):
            T = tr.x.shape[0]
            if T > P:
                cached_x_for_rec.append(tr.x[P - 1 : T - 1])
            else:
                cached_x_for_rec.append(None)

    # --- (2) PG augmentation + (3) (R, r) sample ---
    if phase in ("full", "trans"):
        _resample_transitions(p, cfg, trajs, z_state, cached_x_for_rec,
                              mniw_rec, rng)

    # --- (4) sample (A_k, Q_k) | z, x ---
    if phase in ("full", "dyn"):
        X_in_ar, X_out_ar, _, _ = stack_for_ar(trajs, P=P)
        z_for_ar = np.concatenate([z_state[i][P:] for i in range(len(trajs))
                                   if z_state[i].shape[0] > P])
        for k in range(K):
            idx = (z_for_ar == k)
            if idx.sum() < 1:
                continue
            Xk, Yk = X_in_ar[idx], X_out_ar[idx]
            S_xx, S_xy, S_yy, n = weighted_suff_stats(Xk, Yk, np.ones(idx.sum()))
            nu_n, Psi_n, Mn, Vn = mniw_dyn.posterior(S_xx, S_xy, S_yy, int(idx.sum()))
            A_new, Q_new = MNIW.sample(nu_n, Psi_n, Mn, Vn, rng)
            p.A[k] = A_new
            p.Q[k] = Q_new + cfg.Q_jitter * np.eye(M)

    # --- (4.5) update observation noise S ---
    if phase == "full":
        m_step_obs_noise(trajs, p, cfg)

    # --- (5) re-estimate initial-state distribution ---
    if phase == "full":
        z0_counts = np.zeros(K)
        for z in z_state:
            if z.size > 0:
                z0_counts[z[P - 1 if P > 0 else 0]] += 1.0
        log_init = np.log(z0_counts + 1.0) - np.log(z0_counts.sum() + K)

    return total_loglik, log_init


def _resample_transitions(p: ModelParams, cfg: Config,
                          trajs: Sequence[Trajectory],
                          z_state: List[np.ndarray],
                          cached_x_for_rec: list,
                          mniw_rec: MNIW,
                          rng: np.random.Generator) -> None:
    """Steps (2)+(3) of the Gibbs sweep, factored out for warmup reuse."""
    K, M = p.K, p.M
    P = cfg.ar_lag
    Xrec_all, Zprev_all, Znext_all = [], [], []
    for i, tr in enumerate(trajs):
        if cached_x_for_rec[i] is None:
            continue
        z = z_state[i]
        T = z.shape[0]
        Xrec_all.append(cached_x_for_rec[i])
        Zprev_all.append(z[P - 1 : T - 1])
        Znext_all.append(z[P    : T])
    Xrec_all = np.concatenate(Xrec_all, 0) if Xrec_all else np.zeros((0, M))
    Zprev_all = np.concatenate(Zprev_all, 0) if Zprev_all else np.zeros(0, dtype=np.int64)
    Znext_all = np.concatenate(Znext_all, 0) if Znext_all else np.zeros(0, dtype=np.int64)
    if Xrec_all.shape[0] == 0:
        return

    nu = p.recurrence_logits(Xrec_all, Zprev_all)
    nu_clip = np.clip(nu, -cfg.pg_clip_nu_abs, cfg.pg_clip_nu_abs)
    b = pg_b_indicator_zerobased(Znext_all, K)
    omega = np.zeros_like(b)
    mask = b > 0
    if mask.any():
        omega[mask] = sample_pg(b[mask], nu_clip[mask], rng,
                                backend=cfg.pg_backend,
                                truncation=cfg.pg_truncation)
    kappa = pg_kappa_zerobased(Znext_all, K)

    X_rec_design = Xrec_all
    Xa_all = np.concatenate([X_rec_design, np.ones((X_rec_design.shape[0], 1))], axis=1)
    D_in_rec = Xa_all.shape[1]
    sticky_kappa = cfg.stickiness_kappa
    sticky_sigsq = cfg.sigmasq_stickiness

    if p.mode == "full":
        for kprev in range(K):
            idx_k = (Zprev_all == kprev)
            if not idx_k.any():
                continue
            Xk = X_rec_design[idx_k]
            om_k = omega[idx_k]; ka_k = kappa[idx_k]
            for j in range(K - 1):
                w = om_k[:, j]
                if w.sum() < 1e-8:
                    continue
                y = (ka_k[:, j] / np.where(w > 0, w, 1.0))[:, None]
                Xa = np.concatenate([Xk, np.ones((Xk.shape[0], 1))], axis=1)
                S_xx, S_xy, S_yy, n = weighted_suff_stats(Xa, y, w)
                target = sticky_kappa if (j == kprev) else (
                    -sticky_kappa if kprev == K - 1 else 0.0)
                S_xx, S_xy, S_yy = _apply_stickiness(S_xx, S_xy, S_yy,
                                                    target, sticky_sigsq, D_in_rec)
                nu_n, Psi_n, Mn, Vn = mniw_rec.posterior(S_xx, S_xy, S_yy,
                                                        int(idx_k.sum()))
                B, _ = MNIW.sample(nu_n, Psi_n, Mn, Vn, rng)
                p.R[kprev, j] = B[0, :M]
                p.r[kprev, j] = B[0, M]
    else:
        for j in range(K - 1):
            w = omega[:, j]
            if w.sum() < 1e-8:
                continue
            y = (kappa[:, j] / np.where(w > 0, w, 1.0))[:, None]
            S_xx, S_xy, S_yy, n = weighted_suff_stats(Xa_all, y, w)
            nu_n, Psi_n, Mn, Vn = mniw_rec.posterior(S_xx, S_xy, S_yy,
                                                    int(Xa_all.shape[0]))
            B, _ = MNIW.sample(nu_n, Psi_n, Mn, Vn, rng)
            p.R[:, j] = B[0, :M]
            if p.mode == "shared":
                for kprev in range(K):
                    idx = (Zprev_all == kprev) & (w > 0)
                    if idx.sum() < 1:
                        continue
                    resid = kappa[idx, j] / w[idx] - X_rec_design[idx] @ p.R[0, j]
                    denom = w[idx].sum()
                    r_mle = (w[idx] * resid).sum() / max(denom, 1e-8)
                    target = sticky_kappa if (j == kprev) else (
                        -sticky_kappa if kprev == K - 1 else 0.0)
                    if target != 0.0:
                        prec_data = denom
                        prec_prior = 1.0 / max(sticky_sigsq, 1e-12)
                        r_post = (prec_data * r_mle + prec_prior * target) / (
                            prec_data + prec_prior)
                        p.r[kprev, j] = r_post
                    else:
                        p.r[kprev, j] = r_mle
            else:
                p.r[:, j] = B[0, M]


# ---------------------------------------------------------------------------
# Three-stage initialization
# ---------------------------------------------------------------------------
def initialize(model: RecurrentSLDS, trajs: Sequence[Trajectory],
               rng: np.random.Generator) -> List[np.ndarray]:
    """Returns initial z_{1:T} for every trajectory.  Also fills model.params.

    Uses the initial x estimates (from finite-difference omega) for k-means + AR-EM.
    """
    cfg = model.cfg
    K, M, P = cfg.K, cfg.obs_dim, cfg.ar_lag
    model.init_random(rng)
    p = model.params

    # --- (a) k-means on (x_t, x_{t+1} - x_t) to seed states ---
    X_in, X_out, traj_idx, t_idx = stack_for_ar(trajs, P=P)
    feats = np.concatenate([X_out, X_out - X_in[:, :M]], axis=1)
    km = KMeans(n_clusters=K, n_init=cfg.init_kmeans_n_init,
                random_state=cfg.init_seed).fit(feats)
    z_flat = km.labels_

    # --- (b) AR-HMM EM: fit AR params per cluster ---
    for _ in range(cfg.init_arhmm_em_iter):
        for k in range(K):
            idx = (z_flat == k)
            if idx.sum() < M + 2:
                continue
            Xk, Yk = X_in[idx], X_out[idx]
            Reg = 1e-4 * np.eye(Xk.shape[1])
            B = np.linalg.solve(Xk.T @ Xk + Reg, Xk.T @ Yk).T
            p.A[k] = B
            resid = Yk - Xk @ B.T
            p.Q[k] = resid.T @ resid / max(idx.sum() - 1, 1) + 1e-4 * np.eye(M)
        log_ar = p.log_ar_likelihood(X_in, X_out)
        z_flat = log_ar.argmax(axis=1)

    # --- (c) decision-list initialization for the recurrence ---
    if cfg.init_decision_list and K > 1:
        order = list(range(K))
        Xrec, Znext = [], []
        for i, tr in enumerate(trajs):
            T = tr.x.shape[0]
            if T <= P:
                continue
            zi = z_flat[traj_idx == i]
            Xrec.append(tr.x[P - 1 : T - 1])
            Znext.append(zi)
        Xrec = np.concatenate(Xrec, 0)
        Znext = np.concatenate(Znext, 0)
        remaining = set(order)
        perm = []
        for j in range(K - 1):
            best_acc, best_k = -np.inf, None
            best_coef, best_intc = None, None
            for k in remaining:
                if len(remaining) == 1:
                    best_k = k; break
                y_bin = (Znext == k).astype(int)
                mask = np.isin(Znext, list(remaining))
                if y_bin[mask].sum() < 2 or (1 - y_bin[mask]).sum() < 2:
                    continue
                try:
                    lr = LogisticRegression(max_iter=200).fit(Xrec[mask], y_bin[mask])
                    acc = lr.score(Xrec[mask], y_bin[mask])
                except Exception:
                    continue
                if acc > best_acc:
                    best_acc, best_k = acc, k
                    best_coef = lr.coef_[0]; best_intc = lr.intercept_[0]
            if best_k is None:
                best_k = next(iter(remaining))
            perm.append(best_k)
            remaining.discard(best_k)
            if best_coef is not None and p.mode in ("shared", "ro"):
                p.R[:, j, :M] = best_coef
                if p.mode == "ro":
                    p.r[:, j] = best_intc
                else:
                    p.r[:, j] = best_intc
            elif best_coef is not None:
                for kp in range(K):
                    p.R[kp, j, :M] = best_coef
                    p.r[kp, j] = best_intc
        perm.append(next(iter(remaining)))
        inv_perm = np.argsort(perm)
        z_flat = inv_perm[z_flat]
        p.A = p.A[perm]
        p.Q = p.Q[perm]

    # --- distribute z_flat back into per-trajectory arrays ---
    z_per: List[np.ndarray] = []
    for i, tr in enumerate(trajs):
        T = tr.x.shape[0]
        zi = np.zeros(T, dtype=np.int64)
        if T > P:
            zi[P:] = z_flat[traj_idx == i]
            zi[:P] = zi[P]
        z_per.append(zi)
    return z_per
