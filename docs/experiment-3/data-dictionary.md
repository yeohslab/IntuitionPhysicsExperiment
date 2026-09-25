# 实验三：数据字典

实验三 CSV 仅包含已确认的正式响应；刺激 JSON 包含9条练习与180条正式刺激的完整物理描述。

## 标识与设计字段

| 字段 | 含义 |
|---|---|
| `experiment_id` | 固定为 `experiment-3` |
| `protocol_version` | 协议版本，初始为 `1.0.0` |
| `data_schema_version` | CSV schema，初始为 `1` |
| `subject_id` | `E3-0001`–`E3-9999` |
| `motion_condition` | `oscillation` 或 `rotation` |
| `block_index` | 正式 Block 为1–20；练习为0 |
| `formal_trial_index` | 正式 Trial 为1–180；练习为空 |
| `experiment_status` | 完成为 `f`，中断或不完整为 `nf` |

## 速度提示字段

| 字段 | 值 |
|---|---|
| `speed_cue_type` | `level-bars` |
| `speed_bar_v_min_m_per_sec` | `0` |
| `speed_bar_v_max_m_per_sec` | `14.515508947329405` |

其余物理状态、时序、转向、作答误差和运行质控字段与实验二同名字段含义一致。
