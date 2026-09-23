# 实验二 CSV 数据字典（schema v1）

实验二沿用实验一的物理、时序、终态、响应和运行质量字段，并使用独立数据协议。核心差异字段如下：

| 字段 | 类型/单位 | 含义 |
|---|---|---|
| `experiment_id` | string | 固定为 `experiment-2` |
| `protocol_version` | string | 当前为 `1.0.0` |
| `data_schema_version` | integer | 当前为 `1` |
| `subject_id` | string | `E2-0001` 格式 |
| `motion_condition` | string | `oscillation` 或 `rotation`，为Trial级属性 |
| `speed_cue_type` | string | 固定为 `color-strips` |
| `speed_color_v_min_m_per_sec` | m/s | 固定为0 |
| `speed_color_v_max_m_per_sec` | m/s | 固定为 `14.515508947329405` |
| `block_index` | integer | 正式呈现顺序1–20；练习为0 |
| `trial_index_in_block` | integer | Block内1–9 |
| `formal_trial_index` | integer | 正式呈现顺序1–180 |

实验二没有参与者级 `motion_group`；运动类别由每条 Trial 的 `motion_condition` 与 `pendulum_regime` 表示。空值仍按实验一规则序列化为空单元格。
