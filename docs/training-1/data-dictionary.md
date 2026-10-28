# 训练一：数据字典（协议 1.0.0）

CSV 列见 `src/experiments/training-1/exportStimulusCsv.ts` 中的 `TRAINING_1_CSV_COLUMNS`。

| 列 | 说明 |
| --- | --- |
| `training_segment` | `anchor_demo` / `mastery_1`–`mastery_5` |
| `mastery_block_index` | 锚点为 0；计分阶段为 1–5 |
| `target_bin_index` | 连续抽样所在的色带八等分区间；锚点为空 |
| `target_strip_position` | 连续目标色带位置 $p\in[0,1]$ |
| `theta_0_deg` / `omega_0_deg_per_sec` | 本次可见轨迹初态 |
| `theta_q_deg` / `omega_q_deg_per_sec` | 询问与反馈回放终点的真实状态 |
| `speed_strip_position` | 被试报告 $p\in[0,1]$ |
| `speed_strip_truth_position` | 询问瞬间真值位置 |
| `abs_delta_strip_position` | $\|p-p_\mathrm{truth}\|$ |
| `speed_scale_omega_max_rad_per_sec` | 固定色带右端角速度（与实验四相同） |
| `mastery_passed` | 本轮是否达到训练一标准 |
| `completed_report_trials` | 实际完成的计分试次数（16/24/32/40） |
| `mastery_recent_mean_abs_error` | 最近 8 次平均绝对色带误差 |
| `mastery_recent_within_015_count` | 最近 8 次中误差不超过 0.15 的次数 |
