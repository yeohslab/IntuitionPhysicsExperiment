"""Posterior predictive rollout: given a prefix x_{1:T0}, predict x_{T0+1:T0+H}."""
from __future__ import annotations

from typing import List, Sequence
import numpy as np

from .config import Config
from .model import RecurrentARHMM, ModelParams
from .stick_breaking import stick_breaking_log_probs
from .inference import _per_traj_logobs_logtrans, ffbs_single
from .data import Trajectory


def _ffbs_last_state(prefix: Trajectory, params: ModelParams, cfg: Config,
                     rng: np.random.Generator,
                     log_init: np.ndarray | None = None) -> int:
    """Sample z_{T0} given the observed prefix x_{1:T0}."""
    K = params.K
    if log_init is None:
        log_init = np.full(K, -np.log(K))
    bundle = _per_traj_logobs_logtrans(prefix, params, cfg)
    if bundle is None:
        return int(rng.choice(K))
    log_obs, log_trans, _ = bundle
    z = ffbs_single(log_init, log_trans, log_obs, rng)
    return int(z[-1])


def rollout(cfg: Config, params: ModelParams, prefix_x: np.ndarray, horizon: int,
            rng: np.random.Generator,
            log_init: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Rollout starting from a prefix of length T0 >= P.

    prefix_x : (T0, M)
    Returns predicted x_pred (horizon, M) and discrete z_pred (horizon,) — both
    *future* values (do not include the prefix).
    """
    P, M = cfg.ar_lag, cfg.obs_dim
    T0 = prefix_x.shape[0]
    assert T0 >= P, f"need at least P={P} steps of prefix"
    # last state via FFBS on prefix
    tr_prefix = Trajectory(id="prefix", regime="", E_bar=np.nan,
                           theta=np.zeros(T0), omega=np.zeros(T0),
                           x=prefix_x)
    z_prev = _ffbs_last_state(tr_prefix, params, cfg, rng, log_init)

    x_hist = list(prefix_x[-P:])
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
                      prefix_x: np.ndarray, horizon: int, n_draws: int,
                      rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Average over posterior parameter samples by drawing one parameter per rollout.

    Returns x_pred (n_draws, horizon, M), z_pred (n_draws, horizon)."""
    M = cfg.obs_dim
    X = np.empty((n_draws, horizon, M))
    Z = np.empty((n_draws, horizon), dtype=np.int64)
    if len(samples) == 0:
        raise ValueError("no posterior samples")
    for d in range(n_draws):
        p = samples[rng.integers(0, len(samples))]
        Xd, Zd = rollout(cfg, p, prefix_x, horizon, rng)
        X[d] = Xd; Z[d] = Zd
    return X, Z
