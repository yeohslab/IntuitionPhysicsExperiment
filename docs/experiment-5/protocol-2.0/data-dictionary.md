# 实验五协议 2.0 数据字典

协议号为 `2.0.0`，刺激集 schema 为 11，数据 schema 为 5。正式振幅为 75°、65°、55°，练习为 60°。每个被试的练习和每个振幅区组都左右等数。摆球从出发侧最外遮挡条外沿朝铃铛运动。0.10 s 全空白结束时摆球到达振幅减 \(9^\circ\) 的最低铃铛位置，空白继续到该侧最高点，`query_time_sec` 是到达最高点的时刻。可见片段数由这段窗口和光栅决定；上述四档的每个光栅都至少有一段露出。铃铛角度偏移为 \(\pm 3^\circ\)、\(\pm 6^\circ\)、\(\pm 9^\circ\)。按键固定为 F 会到达、J 不会到达，从第一条朝向铃铛的间隙起即可作答。

主要字段：

| 字段 | 含义 |
| --- | --- |
| `state_site_id` | 当前振幅和上摆方向，形如 `approach-70-right` |
| `amplitude_deg` / `energy_J` | 振幅区组与单位质量机械能 |
| `grating_condition` / 光栅米制字段 | G1/G2/G3及完整几何 |
| `visible_segments_json` | 计划可见片段及截断标记；片段数随窗口和光栅变化 |
| `blank_duration_sec` | 终点前的全空白，固定 0.10 s；`query_time_sec` 为对侧最高点 |
| `bell_angle_offset_deg` | 铃铛相对振幅的角度偏移 |
| `bell_contact_height_m` / `bell_theta_deg` / `bell_side` | 圆弧上的接触高度、轨道角度和侧别 |
| `correct_response` | 端点加摆球角半径盖住铃铛为 `reachable`，否则为 `unreachable` |
| `planned_visible_turn/contact` | 计划可见窗口中的显示线索；按本窗口应为假 |
| `actual_visible_turn/contact` | 实际显示帧中的线索及首次帧/时刻 |
| `response_judgment` / `response_key` / `rt_sec` | 无超时可达性作答 |
| `timing_valid` | 无页面隐藏、帧间隔合格且每个可见片段至少两帧 |

刺激 JSON 保留完整片段、上摆窗口和铃铛参数。导出文件名使用 `experiment-5_v2.0_*`。
