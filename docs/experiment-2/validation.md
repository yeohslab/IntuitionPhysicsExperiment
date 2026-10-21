# 实验二：验证与复现（协议 2.0.0）

```bash
npm run verify-experiment-2
npm run verify-all
npm run build
```

`verify-experiment-2` 检查：

- 1×9 练习 + 3×50=150 正式 Trial；
- 每 Block 单一 `hide_sec`（0.7 / 1.0 / 1.3 s），10 能量各 5 次；
- `show_T = 1.2`；终态角落在对应基准邻域（拟合容差 1°）；
- 协议 `2.0.0`、颜色标尺与导出文件名 `experiment-2_v2.0_*`；
- 150 条完成判定与 schema v3 JSON/CSV。
