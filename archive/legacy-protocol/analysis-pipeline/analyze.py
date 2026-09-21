"""
直觉物理实验数据分析入口：预处理 → 描述性统计 → 推断统计。
"""

from __future__ import annotations

import json
from pathlib import Path

from latex_export import copy_figures, copy_tables, write_section_results
from descriptive import run_descriptive
from inferential import run_inferential
from preprocess import OUTPUT_DIR, preprocess
from viz_subspace_error_human import run_viz


def write_summary(
    prep,
    desc_stats: dict,
    infer_stats: dict,
    *,
    output_dir: Path = OUTPUT_DIR,
) -> None:
    overall = desc_stats["overall"]
    lines = [
        "# 数据分析摘要",
        "",
        f"- 数据目录: `{prep.raw_all.attrs.get('data_dir', '未记录')}`",
        f"- CSV 文件数: {prep.raw_all['source_file'].nunique()}",
        f"- 原始总试次数: {len(prep.raw_all)}",
        f"- 正式 block 试次（剔除前）: {len(prep.formal_raw)}",
        f"- 正式 block 试次（剔除后）: {len(prep.formal_clean)}",
        f"- RT 异常剔除: {int(prep.formal_raw['rt_outlier'].sum())} 试次",
        f"- 被试数: {overall['n_subjects']}",
        "",
        "## 描述性统计（正式 block，剔除后）",
        "",
        f"- E (J): M={overall['E_mean']:.3f}, SD={overall['E_sd']:.3f}",
        f"- Δθ (°): M={overall['bias_mean']:.3f}, SD={overall['bias_sd']:.3f}",
        f"- |Δθ| (°): M={overall['mae_mean']:.3f}, SD={overall['mae_sd']:.3f}, "
        f"Md={overall['mae_median']:.3f}",
        f"- RT (s): M={overall['rt_mean']:.3f}, SD={overall['rt_sd']:.3f}",
        "",
        "## 推断统计",
        "",
    ]
    rm = infer_stats["rm_anova"]
    lines.extend(
        [
            f"- RM-ANOVA（能量档）: F({rm['df1']}, {rm['df2']}) = {rm['F']:.3f}, "
            f"p = {rm['p']:.4f}, η²p = {rm['eta_p2']:.3f}",
            f"- Pearson r(E, |Δθ|) = {infer_stats['correlation']['pearson_r']:.3f}, "
            f"p = {infer_stats['correlation']['pearson_p']:.4f}",
            "",
            "## 输出",
            "",
            "- `formal_trials_clean.csv` — 清洗后试次表",
            "- `qc_report.md` — 质控报告",
            "- `stats.json` — 推断统计 JSON",
            "- `figures/` — 分析图",
            "- `tables/` — LaTeX 表格片段",
            "",
        ]
    )
    (output_dir / "summary.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    output_dir = OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    prep = preprocess()
    desc_stats = run_descriptive(prep.formal_clean, prep.raw_all, output_dir=output_dir)
    subspace_info = run_viz(prep.raw_all, out_path=output_dir / "figures" / "viz_subspace_error_human.png")
    infer_stats = run_inferential(prep.formal_clean, output_dir=output_dir)

    full_stats = {
        "preprocess": {
            "n_raw_all": len(prep.raw_all),
            "n_formal_raw": len(prep.formal_raw),
            "n_formal_clean": len(prep.formal_clean),
            "n_rt_excluded": int(prep.formal_raw["rt_outlier"].sum()),
            "subjects": sorted(prep.formal_clean["subject_id"].unique()),
        },
        "descriptive": desc_stats,
        "subspace_viz": subspace_info,
        "inferential": infer_stats,
    }
    (output_dir / "stats_full.json").write_text(
        json.dumps(full_stats, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    write_summary(prep, desc_stats, infer_stats, output_dir=output_dir)
    copy_tables()
    copy_figures()
    tex_path = write_section_results(output_dir / "stats_full.json")

    print(
        f"done: formal_clean={len(prep.formal_clean)}, "
        f"figures={len(list((output_dir / 'figures').glob('*.png')))}, "
        f"latex={tex_path}, "
        f"output={output_dir}"
    )


if __name__ == "__main__":
    main()
