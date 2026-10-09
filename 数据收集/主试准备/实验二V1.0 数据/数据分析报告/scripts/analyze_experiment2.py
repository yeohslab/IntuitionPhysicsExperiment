"""Reproducible descriptive analysis for Experiment 2.

The script leaves the source CSV files untouched. It validates the exported
formal-trial data, computes the report statistics, and writes generated LaTeX
fragments plus publication-ready figures into the existing report template.
"""

from __future__ import annotations

import io
import json
import math
from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
from matplotlib.lines import Line2D
from matplotlib.colors import Normalize
import numpy as np
import pandas as pd


REPORT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPORT_ROOT.parent / "data"
SRC_DIR = REPORT_ROOT / "src"
FIGURE_DIR = SRC_DIR / "figures"
GENERATED_DIR = SRC_DIR / "generated"

CORE_COLUMNS = [
    "theta_x_t_deg",
    "theta_x_t_rad",
    "omega_x_t_rad_per_sec",
    "theta_estimated_deg",
    "abs_delta_theta_deg",
    "rt_estimate_sec",
]

TIMING_IMPUTED_TRIAL_IDS = {
    "b5dec3cf-7043-4475-82a6-72563ab914a2",
    "4f761b52-c41e-4057-b865-47bc7661e186",
    "5f3da335-d4ac-4822-97f1-05775e84da4c",
}


def configure_matplotlib() -> None:
    """Use an installed Chinese font and embed TrueType glyphs in PDFs."""
    candidates = [
        Path(r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\msyhbd.ttc"),
        Path(r"C:\Windows\Fonts\simhei.ttf"),
        Path(r"C:\Windows\Fonts\simsun.ttc"),
    ]
    family = "DejaVu Sans"
    for path in candidates:
        if path.exists():
            mpl.font_manager.fontManager.addfont(path)
            family = FontProperties(fname=path).get_name()
            break
    mpl.rcParams.update(
        {
            "font.family": "sans-serif",
            "font.sans-serif": [family, "DejaVu Sans"],
            "axes.unicode_minus": False,
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
            "figure.dpi": 140,
            "savefig.dpi": 300,
            "axes.edgecolor": "#4b5563",
            "axes.labelcolor": "#111827",
            "xtick.color": "#374151",
            "ytick.color": "#374151",
        }
    )


def save_figure(fig: plt.Figure, stem: str) -> None:
    """Write through memory buffers so Unicode Windows paths stay reliable."""
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    for suffix, output_format in [("pdf", "pdf"), ("png", "png")]:
        buffer = io.BytesIO()
        fig.savefig(buffer, format=output_format, bbox_inches="tight")
        (FIGURE_DIR / f"{stem}.{suffix}").write_bytes(buffer.getvalue())


def load_data() -> tuple[pd.DataFrame, list[Path]]:
    paths = sorted(DATA_DIR.glob("experiment-2_data_subjectE2-*_f.csv"))
    if len(paths) != 5:
        raise AssertionError(f"Expected 5 completed CSV files, found {len(paths)}")
    frames = [pd.read_csv(path).assign(source_file=path.name) for path in paths]
    return pd.concat(frames, ignore_index=True), paths


def wrap_deg(values: pd.Series) -> pd.Series:
    wrapped = (values + 180.0) % 360.0 - 180.0
    return wrapped.where(~np.isclose(wrapped, -180.0), 180.0)


def add_derived_columns(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    est = wrap_deg(result["theta_estimated_deg"])
    actual = wrap_deg(result["theta_x_t_deg"])
    rotation = result["motion_condition"].eq("rotation")

    rotation_error = wrap_deg(est - actual).abs()
    limit = result["w_max_deg"]
    oscillation_error = (est.clip(lower=-limit, upper=limit) - actual).abs()
    result["abs_error_recomputed_deg"] = np.where(
        rotation, rotation_error, oscillation_error
    )

    result["max_possible_error_deg"] = np.where(
        rotation, 180.0, 2.0 * result["w_max_deg"]
    )
    result["relative_error_pct"] = (
        100.0
        * result["abs_delta_theta_deg"]
        / result["max_possible_error_deg"]
    )
    result["natural_frequency_rad_per_sec"] = np.sqrt(
        result["gravity_m_per_sec2"] / result["rod_length_m"]
    )
    result["omega_t_normalized"] = (
        result["omega_x_t_rad_per_sec"]
        / result["natural_frequency_rad_per_sec"]
    )
    result["energy_level_j"] = result["pendulum_E_J"].round(6)
    result["hide_level_sec"] = result["hide_sec"].round(1)
    result["show_level_T"] = result["show_T"].round(2)
    return result


def validate_data(df: pd.DataFrame) -> None:
    assert len(df) == 675, f"Expected 675 formal trials, found {len(df)}"
    assert df["subject_id"].nunique() == 5
    assert set(df["experiment_status"].unique()) == {"f"}
    assert set(df["segment_kind"].unique()) == {"block"}
    assert set(df["physics_kind"].unique()) == {"pendulum"}
    assert df["trial_id"].duplicated().sum() == 0
    assert df.duplicated(["subject_id", "formal_trial_index"]).sum() == 0
    assert int(df[CORE_COLUMNS].isna().sum().sum()) == 0

    subject_counts = df.groupby("subject_id").size()
    assert (subject_counts == 135).all()
    motion_counts = df.groupby("motion_condition").size().to_dict()
    assert motion_counts == {"oscillation": 450, "rotation": 225}
    by_subject_motion = (
        df.groupby(["subject_id", "motion_condition"]).size().unstack()
    )
    assert (by_subject_motion["oscillation"] == 90).all()
    assert (by_subject_motion["rotation"] == 45).all()

    expected_indices = set(range(1, 136))
    for _, group in df.groupby("subject_id"):
        assert set(group["formal_trial_index"].astype(int)) == expected_indices
        assert set(group["block_index"].astype(int)) == set(range(1, 16))

    error_difference = (
        df["abs_error_recomputed_deg"] - df["abs_delta_theta_deg"]
    ).abs()
    assert float(error_difference.max()) < 1e-8
    assert df["relative_error_pct"].between(0.0, 100.0).all()
    assert df["visibility_pause_count"].eq(0).all()
    assert np.isclose(df["visibility_pause_sec"], 0.0).all()

    for trial_id in TIMING_IMPUTED_TRIAL_IDS:
        target = df[df["trial_id"].eq(trial_id)]
        assert len(target) == 1
        row = target.iloc[0]
        peers = df[
            df["subject_id"].ne(row["subject_id"])
            & df["energy_level_j"].eq(row["energy_level_j"])
            & df["show_level_T"].eq(row["show_level_T"])
            & df["hide_level_sec"].eq(row["hide_level_sec"])
        ]
        assert len(peers) == 4
        expected_rt = float(peers["rt_estimate_sec"].median())
        assert math.isclose(
            float(row["rt_estimate_sec"]), expected_rt, abs_tol=1e-8
        )

    energy_counts = df.groupby(["motion_condition", "energy_level_j"]).size()
    assert len(energy_counts.loc["oscillation"]) == 10
    assert len(energy_counts.loc["rotation"]) == 5
    assert (energy_counts == 45).all()


def describe(series: pd.Series) -> dict[str, float]:
    return {
        "n": int(series.size),
        "mean": float(series.mean()),
        "sd": float(series.std(ddof=1)),
        "median": float(series.median()),
        "q1": float(series.quantile(0.25)),
        "q3": float(series.quantile(0.75)),
        "min": float(series.min()),
        "max": float(series.max()),
    }


def rank_correlation(x: pd.Series, y: pd.Series) -> float:
    return float(x.rank(method="average").corr(y.rank(method="average")))


def build_summary(df: pd.DataFrame, paths: list[Path]) -> dict[str, object]:
    motion_summary: dict[str, object] = {}
    for motion, group in df.groupby("motion_condition", sort=False):
        motion_summary[motion] = {
            "absolute_error_deg": describe(group["abs_delta_theta_deg"]),
            "relative_error_pct": describe(group["relative_error_pct"]),
            "energy_abs_rank_correlation": rank_correlation(
                group["energy_level_j"], group["abs_delta_theta_deg"]
            ),
            "energy_relative_rank_correlation": rank_correlation(
                group["energy_level_j"], group["relative_error_pct"]
            ),
        }

    subject_summary = (
        df.groupby(["subject_id", "motion_condition"])
        .agg(
            n=("trial_id", "size"),
            absolute_mean_deg=("abs_delta_theta_deg", "mean"),
            absolute_median_deg=("abs_delta_theta_deg", "median"),
            relative_mean_pct=("relative_error_pct", "mean"),
            relative_median_pct=("relative_error_pct", "median"),
        )
        .reset_index()
    )

    timing_summary = (
        df.groupby(
            ["motion_condition", "hide_level_sec", "show_level_T"],
            observed=True,
        )
        .agg(
            n=("trial_id", "size"),
            absolute_mean_deg=("abs_delta_theta_deg", "mean"),
            absolute_median_deg=("abs_delta_theta_deg", "median"),
            relative_mean_pct=("relative_error_pct", "mean"),
        )
        .reset_index()
    )

    hide_summary = (
        df.groupby(["motion_condition", "hide_level_sec"], observed=True)
        .agg(
            n=("trial_id", "size"),
            absolute_mean_deg=("abs_delta_theta_deg", "mean"),
            absolute_median_deg=("abs_delta_theta_deg", "median"),
            relative_mean_pct=("relative_error_pct", "mean"),
        )
        .reset_index()
    )

    show_summary = (
        df.groupby(["motion_condition", "show_level_T"], observed=True)
        .agg(
            n=("trial_id", "size"),
            absolute_mean_deg=("abs_delta_theta_deg", "mean"),
            absolute_median_deg=("abs_delta_theta_deg", "median"),
            relative_mean_pct=("relative_error_pct", "mean"),
        )
        .reset_index()
    )

    energy_summary = (
        df.groupby(["motion_condition", "energy_level_j"], observed=True)
        .agg(
            n=("trial_id", "size"),
            absolute_mean_deg=("abs_delta_theta_deg", "mean"),
            absolute_median_deg=("abs_delta_theta_deg", "median"),
            relative_mean_pct=("relative_error_pct", "mean"),
            relative_median_pct=("relative_error_pct", "median"),
        )
        .reset_index()
    )

    turning = df[df["motion_condition"].eq("oscillation")]
    turning_summary = (
        turning.groupby("hide_has_turning")
        .agg(
            n=("trial_id", "size"),
            absolute_mean_deg=("abs_delta_theta_deg", "mean"),
            absolute_median_deg=("abs_delta_theta_deg", "median"),
            relative_mean_pct=("relative_error_pct", "mean"),
        )
        .reset_index()
    )

    timing_imputations = (
        df[df["trial_id"].isin(TIMING_IMPUTED_TRIAL_IDS)][
            ["subject_id", "formal_trial_index", "trial_id", "rt_estimate_sec"]
        ]
        .sort_values(["subject_id", "formal_trial_index"])
        .to_dict(orient="records")
    )

    return {
        "source_files": [path.name for path in paths],
        "row_count": int(len(df)),
        "subject_count": int(df["subject_id"].nunique()),
        "motion_counts": {
            key: int(value)
            for key, value in df.groupby("motion_condition").size().to_dict().items()
        },
        "duplicate_trial_ids": int(df["trial_id"].duplicated().sum()),
        "duplicate_subject_formal_indices": int(
            df.duplicated(["subject_id", "formal_trial_index"]).sum()
        ),
        "missing_core_values": int(df[CORE_COLUMNS].isna().sum().sum()),
        "max_absolute_error_recompute_difference_deg": float(
            (
                df["abs_error_recomputed_deg"]
                - df["abs_delta_theta_deg"]
            ).abs().max()
        ),
        "motion_summary": motion_summary,
        "subject_summary": subject_summary.to_dict(orient="records"),
        "timing_summary": timing_summary.to_dict(orient="records"),
        "hide_summary": hide_summary.to_dict(orient="records"),
        "show_summary": show_summary.to_dict(orient="records"),
        "energy_summary": energy_summary.to_dict(orient="records"),
        "turning_summary": turning_summary.to_dict(orient="records"),
        "quality": {
            "timing_imputation_count": int(len(timing_imputations)),
            "timing_imputations": timing_imputations,
            "remaining_visibility_pause_trials": int(
                df["visibility_pause_count"].gt(0).sum()
            ),
            "max_rt_estimate_sec": float(df["rt_estimate_sec"].max()),
            "median_rt_estimate_sec": float(df["rt_estimate_sec"].median()),
            "max_sim_frame_gap_ms": float(df["sim_max_frame_gap_ms"].max()),
        },
    }


def fmt(value: float, digits: int = 2) -> str:
    return f"{value:.{digits}f}"


def macro(name: str, value: object) -> str:
    return f"\\newcommand{{\\{name}}}{{{value}}}"


def write_generated_latex(summary: dict[str, object]) -> None:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    motion = summary["motion_summary"]
    osc = motion["oscillation"]
    rot = motion["rotation"]
    quality = summary["quality"]

    macros = [
        macro("TotalTrials", summary["row_count"]),
        macro("TotalSubjects", summary["subject_count"]),
        macro("OscTrials", summary["motion_counts"]["oscillation"]),
        macro("RotTrials", summary["motion_counts"]["rotation"]),
        macro("OscAbsMean", fmt(osc["absolute_error_deg"]["mean"])),
        macro("OscAbsMedian", fmt(osc["absolute_error_deg"]["median"])),
        macro("OscRelMean", fmt(osc["relative_error_pct"]["mean"])),
        macro("OscRelMedian", fmt(osc["relative_error_pct"]["median"])),
        macro("RotAbsMean", fmt(rot["absolute_error_deg"]["mean"])),
        macro("RotAbsMedian", fmt(rot["absolute_error_deg"]["median"])),
        macro("RotRelMean", fmt(rot["relative_error_pct"]["mean"])),
        macro("RotRelMedian", fmt(rot["relative_error_pct"]["median"])),
        macro("TimingImputations", quality["timing_imputation_count"]),
        macro("MaxRtEstimateSec", fmt(quality["max_rt_estimate_sec"], 2)),
        macro(
            "OscEnergyAbsRho", fmt(osc["energy_abs_rank_correlation"], 2)
        ),
        macro(
            "OscEnergyRelRho", fmt(osc["energy_relative_rank_correlation"], 2)
        ),
        macro(
            "RotEnergyAbsRho", fmt(rot["energy_abs_rank_correlation"], 2)
        ),
        macro(
            "RotEnergyRelRho", fmt(rot["energy_relative_rank_correlation"], 2)
        ),
    ]
    (GENERATED_DIR / "macros.tex").write_text(
        "\n".join(macros) + "\n", encoding="utf-8"
    )

    overall_rows: list[str] = []
    labels = {"oscillation": "摆动", "rotation": "旋转"}
    for key in ["oscillation", "rotation"]:
        item = motion[key]
        absolute = item["absolute_error_deg"]
        relative = item["relative_error_pct"]
        overall_rows.append(
            " & ".join(
                [
                    labels[key],
                    str(absolute["n"]),
                    f"{fmt(absolute['mean'])} $\\pm$ {fmt(absolute['sd'])}",
                    f"{fmt(absolute['median'])} [{fmt(absolute['q1'])}, {fmt(absolute['q3'])}]",
                    f"{fmt(relative['mean'])} $\\pm$ {fmt(relative['sd'])}",
                    f"{fmt(relative['median'])} [{fmt(relative['q1'])}, {fmt(relative['q3'])}]",
                ]
            )
            + r" \\"
        )
    (GENERATED_DIR / "overall_rows.tex").write_text(
        "\\newcommand{\\GeneratedOverallRows}{%\n"
        + "\n".join(overall_rows)
        + "\n}\n",
        encoding="utf-8",
    )

    subject = pd.DataFrame(summary["subject_summary"])
    wide = subject.pivot(index="subject_id", columns="motion_condition")
    subject_rows: list[str] = []
    for subject_id in wide.index:
        osc_abs = wide.loc[subject_id, ("absolute_mean_deg", "oscillation")]
        rot_abs = wide.loc[subject_id, ("absolute_mean_deg", "rotation")]
        osc_rel = wide.loc[subject_id, ("relative_mean_pct", "oscillation")]
        rot_rel = wide.loc[subject_id, ("relative_mean_pct", "rotation")]
        subject_rows.append(
            f"{subject_id} & {fmt(osc_abs)} & {fmt(rot_abs)} & "
            f"{fmt(osc_rel)} & {fmt(rot_rel)} & {fmt(rot_abs - osc_abs)} \\\\"
        )
    (GENERATED_DIR / "subject_rows.tex").write_text(
        "\\newcommand{\\GeneratedSubjectRows}{%\n"
        + "\n".join(subject_rows)
        + "\n}\n",
        encoding="utf-8",
    )

    timing_rows: list[str] = []
    for variable, records in [
        ("遮挡时长（s）", summary["hide_summary"]),
        ("显示时长（周期）", summary["show_summary"]),
    ]:
        frame = pd.DataFrame(records)
        level_column = (
            "hide_level_sec" if "hide_level_sec" in frame.columns else "show_level_T"
        )
        for _, row in frame.iterrows():
            timing_rows.append(
                " & ".join(
                    [
                        variable,
                        labels[row["motion_condition"]],
                        fmt(float(row[level_column]), 2),
                        str(int(row["n"])),
                        fmt(float(row["absolute_mean_deg"])),
                        fmt(float(row["absolute_median_deg"])),
                        fmt(float(row["relative_mean_pct"])),
                    ]
                )
                + r" \\"
            )
    (GENERATED_DIR / "timing_rows.tex").write_text(
        "\\newcommand{\\GeneratedTimingRows}{%\n"
        + "\n".join(timing_rows)
        + "\n}\n",
        encoding="utf-8",
    )

    energy_rows: list[str] = []
    for row in summary["energy_summary"]:
        energy_rows.append(
            " & ".join(
                [
                    labels[row["motion_condition"]],
                    fmt(float(row["energy_level_j"]), 2),
                    str(int(row["n"])),
                    fmt(float(row["absolute_mean_deg"])),
                    fmt(float(row["absolute_median_deg"])),
                    fmt(float(row["relative_mean_pct"])),
                    fmt(float(row["relative_median_pct"])),
                ]
            )
            + r" \\"
        )
    (GENERATED_DIR / "energy_rows.tex").write_text(
        "\\newcommand{\\GeneratedEnergyRows}{%\n"
        + "\n".join(energy_rows)
        + "\n}\n",
        encoding="utf-8",
    )


def plot_phase_space(df: pd.DataFrame) -> None:
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(10.4, 8.5))
    theta = np.linspace(-math.pi, math.pi, 1800)

    rod_length = float(df["rod_length_m"].iloc[0])
    gravity = float(df["gravity_m_per_sec2"].iloc[0])
    energy_levels = sorted(df["energy_level_j"].unique())
    for energy in energy_levels:
        dimensionless_energy = energy / (gravity * rod_length)
        y_squared = 2.0 * (
            dimensionless_energy - (1.0 - np.cos(theta))
        )
        valid = y_squared >= 0.0
        y = np.full_like(theta, np.nan)
        y[valid] = np.sqrt(y_squared[valid])
        ax.plot(theta, y, color="#b7b7b7", lw=0.85, alpha=0.68, zorder=1)
        ax.plot(theta, -y, color="#b7b7b7", lw=0.85, alpha=0.68, zorder=1)

    vmax = math.ceil(float(df["abs_delta_theta_deg"].max()) / 10.0) * 10.0
    norm = Normalize(vmin=0.0, vmax=vmax)
    cmap = mpl.colormaps["viridis"]
    plot_order = df.sort_values("abs_delta_theta_deg")
    styles = {
        "oscillation": {"marker": "o", "size": 23, "label": "摆动"},
        "rotation": {"marker": "^", "size": 31, "label": "旋转"},
    }
    for motion in ["oscillation", "rotation"]:
        subset = plot_order[plot_order["motion_condition"].eq(motion)]
        ax.scatter(
            subset["theta_x_t_rad"],
            subset["omega_t_normalized"],
            c=subset["abs_delta_theta_deg"],
            cmap=cmap,
            norm=norm,
            marker=styles[motion]["marker"],
            s=styles[motion]["size"],
            alpha=0.80,
            linewidths=0,
            zorder=3,
        )

    ax.set_xlim(-math.pi, math.pi)
    ax.set_ylim(-2.75, 2.75)
    ax.set_xticks(
        [-math.pi, -math.pi / 2, 0, math.pi / 2, math.pi],
        [r"$-\pi$", r"$-\pi/2$", "0", r"$\pi/2$", r"$\pi$"],
    )
    ax.set_xlabel(r"真实终态角 $\theta_t$ (rad)", fontsize=12)
    ax.set_ylabel(r"归一化终态角速度 $\omega_t/\sqrt{g/l}$", fontsize=12)
    ax.set_title("摆动与旋转终态相空间", fontsize=16, pad=14)
    ax.grid(True, color="#d8dadd", linewidth=0.7, alpha=0.8)
    ax.axhline(0, color="#a8aaad", lw=0.7, zorder=0)
    ax.axvline(0, color="#a8aaad", lw=0.7, zorder=0)

    colorbar = fig.colorbar(
        mpl.cm.ScalarMappable(norm=norm, cmap=cmap), ax=ax, pad=0.025
    )
    colorbar.set_label("绝对角误差 (°)", fontsize=11)

    legend_handles = [
        Line2D(
            [0],
            [0],
            marker="o",
            linestyle="none",
            markerfacecolor="#4b5563",
            markeredgecolor="none",
            markersize=7,
            label=f"摆动 (n={int((df.motion_condition == 'oscillation').sum())})",
        ),
        Line2D(
            [0],
            [0],
            marker="^",
            linestyle="none",
            markerfacecolor="#4b5563",
            markeredgecolor="none",
            markersize=8,
            label=f"旋转 (n={int((df.motion_condition == 'rotation').sum())})",
        ),
        Line2D(
            [0],
            [0],
            color="#a9a9a9",
            lw=1.2,
            label="等能量线",
        ),
    ]
    ax.legend(
        handles=legend_handles,
        loc="upper center",
        bbox_to_anchor=(0.5, -0.105),
        ncol=3,
        frameon=False,
        fontsize=10.5,
    )
    fig.subplots_adjust(left=0.10, right=0.91, top=0.91, bottom=0.17)
    save_figure(fig, "phase-space-error")
    plt.close(fig)


def plot_subject_pairs(df: pd.DataFrame) -> None:
    subject = (
        df.groupby(["subject_id", "motion_condition"])
        .agg(
            absolute_error=("abs_delta_theta_deg", "mean"),
            relative_error=("relative_error_pct", "mean"),
        )
        .reset_index()
    )
    subjects = sorted(subject["subject_id"].unique())
    colors = mpl.colormaps["tab10"](np.linspace(0.05, 0.65, len(subjects)))
    fig, axes = plt.subplots(1, 2, figsize=(9.4, 4.25))
    panels = [
        ("absolute_error", "平均绝对角误差 (°)", "绝对误差"),
        ("relative_error", "平均范围归一化相对误差 (%)", "相对误差"),
    ]
    x = np.array([0.0, 1.0])
    for ax, (column, ylabel, title) in zip(axes, panels):
        for color, subject_id in zip(colors, subjects):
            values = (
                subject[subject["subject_id"].eq(subject_id)]
                .set_index("motion_condition")
                .loc[["oscillation", "rotation"], column]
                .to_numpy()
            )
            ax.plot(
                x,
                values,
                color=color,
                marker="o",
                markersize=5.5,
                linewidth=1.5,
                alpha=0.92,
                label=subject_id,
            )
        group_values = (
            subject.groupby("motion_condition")[column]
            .mean()
            .loc[["oscillation", "rotation"]]
            .to_numpy()
        )
        ax.plot(
            x,
            group_values,
            color="#111827",
            marker="D",
            markersize=6.5,
            linewidth=2.4,
            linestyle="--",
            label="被试均值",
            zorder=5,
        )
        ax.set_xticks(x, ["摆动", "旋转"])
        ax.set_xlim(-0.25, 1.25)
        ax.set_ylabel(ylabel)
        ax.set_title(title, fontsize=13, pad=9)
        ax.grid(axis="y", color="#d8dadd", linewidth=0.7, alpha=0.9)
        ax.spines[["top", "right"]].set_visible(False)

    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(
        handles,
        labels,
        loc="lower center",
        bbox_to_anchor=(0.5, -0.005),
        ncol=6,
        frameon=False,
        fontsize=9,
    )
    fig.suptitle("各被试在两类运动条件下的平均误差", fontsize=15, y=0.99)
    fig.subplots_adjust(left=0.09, right=0.98, top=0.84, bottom=0.22, wspace=0.28)
    save_figure(fig, "subject-paired-errors")
    plt.close(fig)


def plot_error_distributions(df: pd.DataFrame) -> None:
    colors = ["#2563eb", "#d97706"]
    motions = ["oscillation", "rotation"]
    labels = ["摆动", "旋转"]
    fig, axes = plt.subplots(1, 2, figsize=(9.5, 4.5))
    panels = [
        ("abs_delta_theta_deg", "绝对角误差 (°)", "绝对误差分布"),
        ("relative_error_pct", "范围归一化相对误差 (%)", "相对误差分布"),
    ]
    rng = np.random.default_rng(20260930)

    for ax, (column, ylabel, title) in zip(axes, panels):
        arrays = [
            df.loc[df["motion_condition"].eq(motion), column].to_numpy()
            for motion in motions
        ]
        violin = ax.violinplot(
            arrays,
            positions=[0, 1],
            widths=0.78,
            showextrema=False,
            showmedians=False,
        )
        for body, color in zip(violin["bodies"], colors):
            body.set_facecolor(color)
            body.set_edgecolor(color)
            body.set_alpha(0.20)

        box = ax.boxplot(
            arrays,
            positions=[0, 1],
            widths=0.22,
            patch_artist=True,
            showfliers=False,
            medianprops={"color": "#111827", "linewidth": 1.5},
            whiskerprops={"color": "#4b5563", "linewidth": 1.0},
            capprops={"color": "#4b5563", "linewidth": 1.0},
            boxprops={"color": "#4b5563", "linewidth": 1.0},
            zorder=3,
        )
        for patch, color in zip(box["boxes"], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.30)

        for position, values, color in zip([0, 1], arrays, colors):
            jitter = rng.uniform(-0.17, 0.17, values.size)
            ax.scatter(
                position + jitter,
                values,
                s=8,
                color=color,
                alpha=0.18,
                linewidths=0,
                zorder=2,
            )
            ax.scatter(
                position,
                float(np.mean(values)),
                marker="D",
                s=48,
                facecolor=color,
                edgecolor="white",
                linewidth=0.9,
                zorder=5,
            )

        ax.set_xticks([0, 1], labels)
        ax.set_ylabel(ylabel)
        ax.set_title(title, fontsize=13, pad=9)
        ax.set_ylim(bottom=0)
        ax.grid(axis="y", color="#d8dadd", linewidth=0.7, alpha=0.9)
        ax.spines[["top", "right"]].set_visible(False)

    fig.suptitle("两类运动条件的试次级误差分布", fontsize=15, y=0.99)
    fig.subplots_adjust(left=0.09, right=0.98, top=0.84, bottom=0.13, wspace=0.28)
    save_figure(fig, "error-distributions")
    plt.close(fig)


def plot_timing_effects(df: pd.DataFrame) -> None:
    motions = ["oscillation", "rotation"]
    motion_labels = {"oscillation": "摆动", "rotation": "旋转"}
    colors = {"oscillation": "#2563eb", "rotation": "#d97706"}
    factors = [
        ("hide_level_sec", "遮挡时长 (s)"),
        ("show_level_T", "显示时长 (周期)"),
    ]
    fig, axes = plt.subplots(2, 2, figsize=(9.5, 7.1))

    for row_index, motion in enumerate(motions):
        subset = df[df["motion_condition"].eq(motion)]
        for column_index, (factor, xlabel) in enumerate(factors):
            ax = axes[row_index, column_index]
            grouped = (
                subset.groupby(["subject_id", factor])
                .agg(mean_error=("abs_delta_theta_deg", "mean"))
                .reset_index()
            )
            levels = np.array(sorted(grouped[factor].unique()), dtype=float)
            for _, subject_frame in grouped.groupby("subject_id"):
                subject_frame = subject_frame.sort_values(factor)
                ax.plot(
                    subject_frame[factor],
                    subject_frame["mean_error"],
                    color="#9ca3af",
                    marker="o",
                    markersize=3.2,
                    linewidth=1.0,
                    alpha=0.65,
                    zorder=2,
                )
            group_mean = (
                grouped.groupby(factor)["mean_error"].mean().reindex(levels)
            )
            ax.plot(
                levels,
                group_mean.to_numpy(),
                color=colors[motion],
                marker="o",
                markersize=6,
                linewidth=2.4,
                zorder=4,
            )
            ax.set_xticks(levels)
            ax.set_xlabel(xlabel)
            ax.set_ylabel("平均绝对角误差 (°)")
            ax.set_title(
                f"{motion_labels[motion]}：{xlabel.split(' ')[0]}",
                fontsize=12.5,
                pad=8,
            )
            ax.grid(axis="y", color="#d8dadd", linewidth=0.7, alpha=0.9)
            ax.spines[["top", "right"]].set_visible(False)

    legend_handles = [
        Line2D([0], [0], color="#9ca3af", marker="o", lw=1.0, label="单名被试"),
        Line2D([0], [0], color="#2563eb", marker="o", lw=2.4, label="摆动均值"),
        Line2D([0], [0], color="#d97706", marker="o", lw=2.4, label="旋转均值"),
    ]
    fig.legend(
        handles=legend_handles,
        loc="lower center",
        bbox_to_anchor=(0.5, 0.005),
        ncol=3,
        frameon=False,
        fontsize=9.5,
    )
    fig.suptitle("遮挡与显示时长下的被试内误差变化", fontsize=15, y=0.99)
    fig.subplots_adjust(left=0.10, right=0.98, top=0.90, bottom=0.13, hspace=0.38, wspace=0.25)
    save_figure(fig, "timing-effects")
    plt.close(fig)


def plot_energy_effects(df: pd.DataFrame) -> None:
    motions = ["oscillation", "rotation"]
    labels = {"oscillation": "摆动", "rotation": "旋转"}
    colors = {"oscillation": "#2563eb", "rotation": "#d97706"}
    subject_energy = (
        df.groupby(["subject_id", "motion_condition", "energy_level_j"])
        .agg(
            absolute_error=("abs_delta_theta_deg", "mean"),
            relative_error=("relative_error_pct", "mean"),
        )
        .reset_index()
    )
    fig, axes = plt.subplots(1, 2, figsize=(9.5, 4.5))
    panels = [
        ("absolute_error", "平均绝对角误差 (°)", "绝对误差"),
        ("relative_error", "平均范围归一化相对误差 (%)", "相对误差"),
    ]

    for ax, (column, ylabel, title) in zip(axes, panels):
        for motion in motions:
            subset = subject_energy[subject_energy["motion_condition"].eq(motion)]
            summary = (
                subset.groupby("energy_level_j")[column]
                .agg(["mean", "min", "max"])
                .reset_index()
                .sort_values("energy_level_j")
            )
            yerr = np.vstack(
                [
                    summary["mean"] - summary["min"],
                    summary["max"] - summary["mean"],
                ]
            )
            ax.errorbar(
                summary["energy_level_j"],
                summary["mean"],
                yerr=yerr,
                color=colors[motion],
                marker="o",
                markersize=5.5,
                linewidth=2.0,
                elinewidth=1.0,
                capsize=3,
                alpha=0.92,
                label=labels[motion],
            )
        ax.set_xlabel("实验能量水平 (J)")
        ax.set_ylabel(ylabel)
        ax.set_title(title, fontsize=13, pad=9)
        ax.set_ylim(bottom=0)
        ax.grid(axis="y", color="#d8dadd", linewidth=0.7, alpha=0.9)
        ax.spines[["top", "right"]].set_visible(False)

    handles, legend_labels = axes[0].get_legend_handles_labels()
    fig.legend(
        handles,
        legend_labels,
        loc="lower center",
        bbox_to_anchor=(0.5, 0.005),
        ncol=2,
        frameon=False,
        fontsize=9.5,
    )
    fig.suptitle("不同能量水平下的被试均值及范围", fontsize=15, y=0.99)
    fig.subplots_adjust(left=0.09, right=0.98, top=0.84, bottom=0.20, wspace=0.28)
    save_figure(fig, "energy-effects")
    plt.close(fig)


def verify_expected_statistics(summary: dict[str, object]) -> None:
    motion = summary["motion_summary"]
    checks = {
        "osc_abs_mean": (motion["oscillation"]["absolute_error_deg"]["mean"], 20.038),
        "osc_abs_median": (motion["oscillation"]["absolute_error_deg"]["median"], 14.727),
        "osc_rel_mean": (motion["oscillation"]["relative_error_pct"]["mean"], 12.450),
        "osc_rel_median": (motion["oscillation"]["relative_error_pct"]["median"], 9.612),
        "rot_abs_mean": (motion["rotation"]["absolute_error_deg"]["mean"], 37.228),
        "rot_abs_median": (motion["rotation"]["absolute_error_deg"]["median"], 29.533),
        "rot_rel_mean": (motion["rotation"]["relative_error_pct"]["mean"], 20.682),
        "rot_rel_median": (motion["rotation"]["relative_error_pct"]["median"], 16.407),
    }
    failures = {
        name: {"actual": actual, "expected": expected}
        for name, (actual, expected) in checks.items()
        if round(actual, 3) != expected
    }
    if failures:
        raise AssertionError(f"Expected statistics changed: {failures}")


def main() -> None:
    configure_matplotlib()
    df, paths = load_data()
    df = add_derived_columns(df)
    validate_data(df)
    summary = build_summary(df, paths)
    verify_expected_statistics(summary)
    write_generated_latex(summary)
    plot_error_distributions(df)
    plot_phase_space(df)
    plot_subject_pairs(df)
    plot_timing_effects(df)
    plot_energy_effects(df)

    (GENERATED_DIR / "analysis_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    concise = {
        "rows": summary["row_count"],
        "subjects": summary["subject_count"],
        "motion_counts": summary["motion_counts"],
        "timing_imputations": summary["quality"]["timing_imputation_count"],
        "remaining_visibility_pause_trials": summary["quality"][
            "remaining_visibility_pause_trials"
        ],
        "maximum_error_check_difference_deg": summary[
            "max_absolute_error_recompute_difference_deg"
        ],
        "figures": [
            "error-distributions.pdf",
            "phase-space-error.pdf",
            "subject-paired-errors.pdf",
            "timing-effects.pdf",
            "energy-effects.pdf",
        ],
    }
    print(json.dumps(concise, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
