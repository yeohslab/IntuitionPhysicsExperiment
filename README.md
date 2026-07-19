# 直觉物理实验（Intuition Physics Experiment）

基于浏览器与 [jsPsych 8](https://www.jspsych.org/) 的单摆内部模拟与状态估计范式。被试在部分遮挡条件下观察单摆运动，在心中延续动力学，并在提示音响起时对摆角做点估计。

## 快速开始

```bash
npm install
npm run dev          # 开发服务器，打开 #/start
npm run build        # 生产构建到 dist/
npm run verify-all   # 物理精度 + 运行时刺激生成自检
```

正式实验须从首页 **「开始实验」** 进入：输入组别（1=摆动，2=旋转）与被试编号后，程序使用 `crypto.getRandomValues` **运行时真随机**生成当次刺激集，写入 `sessionStorage` 再进入运行页。

## 实验设计概要

- **设计**：2（运动方式，组间）× 3（遮挡时长，组内）× 3（可视时长，组内）
- **组 1（摆动）**：能量区间 \([1.96,\, 78.4]\,\mathrm{J}\)；**组 2（旋转）**：\([78.4,\, 156.8]\,\mathrm{J}\)
- **结构**：1 个练习 Block（9 Trial，练习能量）+ 15 个正式 Block × 9 个刺激 Trial
- **汇报**：摆弧点估计；仿真阶段底部显示只读**速度指示条**（\(|ω|/ω_{\max}\)，白→红渐变，无数字）

详细说明见 [READINGME.md](READINGME.md)（设计备忘）与 [ExperimentDesign.md](ExperimentDesign.md)（完整设计文档）。

## 目录

| 路径 | 说明 |
|------|------|
| `src/start/` | 首页：组别 + 被试编号，触发运行时生成 |
| `src/stimulate/` | `generateRuntimeStimulusSet`、指导语文案、`cryptoRandom` |
| `src/physics/` | 单摆动力学、拟合、渲染、时序 |
| `src/runner/` | jsPsych 时间线、刺激插件、CSV 导出 |
| `data/` | 数据字段说明；`formal_raw_data/` 为既往正式数据 |
| `data_analysis/` | Python 分析流水线（针对已采集的 CSV） |

## 数据导出

实验结束后自动下载 `experiment_data_subjectXXXX.csv`（`XXXX` 为四位被试编号）。字段说明见 [data/data_feature.md](data/data_feature.md)。

## 校验

| 命令 | 内容 |
|------|------|
| `npm run verify-physics` | 椭圆周期、能量守恒、相位求解 |
| `npm run verify-runtime-generator` | 15 Block × 9 Trial、timing 全交叉、hide 无转向、ω₀ 符号抽检 |
| `npm run verify-pendulum-arc-score` | 摆角误差与折返规则 |
