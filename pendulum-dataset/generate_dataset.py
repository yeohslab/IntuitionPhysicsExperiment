"""Generate the planar-pendulum rAR-HMM training dataset.

Implements docs/pendulum-dataset-spec.md (v2.0) verbatim:
- 80 energy bins of width 0.05 (E_k = 0.05*k, k = 1..80)
- Separatrix bins {39, 40, 41} excluded
- Hold-out bins {2, 29, 53}, one per evaluation regime
- Per-bin counts: 40 train / 5 val / 5 test_in_dist / 100 test_energy_oos
- velocity Verlet (symplectic) at dt = 0.05 s
- burn-in by phi ~ U[0, T(E_k)) erases the formula-start bias
- QA gate: relative energy drift must be <= 1e-3

Output layout under <out>/pendulum/ :
    manifest.json                       <- spec §7.3 (always written)
    train.npz                           <- object arrays {id, regime, E_bar, theta, omega}
    val.npz
    test_in_dist.npz
    test_energy_oos.npz
    [json/<split>/traj_XXXXXX.json]     <- only when --json is passed

The NPZ layout matches `rarhmm.data._load_npz` in the existing model
(InstitutionPhysics-main/rarhmm/rarhmm/data.py): each array is an object
array indexed by trajectory, exactly what `load_split(...)` expects.

Usage (PowerShell):
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" generate_dataset.py --out data
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" generate_dataset.py --out data --json
"""
from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path
from typing import Dict, Iterator, List, Tuple

import numpy as np
from scipy.special import ellipk

# -----------------------------------------------------------------------------#
# Physics & integration constants (mirror docs/pendulum-dataset-spec.md §1)    #
# -----------------------------------------------------------------------------#
G: float = 9.8
L: float = 1.0
W0: float = math.sqrt(G / L)          # natural angular frequency ~ 3.1305 rad/s
W0_SQ: float = G / L
DT: float = 0.05                      # sample/integration step (s)

N_MIN: int = 400
N_MAX: int = 1200

# Internal integrator sub-stepping. Sampling stays at dt = 0.05 s, but the
# velocity-Verlet kernel runs at dt_int = DT / N_SUBSTEPS to bring the symplectic
# shadow-Hamiltonian oscillation (~ (omega * dt_int)^2 / 2) safely under the
# spec's 1e-3 relative-drift gate even at the highest energies (omega ~ 8.86
# rad/s at E_bar = 4.0).  With N_SUBSTEPS = 16 the worst-case relative drift
# is ~4e-4.
N_SUBSTEPS: int = 16

# -----------------------------------------------------------------------------#
# Bin grid                                                                     #
# -----------------------------------------------------------------------------#
BIN_WIDTH: float = 0.05
ALL_K: List[int] = list(range(1, 81))
SEPARATRIX_K = {39, 40, 41}
HOLDOUT_K_BY_REGIME: Dict[str, int] = {
    "libration_small": 2,    # E_bar = 0.10
    "libration_large": 29,   # E_bar = 1.45
    "rotation":        53,   # E_bar = 2.65
}
HOLDOUT_K = set(HOLDOUT_K_BY_REGIME.values())

PER_BIN: Dict[str, int] = {
    "train":           40,
    "val":              5,
    "test_in_dist":     5,
    "test_energy_oos": 100,
}

REGIME_LABELS = {
    "libration_small": {"k_range": [1, 4],   "E_bar_range": [0.05, 0.20]},
    "libration_large": {"k_range": [5, 38],  "E_bar_range": [0.25, 1.90]},
    "rotation":        {"k_range": [42, 80], "E_bar_range": [2.10, 4.00]},
}

# -----------------------------------------------------------------------------#
# Helpers                                                                      #
# -----------------------------------------------------------------------------#
def regime_of_k(k: int) -> str:
    if 1 <= k <= 4:    return "libration_small"
    if 5 <= k <= 38:   return "libration_large"
    if 42 <= k <= 80:  return "rotation"
    raise ValueError(f"bin k={k} is in the separatrix exclusion band")


def period(E: float) -> float:
    """Exact period T(E_bar) via the first kind complete elliptic integral.

    libration (E<2):  T = (4/w0) * K(m),   m = E/2
    rotation  (E>2):  T = (2/w0) * k * K(m),  m = 2/E,  k = sqrt(m)
    """
    if E < 2.0:
        m = E / 2.0
        return (4.0 / W0) * float(ellipk(m))
    if E > 2.0:
        m = 2.0 / E
        return (2.0 / W0) * math.sqrt(m) * float(ellipk(m))
    return math.inf


def n_steps_of(E: float) -> int:
    T = period(E)
    if not math.isfinite(T):
        return N_MAX
    return int(np.clip(round(6.0 * T / DT), N_MIN, N_MAX))


def energy_bar(theta: np.ndarray, omega: np.ndarray) -> np.ndarray:
    """E_bar = 0.5 * (omega/omega0)^2 + 1 - cos(theta)."""
    return 0.5 * (omega * omega) / W0_SQ + 1.0 - np.cos(theta)


def wrap_pi(theta: np.ndarray) -> np.ndarray:
    """Wrap theta to (-pi, pi]."""
    out = (theta + math.pi) % (2.0 * math.pi) - math.pi
    # ensure the upper boundary is +pi (np mod puts -pi)
    out[out == -math.pi] = math.pi
    return out


# -----------------------------------------------------------------------------#
# velocity Verlet integrators                                                  #
# -----------------------------------------------------------------------------#
def leapfrog_run(theta0: float, omega0: float, t_total: float, dt: float,
                 n_substeps: int = N_SUBSTEPS) -> Tuple[float, float]:
    """Integrate forward for `t_total` seconds and return the final state.

    velocity Verlet for theta'' = -w0^2 sin(theta), with `n_substeps`
    integrator sub-steps per sample step `dt`.
    """
    if t_total <= 0.0:
        return theta0, omega0
    n_outer = int(round(t_total / dt))
    dt_int = dt / n_substeps
    half_dt = 0.5 * dt_int
    th = float(theta0)
    om = float(omega0)
    acc = -W0_SQ * math.sin(th)
    for _ in range(n_outer * n_substeps):
        om_half = om + half_dt * acc
        th = th + dt_int * om_half
        acc = -W0_SQ * math.sin(th)
        om = om_half + half_dt * acc
    return th, om


def leapfrog_record(theta0: float, omega0: float, n_steps: int, dt: float,
                    n_substeps: int = N_SUBSTEPS
                    ) -> Tuple[np.ndarray, np.ndarray]:
    """Integrate `n_steps` sample steps (each of `n_substeps` sub-steps) and
    record the full state trajectory at the outer sampling cadence `dt`.

    Returns arrays of length `n_steps` (sample at t = 0, dt, 2dt, ...).
    """
    theta = np.empty(n_steps, dtype=np.float64)
    omega = np.empty(n_steps, dtype=np.float64)
    th = float(theta0)
    om = float(omega0)
    acc = -W0_SQ * math.sin(th)
    theta[0] = th
    omega[0] = om
    dt_int = dt / n_substeps
    half_dt = 0.5 * dt_int
    for i in range(1, n_steps):
        for _ in range(n_substeps):
            om_half = om + half_dt * acc
            th = th + dt_int * om_half
            acc = -W0_SQ * math.sin(th)
            om = om_half + half_dt * acc
        theta[i] = th
        omega[i] = om
    return theta, omega


# -----------------------------------------------------------------------------#
# Trajectory enumeration (matches spec §3 + §12)                               #
# -----------------------------------------------------------------------------#
def bins_for_split(split: str) -> List[int]:
    if split == "test_energy_oos":
        return sorted(HOLDOUT_K)
    return [k for k in ALL_K if k not in SEPARATRIX_K and k not in HOLDOUT_K]


def enumerate_trajectories(split: str, base_seed: int = 20260518
                           ) -> Iterator[dict]:
    """Deterministic iterator: yields exactly PER_BIN[split] * |bins| trajectories."""
    n_per = PER_BIN[split]
    for k in bins_for_split(split):
        E_k = round(BIN_WIDTH * k, 6)
        reg = regime_of_k(k)
        T_k = period(E_k)
        N_k = n_steps_of(E_k)

        # rotation: deterministic +/- alternation (no randomness in the sign bit)
        if reg == "rotation":
            signs = [(+1 if (i % 2 == 0) else -1) for i in range(n_per)]
        else:
            signs = [0] * n_per

        for i in range(n_per):
            seed = base_seed * 1_000_000 + k * 1_000 + i
            rng = np.random.default_rng(seed)
            sign = signs[i]

            # 1) formula start point on the energy contour
            if reg != "rotation":
                theta0, omega0 = math.acos(1.0 - E_k), 0.0
            else:
                theta0 = 0.0
                omega0 = sign * W0 * math.sqrt(2.0 * E_k)

            # 2) burn-in by phi ~ U[0, T_k) along the orbit
            phi = float(rng.uniform(0.0, T_k))
            theta0, omega0 = leapfrog_run(theta0, omega0, phi, DT)

            # 3) record N_k steps
            theta, omega = leapfrog_record(theta0, omega0, N_k, DT)

            # 4) QA gate: relative energy drift must be <= 1e-3
            E_t = energy_bar(theta, omega)
            drift = float(np.max(np.abs(E_t - E_k)) / E_k)
            if drift > 1e-3:
                raise RuntimeError(
                    f"energy drift {drift:.3e} > 1e-3 at split={split} k={k} i={i}"
                )

            # 5) theta representation: wrap for libration, unwrap (raw) for rotation
            theta_out = theta.copy() if reg == "rotation" else wrap_pi(theta)

            yield {
                "regime": reg,
                "E_bar": E_k,
                "L": L,
                "g": G,
                "dt": DT,
                "n_steps": int(N_k),
                "init_phase_sec": phi,
                "rot_sign": int(sign),
                "theta_repr": "unwrap" if reg == "rotation" else "wrap",
                "theta": theta_out,
                "omega": omega,
                "energy_drift_max": drift,
                "seed": int(seed),
            }


# -----------------------------------------------------------------------------#
# IO                                                                           #
# -----------------------------------------------------------------------------#
def write_split(out_root: Path, split: str, traj_iter: Iterator[dict],
                dump_json: bool, traj_id_offset: int = 0
                ) -> Tuple[List[str], int]:
    """Materialise one split into NPZ (always) + optional JSON-per-trajectory.

    Returns the list of relative JSON file names for the manifest, plus the
    total number of time-points written.
    """
    ids: List[str] = []
    regimes: List[str] = []
    E_bars: List[float] = []
    thetas: List[np.ndarray] = []
    omegas: List[np.ndarray] = []
    drifts: List[float] = []
    seeds: List[int] = []
    file_names: List[str] = []
    total_tp = 0

    json_dir = out_root / "json" / split
    if dump_json:
        json_dir.mkdir(parents=True, exist_ok=True)

    for local_idx, tr in enumerate(traj_iter):
        global_idx = traj_id_offset + local_idx
        tid = f"traj_{global_idx:06d}"
        ids.append(tid)
        regimes.append(tr["regime"])
        E_bars.append(tr["E_bar"])
        thetas.append(tr["theta"].astype(np.float32))
        omegas.append(tr["omega"].astype(np.float32))
        drifts.append(tr["energy_drift_max"])
        seeds.append(tr["seed"])
        total_tp += tr["n_steps"]

        rel_name = f"json/{split}/{tid}.json"
        file_names.append(rel_name)

        if dump_json:
            payload = {
                "id": tid,
                "regime": tr["regime"],
                "E_bar": tr["E_bar"],
                "L": tr["L"],
                "g": tr["g"],
                "dt": tr["dt"],
                "n_steps": tr["n_steps"],
                "init_phase_sec": tr["init_phase_sec"],
                "rot_sign": tr["rot_sign"],
                "theta_repr": tr["theta_repr"],
                "theta": tr["theta"].astype(np.float32).tolist(),
                "omega": tr["omega"].astype(np.float32).tolist(),
                "energy_drift_max": tr["energy_drift_max"],
                "seed": tr["seed"],
            }
            with open(out_root / rel_name, "w", encoding="utf-8") as f:
                json.dump(payload, f)

    # NPZ for fast loading (object arrays of variable-length sequences).
    # IMPORTANT: build the object arrays via explicit per-slot assignment so
    # equal-length splits (e.g. test_energy_oos: every trajectory is 400 steps)
    # do NOT get collapsed by NumPy into a 2-D float array.  `rarhmm.data._load_npz`
    # indexes them as `thetas[i]` expecting a 1-D float ndarray per trajectory.
    n = len(thetas)
    theta_obj = np.empty(n, dtype=object)
    omega_obj = np.empty(n, dtype=object)
    for i in range(n):
        theta_obj[i] = thetas[i]
        omega_obj[i] = omegas[i]

    npz_path = out_root / f"{split}.npz"
    np.savez(
        npz_path,
        id=np.array(ids, dtype=object),
        regime=np.array(regimes, dtype=object),
        E_bar=np.array(E_bars, dtype=np.float64),
        theta=theta_obj,
        omega=omega_obj,
        energy_drift_max=np.array(drifts, dtype=np.float64),
        seed=np.array(seeds, dtype=np.int64),
    )
    return file_names, total_tp


def write_manifest(out_root: Path,
                   split_files: Dict[str, List[str]],
                   split_counts: Dict[str, Tuple[int, int]]) -> None:
    manifest = {
        "version": "2.0",
        "constants": {"L": L, "g": G, "omega0": W0, "dt": DT},
        "energy_grid": {
            "bin_width": BIN_WIDTH,
            "n_bins": 80,
            "k_range": [1, 80],
            "E_bar_k_formula": "E_bar_k = 0.05 * k",
            "separatrix_excluded_k": sorted(SEPARATRIX_K),
            "holdout_k_by_regime": HOLDOUT_K_BY_REGIME,
        },
        "eval_regime_labels": REGIME_LABELS,
        "per_bin_counts": PER_BIN,
        "split_counts": {s: {"n_traj": nt, "n_time_points": ntp}
                         for s, (nt, ntp) in split_counts.items()},
        "integrator": {"name": "velocity_verlet", "dt": DT,
                       "n_substeps": N_SUBSTEPS,
                       "dt_internal": DT / N_SUBSTEPS,
                       "energy_drift_threshold": 1e-3},
        "n_steps_rule": "clip(round(6 * T(E_bar) / dt), 400, 1200)",
        "theta_representation": {
            "libration_small": "wrap_to_(-pi,pi]",
            "libration_large": "wrap_to_(-pi,pi]",
            "rotation":        "unwrapped (cumulative)",
        },
        "splits": split_files,
    }
    with open(out_root / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)


# -----------------------------------------------------------------------------#
# Entry point                                                                  #
# -----------------------------------------------------------------------------#
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=str, default="data",
                   help="Output root directory (a 'pendulum/' subfolder is created).")
    p.add_argument("--base-seed", type=int, default=20260518)
    p.add_argument("--json", action="store_true",
                   help="Also dump per-trajectory JSON files (4000 of them).")
    p.add_argument("--splits", type=str, default="all",
                   help="Comma-separated subset of "
                        "{train,val,test_in_dist,test_energy_oos} or 'all'.")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    out_root = Path(args.out).resolve() / "pendulum"
    out_root.mkdir(parents=True, exist_ok=True)

    if args.splits == "all":
        splits = ["train", "val", "test_in_dist", "test_energy_oos"]
    else:
        splits = [s.strip() for s in args.splits.split(",") if s.strip()]

    print(f"[out] {out_root}")
    print(f"[splits] {splits}  (json={'yes' if args.json else 'no'})")

    split_files: Dict[str, List[str]] = {}
    split_counts: Dict[str, Tuple[int, int]] = {}

    # global running counter for trajectory IDs
    id_offset = 0
    for split in splits:
        t0 = time.time()
        files, n_tp = write_split(
            out_root, split,
            enumerate_trajectories(split, base_seed=args.base_seed),
            dump_json=args.json,
            traj_id_offset=id_offset,
        )
        n_traj = len(files)
        id_offset += n_traj
        split_files[split] = files
        split_counts[split] = (n_traj, n_tp)
        dt_sec = time.time() - t0
        print(f"  [{split:<16}] {n_traj:>4} traj  {n_tp:>10,} steps  "
              f"({dt_sec:6.1f}s)  -> {split}.npz")

    write_manifest(out_root, split_files, split_counts)
    print(f"[done] manifest.json written.")
    total_traj = sum(c[0] for c in split_counts.values())
    total_tp = sum(c[1] for c in split_counts.values())
    print(f"[totals] {total_traj} trajectories, {total_tp:,} time points")


if __name__ == "__main__":
    main()
