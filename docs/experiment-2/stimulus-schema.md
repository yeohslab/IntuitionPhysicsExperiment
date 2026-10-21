# 实验二精简刺激集 JSON（协议 2.0.0）

导出文件名为 `experiment-2_v2.0_stimulus_set_subjectE2-0001.json`。顶层结构：

```json
{
  "schema_version": 1,
  "experiment_id": "experiment-2",
  "protocol_version": "2.0.0",
  "participant": {
    "subject_id": "E2-0001",
    "gender_code": 0,
    "age_years": 20
  },
  "trials": []
}
```

`trials` 恰有 159 项：9 个练习 Trial 和 150 个正式 Trial。每条包含物理、时序、隐藏转向、初态和终态字段，并以 `motion_condition` 表示摆动或旋转，以 `speed_cue_type`、`speed_color_v_min_m_per_sec` 和 `speed_color_v_max_m_per_sec` 记录颜色提示协议。

练习 Trial 为 `segment_kind="practice"`、`block_index=0`、`formal_trial_index=null`；正式 Trial 为 `segment_kind="block"`、`block_index=1..3`、`formal_trial_index=1..150`。
