"""Inference for rAR-HMM:

* HMM forward-filter / backward-sample of z_{1:T} given parameters and PG aug.
* Gibbs step that cycles z -> omega -> (A, Q) -> (R, r).
* Three-stage initializer (k-means warm-start -> AR-HMM EM -> decision-list permute).

x is fully observed in rAR-HMM, so we do NOT sample x.
"""
from __future__ import annotations

from typing import List, Tuple, Sequence
import numpy as np
from scipy.special import logsumexp
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression

from .config import Config
from .data import Trajectory, stack_for_ar
from .model import ModelParams, RecurrentARHMM
from .stick_breaking import (
    stick_breaking_log_probs,
    pg_b_indicator_zerobased,
    pg_kappa_zerobased,
)
from .distributions import MNIW, sample_pg, weighted_suff_stats


# ---------------------------------------------------------------------------
# Stickiness: inject pseudo-observation pulling bias coef toward target value.
#   Equivalent to a Normal(target, sigmasq) prior on the bias-column coefficient.
#   Mirrors the `kappa, sigmasq_kappa` mechanism in official
#   `StickyInputHMMTransitions` / `StickyInputOnlyHMMTransitions`.
# ---------------------------------------------------------------------------
def _apply_stickiness(S_xx: np.ndarray, S_xy: np.ndarray, S_yy: np.ndarray,
                      target_bias: float, sigmasq: float, D_in: int):
    if target_bias == 0.0:
        return S_xx, S_xy, S_yy
    w = 1.0 / max(sigmasq, 1e-12)
    e_bias = np.zeros(D_in); e_bias[-1] = 1.0          # bias is last design column
    S_xx = S_xx + w * np.outer(e_bias, e_bias)
    S_xy = S_xy + w * np.outer(e_bias, np.array([target_bias]))
    S_yy = S_yy + w * (target_bias ** 2)
    return S_xx, S_xy, S_yy


# ---------------------------------------------------------------------------
# Empirical prior estimation for AR dynamics (mirrors pyslds.get_empirical_ar_params)
#   Returns (M0, Psi0) suitable for plugging into MNIW(D_in_ar, M).
# ---------------------------------------------------------------------------
def empirical_dyn_prior(trajs: Sequence[Trajectory], cfg: Config
                        ) -> Tuple[np.ndarray, np.ndarray]:
    M, P = cfg.obs_dim, cfg.ar_lag
    D_in = M * P + 1
    X_in, X_out, _, _ = stack_for_ar(trajs, P=P)
    if X_in.shape[0] < D_in + 1:
        # fallback to identity prior
        M0 = np.zeros((M, D_in)); M0[:M, :M] = cfg.spectral_radius_target * np.eye(M)
        Psi0 = cfg.psi_dyn_scale * np.eye(M)
        return M0, Psi0
    # Global ridge regression to estimate (A_global, b_global)
    Reg = 1e-4 * np.eye(D_in)
    B = np.linalg.solve(X_in.T @ X_in + Reg, X_in.T @ X_out).T          # (M, D_in)
    resid = X_out - X_in @ B.T
    Psi_emp = resid.T @ resid / max(X_in.shape[0] - D_in, 1)
    # Scale by psi_dyn_scale to preserve user control over prior strength
    Psi0 = cfg.psi_dyn_scale * Psi_emp + 1e-8 * np.eye(M)
    return B, Psi0


# ---------------------------------------------------------------------------
# Forward-filter backward-sample for a single trajectory
# ---------------------------------------------------------------------------
def ffbs_single(log_init: np.ndarray,
                log_trans: np.ndarray,
                log_obs: np.ndarray,
                rng: np.random.Generator) -> np.ndarray:
    """Sample z_{1:T} ~ p(z | x).

    log_init  : (K,)        log p(z_1)
    log_trans : (T-1, K, K) log p(z_{t+1}=k' | z_t=k, x_t)
    log_obs   : (T, K)      log p(x_t | z_t)   (here = AR likelihood of x_t given z_t and x_{t-P:t-1})
    """
    T, K = log_obs.shape
    log_alpha = np.empty((T, K))
    log_alpha[0] = log_init + log_obs[0]
    for t in range(1, T):
        # log_alpha[t, k'] = logsumexp_k ( log_alpha[t-1, k] + log_trans[t-1, k, k'] ) + log_obs[t, k']
        log_alpha[t] = logsumexp(log_alpha[t - 1][:, None] + log_trans[t - 1], axis=0) + log_obs[t]
    # backward sample
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
# ---------------------------------------------------------------------------
def _per_traj_logobs_logtrans(tr: Trajectory, params: ModelParams, cfg: Config):
    P = cfg.ar_lag
    K, M = params.K, params.M
    T = tr.x.shape[0]
    # log_obs[t, k]:  for t >= P, equals log N(x_t | A_k [x_{t-P..t-1};1], Q_k)
    # For t < P, no AR likelihood applies; we set it to 0 (the initial-state prior
    # absorbs everything).  We then use indices t = P-1 .. T-1 as the "HMM time" axis
    # of length T - P + 1.
    if T <= P:
        return None
    lagged = np.concatenate([tr.x[P - k - 1 : T - k - 1] for k in range(P)], axis=1)
    lagged = np.concatenate([lagged, np.ones((T - P, 1))], axis=1)         # (T-P, D_in_ar)
    log_ar = params.log_ar_likelihood(lagged, tr.x[P:])                    # (T-P, K)
    # Prepend a zero row for time t = P-1 (state at the seed)
    log_obs = np.concatenate([np.zeros((1, K)), log_ar], axis=0)           # (T-P+1, K)

    # log_trans[s, k, k']  uses x at HMM-time s as the input to the recurrence,
    # where HMM-time s corresponds to data-time s + P - 1.
    x_for_rec = tr.x[P - 1 : T - 1]                                        # (T-P, M)
    # Need transitions for s = 0..T-P-1.  Build by evaluating recurrence with all
    # possible z_t values.
    log_trans = np.empty((T - P, K, K))
    for k in range(K):
        z_prev = np.full(T - P, k, dtype=np.int64)
        nu = params.recurrence_logits(x_for_rec, z_prev)                   # (T-P, K-1)
        log_trans[:, k, :] = stick_breaking_log_probs(nu)
    return log_obs, log_trans, x_for_rec


# ---------------------------------------------------------------------------
# Gibbs step
# ---------------------------------------------------------------------------
def gibbs_step(model: RecurrentARHMM,
               trajs: Sequence[Trajectory],
               z_state: List[np.ndarray],
               rng: np.random.Generator,
               mniw_dyn: MNIW, mniw_rec: MNIW,
               log_init: np.ndarray | None = None,
               phase: str = "full") -> Tuple[float, np.ndarray]:
    """One Gibbs sweep.  Modifies model.params and z_state in place.

    phase:
        "full"  - resample z, omega, (R, r), (A, Q), pi_0  (default)
        "dyn"   - resample only (A, Q) given current z (mirrors official
                  `resample_dynamics_distns` warmup loop in nascar.py)
        "trans" - resample only omega and (R, r) given current z (mirrors
                  `resample_trans_distn` warmup loop)

    Returns (joint log-likelihood proxy, new log_init).
    """
    cfg = model.cfg
    p = model.params
    K, M = p.K, p.M
    P = cfg.ar_lag

    if log_init is None:
        log_init = np.full(K, -np.log(K))

    # --- (1) sample z_{1:T} for each trajectory via FFBS ---
    total_loglik = 0.0
    cached_logtrans = []                            # used for omega step
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
            z_hmm = ffbs_single(log_init, log_trans, log_obs, rng)         # (T-P+1,)
            z_full = np.empty(tr.x.shape[0], dtype=np.int64)
            z_full[: P - 1] = z_hmm[0]
            z_full[P - 1 :] = z_hmm
            z_state[i] = z_full
            total_loglik += float(logsumexp(log_obs.sum(0)))               # rough proxy
        cached_logtrans.append(log_trans); cached_x_for_rec.append(x_rec)

    # --- (2) Polya-Gamma augmentation + (3) (R, r) sample (skipped in phase="dyn") ---
    if phase in ("full", "trans"):
        _resample_transitions(p, cfg, trajs, z_state, cached_x_for_rec,
                              mniw_rec, rng)

    # --- (4) sample (A_k, Q_k) | z, x (skipped in phase="trans") ---
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

    # --- (5) re-estimate initial-state distribution (full phase only) ---
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
    # Concatenate (x_t, z_t, z_{t+1}) across all trajectories.
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

    nu = p.recurrence_logits(Xrec_all, Zprev_all)                          # (N, K-1)
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
                # Stickiness: prior pulls self-stick bias toward +kappa
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
        # shared R; for "ro" the bias is also shared.
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
                # Per-state biases r[kprev, j] via weighted MLE residual + stickiness pull.
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
def initialize(model: RecurrentARHMM, trajs: Sequence[Trajectory],
               rng: np.random.Generator) -> List[np.ndarray]:
    """Returns initial z_{1:T} for every trajectory.  Also fills model.params."""
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

    # --- (b) AR-HMM EM: fit AR params per cluster, then iterate hard-EM ---
    for _ in range(cfg.init_arhmm_em_iter):
        # M-step: AR params
        for k in range(K):
            idx = (z_flat == k)
            if idx.sum() < M + 2:
                continue
            Xk, Yk = X_in[idx], X_out[idx]
            # ridge regression
            Reg = 1e-4 * np.eye(Xk.shape[1])
            B = np.linalg.solve(Xk.T @ Xk + Reg, Xk.T @ Yk).T               # (M, D_in_ar)
            p.A[k] = B
            resid = Yk - Xk @ B.T
            p.Q[k] = resid.T @ resid / max(idx.sum() - 1, 1) + 1e-4 * np.eye(M)
        # E-step (hard): re-assign z_t to argmax_k log N(x_t | A_k X_in_t, Q_k)
        log_ar = p.log_ar_likelihood(X_in, X_out)                           # (N, K)
        z_flat = log_ar.argmax(axis=1)

    # --- (c) decision-list initialization for the recurrence (paper §4.4) ---
    if cfg.init_decision_list and K > 1:
        # Greedy: for each stick j = 0..K-2, find the binary split
        # (state j vs states > j) that's most separable in x_t, fit logistic regression.
        # We use x_{t} -> "is z_{t+1} == permuted_state[j]" classifier.
        order = list(range(K))
        # build dataset of x_{t} -> z_{t+1}
        Xrec, Znext = [], []
        for i, tr in enumerate(trajs):
            T = tr.x.shape[0]
            if T <= P:
                continue
            zi = z_flat[traj_idx == i]                          # (T-P,)
            Xrec.append(tr.x[P - 1 : T - 1])
            Znext.append(zi)                                    # zi[s] is z at data-time s+P
        Xrec = np.concatenate(Xrec, 0)
        Znext = np.concatenate(Znext, 0)
        # greedy permutation
        remaining = set(order)
        perm = []
        for j in range(K - 1):
            best_acc, best_k = -np.inf, None
            best_coef, best_intc = None, None
            for k in remaining:
                if len(remaining) == 1:
                    best_k = k; break
                y = (Znext == k).astype(int)
                mask = np.isin(Znext, list(remaining))
                if y[mask].sum() < 2 or (1 - y[mask]).sum() < 2:
                    continue
                try:
                    lr = LogisticRegression(max_iter=200).fit(Xrec[mask], y[mask])
                    acc = lr.score(Xrec[mask], y[mask])
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
        # apply permutation to z_flat and to A, Q
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
