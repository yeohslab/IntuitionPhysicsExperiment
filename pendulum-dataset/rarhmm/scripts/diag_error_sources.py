"""Diagnostic: separate state-switch seam error from nonlinearity error.

Usage:
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" -u -m scripts.diag_error_sources `
        --run runs/K5_theta_norot_vi --data-root ..\data\pendulum
"""
from __future__ import annotations
import argparse, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarhmm.train import load_checkpoint
from rarhmm.data import load_split
from rarhmm.stick_breaking import stick_breaking_probs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--data-root", required=True)
    args = ap.parse_args()

    ckpt = load_checkpoint(Path(args.run) / "chain.pkl")
    cfg = ckpt["cfg"]; p = ckpt["samples"][0]
    K, M = cfg.K, cfg.obs_dim
    R_w, r_b = p.R[0], p.r[0]

    trajs = load_split(args.data_root, "test_in_dist", cfg)
    trajs += load_split(args.data_root, "test_energy_oos", cfg)
    trajs = [t for t in trajs if t.regime != "rotation"]
    print(f"Total trajectories: {len(trajs)}")

    # --- Collect per-point diagnostics ---
    theta_list, omega_list = [], []
    err_R_list, err_oracle_list = [], []
    state_R_list, state_oracle_list = [], []
    is_switch_list, entropy_list = [], []

    for tr in trajs:
        T = tr.x.shape[0]
        if T < 2:
            continue

        # R's state assignment for each point
        nu = tr.x @ R_w.T + r_b
        pi = stick_breaking_probs(nu)
        z_R = pi.argmax(axis=1)
        entropy = -np.sum(pi * np.log(pi + 1e-12), axis=1)

        for t in range(T - 1):
            theta, omega = tr.x[t]
            x_aug = np.array([theta, omega, 1.0])
            x_true = tr.x[t + 1]

            # Error using R's chosen state
            k_R = z_R[t]
            pred_R = p.A[k_R] @ x_aug
            err_R = abs(pred_R[0] - x_true[0])

            # Error using EACH state → oracle = best possible
            errs_k = [abs((p.A[k] @ x_aug)[0] - x_true[0]) for k in range(K)]
            err_oracle = min(errs_k)
            k_oracle = int(np.argmin(errs_k))

            is_switch = 1 if (t > 0 and z_R[t] != z_R[t - 1]) else 0

            theta_list.append(theta)
            omega_list.append(omega)
            err_R_list.append(err_R)
            err_oracle_list.append(err_oracle)
            state_R_list.append(k_R)
            state_oracle_list.append(k_oracle)
            is_switch_list.append(is_switch)
            entropy_list.append(entropy[t])

    theta_all = np.array(theta_list)
    omega_all = np.array(omega_list)
    err_R = np.array(err_R_list)
    err_oracle = np.array(err_oracle_list)
    state_R = np.array(state_R_list)
    state_oracle = np.array(state_oracle_list)
    is_switch = np.array(is_switch_list)
    entropy_all = np.array(entropy_list)
    abs_theta = np.abs(theta_all)

    N = len(theta_all)
    print(f"Total evaluation points: {N}")

    # ===== TEST 1: State Switch Seam Error =====
    print("\n" + "=" * 60)
    print("TEST 1: State Switch Seam Error")
    print("=" * 60)
    sw = is_switch == 1
    st = is_switch == 0
    print(f"  Switch points: {sw.sum():6d} ({100 * sw.mean():.1f}%)")
    print(f"  Stable points: {st.sum():6d} ({100 * st.mean():.1f}%)")
    print(f"  Error at SWITCH:  mean={err_R[sw].mean():.6f}  "
          f"median={np.median(err_R[sw]):.6f}  p95={np.percentile(err_R[sw], 95):.6f}")
    print(f"  Error at STABLE:  mean={err_R[st].mean():.6f}  "
          f"median={np.median(err_R[st]):.6f}  p95={np.percentile(err_R[st], 95):.6f}")
    print(f"  Ratio (switch / stable): {err_R[sw].mean() / err_R[st].mean():.2f}x")

    # Break down by theta bin
    print("\n  Per |theta| bin:")
    bins = [0, 0.5, 1.0, 1.5, 2.0, 3.14]
    for i in range(len(bins) - 1):
        m = (abs_theta >= bins[i]) & (abs_theta < bins[i + 1])
        m_sw = m & sw
        m_st = m & st
        if m_sw.sum() > 5 and m_st.sum() > 5:
            ratio = err_R[m_sw].mean() / err_R[m_st].mean()
            print(f"    |θ|∈[{bins[i]:.1f},{bins[i+1]:.1f}): "
                  f"switch err={err_R[m_sw].mean():.6f} (n={m_sw.sum()})  "
                  f"stable err={err_R[m_st].mean():.6f} (n={m_st.sum()})  "
                  f"ratio={ratio:.2f}x")

    # ===== TEST 2: Oracle vs R (State Selection Error) =====
    print("\n" + "=" * 60)
    print("TEST 2: Oracle vs R — Is R picking the wrong state?")
    print("=" * 60)
    gap = err_R - err_oracle
    mismatch = state_R != state_oracle
    print(f"  R-chosen error (mean):      {err_R.mean():.6f}")
    print(f"  Oracle error (mean):        {err_oracle.mean():.6f}")
    print(f"  Selection gap (mean):       {gap.mean():.6f}")
    print(f"  R disagrees with oracle:    {mismatch.sum()} / {N} ({100 * mismatch.mean():.1f}%)")
    if mismatch.sum() > 0:
        print(f"  When R ≠ oracle: R err =    {err_R[mismatch].mean():.6f}")
        print(f"  When R ≠ oracle: oracle =   {err_oracle[mismatch].mean():.6f}")

    print("\n  Per |theta| bin:")
    for i in range(len(bins) - 1):
        m = (abs_theta >= bins[i]) & (abs_theta < bins[i + 1])
        if m.sum() > 0:
            print(f"    |θ|∈[{bins[i]:.1f},{bins[i+1]:.1f}): "
                  f"err_R={err_R[m].mean():.6f}  "
                  f"err_oracle={err_oracle[m].mean():.6f}  "
                  f"gap={gap[m].mean():.6f}  "
                  f"mismatch={100 * mismatch[m].mean():.1f}%")

    # ===== TEST 3: Nonlinearity floor =====
    print("\n" + "=" * 60)
    print("TEST 3: Nonlinearity Floor — Best possible LINEAR fit to true physics")
    print("=" * 60)
    g, L, dt = 9.8, 1.0, 0.05
    omega0 = np.sqrt(g / L)
    for theta_lo, theta_hi in [(0, 0.5), (0.5, 1.0), (1.0, 1.5), (1.5, 2.0), (2.0, 3.14)]:
        thetas_s = np.linspace(theta_lo, theta_hi, 200)
        omegas_s = np.linspace(-2, 2, 200)
        TH, OM = np.meshgrid(thetas_s, omegas_s)
        th, om = TH.ravel(), OM.ravel()
        # True nonlinear next step
        th_next = th + om * omega0 * dt
        om_next = om - omega0 * np.sin(th) * dt
        # Best linear fit
        X_aug = np.column_stack([th, om, np.ones_like(th)])
        A_th, _, _, _ = np.linalg.lstsq(X_aug, th_next, rcond=None)
        A_om, _, _, _ = np.linalg.lstsq(X_aug, om_next, rcond=None)
        resid_th = np.abs(X_aug @ A_th - th_next)
        resid_om = np.abs(X_aug @ A_om - om_next)
        print(f"  |θ|∈[{theta_lo:.1f},{theta_hi:.1f}): "
              f"best linear θ residual={resid_th.mean():.6f}  "
              f"ω residual={resid_om.mean():.6f}  "
              f"(max θ={resid_th.max():.6f})")

    # ===== TEST 4: omega=0 turning point effect =====
    print("\n" + "=" * 60)
    print("TEST 4: Turning Point Effect (near ω=0 vs away)")
    print("=" * 60)
    for theta_lo, theta_hi in [(0, 0.5), (0.5, 1.0), (1.0, 1.5), (1.5, 2.0), (2.0, 3.14)]:
        m_region = (abs_theta >= theta_lo) & (abs_theta < theta_hi)
        m_near = m_region & (np.abs(omega_all) < 0.3)
        m_far = m_region & (np.abs(omega_all) >= 0.3)
        if m_near.sum() > 10 and m_far.sum() > 10:
            print(f"  |θ|∈[{theta_lo:.1f},{theta_hi:.1f}): "
                  f"near ω=0: err={err_R[m_near].mean():.6f} (n={m_near.sum()})  "
                  f"far ω=0:  err={err_R[m_far].mean():.6f} (n={m_far.sum()})  "
                  f"ratio={err_R[m_near].mean() / err_R[m_far].mean():.2f}x")

    # ===== TEST 5: R entropy at transitions =====
    print("\n" + "=" * 60)
    print("TEST 5: R Confidence at State Transitions")
    print("=" * 60)
    print(f"  Entropy at SWITCH points: mean={entropy_all[sw].mean():.4f}  "
          f"median={np.median(entropy_all[sw]):.4f}")
    print(f"  Entropy at STABLE points: mean={entropy_all[st].mean():.4f}  "
          f"median={np.median(entropy_all[st]):.4f}")
    print(f"  Ratio: {entropy_all[sw].mean() / entropy_all[st].mean():.2f}x")


if __name__ == "__main__":
    main()
