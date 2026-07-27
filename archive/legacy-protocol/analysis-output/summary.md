# 数据分析摘要

> **协议说明**：以下结果基于 `data/formal_raw_data/` **旧版**正式数据（25 Block × 5 Trial，无 `motion_group`）。当前程序为 2×3×3、15×9 运行时生成设计。

- 数据目录: `data/formal_raw_data`
- CSV 文件数: 8
- 原始总试次数: 1248
- 正式 block 试次（剔除前）: 1000
- 正式 block 试次（剔除后）: 980
- RT 异常剔除: 20 试次
- 被试数: 8

## 描述性统计（正式 block，剔除后）

- E (J): M=38.611, SD=21.221
- Δθ (°): M=0.250, SD=22.045
- |Δθ| (°): M=15.158, SD=16.001, Md=10.240
- RT (s): M=2.990, SD=1.906

## 推断统计

- RM-ANOVA（能量档）: F(2, 14) = 41.132, p = 0.0000, η²p = 0.855
- Pearson r(E, |Δθ|) = 0.309, p = 0.0000

## 输出

- `formal_trials_clean.csv` — 清洗后试次表
- `qc_report.md` — 质控报告
- `stats.json` — 推断统计 JSON
- `figures/` — 分析图
- `tables/` — LaTeX 表格片段
