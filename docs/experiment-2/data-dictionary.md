# 实验二 CSV 数据字典（协议 2.0.0，schema v1）

CSV 只包含已确认的正式响应。核心字段如下：

| 字段 | 类型/单位 | 含义 |
|---|---|---|
| `experiment_id` | string | 固定为 `experiment-2` |
| `protocol_version` | string | 当前为 `2.0.0` |
| `data_schema_version` | integer | 当前为 `1` |
| `subject_id` | string | `E2-0001` 格式 |
| `motion_condition` | string | `oscillation` 或 `rotation`，为 Trial 级属性 |
| `speed_cue_type` | string | 固定为 `color-strips` |
| `speed_color_v_min_m_per_sec` | m/s | 固定为 0 |
| `speed_color_v_max_m_per_sec` | m/s | 固定为 `15.336231610144651`，对应 117.6 J 在最低点的线速度 |
| `block_index` | integer | 正式呈现顺序 1–3；练习为 0 |
| `trial_index_in_block` | integer | Block 内 1–50；练习 Block 为 1–9 |
| `formal_trial_index` | integer | 正式呈现顺序 1–150 |

完成文件名为 `experiment-2_v2.0_data_subjectE2-0001_f.csv`，中断为同名 `_nf.csv`。运动类别由每条 Trial 的 `motion_condition` 与 `pendulum_regime` 表示。空值序列化为空单元格。
