# 实验三：刺激 JSON schema

导出文件名为 `experiment-3_stimulus_set_subjectE3-0001.json`，顶层结构为：

```json
{
  "schema_version": 1,
  "experiment_id": "experiment-3",
  "protocol_version": "1.0.0",
  "participant": {},
  "trials": []
}
```

`trials` 按实际呈现顺序包含9条练习和180条正式刺激。每条记录包含运动条件、Block和Trial索引、完整时序与物理初末状态，以及固定的速度提示字段：

```json
{
  "speed_cue_type": "level-bars",
  "speed_bar_v_min_m_per_sec": 0,
  "speed_bar_v_max_m_per_sec": 14.515508947329405
}
```

刺激 JSON 不包含被试作答；作答只出现在运行结束或中断时导出的 CSV 中。
