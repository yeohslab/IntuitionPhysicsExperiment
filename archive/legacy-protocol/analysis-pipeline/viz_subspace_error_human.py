"""相空间 (θ, ω/ω₀) 上的人类被试绝对角误差可视化。"""

from __future__ import annotations

import warnings
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from preprocess import COL_ABS_ERROR, COL_E, DATA_DIR, OUTPUT_DIR, formal_block_trials, load_all_csv

ROD_LENGTH_M = 4.0
GRAVITY = 9.8
MASS_KG = 1.0


def derive_omega_norm(df: pd.DataFrame) -> np.ndarray:
    """由机械能与真值摆角反推 |ω|/ω₀（往复摆，ω₀ = √(g/l)）。"""
    omega0 = np.sqrt(GRAVITY / ROD_LENGTH_M)
    theta = df["theta_x_t_rad"].to_numpy()
    e_kin = df[COL_E].to_numpy() - MASS_KG * GRAVITY * ROD_LENGTH_M * (1 - np.cos(theta))
    negative = e_kin < 0
    if negative.any():
        warnings.warn(f"{negative.sum()} 试次动能项为负，已截断为 0", stacklevel=2)
        e_kin = np.maximum(e_kin, 0.0)
    omega = np.sqrt(2 * e_kin / (MASS_KG * ROD_LENGTH_M**2))
    return omega / omega0


def oscillation_formal_trials(df: pd.DataFrame) -> pd.DataFrame:
    mask = (
        (df["unit_type"] == "pendulumStimulus")
        & (df["segment_kind"] == "block")
        & (df["pendulum_regime"] == "oscillation")
    )
    return df.loc[mask].copy()


def prepare_points(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    theta_deg = df["theta_x_t_deg"].to_numpy()
    omega_norm = derive_omega_norm(df)
    abs_err = df[COL_ABS_ERROR].to_numpy()
    return theta_deg, omega_norm, abs_err


def plot_subspace_error_human(
    df: pd.DataFrame,
    out_path: Path,
    *,
    dpi: int = 150,
) -> dict[str, float]:
    theta_deg, omega_norm, abs_err = prepare_points(df)
    vmax = float(np.percentile(abs_err, 97))

    fig, ax = plt.subplots(figsize=(8, 6))
    sc = ax.scatter(
        theta_deg,
        omega_norm,
        c=abs_err,
        cmap="hot_r",
        vmin=0,
        vmax=vmax,
        s=22,
        alpha=0.75,
        edgecolors="none",
    )
    cbar = fig.colorbar(sc, ax=ax)
    cbar.set_label("|Δθ| (°)")

    e_levels = np.linspace(df[COL_E].min(), df[COL_E].max(), 8)
    theta_grid = np.linspace(-df["w_max_deg"].max(), df["w_max_deg"].max(), 200)
    for e in e_levels:
        w_max_rad = np.arccos(1 - e / (MASS_KG * GRAVITY * ROD_LENGTH_M))
        w_max_deg = np.degrees(w_max_rad)
        mask = np.abs(theta_grid) <= w_max_deg
        omega_curve = np.sqrt(np.maximum(2 * e / (MASS_KG * ROD_LENGTH_M**2) - 2 * GRAVITY / ROD_LENGTH_M * (1 - np.cos(np.radians(theta_grid[mask]))), 0))
        omega0 = np.sqrt(GRAVITY / ROD_LENGTH_M)
        ax.plot(theta_grid[mask], omega_curve / omega0, color="0.7", linewidth=0.6, alpha=0.5)

    ax.set_xlabel("真值摆角 θ (°)")
    ax.set_ylabel(r"$|\omega|/\omega_0$")
    ax.set_title("相空间上的绝对角误差（人类数据）")
    fig.tight_layout()
    fig.savefig(out_path, dpi=dpi)
    plt.close(fig)

    return {
        "n": float(len(df)),
        "mean": float(abs_err.mean()),
        "median": float(np.median(abs_err)),
        "p95": float(np.percentile(abs_err, 95)),
        "max": float(abs_err.max()),
    }


def run_viz(
    df: pd.DataFrame | None = None,
    *,
    data_dir: Path = DATA_DIR,
    out_path: Path = OUTPUT_DIR / "figures" / "viz_subspace_error_human.png",
    dpi: int = 150,
) -> dict[str, float]:
    plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False
    if df is None:
        df = load_all_csv(data_dir)
    formal = oscillation_formal_trials(df)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    return plot_subspace_error_human(formal, out_path, dpi=dpi)


if __name__ == "__main__":
    info = run_viz()
    print(info)
