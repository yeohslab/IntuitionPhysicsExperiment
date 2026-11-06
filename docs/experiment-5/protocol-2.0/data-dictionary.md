# 实验五协议 2.0 数据字典

协议号为 `2.0.0`，数据 schema 为 5。CSV 每行对应一条正式铃铛可达性试次。空白固定为 0.70 s。可见片段数为光栅编号加 3。铃铛高度偏移只取 `-0.50`、`-0.30`、`-0.10` m，落在可达弧线内。可达性由这 0.70 s 空白内摆球角度是否扫过铃铛决定。

主要字段：

| 字段 | 含义 |
| --- | --- |
| `state_site_id` | 当前振幅共享的隐藏查询状态 |
| `amplitude_deg` / `energy_J` | 振幅区组与单位质量机械能 |
| `grating_condition` / 光栅米制字段 | G1/G2/G3及完整几何 |
| `visible_segments_json` | 计划可见片段及截断标记；G1为4段，G2为5段，G3为6段 |
| `delta_h_m` / `bell_contact_height_m` | 铃铛相对能量边界的高度偏移与实际接触高度 |
| `bell_theta_deg` / `bell_side` | 铃铛轨道位置和侧别 |
| `correct_response` | 空白 0.70 s 内扫过铃铛为 `reachable`，否则为 `unreachable` |
| `planned_visible_turn/contact` | 连续计划轨迹中的显示线索 |
| `actual_visible_turn/contact` | 实际显示帧中的线索及首次帧/时刻 |
| `response_judgment` / `response_key` / `rt_sec` | 无超时可达性作答 |
| `timing_valid` | 无页面隐藏、帧间隔合格且每个可见片段至少两帧 |

刺激 JSON 保留完整片段、查询态和铃铛参数。导出文件名使用 `experiment-5_v2.0_*`。
