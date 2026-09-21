"""推断统计：重复测量方差分析、t 检验、相关与混合模型。"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pingouin as pg
from scipy import stats
from statsmodels.regression.mixed_linear_model import MixedLM

from preprocess import COL_ABS_ERROR, COL_E, COL_RESIDUAL, COL_RT, OUTPUT_DIR

TABLES_DIR = OUTPUT_DIR / "tables"


def _fmt_p(p: float) -> str:
    if p < 0.001:
        return "< .001"
    return f"= {p:.3f}".replace("0.", ".")


def subject_ebin_means(df: pd.DataFrame, dv: str) -> pd.DataFrame:
    return (
        df.groupby(["subject_id", "E_bin_label"], observed=True)[dv]
        .mean()
        .reset_index()
    )


def run_rm_anova(df: pd.DataFrame, dv: str = COL_ABS_ERROR) -> dict:
    long = subject_ebin_means(df, dv)
    long["E_bin_label"] = pd.Categorical(long["E_bin_label"], categories=["低", "中", "高"], ordered=True)
    aov = pg.rm_anova(
        data=long,
        dv=dv,
        within="E_bin_label",
        subject="subject_id",
        detailed=True,
        effsize="np2",
    )
    sphericity = pg.sphericity(long, dv=dv, within="E_bin_label", subject="subject_id")
    posthoc = pg.pairwise_tests(
        data=long,
        dv=dv,
        within="E_bin_label",
        subject="subject_id",
        padjust="bonf",
        effsize="cohen",
    )
    return {
        "anova_table": aov,
        "sphericity": sphericity,
        "posthoc": posthoc,
        "long_data": long,
    }


def write_rm_anova_tex(rm: dict, out_path: Path) -> None:
    aov = rm["anova_table"]
    row = aov.loc[aov["Source"] != "Error"].iloc[0]
    err = aov.loc[aov["Source"] == "Error"].iloc[0]
    f_val = row["F"]
    df1 = int(row["DF"])
    df2 = int(err["DF"])
    p_val = row["p_unc"]
    eta = row.get("np2", np.nan)
    sph = rm["sphericity"]
    sph_w = float(sph.W)
    sph_p = float(sph.pval)
    lines = [
        "\\begin{table}[htbp]",
        "  \\centering",
        "  \\caption{能量档（低/中/高）对绝对角误差的重复测量方差分析}",
        "  \\label{tab:infer-rm-anova}",
        "  \\begin{tabular}{lccc}",
        "    \\toprule",
        "    因素 & $F$ & $p$ & $\\eta_p^2$ \\\\",
        "    \\midrule",
        f"    能量档 & {f_val:.3f} & {_fmt_p(p_val)} & {eta:.3f} \\\\",
        "    \\bottomrule",
        "  \\end{tabular}",
        "  \\begin{flushleft}",
        "    \\footnotesize",
        f"    注：Mauchly 球形性检验 $W$ = {sph_w:.3f}，$p$ = {_fmt_p(sph_p)}。",
        "  \\end{flushleft}",
        "\\end{table}",
        "",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")


def write_posthoc_tex(rm: dict, out_path: Path) -> None:
    ph = rm["posthoc"]
    lines = [
        "\\begin{table}[htbp]",
        "  \\centering",
        "  \\caption{能量档两两比较的事后检验（Bonferroni 校正）}",
        "  \\label{tab:infer-posthoc}",
        "  \\begin{tabular}{lccc}",
        "    \\toprule",
        "    比较 & $t$ & $p_{\\mathrm{corr}}$ & Cohen's $d$ \\\\",
        "    \\midrule",
    ]
    for _, r in ph.iterrows():
        a, b = r["A"], r["B"]
        lines.append(
            f"    {a} vs {b} & {r['T']:.3f} & {_fmt_p(r['p_corr'])} & {r['cohen']:.3f} \\\\"
        )
    lines.extend(["    \\bottomrule", "  \\end{tabular}", "\\end{table}", ""])
    out_path.write_text("\n".join(lines), encoding="utf-8")


def run_one_sample_ttests(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    tests = [("全体", df)] + [(label, df[df["E_bin_label"] == label]) for label in ["低", "中", "高"]]
    for label, sub in tests:
        x = sub[COL_RESIDUAL].to_numpy()
        t_stat, p_val = stats.ttest_1samp(x, popmean=0.0)
        d = x.mean() / x.std(ddof=1) if x.std(ddof=1) > 0 else np.nan
        ci = stats.t.interval(0.95, len(x) - 1, loc=x.mean(), scale=stats.sem(x))
        rows.append(
            {
                "condition": label,
                "mean": x.mean(),
                "sd": x.std(ddof=1),
                "t": t_stat,
                "df": len(x) - 1,
                "p": p_val,
                "cohen_d": d,
                "ci_low": ci[0],
                "ci_high": ci[1],
                "n": len(x),
            }
        )
    return pd.DataFrame(rows)


def write_ttest_tex(tt: pd.DataFrame, out_path: Path) -> None:
    lines = [
        "\\begin{table}[htbp]",
        "  \\centering",
        "  \\caption{有符号角偏差 $\\Delta\\theta$ 的单样本 $t$ 检验（检验值 = 0°）}",
        "  \\label{tab:infer-ttest}",
        "  \\begin{tabular}{lcccccc}",
        "    \\toprule",
        "    条件 & $M$ (°) & $SD$ (°) & $t$ & $df$ & $p$ & Cohen's $d$ \\\\",
        "    \\midrule",
    ]
    for _, r in tt.iterrows():
        lines.append(
            f"    {r['condition']} & {r['mean']:.2f} & {r['sd']:.2f} & "
            f"{r['t']:.3f} & {int(r['df'])} & {_fmt_p(r['p'])} & {r['cohen_d']:.3f} \\\\"
        )
    lines.extend(
        [
            "    \\bottomrule",
            "  \\end{tabular}",
            "  \\begin{flushleft}",
            "    \\footnotesize 注：$p$ 值采用双尾检验。",
            "  \\end{flushleft}",
            "\\end{table}",
            "",
        ]
    )
    out_path.write_text("\n".join(lines), encoding="utf-8")


def run_correlations(df: pd.DataFrame) -> dict:
    r_raw, p_raw = stats.pearsonr(df[COL_E], df[COL_ABS_ERROR])
    df_c = df.copy()
    for col in [COL_E, COL_ABS_ERROR]:
        df_c[f"{col}_c"] = df_c.groupby("subject_id")[col].transform(lambda x: x - x.mean())
    r_within, p_within = stats.pearsonr(df_c[f"{COL_E}_c"], df_c[f"{COL_ABS_ERROR}_c"])
    return {
        "pearson_r": float(r_raw),
        "pearson_p": float(p_raw),
        "within_subject_r": float(r_within),
        "within_subject_p": float(p_within),
    }


def run_mixed_lm(df: pd.DataFrame, exclude_subjects: set[str] | None = None) -> dict:
    sub = df.copy()
    if exclude_subjects:
        sub = sub[~sub["subject_id"].isin(exclude_subjects)]
    sub["E_z"] = (sub[COL_E] - sub[COL_E].mean()) / sub[COL_E].std(ddof=0)
    sub["show_T_z"] = (sub["show_T"] - sub["show_T"].mean()) / sub["show_T"].std(ddof=0)
    model = MixedLM.from_formula(
        f"{COL_ABS_ERROR} ~ E_z + show_T_z",
        groups="subject_id",
        data=sub,
    )
    fit = model.fit(reml=True)
    return {
        "n_obs": int(fit.nobs),
        "n_groups": int(sub["subject_id"].nunique()),
        "exclude_subjects": sorted(exclude_subjects) if exclude_subjects else [],
        "params": {k: float(v) for k, v in fit.params.items()},
        "pvalues": {k: float(v) for k, v in fit.pvalues.items()},
        "aic": float(fit.aic) if np.isfinite(fit.aic) else None,
    }


def inferential_to_dict(
    rm: dict,
    ttests: pd.DataFrame,
    corr: dict,
    mixed_all: dict,
    mixed_no10: dict,
) -> dict:
    aov = rm["anova_table"]
    effect = aov.loc[aov["Source"] != "Error"].iloc[0]
    err = aov.loc[aov["Source"] == "Error"].iloc[0]
    sph = rm["sphericity"]
    return {
        "rm_anova": {
            "F": float(effect["F"]),
            "df1": int(effect["DF"]),
            "df2": int(err["DF"]),
            "p": float(effect["p_unc"]),
            "p_gg": float(effect["p_GG_corr"]),
            "eta_p2": float(effect.get("np2", np.nan)),
            "sphericity_W": float(sph.W),
            "sphericity_p": float(sph.pval),
            "sphericity_ok": bool(sph.spher),
        },
        "posthoc": rm["posthoc"].to_dict(orient="records"),
        "one_sample_t": ttests.to_dict(orient="records"),
        "correlation": corr,
        "mixed_lm_all": mixed_all,
        "mixed_lm_no_subject10": mixed_no10,
    }


def run_inferential(df: pd.DataFrame, *, output_dir: Path = OUTPUT_DIR) -> dict:
    tab_dir = output_dir / "tables"
    tab_dir.mkdir(parents=True, exist_ok=True)

    rm = run_rm_anova(df)
    write_rm_anova_tex(rm, tab_dir / "inferential_rm_anova.tex")
    write_posthoc_tex(rm, tab_dir / "inferential_posthoc.tex")

    ttests = run_one_sample_ttests(df)
    write_ttest_tex(ttests, tab_dir / "inferential_ttest.tex")

    corr = run_correlations(df)
    flagged = set(df.loc[df["subject_sensitivity_flag"], "subject_id"].unique())
    mixed_all = run_mixed_lm(df)
    mixed_no10 = run_mixed_lm(df, exclude_subjects=flagged if flagged else {"0010"})

    result = inferential_to_dict(rm, ttests, corr, mixed_all, mixed_no10)
    (output_dir / "stats.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return result


if __name__ == "__main__":
    from preprocess import preprocess

    prep = preprocess()
    stats_out = run_inferential(prep.formal_clean)
    print(json.dumps(stats_out["rm_anova"], indent=2))
