"""Top-level training driver: init + Gibbs loop + checkpointing."""
from __future__ import annotations

from pathlib import Path
from typing import Sequence, List, Dict, Any
import json
import pickle
import time
import numpy as np

from .config import Config
from .data import Trajectory
from .model import RecurrentARHMM, ModelParams
from .inference import initialize, gibbs_step, empirical_dyn_prior
from .distributions import MNIW


def _build_priors(cfg: Config,
                  trajs: Sequence[Trajectory] | None = None) -> tuple[MNIW, MNIW]:
    M = cfg.obs_dim
    D_in_ar = M * cfg.ar_lag + 1
    D_in_rec = M + 1                              # regressor [x; 1]

    # Dynamics MNIW: optionally use data-driven M0, Psi0 (mirrors
    # pyslds.util.get_empirical_ar_params used in official nascar.py).
    if cfg.use_empirical_priors and trajs is not None:
        M0, Psi0 = empirical_dyn_prior(trajs, cfg)
        V0_inv = (1.0 / cfg.K_dyn_eye_scale) * np.eye(D_in_ar)
        mniw_dyn = MNIW(D_in=D_in_ar, D_out=M,
                        nu0=cfg.nu_dyn, Psi0=Psi0, M0=M0, V0_inv=V0_inv)
    else:
        mniw_dyn = MNIW.isotropic(D_in=D_in_ar, D_out=M,
                                  nu0=cfg.nu_dyn,
                                  psi_scale=cfg.psi_dyn_scale,
                                  M0_diag_value=cfg.spectral_radius_target,
                                  V0_eye_scale=cfg.K_dyn_eye_scale)

    mniw_rec = MNIW.isotropic(D_in=D_in_rec, D_out=1,
                              nu0=max(cfg.nu_rec, 3.0),
                              psi_scale=cfg.psi_rec_scale,
                              M0_diag_value=cfg.M_rec_bias_init,
                              V0_eye_scale=cfg.K_rec_eye_scale)
    return mniw_dyn, mniw_rec


def fit(cfg: Config, trajs: Sequence[Trajectory],
        verbose: bool = True) -> Dict[str, Any]:
    """Run the full sampler.  Returns a dict with checkpoint contents."""
    rng = np.random.default_rng(cfg.init_seed)
    model = RecurrentARHMM(cfg)
    if verbose:
        print(f"[init] {len(trajs)} trajectories, K={cfg.K}, mode={cfg.recurrence_mode}")
    z_state = initialize(model, trajs, rng)
    mniw_dyn, mniw_rec = _build_priors(cfg, trajs)

    samples: List[ModelParams] = []
    loglik_history: List[float] = []
    log_init = None
    t0 = time.time()

    # --- Two-stage warmup (mirrors nascar.py: 100 dyn + 100 trans before joint Gibbs) ---
    if cfg.n_warmup_dyn > 0:
        if verbose:
            print(f"[warmup] {cfg.n_warmup_dyn} rounds of dynamics-only resampling")
        for _ in range(cfg.n_warmup_dyn):
            _, log_init = gibbs_step(model, trajs, z_state, rng,
                                     mniw_dyn, mniw_rec, log_init, phase="dyn")
    if cfg.n_warmup_trans > 0:
        if verbose:
            print(f"[warmup] {cfg.n_warmup_trans} rounds of transitions-only resampling")
        for _ in range(cfg.n_warmup_trans):
            _, log_init = gibbs_step(model, trajs, z_state, rng,
                                     mniw_dyn, mniw_rec, log_init, phase="trans")

    # --- Main joint Gibbs loop ---
    for it in range(cfg.n_iter):
        ll, log_init = gibbs_step(model, trajs, z_state, rng,
                                  mniw_dyn, mniw_rec, log_init, phase="full")
        loglik_history.append(ll)
        keep = (it >= cfg.n_burnin) and ((it - cfg.n_burnin) % cfg.n_thin == 0)
        if keep:
            samples.append(_copy_params(model.params))
        if verbose and (it % cfg.log_every == 0 or it == cfg.n_iter - 1):
            print(f"[gibbs] iter {it:4d}/{cfg.n_iter}  ll≈{ll: .2f}  "
                  f"kept={len(samples)}  elapsed={time.time()-t0:.1f}s")

    ckpt = {
        "cfg": cfg,
        "samples": samples,
        "z_last": z_state,
        "log_init": log_init,
        "loglik_history": np.asarray(loglik_history),
    }
    out_dir = Path(cfg.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg.save(out_dir / "config.json")
    with open(out_dir / "chain.pkl", "wb") as f:
        pickle.dump(ckpt, f)
    np.save(out_dir / "loglik_history.npy", ckpt["loglik_history"])
    if verbose:
        print(f"[done] saved chain to {out_dir / 'chain.pkl'} "
              f"({len(samples)} posterior samples)")
    return ckpt


def _copy_params(p: ModelParams) -> ModelParams:
    return ModelParams(
        K=p.K, M=p.M, D_in_ar=p.D_in_ar, D_in_rec=p.D_in_rec,
        A=p.A.copy(), Q=p.Q.copy(), R=p.R.copy(), r=p.r.copy(), mode=p.mode,
    )


def load_checkpoint(path: str | Path) -> Dict[str, Any]:
    with open(path, "rb") as f:
        return pickle.load(f)
