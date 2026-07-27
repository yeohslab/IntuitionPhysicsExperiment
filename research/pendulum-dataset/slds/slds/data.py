"""Data loader for the pendulum dataset — SLDS variant.

Extends the rAR-HMM data loader with an observation field y_t = theta_t.
The full state x_t = (theta, omega/omega0) is still loaded from the data files
for evaluation purposes, but the model only sees y_t = theta_t during training.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Iterable, Sequence
import json
import numpy as np

from .config import Config


@dataclass
class Trajectory:
    """One trajectory with both full state x and partial observation y."""
    id: str
    regime: str            # "libration_small" | "libration_large" | "rotation"
    E_bar: float
    theta: np.ndarray      # raw (wrapped) theta, shape (T,)
    omega: np.ndarray      # raw omega, shape (T,)
    x: np.ndarray          # model latent state, shape (T, M) — updated by Kalman smoother
    y: np.ndarray          # observation y_t = theta_t, shape (T,) — fixed, never modified
    x_true: np.ndarray     # ground-truth full state (for evaluation), shape (T, M)
    split: str = "train"


def _wrap_to_pi(theta: np.ndarray) -> np.ndarray:
    """Wrap angle to [-π, π]."""
    return (theta + np.pi) % (2 * np.pi) - np.pi


def _to_x(theta: np.ndarray, omega: np.ndarray, cfg: Config) -> np.ndarray:
    """Convert (theta, omega) to model state x_t."""
    if cfg.obs_repr == "theta_omega":
        theta_w = _wrap_to_pi(theta)
        return np.stack([theta_w, omega / cfg.omega0], axis=-1).astype(np.float64)
    return np.stack([np.sin(theta), np.cos(theta), omega / cfg.omega0],
                    axis=-1).astype(np.float64)


def _init_x_from_y(y: np.ndarray, cfg: Config) -> np.ndarray:
    """Initialize x estimates from observed y = theta only.

    theta component = y (exact).
    omega component = finite-difference estimate of d(theta)/dt, normalised by omega0.
    """
    T = y.shape[0]
    M = cfg.obs_dim
    x = np.zeros((T, M), dtype=np.float64)
    x[:, 0] = y  # theta from observation

    if M >= 2:
        dt = cfg.dt
        omega0 = cfg.omega0
        # Central difference for interior points
        if T > 2:
            dtheta = _wrap_to_pi(y[2:] - y[:-2])
            x[1:-1, 1] = dtheta / (2 * dt) / omega0
        # Forward / backward difference at endpoints
        if T > 1:
            x[0, 1] = _wrap_to_pi(y[1] - y[0]) / dt / omega0
            x[-1, 1] = _wrap_to_pi(y[-1] - y[-2]) / dt / omega0

    return x


def load_one(path: Path, cfg: Config, split: str = "train") -> Trajectory:
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)
    theta = np.asarray(d["theta"], dtype=np.float64)
    omega = np.asarray(d["omega"], dtype=np.float64)
    x_true = _to_x(theta, omega, cfg)
    theta_store = _wrap_to_pi(theta) if cfg.obs_repr == "theta_omega" else theta
    # Observation = wrapped theta
    y = theta_store.copy()
    # Initial x estimate from y only (not using true omega)
    x_init = _init_x_from_y(y, cfg)
    return Trajectory(
        id=d.get("id", path.stem),
        regime=d.get("regime", "unknown"),
        E_bar=float(d.get("E_bar", np.nan)),
        theta=theta_store, omega=omega,
        x=x_init,
        y=y,
        x_true=x_true,
        split=split,
    )


def load_split(data_root: str | Path, split: str, cfg: Config,
               manifest_name: str = "manifest.json",
               max_trajs: int | None = None) -> List[Trajectory]:
    root = Path(data_root)
    npz = root / f"{split}.npz"
    if npz.exists():
        return _load_npz(npz, cfg, split, max_trajs)
    manifest = root / manifest_name
    if not manifest.exists():
        raise FileNotFoundError(f"No {split}.npz or manifest at {root}")
    with open(manifest, "r", encoding="utf-8") as f:
        mani = json.load(f)
    files = mani["splits"][split]
    if max_trajs is not None:
        files = files[:max_trajs]
    return [load_one(root / fp, cfg, split) for fp in files]


def _load_npz(npz_path: Path, cfg: Config, split: str,
              max_trajs: int | None) -> List[Trajectory]:
    z = np.load(npz_path, allow_pickle=True)
    thetas, omegas = z["theta"], z["omega"]
    ids = z["id"] if "id" in z.files else np.array([f"{split}_{i:06d}" for i in range(len(thetas))])
    regimes = z["regime"] if "regime" in z.files else np.array(["unknown"] * len(thetas))
    Ebars = z["E_bar"] if "E_bar" in z.files else np.full(len(thetas), np.nan)
    out: List[Trajectory] = []
    n = len(thetas) if max_trajs is None else min(max_trajs, len(thetas))
    for i in range(n):
        th, om = np.asarray(thetas[i]), np.asarray(omegas[i])
        x_true = _to_x(th, om, cfg)
        th_store = _wrap_to_pi(th) if cfg.obs_repr == "theta_omega" else th
        y = th_store.copy()
        x_init = _init_x_from_y(y, cfg)
        out.append(Trajectory(
            id=str(ids[i]), regime=str(regimes[i]), E_bar=float(Ebars[i]),
            theta=th_store, omega=om,
            x=x_init,
            y=y,
            x_true=x_true,
            split=split,
        ))
    return out


def stack_for_ar(trajs: Sequence[Trajectory], P: int = 1):
    """Build the AR design matrix across all trajectories.

    Returns
    -------
    X_in  : (N, M*P + 1)   regressor [x_{t-P}, ..., x_{t-1}, 1]
    X_out : (N, M)         target    x_t
    traj_idx : (N,)        which trajectory each row came from
    t_idx    : (N,)        local time index within the trajectory (starts at P)
    """
    Xin, Xout, tid, ttime = [], [], [], []
    for i, tr in enumerate(trajs):
        T, M = tr.x.shape
        if T <= P:
            continue
        lagged = np.concatenate(
            [tr.x[P - k - 1 : T - k - 1] for k in range(P)], axis=1
        )
        lagged = np.concatenate([lagged, np.ones((T - P, 1))], axis=1)
        Xin.append(lagged)
        Xout.append(tr.x[P:])
        tid.append(np.full(T - P, i, dtype=np.int64))
        ttime.append(np.arange(P, T, dtype=np.int64))
    return (np.concatenate(Xin, 0), np.concatenate(Xout, 0),
            np.concatenate(tid, 0), np.concatenate(ttime, 0))
