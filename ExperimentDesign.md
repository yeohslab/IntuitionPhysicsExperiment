# 直觉物理实验：实验设计

## 摘要

本研究采用基于浏览器的连续心理物理学范式，考察人类被试在**部分可观测**条件下对单摆运动的**内部模拟**与**状态估计**能力。被试在短暂可见单摆运动后，于遮挡阶段在心中延续其动力学演化，并在提示音响起时刻对摆角进行点估计。

实验为 **2（运动方式，组间）× 3（遮挡时长，组内）× 3（可视时长，组内）** 混合设计：组 1 为摆动区能量试次，组 2 为旋转区能量试次。每名被试完成 **1 个练习 Block（9 Trial，不计入分析）+ 15 个正式 Block × 9 个刺激 Trial = 135** 个正式试次。刺激集在会话开始时由客户端**运行时真随机**生成并校验；实验结束后自动导出试次级 CSV（见 `data/data_feature.md`）。

---

## 1 研究问题与假设

### 1.1 研究问题

当物理运动在感知上被中断后，被试能否依据短时观察，在心理表征中延续其动力学并准确推断某一时刻的状态？

1. **状态估计精度**：遮挡结束后点估计与仿真真值的角距离。
2. **能量与运动方式**：机械能 \(E\) 与组间运动方式（摆动 / 旋转）是否影响误差。
3. **时序因素**：可视时长 `show1T`、遮挡时长 `hide1T` 的效应。
4. **个体差异**：被试间估计精度与反应时差异。

### 1.2 探索性假设（待验证）

- **H1**：能量越高或运动越复杂，\(|\Delta\theta|\) 越大。
- **H2**：有符号偏差 \(\Delta\theta\) 在各条件下均值接近零。
- **H3**：`show1T` / `hide1T` 的主效应弱于能量 \(E\)。

---

## 2 被试与分组

被试在首页输入：

| 字段 | 说明 |
|------|------|
| 组别编号 | `1` = 摆动组；`2` = 旋转组（组间） |
| 组内被试编号 | 1–9999，格式化为四位（如 `0001`） |

编号写入 `subject_id` 与 `motion_group`（CSV 列），**不**再用于选取五份固定 JSON 或确定性 Block 种子。

### 既往样本（旧版协议）

`data/formal_raw_data/` 中 8 名被试（0002–0010）数据来自**旧版**单旋转区、25 Block × 5 Trial 协议，仅供历史分析参考，与当前 2×3×3 运行时生成设计不同。

---

## 3 软件与装置

- 浏览器（Chrome / Edge 等），鼠标 + 键盘（空格确认指导语；练习 Trial 反馈阶段亦用空格继续）。
- 客户端完成物理仿真、Canvas 渲染与 CSV 导出；可静态托管（如 GitHub Pages）。

| 模块 | 路径 | 功能 |
|------|------|------|
| 运行时生成 | `src/stimulate/generateRuntimeSet.ts` | 15 Block × 9 Trial、真随机、自检 |
| 物理引擎 | `src/physics/pendulum.ts` | 能量、周期、动力学 |
| 试次拟合 | `src/physics/pendulumUnitFit.ts` | 按 \(E\) 与终态角反推初态 |
| 刺激插件 | `src/runner/plugins/physicsStimulusPlugin.ts` | 仿真时序、速度条、点估计；练习 Trial 含反馈，正式 Trial 无反馈 |
| 数据导出 | `src/runner/exportStimulusCsv.ts` | 试次级 CSV |

---

## 4 物理模型与刺激

### 4.1 固定参数

| 参数 | 取值 |
|------|------|
| 质量 \(m\) | \(1\,\mathrm{kg}\) |
| 杆长 \(l\) | \(4\,\mathrm{m}\) |
| 重力 \(g\) | \(9.8\,\mathrm{m/s^2}\) |
| 势能零点 | 最低点；\(\theta=0\) 竖直向下，顺时针为正 |

临界能量 \(E_c = 2mgl = 78.4\,\mathrm{J}\)。

### 4.2 能量水平（组间）

| 组 | 运动方式 | 能量区间 (J) | 练习段能量 |
|----|----------|--------------|------------|
| 1 | 摆动 `oscillation` | \([1.96,\, 78.4]\) | \(\approx 40.18\)（区间中点） |
| 2 | 旋转 `rotation` | \([78.4,\, 156.8]\) | \(\approx 117.6\)（区间中点） |

各区间内 16 等分后去掉最靠近 \(E_c\) 的 1 段，得 **15** 个 \(E_\mathrm{mid}\)，各对应 1 个正式 Block。

### 4.3 单试次生成

1. 在 \([-\theta_{\max},\, \theta_{\max}]\) 上均匀采样目标终态角 \(\theta_\mathrm{end}\)。
2. 给定 Block 的 timing 组合 \((\texttt{show1T},\, \texttt{hide1T})\)。
3. [`fitPendulumDiscreteTrial`](src/physics/pendulumUnitFit.ts) 反推 \((\theta_0,\, \omega_0)\)，满足能量、终态角误差 ≤ 1°、hide 无转向；\(\omega_0\) 符号扫描顺序由 rng 随机。

### 4.4 时序水平（组内）

| 变量 | 摆动组（组 1） | 旋转组（组 2） |
|------|----------------|----------------|
| `show1T` | 1.25, 1.5, 1.75（× 周期 \(T\)） | 2.5, 3, 3.5（× 周期 \(T\)） |
| `hide1T` | 0.5, 0.6, 0.7（秒） | 同左 |
| `fadeT` | 0.25（× 周期 \(T\)，不计入 `hide1T`） | 0.5（× 周期 \(T\)，不计入 `hide1T`） |

周期 \(T\)：摆动 \(T=4\sqrt{l/g}\,K(k)\)（\(k=\sin(\theta_{\max}/2)\)）；旋转 \(T=2\sqrt{l/g}\,k\,K(k)\)（\(k=\sqrt{E_c/E}\)）。

每个 Block 内 3×3 组合各出现一次，Trial 顺序随机。

---

## 5 流程结构

```
欢迎 Rest → 结构 Rest → 练习 Rest → 练习 Block（9 Trial）
→ [Rest 1/15 → Block 1 (9 Trial)] → … → [Rest 15/15 → Block 15]
```

每个刺激 Trial：**注视点** → **pendulumStimulus**（阶段见下）。

### 5.1 练习 Trial 与正式 Trial

| 类型 | 段落 | 阶段 |
|------|------|------|
| **练习 Trial** | 练习 Block（`segment_kind=practice`） | 可视 → 淡出 → 遮挡 → 汇报 → **反馈** |
| **正式 Trial** | 正式 Block（`segment_kind=block`） | 可视 → 淡出 → 遮挡 → 汇报（确认后直接进入下一试次） |

#### 阶段说明

| 阶段 | 时长 | 说明 |
|------|------|------|
| 可视 | `show1T` × \(T\) | 蓝杆/蓝虚线；摆左右**竖向线速度条**（$(v-v_{\min})/(v_{\max}-v_{\min})$） |
| 淡出 | 摆动 \(0.25\,T\) / 旋转 \(0.5\,T\) | 蓝→黑；掩蔽音 |
| 遮挡 | `hide1T` s | 仅黑虚线；掩蔽音；心中模拟 |
| 汇报 | 被试控制 | 提示音；橙框/橙虚线；点击/拖动后确认摆角（按钮或空格） |
| 反馈 | 被试控制（**仅练习 Trial**） | 橙（选择）vs 蓝（真值）；约 0.3 s 后可空格继续 |

点估计针对 \(t_\mathrm{sim,end} = \texttt{show\_sec} + \texttt{fade\_sec} + \texttt{hide\_sec}\) 的真值角。

---

## 6 因变量与协变量

主要因变量：`abs_delta_theta_deg`、`delta_theta_deg`、`rt_estimate_sec`。

试次级协变量：`pendulum_E_J`、`pendulum_T_sec`、`pendulum_regime`、`show_T` / `hide_T` / `total_time_T`、`motion_group` 等。完整字典见 [`data/data_feature.md`](data/data_feature.md)。

**正式分析试次**：`unit_type = pendulumStimulus` 且 `segment_kind = block`。每名被试 **135** 试次。

---

## 7 数据记录

- 文件名：`experiment_data_subjectXXXX.csv`
- 列数：**28**（含 `motion_group`；含仿真结束角速度 `omega_actual_*`）
- 练习 Rest / 练习 Block（`segment_kind=practice`，`unit_type=pendulumStimulus`）不产生正式分析 CSV 行；导出仅保留 `segment_kind = block`

质控与分析见 `data_analysis/preprocess.py`（针对已采集 CSV；旧版 125 试次/被试的规则需随新协议更新）。

---

## 8 可重复性

| 项目 | 说明 |
|------|------|
| 随机源 | `crypto.getRandomValues`（每次会话新刺激集） |
| 物理常数 | \(m=1\), \(l=4\), \(g=9.8\) |
| 时序 | `showLevelsForGroup`、`fadeTForGroup`、`HIDE_LEVELS_SEC` 见 `timePhases.ts` |
| 校验 | `npm run verify-all` |
| 刺激说明 | [`stimulate/README.md`](stimulate/README.md) |

---

## 参考文献（待补充）

- jsPsych：https://www.jspsych.org/
- 实现与校验：仓库根目录 `README.md`、`AUDIT_REPORT.md`
