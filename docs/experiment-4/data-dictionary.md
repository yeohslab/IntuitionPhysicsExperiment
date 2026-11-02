# 实验四：数据字典（协议 1.0.0）

CSV 列定义见 `src/experiments/experiment-4/exportStimulusCsv.ts` 中的 `EXPERIMENT_4_STIMULUS_CSV_COLUMNS`，数据 schema 为 6。

主要字段：

| 列 | 说明 |
| --- | --- |
| `visible_window_count` | 固定能量下完整左→右横穿的整球完全可见窗口数：2、3 或 4 |
| `gap_m` | 透明观察宽度，三档均固定为 $0.450000\,\mathrm{m}$ |
| `bar_width_m` | 当前条件的遮挡条宽度 |
| `grating_period_m` | 光栅周期 $P=B+G$ |
| `grating_offset_m` | 编号 $k=0$ 的遮挡条中心坐标；其他条中心为 $\mathrm{offset}+kP$ |
| `initial_side` | 初始位置位于 `left` / `right` 半边 |
| `initial_direction` | 初始运动方向 `leftward` / `rightward` |
| `theta_0_deg` / `omega_0_deg_per_sec` | 同一能量轨道上按运动时间随机抽取的初始角度与非零角速度 |
| `pendulum_E_J` | 本试次机械能（固定为区间中点 $11.48\,\mathrm{J}$） |
| `omega_max_rad_per_sec` | 本试次最低点最大角速度 |
| `speed_scale_energy_j` | 速度色带右端标定能量，固定为 $11.48\,\mathrm{J}$ |
| `speed_scale_linear_v_max_m_per_sec` | 色带右端线速度，约 $4.791659\,\mathrm{m/s}$，与训练一相同 |
| `speed_scale_omega_max_rad_per_sec` | 色带右端等效角速度，约 $1.197915\,\mathrm{rad/s}$ |
| `query_time_sec` | 询问时刻 $t_q$ |
| `query_grating_index` | 询问时最近遮挡条的整数编号 $k=\mathrm{round}((x-\mathrm{offset})/P)$ |
| `theta_q_*` / `omega_q_*` | 询问瞬间真值 |
| `linear_speed_q_m_per_sec` | 询问瞬间真实线速度 $4|\omega_q|$ |
| `theta_reported_*` | 被试报告角度 |
| `speed_strip_position` | 色带位置 $p\in[0,1]$ |
| `omega_reported_rad_per_sec` | 由固定色带尺度换算的角速度估计 |
| `linear_speed_reported_m_per_sec` | 由色带位置换算的线速度估计 |
| `delta_linear_speed_m_per_sec` / `abs_delta_linear_speed_m_per_sec` | 有符号/绝对线速度误差 |
| `response_order_first` | `angle` 或 `speed`：该试次规定先报的一项（区组内按初始位置侧 5/5 平衡） |
| `rt_angle_sec` / `rt_speed_sec` | 从询问时刻到首次点选该项的时间（s），两种顺序定义相同 |
| `visible_frame_count` | 仿真阶段完全可见帧数 |

刺激 JSON 含完整 `occlusion_timeline` 与试次描述符，供 agent 重建证据。
