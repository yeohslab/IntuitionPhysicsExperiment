# 训练一：数据字典（协议 1.0.0）

CSV 列见 `src/experiments/training-1/exportStimulusCsv.ts` 中的 `TRAINING_1_CSV_COLUMNS`，数据 schema 为 7。

| 列 | 说明 |
| --- | --- |
| `training_segment` | `guided_1`–`guided_3`、`assessment_1`、`remediation` 或循环复用的 `assessment_2` |
| `mode` | `guided` / `assessment` |
| `stage_round_index` | 有反馈基础练习为 1–3；补强和测验为 1 |
| `target_bin_index` | 基础/补强练习为八等分区间 0–7；无反馈测验为六等分区间 0–5 |
| `assessment_attempt` | 无反馈测验的实际轮次，从 1 开始并随循环递增；其他阶段为空 |
| `feedback_shown` | 本试次是否显示真值反馈 |
| `initial_direction` | 非静止为 `rightward`，静止为 `stationary` |
| `motion_loop_mode` | 非静止为 `ping_pong`，静止为 `stationary` |
| `track_left_x_m` / `track_right_x_m` | 固定轨道左右端点，分别为 $-4$ 和 $4\,\mathrm{m}$ |
| `initial_x_m` | 非静止为左端 $-4\,\mathrm{m}$，静止为中央 0 |
| `report_available_at_sec` | 固定为 $4\,\mathrm{s}$ |
| `first_traversal_duration_sec` | 非静止小球首次左→右横穿时长 $8/v$；静止为空 |
| `motion_elapsed_at_confirmation_sec` | 从小球开始运动到被试确认时的累计时间 |
| `feedback_phase_skipped` | 是否在该试次点击“跳过反馈阶段”，从而跳过剩余有反馈练习；其他试次为 `false` |
| `target_strip_position` | 生成刺激时的目标色带位置 $p\in[0,1]$ |
| `linear_speed_m_per_sec` | 小球真实恒定线速度 |
| `speed_strip_position` | 被试报告的色带位置 |
| `speed_strip_truth_position` | 真实速度对应的色带位置 |
| `delta_strip_position` / `abs_delta_strip_position` | 有符号/绝对色带位置误差 |
| `speed_scale_energy_j` | 色带右端标定能量，固定为 $11.48\,\mathrm{J}$ |
| `speed_scale_linear_v_max_m_per_sec` | 色带右端线速度，约 $4.791659\,\mathrm{m/s}$ |
| `speed_scale_omega_max_rad_per_sec` | 实验四中等效角速度，约 $1.197915\,\mathrm{rad/s}$ |
| `speed_reported_m_per_sec` | 被试色带选择换算的线速度 |
| `rt_speed_sec` | 色带出现后到首次选择的时间 |
| `rt_total_sec` | 色带出现后到确认的时间 |
| `mastery_passed` / `mastery_passed_attempt` | 最终是否达标及通过的测验轮次 |
| `completed_guided_trials` | 实际完成的有反馈练习数：$24+8\times$ 补强轮数 |
| `completed_assessment_trials` | 实际完成的无反馈测验数：$6\times$ 测验轮数 |
| `mastery_final_mean_abs_error` | 最终一套测验的平均绝对色带误差 |
| `mastery_final_within_threshold_count` | 最终一套测验中绝对误差不超过 0.25 的次数 |
