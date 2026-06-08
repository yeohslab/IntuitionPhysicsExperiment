"""
分析 data/formal_raw_data 下的实验 CSV，生成图表到 data_analysis/output/。
"""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / "data" / "formal_raw_data"
OUTPUT_DIR = SCRIPT_DIR / "output"

COL_E = "pendulum_E_J"
COL_RESIDUAL = "delta_theta_deg"
COL_ABS_ERROR = "abs_delta_theta_deg"


def load_all_csv(data_dir: Path = DATA_DIR) -> pd.DataFrame:
    paths = sorted(data_dir.glob("experiment_data_subject*.csv"))
    if not paths:
        raise FileNotFoundError(f"未在 {data_dir} 找到 experiment_data_subject*.csv")
    frames = []
    for p in paths:
        chunk = pd.read_csv(p)
        chunk["source_file"] = p.name
        frames.append(chunk)
    return pd.concat(frames, ignore_index=True)


def formal_block_trials(df: pd.DataFrame) -> pd.DataFrame:
    """正式 block 中的摆球刺激试次（不含练习段）。"""
    mask = (df["unit_type"] == "pendulumStimulus") & (df["segment_kind"] == "block")
    return df.loc[mask].copy()


def plot_energy_vs_residual(
    df: pd.DataFrame,
    out_path: Path,
    *,
    title: str,
) -> None:
    """能量 (y) 与有符号角残差 (x) 散点图。"""
    x = df[COL_RESIDUAL].to_numpy()
    y = df[COL_E].to_numpy()

    fig, ax = plt.subplots(figsize=(8, 6))
    ax.axvline(0, color="0.5", linewidth=0.8, linestyle="--", zorder=0)
    ax.scatter(x, y, alpha=0.45, s=28, edgecolors="none", c="#2563eb")

    # 按能量分箱的中位残差趋势
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

    ax.set_xlabel("有符号角残差 Δθ (°)\n(估计 − 真值，可正可负)")
    ax.set_ylabel("机械能 E (J)")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def plot_energy_vs_residual_by_subject(
    df: pd.DataFrame,
    out_path: Path,
    *,
    title: str,
) -> None:
    subjects = sorted(df["subject_id"].astype(str).unique())
    n = len(subjects)
    ncol = min(4, n)
    nrow = int(np.ceil(n / ncol))

    fig, axes = plt.subplots(nrow, ncol, figsize=(4 * ncol, 3.5 * nrow), squeeze=False)
    for ax, sid in zip(axes.flat, subjects):
        sub = df[df["subject_id"].astype(str) == sid]
        ax.axvline(0, color="0.5", linewidth=0.6, linestyle="--")
        ax.scatter(sub[COL_RESIDUAL], sub[COL_E], alpha=0.5, s=18, edgecolors="none")
        ax.set_title(f"被试 {sid}", fontsize=10)
        ax.set_xlabel("Δθ (°)")
        ax.set_ylabel("E (J)")
    for ax in axes.flat[n:]:
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


def write_summary(df: pd.DataFrame, formal: pd.DataFrame, out_path: Path) -> None:
    lines = [
        "# 数据分析摘要",
        "",
        f"- 数据目录: `{DATA_DIR}`",
        f"- CSV 文件数: {df['source_file'].nunique()}",
        f"- 总试次数: {len(df)}",
        f"- 正式 block 试次: {len(formal)}",
        f"- 被试: {', '.join(sorted(df['subject_id'].astype(str).unique(), key=int))}",
        "",
        "## 正式 block：能量与残差",
        "",
        f"- E (J): mean={formal[COL_E].mean():.3f}, std={formal[COL_E].std():.3f}",
        f"- Δθ (°): mean={formal[COL_RESIDUAL].mean():.3f}, std={formal[COL_RESIDUAL].std():.3f}",
        f"- |Δθ| (°): mean={formal[COL_ABS_ERROR].mean():.3f}, median={formal[COL_ABS_ERROR].median():.3f}",
        "",
        "## 输出图表",
        "",
        "- `energy_vs_residual_formal.png` — 正式试次：E (y) vs 有符号残差 (x)",
        "- `energy_vs_residual_formal_by_subject.png` — 分被试散点",
        "- `energy_vs_residual_all.png` — 全部试次（含练习）",
        "- `residual_distribution_formal.png` — 残差与绝对误差分布",
        "- `energy_vs_abs_error_formal.png` — E vs 绝对误差",
        "",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    sns.set_theme(style="whitegrid")
    plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    df = load_all_csv()
    formal = formal_block_trials(df)

    plot_energy_vs_residual(
        formal,
        OUTPUT_DIR / "energy_vs_residual_formal.png",
        title="正式 block：机械能 vs 有符号角残差",
    )
    plot_energy_vs_residual_by_subject(
        formal,
        OUTPUT_DIR / "energy_vs_residual_formal_by_subject.png",
        title="正式 block：各被试 E vs Δθ",
    )
    plot_energy_vs_residual(
        df,
        OUTPUT_DIR / "energy_vs_residual_all.png",
        title="全部试次：机械能 vs 有符号角残差",
    )
    plot_residual_distribution(
        formal,
        OUTPUT_DIR / "residual_distribution_formal.png",
        title="正式 block：估计误差分布",
    )
    plot_energy_vs_abs_error(
        formal,
        OUTPUT_DIR / "energy_vs_abs_error_formal.png",
        title="正式 block：机械能 vs 绝对角误差",
    )
    write_summary(df, formal, OUTPUT_DIR / "summary.md")

    print(f"rows={len(df)}, formal_block={len(formal)}, output={OUTPUT_DIR}")


if __name__ == "__main__":
    main()
