# 实验四协议 2.0 数据字典

协议号为 `2.0.0`，数据 schema 为 1。CSV 每行对应一条正式追踪试次。

主要字段：

| 字段 | 含义 |
| --- | --- |
| `state_site_id` | 未四舍五入的缩放轨道状态点标识 |
| `tracking_condition` | `no_hidden_reversal` 或 `hidden_reversal` |
| `grating_condition` | G1/G2/G3 |
| `visible_segments_json` | 三个计划可见片段及空白截断标记 |
| `blank_start_sec` / `blank_duration_sec` | 相对播放起点的空白边界与固定0.30 s时长 |
| `reversal_time_sec` | 隐藏转折相对播放起点的时刻；无反向时为空 |
| `query_theta_deg` / `query_omega_rad_per_sec` | 查询真值 |
| `theta_reported_*` / `speed_strip_position` | 角度与速度报告 |
| `actual_visible_segment_frame_counts` | 三片段实际显示帧数 |
| `actual_last_visible_frame_sec` | 实际最后可见帧相对播放起点的时刻 |
| `cue_*` / `blank_*` / `prompt_*` | 提示、空白和作答提示的性能时间戳 |
| `timing_valid` | 无页面隐藏、帧间隔合格且三个片段各至少两帧 |

刺激 JSON 保存完整三片段边界和全部物理参数。导出文件名使用 `experiment-4_v2.0_*`。
