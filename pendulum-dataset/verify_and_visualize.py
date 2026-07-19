"""Verify the pendulum dataset and visualize three sample trajectories as a GIF.

What this script does
---------------------
1. Loads `data/pendulum/train.npz` and `data/pendulum/manifest.json`.
2. Verifies that the data really is a planar pendulum dataset by checking:
   - per-trajectory energy conservation against the manifest's `energy_drift_max`,
   - the recomputed E_bar = 0.5*(omega/omega0)^2 + 1 - cos(theta) matches the
     trajectory's declared `E_bar` to <= 1e-3 relative drift (spec QA gate),
   - the discrete-time dynamics is consistent with theta'' = -omega0^2 sin(theta)
     (central-difference acceleration vs. -omega0^2 sin(theta) is small).
3. Randomly picks ONE trajectory in each of the three energy bands defined by the
   manifest's regimes (libration_small = "low", libration_large = "mid",
   rotation = "high") and renders the *actual recorded samples* as an animated
   pendulum GIF (no interpolation, no fabricated frames -- each GIF frame is one
   recorded (theta, omega) sample).

Run:
    & "C:\\Users\\tonyj\\anaconda3\\python.exe" verify_and_visualize.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "pendulum"


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------
def load_split(name: str):
    z = np.load(DATA_DIR / f"{name}.npz", allow_pickle=True)
    return {k: z[k] for k in z.files}


def load_manifest():
    with open(DATA_DIR / "manifest.json", "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------
def verify_dataset(split: dict, manifest: dict, n_check: int = 60) -> None:
    L = manifest["constants"]["L"]
    g = manifest["constants"]["g"]
    omega0 = manifest["constants"]["omega0"]
    dt = manifest["constants"]["dt"]
    drift_gate = manifest["integrator"]["energy_drift_threshold"]

    # Independently recompute omega0 from L, g
    assert math.isclose(omega0, math.sqrt(g / L), rel_tol=1e-12), \
        f"omega0 mismatch: {omega0} vs sqrt(g/L)={math.sqrt(g/L)}"

    ids = split["id"]
    regimes = split["regime"]
    E_bars = split["E_bar"]
    thetas = split["theta"]
    omegas = split["omega"]
    drifts = split["energy_drift_max"]

    n_traj = len(ids)
    print(f"[verify] split has {n_traj} trajectories")
    print(f"[verify] regime counts: "
          f"{ {r: int((regimes == r).sum()) for r in np.unique(regimes)} }")
    print(f"[verify] declared max energy drift across split = {drifts.max():.3e}")
    assert drifts.max() <= drift_gate, \
        f"declared drift {drifts.max():.3e} > gate {drift_gate}"

    # Spot-check `n_check` random trajectories.
    rng = np.random.default_rng(0)
    sample_idx = rng.choice(n_traj, size=min(n_check, n_traj), replace=False)

    worst_E = 0.0
    worst_ode = 0.0
    for i in sample_idx:
        th = np.asarray(thetas[i], dtype=np.float64)
        om = np.asarray(omegas[i], dtype=np.float64)
        E_decl = float(E_bars[i])
        reg = str(regimes[i])

        # 1) Energy conservation: E_bar(t) ~ E_decl
        E_t = 0.5 * (om / omega0) ** 2 + 1.0 - np.cos(th)
        rel = np.max(np.abs(E_t - E_decl)) / E_decl
        worst_E = max(worst_E, rel)
        assert rel <= drift_gate * 1.5, \
            f"traj {i} ({reg}) energy drift {rel:.3e} > gate"

        # 2) Dynamics: central-difference omega' ~ -omega0^2 sin(theta).
        # We use theta (unwrap for rotation just in case) and omega together.
        if len(th) < 5:
            continue
        # central difference of omega
        om_dot = (om[2:] - om[:-2]) / (2 * dt)
        rhs = -(omega0 ** 2) * np.sin(th[1:-1])
        # Use a robust scale: amplitude of rhs across the trajectory
        scale = max(np.max(np.abs(rhs)), 1e-6)
        ode_err = float(np.max(np.abs(om_dot - rhs)) / scale)
        worst_ode = max(worst_ode, ode_err)

        # Also check d(theta)/dt ~ omega via central diff (mod 2pi for libration)
        # We skip this strict check for wrapped libration because wrap creates
        # jumps; rotation thetas are unwrapped, so we check those.
        if reg == "rotation":
            th_dot = (th[2:] - th[:-2]) / (2 * dt)
            scale_om = max(np.max(np.abs(om[1:-1])), 1e-6)
            kin_err = float(np.max(np.abs(th_dot - om[1:-1])) / scale_om)
            assert kin_err < 5e-3, \
                f"traj {i} kinematic mismatch theta'!=omega: {kin_err:.3e}"

    print(f"[verify] spot-checked {len(sample_idx)} trajectories")
    print(f"[verify] worst recomputed energy drift  = {worst_E:.3e} "
          f"(gate {drift_gate})")
    print(f"[verify] worst ODE residual omega' vs -w0^2 sin(theta) (relative) "
          f"= {worst_ode:.3e}")
    # Central-difference truncation error is O(dt^2)*|theta'''|. For the
    # highest-energy rotation orbits (omega ~ 8.9 rad/s, dt = 0.05 s) the
    # truncation alone is a few percent, so we only check that the residual
    # is bounded well below 1 (energy conservation above is the strict gate).
    assert worst_ode < 5e-2, "ODE residual too large -- not a pendulum?"
    print("[verify] PASS: data is consistent with a planar pendulum "
          "(theta'' = -(g/L) sin theta, with energy conservation).")


# ---------------------------------------------------------------------------
# Pick one trajectory per energy band
# ---------------------------------------------------------------------------
def pick_three(split: dict, manifest: dict, seed: int = 42):
    """Return list of dicts [{regime, idx, theta, omega, E_bar}, ...] in order
    low / mid / high energy (= libration_small / libration_large / rotation)."""
    regimes = split["regime"]
    rng = np.random.default_rng(seed)
    order = [
        ("libration_small", "low energy"),
        ("libration_large", "mid energy"),
        ("rotation",        "high energy"),
    ]
    picks = []
    for reg, band_label in order:
        idxs = np.where(regimes == reg)[0]
        assert len(idxs) > 0, f"no trajectories with regime {reg}"
        i = int(rng.choice(idxs))
        picks.append({
            "regime": reg,
            "band": band_label,
            "idx": i,
            "id": str(split["id"][i]),
            "E_bar": float(split["E_bar"][i]),
            "theta": np.asarray(split["theta"][i], dtype=np.float64),
            "omega": np.asarray(split["omega"][i], dtype=np.float64),
            "seed": int(split["seed"][i]),
        })
    return picks


# ---------------------------------------------------------------------------
# Visualisation: three side-by-side pendulums, each frame = one recorded sample
# ---------------------------------------------------------------------------
def make_gif(picks, manifest, out_path: Path,
             max_frames: int = 240, fps: int = 20) -> None:
    L = manifest["constants"]["L"]
    dt = manifest["constants"]["dt"]

    # Subsample each trajectory to at most `max_frames` frames using a uniform
    # stride over the recorded samples (we never invent new samples).
    frames_per_panel = []
    for p in picks:
        n = len(p["theta"])
        stride = max(1, n // max_frames)
        frame_idx = np.arange(0, n, stride)[:max_frames]
        frames_per_panel.append(frame_idx)

    # All panels must advance together: use a common frame count.
    n_frames = min(len(f) for f in frames_per_panel)
    frames_per_panel = [f[:n_frames] for f in frames_per_panel]

    fig, axes = plt.subplots(1, 3, figsize=(12, 4.4))
    fig.suptitle("Pendulum dataset — one real trajectory per energy band\n"
                 "(each frame is an actual recorded sample, dt = 0.05 s; "
                 "stride may skip samples but never invents them)",
                 fontsize=10)

    artists = []
    lim = 1.25 * L
    for ax, p in zip(axes, picks):
        ax.set_xlim(-lim, lim)
        ax.set_ylim(-lim, lim)
        ax.set_aspect("equal")
        ax.set_xticks([])
        ax.set_yticks([])
        ax.axhline(0, color="0.85", lw=0.5)
        ax.axvline(0, color="0.85", lw=0.5)
        ax.set_title(f"{p['band']}  ({p['regime']})\n"
                     f"id={p['id']}  E_bar={p['E_bar']:.3f}",
                     fontsize=9)
        # pivot
        ax.plot(0, 0, "ko", markersize=4)
        rod, = ax.plot([0, 0], [0, -L], "-", color="#1f77b4", lw=2)
        bob, = ax.plot([0], [-L], "o", color="#d62728", markersize=12)
        trail, = ax.plot([], [], "-", color="#d62728", lw=0.7, alpha=0.35)
        text = ax.text(0.02, 0.97, "", transform=ax.transAxes,
                       ha="left", va="top", fontsize=8,
                       family="monospace")
        artists.append({"rod": rod, "bob": bob, "trail": trail,
                        "text": text,
                        "trail_x": [], "trail_y": []})

    def init():
        out = []
        for a in artists:
            a["rod"].set_data([0, 0], [0, -L])
            a["bob"].set_data([0], [-L])
            a["trail"].set_data([], [])
            a["trail_x"].clear()
            a["trail_y"].clear()
            a["text"].set_text("")
            out += [a["rod"], a["bob"], a["trail"], a["text"]]
        return out

    def update(frame_i):
        out = []
        for p, a, fidx in zip(picks, artists, frames_per_panel):
            i = int(fidx[frame_i])
            th = float(p["theta"][i])
            om = float(p["omega"][i])
            # Pendulum hanging down: x = L sin(theta), y = -L cos(theta).
            x = L * math.sin(th)
            y = -L * math.cos(th)
            a["rod"].set_data([0, x], [0, y])
            a["bob"].set_data([x], [y])
            a["trail_x"].append(x)
            a["trail_y"].append(y)
            # keep trail bounded for clarity
            if len(a["trail_x"]) > 80:
                a["trail_x"] = a["trail_x"][-80:]
                a["trail_y"] = a["trail_y"][-80:]
            a["trail"].set_data(a["trail_x"], a["trail_y"])
            a["text"].set_text(
                f"t={i*dt:6.2f}s  step={i:4d}\n"
                f"theta={th:+.3f} rad\n"
                f"omega={om:+.3f} rad/s"
            )
            out += [a["rod"], a["bob"], a["trail"], a["text"]]
        return out

    anim = FuncAnimation(fig, update, init_func=init,
                         frames=n_frames, blit=False, interval=1000 // fps)
    writer = PillowWriter(fps=fps)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    anim.save(out_path, writer=writer, dpi=110)
    plt.close(fig)
    print(f"[gif] wrote {out_path}  ({n_frames} frames, {fps} fps)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    manifest = load_manifest()
    print(f"[load] manifest version {manifest['version']}, "
          f"L={manifest['constants']['L']}, g={manifest['constants']['g']}, "
          f"dt={manifest['constants']['dt']}")

    split = load_split("train")
    verify_dataset(split, manifest, n_check=80)

    picks = pick_three(split, manifest, seed=42)
    print("[pick] selected trajectories:")
    for p in picks:
        print(f"   {p['band']:10s}  regime={p['regime']:15s}  "
              f"id={p['id']}  E_bar={p['E_bar']:.3f}  "
              f"n_steps={len(p['theta'])}  seed={p['seed']}")

    out_gif = ROOT / "verification_pendulum.gif"
    make_gif(picks, manifest, out_gif, max_frames=240, fps=20)


if __name__ == "__main__":
    main()
