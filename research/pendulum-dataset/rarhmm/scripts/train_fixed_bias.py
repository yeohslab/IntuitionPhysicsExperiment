"""Train K=5 with FIXED bias vectors and stratified sampling.

Fixed biases correspond to 5 physically meaningful points in (theta, omega) space:
  1. Equilibrium bottom  (theta=0,   omega=0)
  2. Right turning point (theta=+pi/4, omega=0)
  3. Left turning point  (theta=-pi/4, omega=0)
  4. Top right passage   (theta=+pi/2, omega=+omega_max)
  5. Top left passage    (theta=-pi/2, omega=-omega_max)

In sincos_omega model space: x = (sin(theta), cos(theta), omega/omega0)

The bias b_k is the last column of A[k] (shape M x (M+1)).
After each Gibbs step, we forcibly reset A[k][:, M] = b_k_fixed.

Stratified sampling: 20 libration_small + 40 libration_large + 40 rotation = 100 trajs.

Usage:
    python scripts/train_fixed_bias.py
"""
from __future__ import annotations
import sys, time, pickle
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.config import Config
from rarhmm.data import load_split
from rarhmm.model import RecurrentARHMM, ModelParams
from rarhmm.inference import initialize, gibbs_step, empirical_dyn_prior
from rarhmm.distributions import MNIW

DATA_ROOT = r"d:\intuitive physics\pendulum_dataset\data\pendulum"
OUT_DIR = "runs/K5_fixed_bias"


def stratified_sample(trajs, n_per_regime, rng):
    """Sample n_per_regime trajectories from each regime."""
    by_regime = {}
    for i, tr in enumerate(trajs):
        by_regime.setdefault(tr.regime, []).append(i)

    selected = []
    for regime, indices in sorted(by_regime.items()):
        n = min(n_per_regime.get(regime, 0), len(indices))
        chosen = rng.choice(indices, size=n, replace=False)
        selected.extend(chosen)
        print(f"  {regime}: sampled {n}/{len(indices)}")

    rng.shuffle(selected)
    return [trajs[i] for i in selected]


def make_fixed_biases(omega0):
    """5 physically meaningful bias vectors in sincos_omega space.

    These are small 'drift' vectors that push the dynamics toward
    different regions of phase space, derived from the physics:

    At each characteristic point, we compute the expected one-step
    displacement under the true pendulum dynamics (dt=0.05):
      d(sin theta) ~ cos(theta) * omega * dt
      d(cos theta) ~ -sin(theta) * omega * dt
      d(omega/omega0) ~ -(g/L)*sin(theta)*dt / omega0

    This gives physically grounded bias directions.
    """
    g, L, dt = 9.8, 1.0, 0.05
    M = 3  # sincos_omega

    biases = np.zeros((5, M))

    # State 1: Equilibrium (theta=0, omega=0) — nearly zero drift
    # sin(0)=0, cos(0)=1, omega=0 => all derivatives ≈ 0
    biases[0] = [0.0, 0.0, 0.0]

    # State 2: Right turning point (theta=+pi/4, omega=0)
    # d(sin) = cos(pi/4)*0*dt = 0
    # d(cos) = -sin(pi/4)*0*dt = 0
    # d(omega/omega0) = -(g/L)*sin(pi/4)*dt/omega0 = -0.1108
    theta2 = np.pi / 4
    biases[1] = [0.0, 0.0, -(g / L) * np.sin(theta2) * dt / omega0]

    # State 3: Left turning point (theta=-pi/4, omega=0)
    theta3 = -np.pi / 4
    biases[2] = [0.0, 0.0, -(g / L) * np.sin(theta3) * dt / omega0]

    # State 4: Bottom, max rightward velocity (theta=0, omega=+2)
    omega4 = 2.0
    theta4 = 0.0
    biases[3] = [
        np.cos(theta4) * omega4 * dt,       # d(sin theta)
        -np.sin(theta4) * omega4 * dt,      # d(cos theta)
        -(g / L) * np.sin(theta4) * dt / omega0   # d(omega/omega0)
    ]

    # State 5: Bottom, max leftward velocity (theta=0, omega=-2)
    omega5 = -2.0
    theta5 = 0.0
    biases[4] = [
        np.cos(theta5) * omega5 * dt,
        -np.sin(theta5) * omega5 * dt,
        -(g / L) * np.sin(theta5) * dt / omega0
    ]

    return biases


def _copy_params(p):
    return ModelParams(
        K=p.K, M=p.M, D_in_ar=p.D_in_ar, D_in_rec=p.D_in_rec,
        A=p.A.copy(), Q=p.Q.copy(), R=p.R.copy(), r=p.r.copy(), mode=p.mode,
    )


def main():
    rng = np.random.default_rng(20260525)

    # ---- Config ----
    cfg = Config(
        K=5,
        obs_repr="sincos_omega",
        ar_lag=1,
        recurrence_mode="ro",
        n_iter=100,
        n_burnin=40,
        n_thin=3,
        n_warmup_dyn=100,
        n_warmup_trans=100,
        init_seed=20260525,
        use_empirical_priors=True,
        log_every=10,
        out_dir=OUT_DIR,
    )
    omega0 = cfg.omega0
    M = cfg.obs_dim  # 3

    # ---- Fixed biases ----
    fixed_biases = make_fixed_biases(omega0)
    print("Fixed biases (sincos_omega):")
    labels = ["Equilibrium", "Right turn (pi/4)", "Left turn (-pi/4)",
              "Bottom rightward", "Bottom leftward"]
    for k in range(5):
        print(f"  State {k+1} ({labels[k]}): b = [{', '.join(f'{v:+.6f}' for v in fixed_biases[k])}]")

    # ---- Stratified data loading ----
    print("\nLoading training data...")
    all_trajs = load_split(DATA_ROOT, "train", cfg)
    print(f"  Total: {len(all_trajs)} trajectories")

    trajs = stratified_sample(all_trajs, {
        "libration_small": 20,
        "libration_large": 40,
        "rotation": 40,
    }, rng)
    print(f"  Selected: {len(trajs)} stratified trajectories")

    # ---- Build model and initialize ----
    model = RecurrentARHMM(cfg)
    z_state = initialize(model, trajs, rng)

    # Set initial biases to fixed values
    for k in range(5):
        model.params.A[k][:, M] = fixed_biases[k]

    # Build priors
    D_in_ar = M * cfg.ar_lag + 1
    D_in_rec = M + 1
    if cfg.use_empirical_priors:
        from rarhmm.inference import empirical_dyn_prior
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

    # ---- Gibbs sampling with fixed bias ----
    samples = []
    loglik_history = []
    log_init = None
    t0 = time.time()

    def _fix_biases():
        """Reset bias columns after each Gibbs step."""
        for k in range(5):
            model.params.A[k][:, M] = fixed_biases[k]

    # Warmup: dynamics only
    print(f"\n[warmup] {cfg.n_warmup_dyn} dynamics-only steps")
    for i in range(cfg.n_warmup_dyn):
        _, log_init = gibbs_step(model, trajs, z_state, rng,
                                 mniw_dyn, mniw_rec, log_init, phase="dyn")
        _fix_biases()

    # Warmup: transitions only
    print(f"[warmup] {cfg.n_warmup_trans} transitions-only steps")
    for i in range(cfg.n_warmup_trans):
        _, log_init = gibbs_step(model, trajs, z_state, rng,
                                 mniw_dyn, mniw_rec, log_init, phase="trans")
        # No need to fix biases here since dyn is not updated

    # Main Gibbs loop
    print(f"\n[gibbs] Starting {cfg.n_iter} joint iterations")
    for it in range(cfg.n_iter):
        ll, log_init = gibbs_step(model, trajs, z_state, rng,
                                  mniw_dyn, mniw_rec, log_init, phase="full")
        _fix_biases()  # <--- CRITICAL: reset biases after every step
        loglik_history.append(ll)

        keep = (it >= cfg.n_burnin) and ((it - cfg.n_burnin) % cfg.n_thin == 0)
        if keep:
            samples.append(_copy_params(model.params))

        if it % cfg.log_every == 0 or it == cfg.n_iter - 1:
            print(f"[gibbs] iter {it:4d}/{cfg.n_iter}  ll={ll: .2f}  "
                  f"kept={len(samples)}  elapsed={time.time()-t0:.1f}s")

    # ---- Save ----
    ckpt = {
        "cfg": cfg,
        "samples": samples,
        "z_last": z_state,
        "log_init": log_init,
        "loglik_history": np.asarray(loglik_history),
        "fixed_biases": fixed_biases,
    }
    out_dir = Path(OUT_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg.save(out_dir / "config.json")
    with open(out_dir / "chain.pkl", "wb") as f:
        pickle.dump(ckpt, f)
    np.save(out_dir / "loglik_history.npy", ckpt["loglik_history"])
    print(f"\n[done] saved {len(samples)} posterior samples to {out_dir / 'chain.pkl'}")

    # Verify biases are fixed
    print("\nFinal bias verification:")
    A_last = model.params.A
    for k in range(5):
        b_actual = A_last[k][:, M]
        b_target = fixed_biases[k]
        diff = np.linalg.norm(b_actual - b_target)
        print(f"  State {k+1}: b_actual={b_actual}, diff_from_target={diff:.2e}")


if __name__ == "__main__":
    main()
