# 精简刺激集 JSON（schema v2）

文件名保持 `stimulus_set_groupX_subjectXXXX.json`。首页手动导出、正常结束和中断结束共用同一序列化器。

```json
{
  "schema_version": 2,
  "participant": {
    "subject_id": "0001",
    "motion_group": 1,
    "gender_code": 0,
    "age_years": 20
  },
  "trials": []
}
```

`trials` 恰有 144 项：9 个练习 Trial 和 135 个正式 Trial。它不包含欢迎页、指导语、休息页、注视点、图片、估计响应、反应时或反馈。

## Trial 字段

| 类别 | 字段 |
|---|---|
| 标识 | `trial_id`, `unit_id`, `unit_type`, `physics_kind` |
| 结构 | `segment_kind`, `block_index`, `trial_index_in_block`, `formal_trial_index` |
| 物理 | `pendulum_E_J`, `pendulum_T_sec`, `pendulum_regime`, `rod_length_m`, `gravity_m_per_sec2` |
| 时序 | `total_time_T`, `show_T`, `fade_T`, `hide_T`, `total_time_sec`, `show_sec`, `fade_sec`, `hide_sec` |
| 尺度 | `speed_bar_v_max_m_per_sec`, `w_max_deg` |
| 初态 | `theta_x_0_deg`, `theta_x_0_rad`, `omega_x_0_deg_per_sec`, `omega_x_0_rad_per_sec`, `linear_speed_x_0_m_per_sec` |
| 终态 | `theta_x_t_deg`, `theta_x_t_rad`, `omega_x_t_deg_per_sec`, `omega_x_t_rad_per_sec`, `linear_speed_x_t_m_per_sec` |

练习 Trial：`segment_kind="practice"`、`block_index=0`、`formal_trial_index=null`。正式 Trial：`segment_kind="block"`、`block_index=1..15`、`formal_trial_index=1..135`。

示例 Trial：

```json
{
  "trial_id": "trial-id",
  "unit_id": "unit-id",
  "segment_kind": "block",
  "block_index": 1,
  "trial_index_in_block": 1,
  "formal_trial_index": 1,
  "unit_type": "pendulumStimulus",
  "physics_kind": "pendulum",
  "pendulum_E_J": 71.23375,
  "pendulum_T_sec": 0,
  "pendulum_regime": "oscillation",
  "rod_length_m": 4,
  "gravity_m_per_sec2": 9.8,
  "total_time_T": 0,
  "show_T": 1.25,
  "fade_T": 0.25,
  "hide_T": 0,
  "total_time_sec": 0,
  "show_sec": 0,
  "fade_sec": 0,
  "hide_sec": 0.8,
  "speed_bar_v_max_m_per_sec": 11.9359750335,
  "w_max_deg": 0,
  "theta_x_0_deg": 0,
  "theta_x_0_rad": 0,
  "omega_x_0_deg_per_sec": 0,
  "omega_x_0_rad_per_sec": 0,
  "linear_speed_x_0_m_per_sec": 0,
  "theta_x_t_deg": 0,
  "theta_x_t_rad": 0,
  "omega_x_t_deg_per_sec": 0,
  "omega_x_t_rad_per_sec": 0,
  "linear_speed_x_t_m_per_sec": 0
}
```

示例中的零值仅用于展示结构；真实文件由生成器写入经验证的有限数。

