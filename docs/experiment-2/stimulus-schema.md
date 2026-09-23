# 实验二精简刺激集 JSON（schema v1）

顶层结构：

```json
{
  "schema_version": 1,
  "experiment_id": "experiment-2",
  "protocol_version": "1.0.0",
  "participant": {
    "subject_id": "E2-0001",
    "gender_code": 0,
    "age_years": 20
  },
  "trials": []
}
```

`trials` 恰有189项：9个练习Trial和180个正式Trial。每条保留实验一相同的物理、时序、隐藏转向、初态和终态字段，并以 `motion_condition` 表示摆动或旋转，以 `speed_cue_type`、`speed_color_v_min_m_per_sec` 和 `speed_color_v_max_m_per_sec` 记录颜色提示协议。

练习 Trial 为 `segment_kind="practice"`、`block_index=0`、`formal_trial_index=null`；正式 Trial 为 `segment_kind="block"`、`block_index=1..20`、`formal_trial_index=1..180`。
