# 分析代码

`preprocess.py` 可读取 schema v2 CSV，也会把历史 `physicsKind`、`theta_actual_*` 和 `omega_actual_*` 映射到新命名。默认数据目录是 `archive/legacy-protocol/formal-raw-data`；分析新数据时可向 `preprocess(data_dir=...)` 或 `load_all_csv(data_dir=...)` 传入目录。

```bash
uv sync
uv run python analysis/analyze.py
```

生成结果写入 `analysis/output/`。历史分析结果保存在 `archive/legacy-protocol/analysis-output/`。

