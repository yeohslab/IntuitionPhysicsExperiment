# 实验四：数据字典（协议 1.0.0）

CSV 列定义见 `src/experiments/experiment-4/exportStimulusCsv.ts` 中的 `EXPERIMENT_4_STIMULUS_CSV_COLUMNS`。

主要字段：

| 列 | 说明 |
| --- | --- |
| `gap_level` / `gap_m` | 间隙档与宽度 (m) |
| `release_side` | `left` / `right` |
| `query_time_sec` | 询问时刻 $t_q$ |
| `theta_q_*` / `omega_q_*` | 询问瞬间真值 |
| `theta_reported_*` | 被试报告角度 |
| `speed_strip_position` | 色带位置 $p\in[0,1]$ |
| `omega_reported_rad_per_sec` | $p\cdot|\omega|_{\max}$ |
| `response_order_first` | `angle` 或 `speed`：该试次规定先报的一项（区组内按释放侧 5/5 平衡） |
| `rt_angle_sec` / `rt_speed_sec` | 从询问时刻到首次点选该项的时间（s），两种顺序定义相同 |
| `visible_frame_count` | 仿真阶段完全可见帧数 |

刺激 JSON 含完整 `occlusion_timeline` 与试次描述符，供 agent 重建证据。
