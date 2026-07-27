# CSV 数据字典（schema v2）

CSV 只输出已经确认作答的正式 Block Trial。角度为顺时针正，`theta` 折返到 `(-π, π]`；`omega` 保留方向，`linear_speed=l|omega|` 始终非负。空值在 CSV 中为空单元格。

## 协议、人口学与索引

| 字段 | 类型/单位 | 含义 |
|---|---|---|
| `data_schema_version` | integer | 当前为 2 |
| `subject_id` | string | 四位被试编号 |
| `motion_group` | integer | 1 摆动；2 旋转 |
| `gender_code` | integer | 0 男；1 女 |
| `age_years` | integer / year | 年龄 |
| `experiment_status` | string | `f` 完成；`nf` 未完成 |
| `trial_id` | string | 内部 Trial ID |
| `unit_id` | string | 物理刺激单元 ID |
| `unit_type` | string | `pendulumStimulus` |
| `segment_kind` | string | CSV 中固定为 `block` |
| `block_index` | integer | 正式 Block 1–15 |
| `trial_index_in_block` | integer | Block 内 1–9 |
| `formal_trial_index` | integer | 正式呈现顺序 1–135 |
| `physics_kind` | string | 当前为 `pendulum` |

## 物理与时序

| 字段 | 类型/单位 | 含义 |
|---|---|---|
| `pendulum_E_J` | number / J | 机械能 |
| `pendulum_T_sec` | number / s | 运动周期 |
| `pendulum_regime` | string | `oscillation` / `rotation` / `critical` |
| `rod_length_m` | number / m | 杆长 |
| `gravity_m_per_sec2` | number / m/s² | 重力加速度 |
| `total_time_T` | number / T | 仿真总时长 |
| `show_T` | number / T | 可视时长 |
| `fade_T` | number / T | 淡出时长 |
| `hide_T` | number / T | 遮挡时长 |
| `total_time_sec` | number / s | `show+fade+hide` |
| `show_sec` | number / s | 可视时长 |
| `fade_sec` | number / s | 淡出时长 |
| `hide_sec` | number / s | 遮挡时长 |
| `speed_bar_v_max_m_per_sec` | number / m/s | 组内固定速度条上限 |
| `w_max_deg` | number / degree | 允许作答的运动角范围半宽 |

## 初态 `x_0` 与终态 `x_t`

`x_0` 是仿真 `t=0`；`x_t` 是 `total_time_sec` 的设计结束时刻，不是最后一帧近似值。

| 字段 | 类型/单位 | 含义 |
|---|---|---|
| `theta_x_0_deg` | number / degree | 初始方向角 |
| `theta_x_0_rad` | number / rad | 初始方向角 |
| `omega_x_0_deg_per_sec` | number / degree/s | 初始角速度 |
| `omega_x_0_rad_per_sec` | number / rad/s | 初始角速度 |
| `linear_speed_x_0_m_per_sec` | number / m/s | 初始绝对线速度 |
| `theta_x_t_deg` | number / degree | 隐藏结束方向角 |
| `theta_x_t_rad` | number / rad | 隐藏结束方向角 |
| `omega_x_t_deg_per_sec` | number / degree/s | 隐藏结束角速度 |
| `omega_x_t_rad_per_sec` | number / rad/s | 隐藏结束角速度 |
| `linear_speed_x_t_m_per_sec` | number / m/s | 隐藏结束绝对线速度 |

## 响应与误差

| 字段 | 类型/单位 | 含义 |
|---|---|---|
| `theta_estimated_deg` | number / degree | 被试点估计 |
| `theta_estimated_rad` | number / rad | 被试点估计 |
| `delta_theta_deg` | number / degree | 有符号估计误差 |
| `delta_theta_rad` | number / rad | 有符号估计误差 |
| `abs_delta_theta_deg` | number / degree | 最短/有效范围绝对角误差 |
| `abs_delta_theta_rad` | number / rad | 绝对角误差 |
| `rt_estimate_sec` | number / s | 进入估计到确认的反应时 |

## 原始计时质控

| 字段 | 类型/单位 | 含义 |
|---|---|---|
| `sim_frame_count` | integer | 仿真阶段绘制帧数 |
| `sim_max_frame_gap_ms` | number / ms | 可见标签页内相邻帧最大间隔 |
| `sim_end_overshoot_ms` | number / ms | 最后一帧超过设计结束时刻的墙钟量 |
| `sim_elapsed_actual_sec` | number / s | 去除暂停后的实际结束墙钟时长 |
| `visibility_pause_count` | integer | 标签页隐藏次数 |
| `visibility_pause_sec` | number / s | 标签页隐藏累计时间 |

目前不硬编码有效/无效阈值；应在试点后预注册排除标准。

## 文件名与历史兼容

- 完成：`experiment_data_subjectXXXX_f.csv`
- 中断：`experiment_data_subjectXXXX_nf.csv`

`analysis/preprocess.py` 会将历史 `physicsKind` 映射到 `physics_kind`，并将 `theta_actual_*`、`omega_actual_*` 映射到对应 `x_t` 列。新 CSV 不输出这些历史别名。

