# 实验五协议 2.0 数据字典

协议号为 `2.0.0`，刺激集 schema 为 7。铃铛只出现在空白开始时摆球正在朝向的那一侧。空白从向上到达 \(h_{\mathrm{vis}}\) 开始，到这次上摆端点之后 0.30 s 结束，时长不固定。可见片段数由这段窗口和光栅决定，可以为 0。铃铛高度偏移为 `-0.50`、`-0.30`、`-0.10`、`+0.10`、`+0.30`、`+0.50` m。

主要字段：

| 字段 | 含义 |
| --- | --- |
| `state_site_id` | 当前振幅和上摆方向，形如 `approach-60-right` |
| `amplitude_deg` / `energy_J` | 振幅区组与单位质量机械能 |
| `grating_condition` / 光栅米制字段 | G1/G2/G3及完整几何 |
| `visible_segments_json` | 计划可见片段及截断标记；片段数随窗口和光栅变化 |
| `blank_duration_sec` | 从 \(h_{\mathrm{vis}}\) 上穿到端点后 0.30 s 的时长 |
| `delta_h_m` / `bell_contact_height_m` | 铃铛相对能量边界的高度偏移与实际接触高度 |
| `bell_theta_deg` / `bell_side` | 铃铛轨道位置和侧别 |
| `correct_response` | 端点加摆球角半径盖住铃铛为 `reachable`，否则为 `unreachable` |
| `planned_visible_turn/contact` | 计划可见窗口中的显示线索；按本窗口应为假 |
| `actual_visible_turn/contact` | 实际显示帧中的线索及首次帧/时刻 |
| `response_judgment` / `response_key` / `rt_sec` | 无超时可达性作答 |
| `timing_valid` | 无页面隐藏、帧间隔合格且每个可见片段至少两帧 |

刺激 JSON 保留完整片段、上摆窗口和铃铛参数。导出文件名使用 `experiment-5_v2.0_*`。
