"""描述性统计：表格（LaTeX）与探索性图表。"""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from preprocess import (
    COL_ABS_ERROR,
    COL_E,
    COL_RESIDUAL,
    COL_RT,
    OUTPUT_DIR,
    E_BIN_LABELS,
)

FIGURES_DIR = OUTPUT_DIR / "figures"
TABLES_DIR = OUTPUT_DIR / "tables"


def _msd(series: pd.Series) -> str:
    return f"{series.mean():.2f}$\\pm${series.std(ddof=1):.2f}"


def setup_plot_style() -> None:
    sns.set_theme(style="whitegrid")
    plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False


def write_table_e_bin(df: pd.DataFrame, out_path: Path) -> None:
    rows = []
    for label in ["低", "中", "高"]:
        sub = df[df["E_bin_label"] == label]
        rows.append(
            (
                label,
                _msd(sub[COL_RESIDUAL]),
                _msd(sub[COL_ABS_ERROR]),
                len(sub),
            )
        )
    lines = [
        "\\begin{table}[htbp]",
        "  \\centering",
        "  \\caption{不同能量档下的角估计误差（M$\\pm$SD）}",
        "  \\label{tab:desc-ebin}",
        "  \\begin{tabular}{lccc}",
        "    \\toprule",
        "    能量档 & 有符号偏差 $\\Delta\\theta$ (°) & 绝对误差 $|\\Delta\\theta|$ (°) & $n$ \\\\",
        "    \\midrule",
    ]
    for label, bias, mae, n in rows:
        lines.append(f"    {label} & {bias} & {mae} & {n} \\\\")
    lines.extend(
        [
            "    \\bottomrule",
            "  \\end{tabular}",
            "\\end{table}",
            "",
        ]
    )
    out_path.write_text("\n".join(lines), encoding="utf-8")


def write_table_overall(df: pd.DataFrame, out_path: Path) -> None:
    lines = [
        "\\begin{table}[htbp]",
        "  \\centering",
        "  \\caption{正式 block 试次总体描述统计（M$\\pm$SD）}",
        "  \\label{tab:desc-overall}",
        "  \\begin{tabular}{lc}",
        "    \\toprule",
        "    变量 & M$\\pm$SD \\\\",
        "    \\midrule",
        f"    机械能 $E$ (J) & {_msd(df[COL_E])} \\\\",
        f"    有符号偏差 $\\Delta\\theta$ (°) & {_msd(df[COL_RESIDUAL])} \\\\",
        f"    绝对误差 $|\\Delta\\theta|$ (°) & {_msd(df[COL_ABS_ERROR])} \\\\",
        f"    反应时 RT (s) & {_msd(df[COL_RT])} \\\\",
        "    \\bottomrule",
        "  \\end{tabular}",
        "\\end{table}",
        "",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")


def write_table_by_subject(df: pd.DataFrame, out_path: Path) -> None:
    lines = [
        "\\begin{table}[htbp]",
        "  \\centering",
        "  \\caption{分被试绝对角误差与反应时（M$\\pm$SD）}",
        "  \\label{tab:desc-subject}",
        "  \\begin{tabular}{lccc}",
        "    \\toprule",
        "    被试 & $n$ & $|\\Delta\\theta|$ (°) & RT (s) \\\\",
        "    \\midrule",
    ]
    for sid, sub in df.groupby("subject_id"):
        lines.append(
            f"    {sid} & {len(sub)} & {_msd(sub[COL_ABS_ERROR])} & {_msd(sub[COL_RT])} \\\\"
        )
    lines.extend(
        [
            "    \\bottomrule",
            "  \\end{tabular}",
            "\\end{table}",
            "",
        ]
    )
    out_path.write_text("\n".join(lines), encoding="utf-8")


def write_table_by_energy_level(df: pd.DataFrame, out_path: Path) -> None:
    lines = [
        "\\begin{longtable}{lcccc}",
        "  \\caption{各能量水平下的角估计误差（M$\\pm$SD）} \\label{tab:desc-elevel} \\\\",
        "  \\toprule",
        "  $E$ (J) & $n$ & $\\Delta\\theta$ (°) & $|\\Delta\\theta|$ (°) \\\\",
        "  \\midrule",
        "  \\endfirsthead",
        "  \\multicolumn{4}{c}{\\tablename\\ \\thetable{} -- 续表} \\\\",
        "  \\toprule",
        "  $E$ (J) & $n$ & $\\Delta\\theta$ (°) & $|\\Delta\\theta|$ (°) \\\\",
        "  \\midrule",
        "  \\endhead",
        "  \\bottomrule",
        "  \\endfoot",
    ]
    for level, sub in df.groupby("E_level"):
        lines.append(
            f"  {level:.2f} & {len(sub)} & {_msd(sub[COL_RESIDUAL])} & {_msd(sub[COL_ABS_ERROR])} \\\\"
        )
    lines.extend(["\\end{longtable}", ""])
    out_path.write_text("\n".join(lines), encoding="utf-8")


def plot_energy_vs_residual(df: pd.DataFrame, out_path: Path, *, title: str) -> None:
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.axvline(0, color="0.5", linewidth=0.8, linestyle="--", zorder=0)
    ax.scatter(df[COL_RESIDUAL], df[COL_E], alpha=0.45, s=28, edgecolors="none", c="#2563eb")
    if len(df) >= 8:
        e_bins = pd.qcut(df[COL_E], q=min(8, df[COL_E].nunique()), duplicates="drop")
        binned = df.groupby(e_bins, observed=True)[COL_RESIDUAL].median()
        centers = [interval.mid for interval in binned.index]
        ax.plot(
            binned.values,
            centers,
            color="#dc2626",
            linewidth=2,
            marker="o",
            markersize=5,
            label="分箱中位残差",
            zorder=3,
        )
        ax.legend(loc="best", fontsize=9)
    ax.set_xlabel("有符号角残差 Δθ (°)\n(估计 − 真值)")
    ax.set_ylabel("机械能 E (J)")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def plot_energy_vs_residual_by_subject(df: pd.DataFrame, out_path: Path, *, title: str) -> None:
    subjects = sorted(df["subject_id"].unique())
    ncol = min(4, len(subjects))
    nrow = int(np.ceil(len(subjects) / ncol))
    fig, axes = plt.subplots(nrow, ncol, figsize=(4 * ncol, 3.5 * nrow), squeeze=False)
    for ax, sid in zip(axes.flat, subjects):
        sub = df[df["subject_id"] == sid]
        ax.axvline(0, color="0.5", linewidth=0.6, linestyle="--")
        ax.scatter(sub[COL_RESIDUAL], sub[COL_E], alpha=0.5, s=18, edgecolors="none")
        ax.set_title(f"被试 {sid}", fontsize=10)
        ax.set_xlabel("Δθ (°)")
        ax.set_ylabel("E (J)")
    for ax in axes.flat[len(subjects) :]:
        ax.set_visible(False)
    fig.suptitle(title, fontsize=12, y=1.02)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_residual_distribution(df: pd.DataFrame, out_path: Path, *, title: str) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    sns.histplot(df[COL_RESIDUAL], kde=True, ax=axes[0], color="#2563eb")
    axes[0].axvline(0, color="0.4", linestyle="--")
    axes[0].set_xlabel("有符号角残差 Δθ (°)")
    axes[0].set_title("残差分布")
    sns.histplot(df[COL_ABS_ERROR], kde=True, ax=axes[1], color="#059669")
    axes[1].set_xlabel("绝对角误差 |Δθ| (°)")
    axes[1].set_title("绝对误差分布")
    fig.suptitle(title, fontsize=12)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def plot_energy_vs_abs_error(df: pd.DataFrame, out_path: Path, *, title: str) -> None:
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(df[COL_ABS_ERROR], df[COL_E], alpha=0.45, s=28, edgecolors="none", c="#059669")
    ax.set_xlabel("绝对角误差 |Δθ| (°)")
    ax.set_ylabel("机械能 E (J)")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def plot_e_bin_violin(df: pd.DataFrame, out_path: Path) -> None:
    order = ["低", "中", "高"]
    fig, ax = plt.subplots(figsize=(7, 5))
    sns.violinplot(data=df, x="E_bin_label", y=COL_ABS_ERROR, order=order, ax=ax, color="#93c5fd")
    sns.stripplot(
        data=df,
        x="E_bin_label",
        y=COL_ABS_ERROR,
        order=order,
        ax=ax,
        color="#1e3a8a",
        alpha=0.25,
        size=2,
        jitter=0.2,
    )
    ax.set_xlabel("能量档")
    ax.set_ylabel("|Δθ| (°)")
    ax.set_title("三档能量下的绝对角误差分布")
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def plot_subject_boxplot(df: pd.DataFrame, out_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(9, 5))
    sns.boxplot(data=df, x="subject_id", y=COL_ABS_ERROR, ax=ax, color="#bbf7d0")
    sns.stripplot(
        data=df,
        x="subject_id",
        y=COL_ABS_ERROR,
        ax=ax,
        color="#166534",
        alpha=0.3,
        size=2,
        jitter=0.2,
    )
    ax.set_xlabel("被试")
    ax.set_ylabel("|Δθ| (°)")
    ax.set_title("被试间绝对角误差比较")
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def descriptive_stats_dict(df: pd.DataFrame) -> dict:
    by_bin = {}
    for label in ["低", "中", "高"]:
        sub = df[df["E_bin_label"] == label]
        by_bin[label] = {
            "bias_mean": float(sub[COL_RESIDUAL].mean()),
            "bias_sd": float(sub[COL_RESIDUAL].std(ddof=1)),
            "mae_mean": float(sub[COL_ABS_ERROR].mean()),
            "mae_sd": float(sub[COL_ABS_ERROR].std(ddof=1)),
            "n": int(len(sub)),
        }
    return {
        "overall": {
            "E_mean": float(df[COL_E].mean()),
            "E_sd": float(df[COL_E].std(ddof=1)),
            "bias_mean": float(df[COL_RESIDUAL].mean()),
            "bias_sd": float(df[COL_RESIDUAL].std(ddof=1)),
            "mae_mean": float(df[COL_ABS_ERROR].mean()),
            "mae_sd": float(df[COL_ABS_ERROR].std(ddof=1)),
            "mae_median": float(df[COL_ABS_ERROR].median()),
            "rt_mean": float(df[COL_RT].mean()),
            "rt_sd": float(df[COL_RT].std(ddof=1)),
            "n": int(len(df)),
            "n_subjects": int(df["subject_id"].nunique()),
        },
        "by_e_bin": by_bin,
    }


def run_descriptive(
    df: pd.DataFrame,
    raw_all: pd.DataFrame,
    *,
    output_dir: Path = OUTPUT_DIR,
) -> dict:
    setup_plot_style()
    fig_dir = output_dir / "figures"
    tab_dir = output_dir / "tables"
    fig_dir.mkdir(parents=True, exist_ok=True)
    tab_dir.mkdir(parents=True, exist_ok=True)

    write_table_e_bin(df, tab_dir / "desc_e_bin.tex")
    write_table_overall(df, tab_dir / "desc_overall.tex")
    write_table_by_subject(df, tab_dir / "desc_by_subject.tex")
    write_table_by_energy_level(df, tab_dir / "desc_by_energy_level.tex")

    plot_energy_vs_residual(
        df,
        fig_dir / "energy_vs_residual_formal.png",
        title="正式 block：机械能 vs 有符号角残差",
    )
    plot_energy_vs_residual_by_subject(
        df,
        fig_dir / "energy_vs_residual_formal_by_subject.png",
        title="正式 block：各被试 E vs Δθ",
    )
    plot_residual_distribution(
        df,
        fig_dir / "residual_distribution_formal.png",
        title="正式 block：估计误差分布",
    )
    plot_energy_vs_abs_error(
        df,
        fig_dir / "energy_vs_abs_error_formal.png",
        title="正式 block：机械能 vs 绝对角误差",
    )
    plot_e_bin_violin(df, fig_dir / "e_bin_violin.png")
    plot_subject_boxplot(df, fig_dir / "subject_boxplot.png")
    plot_energy_vs_residual(
        raw_all,
        fig_dir / "energy_vs_residual_all.png",
        title="全部试次：机械能 vs 有符号角残差",
    )

    return descriptive_stats_dict(df)


if __name__ == "__main__":
    from preprocess import preprocess

    result = preprocess()
    stats = run_descriptive(result.formal_clean, result.raw_all)
    print(stats)
