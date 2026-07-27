"""Posterior predictive rollout for rSLDS.

Given a prefix of observations y_{1:T0}, infer the latent x via Kalman smoother,
then roll out x_{T0+1:T0+H} in latent space and project to observations.
"""
from __future__ import annotations

from typing import List, Sequence
import numpy as np

from .config import Config
from .model import RecurrentSLDS, ModelParams
from .stick_breaking import stick_breaking_log_probs
from .inference import (
    _per_traj_logobs_logtrans, ffbs_single,
    kalman_smoother_mean, kalman_smoother_sample,
)
from .data import Trajectory


def _ffbs_last_state(prefix: Trajectory, params: ModelParams, cfg: Config,
                     rng: np.random.Generator,
                     log_init: np.ndarray | None = None) -> int:
    """Sample z_{T0} given the inferred x prefix."""
    K = params.K
    if log_init is None:
        log_init = np.full(K, -np.log(K))
    bundle = _per_traj_logobs_logtrans(prefix, params, cfg)
    if bundle is None:
        return int(rng.choice(K))
    log_obs, log_trans, _ = bundle
    z = ffbs_single(log_init, log_trans, log_obs, rng)
    return int(z[-1])


def rollout(cfg: Config, params: ModelParams, prefix_y: np.ndarray, horizon: int,
            rng: np.random.Generator,
            log_init: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Rollout starting from a prefix of *observations* y_{1:T0}.

    prefix_y : (T0,)  observed theta values
    Returns predicted x_pred (horizon, M) and discrete z_pred (horizon,).
    """
    P, M = cfg.ar_lag, cfg.obs_dim
    T0 = prefix_y.shape[0]
    assert T0 >= P, f"need at least P={P} steps of prefix"

    # (1) Infer x from y via Kalman smoother (using uniform z as initial guess)
    #     First get a z estimate, then refine x.
    z_init = np.zeros(T0, dtype=np.int64)

    # Build a dummy trajectory with initial x estimate from finite differences
    from .data import _init_x_from_y
    x_init = _init_x_from_y(prefix_y, cfg)
    tr_prefix = Trajectory(
        id="prefix", regime="", E_bar=np.nan,
        theta=prefix_y, omega=np.zeros(T0),
        x=x_init,
        y=prefix_y,
        x_true=x_init,
    )

    # Get z from FFBS
    z_prev = _ffbs_last_state(tr_prefix, params, cfg, rng, log_init)

    # Now do Kalman smoother with a better z (from FFBS)
    bundle = _per_traj_logobs_logtrans(tr_prefix, params, cfg)
    if bundle is not None:
        log_obs, log_trans, _ = bundle
        z_hmm = ffbs_single(
            log_init if log_init is not None else np.full(params.K, -np.log(params.K)),
            log_trans, log_obs, rng)
        z_full = np.empty(T0, dtype=np.int64)
        z_full[: P - 1] = z_hmm[0]
        z_full[P - 1 :] = z_hmm
        z_prev = int(z_full[-1])
    else:
        z_full = z_init

    # Kalman smoother to get x estimate from y
    x_smooth = kalman_smoother_mean(prefix_y, z_full, params, cfg)

    # (2) Rollout in latent x space
    x_hist = list(x_smooth[-P:])
    x_pred = np.empty((horizon, M))
    z_pred = np.empty(horizon, dtype=np.int64)
    for h in range(horizon):
        # transition
        x_now = x_hist[-1]
        nu = params.recurrence_logits(x_now[None, :], np.array([z_prev]))[0]
        log_pi = stick_breaking_log_probs(nu); log_pi -= log_pi.max()
        pi = np.exp(log_pi); pi /= pi.sum()
        z_new = int(rng.choice(params.K, p=pi))
        # dynamics
        lagged = np.concatenate(list(x_hist[-P:]) + [[1.0]])
        mu = params.A[z_new] @ lagged
        try:
            L = np.linalg.cholesky(params.Q[z_new])
        except np.linalg.LinAlgError:
            L = np.linalg.cholesky(params.Q[z_new] + 1e-6 * np.eye(M))
        x_new = mu + L @ rng.standard_normal(M)
        x_pred[h] = x_new
        z_pred[h] = z_new
        x_hist.append(x_new)
        z_prev = z_new
    return x_pred, z_pred


def rollout_posterior(cfg: Config, samples: Sequence[ModelParams],
                      prefix_y: np.ndarray, horizon: int, n_draws: int,
                      rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Average over posterior parameter samples.

    Returns x_pred (n_draws, horizon, M), z_pred (n_draws, horizon)."""
    M = cfg.obs_dim
    X = np.empty((n_draws, horizon, M))
    Z = np.empty((n_draws, horizon), dtype=np.int64)
    if len(samples) == 0:
        raise ValueError("no posterior samples")
    for d in range(n_draws):
        p = samples[rng.integers(0, len(samples))]
        Xd, Zd = rollout(cfg, p, prefix_y, horizon, rng)
        X[d] = Xd; Z[d] = Zd
    return X, Z
