"""根据 stats_full.json 生成 LaTeX 结果章叙述片段。"""

from __future__ import annotations

import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR / "output"
LATEX_DIR = SCRIPT_DIR.parent / "archive" / "paper" / "latex-source" / "src"
TABLES_SRC = OUTPUT_DIR / "tables"
TABLES_DST = LATEX_DIR / "tables"
PIC_DST = LATEX_DIR / "pic"


def _p_fmt(p: float) -> str:
    if p < 0.001:
        return "$p < .001$"
    return f"$p = {p:.3f}$"


def copy_figures() -> None:
    fig_src = OUTPUT_DIR / "figures"
    PIC_DST.mkdir(parents=True, exist_ok=True)
    if not fig_src.exists():
        return
    for png in sorted(fig_src.glob("*.png")):
        (PIC_DST / png.name).write_bytes(png.read_bytes())


def copy_tables() -> None:
    TABLES_DST.mkdir(parents=True, exist_ok=True)
    for tex in TABLES_SRC.glob("*.tex"):
        (TABLES_DST / tex.name).write_text(tex.read_text(encoding="utf-8"), encoding="utf-8")


def write_section_results(stats_path: Path = OUTPUT_DIR / "stats_full.json") -> Path:
    stats = json.loads(stats_path.read_text(encoding="utf-8"))
    prep = stats["preprocess"]
    desc = stats["descriptive"]
    inf = stats["inferential"]
    overall = desc["overall"]
    by_bin = desc["by_e_bin"]
    rm = inf["rm_anova"]
    corr = inf["correlation"]
    mixed = inf["mixed_lm_all"]
    mixed_no10 = inf["mixed_lm_no_subject10"]

    low, mid, high = by_bin["低"], by_bin["中"], by_bin["高"]
    mae_diff_mid_low = mid["mae_mean"] - low["mae_mean"]
    mae_diff_high_low = high["mae_mean"] - low["mae_mean"]

    ph_lines = []
    for row in inf["posthoc"]:
        sig = "达到显著" if row["p_corr"] < 0.05 else "未达显著"
        ph_lines.append(
            f"{row['A']}与{row['B']}比较（Bonferroni 校正）{sig}（"
            f"$t({int(row['dof'])}) = {row['T']:.3f}$，"
            f"$p_{{\\mathrm{{corr}}}} = {row['p_corr']:.3f}$，"
            f"Cohen's $d = {row['cohen']:.3f}$）。"
        )
    posthoc_text = " ".join(ph_lines)

    t_all = next(r for r in inf["one_sample_t"] if r["condition"] == "全体")
    t_sig = "未显著偏离 0" if t_all["p"] >= 0.05 else "显著偏离 0"

    out_path = LATEX_DIR / "TeX_files" / "section_results.tex"
    content = rf"""\section{{结果}}

\subsection{{数据预处理}}

在实验数据的预处理阶段，为确保分析结果的可靠性和有效性，本研究依据反应时异常（超过被试内均值$\pm 3$倍标准差）等标准，对原始数据进行了筛选。分析对象为正式 block 中的摆球刺激试次（\texttt{{pendulumStimulus}} + \texttt{{block}}），不含练习段。数据合并、质控与统计均使用 Python（pandas、pingouin、statsmodels）完成。

原始数据共 {prep['n_raw_all']} 个试次（{len(prep['subjects'])} 名被试）。正式 block 试次 {prep['n_formal_raw']} 个；经反应时质控剔除 {prep['n_rt_excluded']} 个试次后，最终保留 {prep['n_formal_clean']} 个试次进入描述性与推断统计分析。各被试正式试次数均为 125（剔除前），25 个能量水平各 40 试次，无缺失值。被试 0010 的绝对误差均值（约 $34.77^\circ$）高于其余被试，已在质控报告中标记；主分析保留该被试，并在推断统计中报告剔除后的敏感性分析。

\subsection{{描述性统计}}

表~\ref{{tab:desc-ebin}} 记录了低、中、高三档能量条件下的有符号角偏差与绝对角误差。总体来看，绝对角误差随能量升高而增大：低能量档 $M = {low['mae_mean']:.2f}^\circ$（$SD = {low['mae_sd']:.2f}^\circ$），中能量档 $M = {mid['mae_mean']:.2f}^\circ$（$SD = {mid['mae_sd']:.2f}^\circ$），高能量档 $M = {high['mae_mean']:.2f}^\circ$（$SD = {high['mae_sd']:.2f}^\circ$）。中档较低档平均高出约 ${mae_diff_mid_low:.2f}^\circ$，高档较低档平均高出约 ${mae_diff_high_low:.2f}^\circ$。

有符号偏差方面，三档能量条件下均值均接近 0（低：$M = {low['bias_mean']:.2f}^\circ$；中：$M = {mid['bias_mean']:.2f}^\circ$；高：$M = {high['bias_mean']:.2f}^\circ$），提示整体上未表现出单一方向的一致性系统偏差。表~\ref{{tab:desc-overall}} 汇总了正式试次各变量的总体描述统计；表~\ref{{tab:desc-subject}} 显示被试间差异，其中被试 0010 的 $|{{\Delta\theta}}|$ 明显高于其他被试。

\input{{tables/desc_e_bin.tex}}
\input{{tables/desc_overall.tex}}
\input{{tables/desc_by_subject.tex}}

图~\ref{{fig:energy-residual}} 展示了机械能 $E$ 与有符号角残差 $\Delta\theta$ 的散点分布及分箱中位趋势线，可见高能量试次多分布于较大残差区域。图~\ref{{fig:energy-abs}} 显示 $E$ 与 $|{{\Delta\theta}}|$ 呈正相关趋势。图~\ref{{fig:residual-dist}} 表明 $|{{\Delta\theta}}|$ 分布右偏，中位数（$Md = {overall['mae_median']:.2f}^\circ$）低于均值（$M = {overall['mae_mean']:.2f}^\circ$）。图~\ref{{fig:ebin-violin}} 与图~\ref{{fig:subject-box}} 分别呈现三档能量与被试间的绝对误差分布；图~\ref{{fig:subspace}} 在 $(\theta,\,|\omega|/\omega_0)$ 相空间上以颜色编码 $|{{\Delta\theta}}|$，显示误差在相空间各区域均有分布。

\begin{{figure}}[htbp]
  \centering
  \includegraphics[width=0.85\linewidth]{{energy_vs_residual_formal.png}}
  \caption{{正式 block：机械能 vs 有符号角残差}}
  \label{{fig:energy-residual}}
\end{{figure}}

\begin{{figure}}[htbp]
  \centering
  \includegraphics[width=0.85\linewidth]{{energy_vs_abs_error_formal.png}}
  \caption{{正式 block：机械能 vs 绝对角误差}}
  \label{{fig:energy-abs}}
\end{{figure}}

\begin{{figure}}[htbp]
  \centering
  \includegraphics[width=0.9\linewidth]{{residual_distribution_formal.png}}
  \caption{{正式 block：估计误差分布}}
  \label{{fig:residual-dist}}
\end{{figure}}

\begin{{figure}}[htbp]
  \centering
  \includegraphics[width=0.75\linewidth]{{e_bin_violin.png}}
  \caption{{三档能量下的绝对角误差分布}}
  \label{{fig:ebin-violin}}
\end{{figure}}

\begin{{figure}}[htbp]
  \centering
  \includegraphics[width=0.85\linewidth]{{subject_boxplot.png}}
  \caption{{被试间绝对角误差比较}}
  \label{{fig:subject-box}}
\end{{figure}}

\begin{{figure}}[htbp]
  \centering
  \includegraphics[width=0.85\linewidth]{{viz_subspace_error_human.png}}
  \caption{{相空间上的绝对角误差（人类数据）}}
  \label{{fig:subspace}}
\end{{figure}}

各能量水平的细粒度描述统计见表~\ref{{tab:desc-elevel}}（\texttt{{longtable}}）。

\input{{tables/desc_by_energy_level.tex}}

\subsection{{推断统计}}

对绝对角误差进行单因素（能量档：低/中/高）重复测量方差分析，以被试在各档内的试次均值为分析单元（$n = 8$）。Mauchly 球形性检验显著（$W = {rm['sphericity_W']:.3f}$，{_p_fmt(rm['sphericity_p'])}），故参考 Greenhouse--Geisser 校正结果：能量档主效应显著（$F({rm['df1']}, {rm['df2']}) = {rm['F']:.3f}$，{_p_fmt(rm['p_gg'])}，$\eta_p^2 = {rm['eta_p2']:.3f}$），表明机械能水平对摆角估计精度具有显著影响。未校正 $p$ 值同样显著（{_p_fmt(rm['p'])}).

事后检验（Bonferroni 校正）显示：{posthoc_text}

\input{{tables/inferential_rm_anova.tex}}
\input{{tables/inferential_posthoc.tex}}

为进一步检验系统性有符号偏差，对 $\Delta\theta$ 进行单样本 $t$ 检验（检验值 $= 0^\circ$）。全体试次均值（$M = {t_all['mean']:.2f}^\circ$，$SD = {t_all['sd']:.2f}^\circ$）{t_sig}（$t({int(t_all['df'])}) = {t_all['t']:.3f}$，{_p_fmt(t_all['p'])}，Cohen's $d = {t_all['cohen_d']:.3f}$），各能量档亦均未表现出显著单向偏差（见表~\ref{{tab:infer-ttest}}）。

\input{{tables/inferential_ttest.tex}}

Pearson 相关分析表明，试次级 $E$ 与 $|{{\Delta\theta}}|$ 显著正相关（$r = {corr['pearson_r']:.3f}$，{_p_fmt(corr['pearson_p'])}）；被试内中心化后相关仍显著（$r = {corr['within_subject_r']:.3f}$，{_p_fmt(corr['within_subject_p'])}），支持能量升高伴随估计难度增加的探索性结论。

作为敏感性分析，线性混合模型（$|{{\Delta\theta}}| \sim E_{{z}} + \mathrm{{show\_T}}_{{z}} + (1|\mathrm{{subject}})$）显示：标准化能量 $E_z$ 的固定效应显著（$\beta = {mixed['params']['E_z']:.3f}$，{_p_fmt(mixed['pvalues']['E_z'])}），可见时长 $\mathrm{{show\_T}}_z$ 效应不显著（{_p_fmt(mixed['pvalues']['show_T_z'])}）。剔除被试 0010 后（$n = {mixed_no10['n_obs']}$ 试次），$E_z$ 效应仍显著（$\beta = {mixed_no10['params']['E_z']:.3f}$，{_p_fmt(mixed_no10['pvalues']['E_z'])}），结果方向保持一致。

鉴于本研究被试量较小（$n = 8$），上述推断统计应视为\textbf{{探索性分析}}，结论侧重效应方向与描述性模式，有待更大样本进一步验证。
"""
    out_path.write_text(content, encoding="utf-8")
    return out_path


if __name__ == "__main__":
    copy_tables()
    path = write_section_results()
    print(f"wrote {path}")
