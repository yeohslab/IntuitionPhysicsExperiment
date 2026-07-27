# 正式实验原始数据（归档）

本目录保存**既往正式实验**导出的被试 CSV（`experiment_data_subjectXXXX.csv`）。

## 协议版本

- **采集时协议**：单旋转区能量、25 Block × 5 Trial（125 试次/被试）、五份固定 JSON 刺激集 + 确定性 Block 打乱
- **当前程序协议**：2×3×3 混合设计、组间摆动/旋转、15 Block × 9 Trial（135 试次/被试）、运行时真随机生成

分析这些 CSV 时请参阅 [`data_feature.md`](../data_feature.md) 末尾「协议版本说明」，勿与当前 `src/stimulate/generateRuntimeSet.ts` 逻辑混用。

## 分析

统计脚本入口：`data_analysis/analyze.py`（输出见 `data_analysis/output/`）。
