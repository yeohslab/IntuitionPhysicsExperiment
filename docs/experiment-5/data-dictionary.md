# 实验五数据字典（v1.0）

每行对应一条正式可达性判断试次。核心刺激字段包括 `energy_J`、`amplitude_deg`、`target_angle_deg`、`boundary_gap_deg`、`judgment_distance_m`、`judgment_time_sec`、初态与消失状态、`side`、`reachability`、正确答案和按键映射。

响应字段包括 `response_judgment`、`response_key`、`correct`、`rt_sec`、`timed_out`。计时质量字段记录动画帧数、最大帧间隔、边界超时、页面隐藏暂停以及 `timing_valid`。

能量没有档位字段；`energy_J` 保存每条试次独立连续抽取的原始值。
