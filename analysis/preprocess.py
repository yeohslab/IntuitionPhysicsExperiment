"""数据预处理：合并 CSV、质控、试次剔除、派生变量。"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "archive" / "legacy-protocol" / "formal-raw-data"
OUTPUT_DIR = SCRIPT_DIR / "output"

COL_E = "pendulum_E_J"
COL_RESIDUAL = "delta_theta_deg"
COL_ABS_ERROR = "abs_delta_theta_deg"
COL_RT = "rt_estimate_sec"

FORMAL_UNIT = "pendulumStimulus"
FORMAL_SEGMENT = "block"
E_BIN_LABELS = {0: "低", 1: "中", 2: "高"}
LEGACY_COLUMN_ALIASES = {
    "physicsKind": "physics_kind",
    "theta_actual_deg": "theta_x_t_deg",
    "theta_actual_rad": "theta_x_t_rad",
    "omega_actual_deg_per_sec": "omega_x_t_deg_per_sec",
    "omega_actual_rad_per_sec": "omega_x_t_rad_per_sec",
}


@dataclass
class PreprocessResult:
    raw_all: pd.DataFrame
    formal_raw: pd.DataFrame
    formal_clean: pd.DataFrame
    qc_lines: list[str]


def load_all_csv(data_dir: Path = DATA_DIR) -> pd.DataFrame:
    paths = sorted(data_dir.glob("experiment_data_subject*.csv"))
    if not paths:
        raise FileNotFoundError(f"未在 {data_dir} 找到 experiment_data_subject*.csv")
    frames = []
    for p in paths:
        chunk = pd.read_csv(p)
        for old_name, current_name in LEGACY_COLUMN_ALIASES.items():
            if current_name not in chunk.columns and old_name in chunk.columns:
                chunk[current_name] = chunk[old_name]
        if "data_schema_version" not in chunk.columns:
            chunk["data_schema_version"] = 1
        if "experiment_status" not in chunk.columns:
            chunk["experiment_status"] = "legacy"
        chunk["source_file"] = p.name
        frames.append(chunk)
    df = pd.concat(frames, ignore_index=True)
    df["subject_id"] = df["subject_id"].astype(int).map(lambda x: f"{x:04d}")
    df.attrs["data_dir"] = str(data_dir)
    return df


def formal_block_trials(df: pd.DataFrame) -> pd.DataFrame:
    mask = (df["unit_type"] == FORMAL_UNIT) & (df["segment_kind"] == FORMAL_SEGMENT)
    return df.loc[mask].copy()


def assign_energy_bins(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["E_level"] = out[COL_E].round(2)
    levels = sorted(out["E_level"].unique())
    n_levels = len(levels)
    tertile_size = int(np.ceil(n_levels / 3))
    level_to_bin: dict[float, int] = {}
    for i, level in enumerate(levels):
        level_to_bin[level] = min(i // tertile_size, 2)
    out["E_bin"] = out["E_level"].map(level_to_bin).astype(int)
    out["E_bin_label"] = out["E_bin"].map(E_BIN_LABELS)
    return out


def flag_rt_outliers(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["rt_outlier"] = False
    for sid, sub in out.groupby("subject_id"):
        mean_rt = sub[COL_RT].mean()
        std_rt = sub[COL_RT].std(ddof=1)
        if std_rt == 0 or np.isnan(std_rt):
            continue
        lo, hi = mean_rt - 3 * std_rt, mean_rt + 3 * std_rt
        mask = (out["subject_id"] == sid) & ((out[COL_RT] < lo) | (out[COL_RT] > hi))
        out.loc[mask, "rt_outlier"] = True
    return out


def flag_subject_sensitivity(df: pd.DataFrame) -> pd.DataFrame:
    """标记 |Δθ| 均值超出被试间均值 ±2SD 的被试（探索性）。"""
    out = df.copy()
    subject_means = out.groupby("subject_id")[COL_ABS_ERROR].mean()
    grand_mean = subject_means.mean()
    grand_std = subject_means.std(ddof=1)
    outlier_subjects: set[str] = set()
    if grand_std > 0:
        for sid, m in subject_means.items():
            if m > grand_mean + 2 * grand_std:
                outlier_subjects.add(sid)
    out["subject_sensitivity_flag"] = out["subject_id"].isin(outlier_subjects)
    return out


def run_qc_checks(formal: pd.DataFrame) -> list[str]:
    lines = ["# 数据质控报告", ""]
    lines.append(f"- 正式 block 试次数: {len(formal)}")
    lines.append(f"- 被试数: {formal['subject_id'].nunique()}")
    lines.append("")

    for sid, sub in formal.groupby("subject_id"):
        n = len(sub)
        schema = int(sub["data_schema_version"].max())
        expected = 135 if schema >= 2 else 125
        status = "OK" if n == expected else "WARN"
        lines.append(
            f"- 被试 {sid}: {n}/{expected} 试次 [schema v{schema}, {status}]"
        )

    lines.append("")
    e_counts = formal.groupby("E_level").size()
    lines.append(
        f"- 能量水平数: {len(e_counts)}；每水平试次数范围: "
        f"{int(e_counts.min())}–{int(e_counts.max())}"
    )

    missing = formal.isna().sum()
    missing = missing[missing > 0]
    if missing.empty:
        lines.append("- 缺失值: 无")
    else:
        lines.append("- 缺失值:")
        for col, cnt in missing.items():
            lines.append(f"  - {col}: {cnt}")

    lines.append("")
    return lines


def preprocess(data_dir: Path = DATA_DIR, output_dir: Path = OUTPUT_DIR) -> PreprocessResult:
    output_dir.mkdir(parents=True, exist_ok=True)

    raw_all = load_all_csv(data_dir)
    formal_raw = formal_block_trials(raw_all)
    formal_raw = assign_energy_bins(formal_raw)
    formal_raw = flag_rt_outliers(formal_raw)
    formal_raw = flag_subject_sensitivity(formal_raw)

    n_rt_outliers = int(formal_raw["rt_outlier"].sum())
    formal_clean = formal_raw.loc[~formal_raw["rt_outlier"]].copy()

    qc_lines = run_qc_checks(formal_raw)
    qc_lines.extend(
        [
            "## 试次剔除",
            "",
            f"- RT 超出被试内均值 ±3SD 的试次: {n_rt_outliers}",
            f"- 剔除后保留试次: {len(formal_clean)}",
            f"- 保留被试数: {formal_clean['subject_id'].nunique()}",
            "",
            "## 被试敏感性标记",
            "",
        ]
    )
    flagged = formal_raw.loc[formal_raw["subject_sensitivity_flag"], "subject_id"].unique()
    if len(flagged):
        for sid in flagged:
            mae = formal_raw.loc[formal_raw["subject_id"] == sid, COL_ABS_ERROR].mean()
            qc_lines.append(f"- 被试 {sid}: |Δθ| 均值 = {mae:.2f}°（标记为离群，主分析保留）")
    else:
        qc_lines.append("- 无被试被标记为离群")

    clean_path = output_dir / "formal_trials_clean.csv"
    formal_clean.to_csv(clean_path, index=False, encoding="utf-8-sig")
    (output_dir / "qc_report.md").write_text("\n".join(qc_lines), encoding="utf-8")

    return PreprocessResult(
        raw_all=raw_all,
        formal_raw=formal_raw,
        formal_clean=formal_clean,
        qc_lines=qc_lines,
    )


if __name__ == "__main__":
    result = preprocess()
    print(
        f"formal_raw={len(result.formal_raw)}, "
        f"formal_clean={len(result.formal_clean)}, "
        f"output={OUTPUT_DIR}"
    )
