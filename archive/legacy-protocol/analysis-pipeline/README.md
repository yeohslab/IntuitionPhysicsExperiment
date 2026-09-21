# 旧协议分析流水线（归档）

针对 **旧 25×5 协议** 采集 CSV 的 Python 脚本，已从仓库根目录迁入此处。**正式收数后的统计分析在实验室独立进行**，不在本 Web 实验仓库内维护。

## 目录

| 路径 | 内容 |
|---|---|
| `../formal-raw-data/` | 旧协议原始 CSV |
| `../analysis-output/` | 既往分析结果（表、图、stats.json） |
| `analysis-pipeline/`（本目录） | `preprocess.py`、`analyze.py` 等脚本 |
| `output/`（gitignore） | 本地重跑脚本时的临时输出 |

`preprocess.py` 可读取 schema v2 CSV，并映射历史列名（`physicsKind` → `physics_kind` 等）。默认读取 `../formal-raw-data/`。

## 运行（仅复现旧分析时）

在仓库根目录：

```bash
uv sync
uv run python archive/legacy-protocol/analysis-pipeline/analyze.py
```

新实验数据请复制到实验室分析环境，**勿** 与 `formal-raw-data/` 混放。
