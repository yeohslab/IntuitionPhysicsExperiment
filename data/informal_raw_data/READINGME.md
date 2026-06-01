# informal_raw_data 实验 CSV 字段说明

本文档说明 `*_experiment_data.csv`（如 `0002_experiment_data.csv`）中**关键列**的含义与计算公式。数据由运行页结束时导出（[`src/runner/exportStimulusCsv.ts`](../../src/runner/exportStimulusCsv.ts)），仅包含 **摆球/弹簧刺激试次**（`trial_type = physics-stimulus`）。

> **注意**：本目录下的 informal 文件为改版**之前**采集（`estimate_arc`，含不确定度滑块与单试次得分）。当前运行版本为 **`estimate_point`**（点估计一步确认，反馈仅蓝色真值）。

## 坐标与符号约定（摆球）

- 摆角 **θ**：θ = 0 为竖直向下，**顺时针为正**（度/弧度字段一致）。
- 能量 **E**（J）：$E = \frac{1}{2} m (l\omega)^2 + m g l (1-\cos\theta)$，$m=1\,\mathrm{kg}$，势能零点在最低点。
- **真值角度** `theta_actual_*`：该试次**全部仿真时段结束瞬间**的摆角（非中间可见段）。

## 标识与元数据

| 字段 | 含义 |
|------|------|
| `subject_id` | 四位被试编号（如 `0002`） |
| `stimulus_set_index` | 预置刺激集索引 **0–4**，对应 `stimulus-01.json` … `stimulus-05.json` |
| `trial_index` | jsPsych **全局**试次序号（含指导语、观察、注视点等所有 trial） |
| `response_mode` | 摆球/弹簧：`estimate_point` |
| `physicsKind` | `pendulum` 或 `spring` |

## 摆球：刺激与运动学

| 字段 | 含义 |
|------|------|
| `pendulum_E_J` | 该试次初始条件对应的机械能 $E$（J） |
| `pendulum_T_sec` | 周期 $T$（s） |
| `pendulum_regime` | `oscillation` / `rotation` / `critical` |
| `stimulus_time_phases_json` | 显示/隐藏时段 JSON |
| `total_time_T` | 仿真总时长（×$T$ 与 hide 秒数之和） |

## 摆球：点估计作答（当前版本）

| 字段 | 含义 |
|------|------|
| `theta_estimated_deg` / `theta_estimated_rad` | 被试确认的位置（度/弧度） |
| `theta_actual_deg` / `theta_actual_rad` | 仿真结束真值 θ |
| `delta_theta_deg` / `abs_delta_theta_deg` | 估计与真值差及绝对误差（度） |
| `rt_estimate_sec` | 进入作答到确认用时（s） |

## 弹簧：点估计作答

| 字段 | 含义 |
|------|------|
| `x_estimated_m` / `x_actual_m` | 相对平衡位置的估计/真值位移（m） |
| `delta_x_m` / `abs_delta_x_m` | 差值与绝对误差 |
| `rt_estimate_sec` | 作答 RT（s） |

## 旧版 estimate_arc 列（当前试次为空）

`arc_half_width_deg`、`interval_hit`、`trial_score`、`rt_arc_sec`、`interval_half_width_m` 等列在 CSV 表头中保留，**estimate_point** 试次不写入（留空）。历史 informal 文件可能仍有值。

## 参考源码

- 列定义：[`src/runner/exportStimulusCsv.ts`](../../src/runner/exportStimulusCsv.ts)
- 运行插件：[`src/runner/plugins/physicsStimulusPlugin.ts`](../../src/runner/plugins/physicsStimulusPlugin.ts)
