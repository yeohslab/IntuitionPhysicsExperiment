# Python 实验环境安装与运行

本文说明如何为 `eye_movement_version` 创建独立的 Windows 眼动实验环境。安装器只在 `eye_movement_version/.venv` 中安装 Python 包，不修改仓库根目录的 Python 环境、Node 依赖或全局 Python 包。需要 Windows x64、CPython 3.11 x64 和 Python Launcher（`py.exe`）。

## 创建环境

在 PowerShell 中进入 `eye_movement_version`，执行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\install.ps1
```

安装器显式使用 `py -3.11` 创建专属 `.venv`，然后按 [requirements.txt](../requirements.txt) 安装 PsychoPy、NumPy、SciPy、SR Research PyLink 和 PsychoPy CoreGraphics bridge。pip 使用其配置的默认索引；这些固定版本可从 PyPI 获取，无需额外配置 SR Research 私有索引。

安装器不会覆盖现有 `.venv`。若它提示环境目录已存在，请先确认没有安装任务或实验进程正在使用该目录，再由操作者自行备份或移走该目录后重试。依赖安装失败时，安装器会保留环境以便诊断，不会自动删除它。

安装后可做 SDK 导入检查：

```powershell
.\.venv\Scripts\python.exe -c "import pylink; from EyeLinkCoreGraphicsPsychoPy import EyeLinkCoreGraphicsPsychoPy; print(pylink.__file__); print(EyeLinkCoreGraphicsPsychoPy)"
```

PyLink 由 `sr-research-pylink` wheel 提供。CoreGraphics bridge 包导出 `EyeLinkCoreGraphicsPsychoPy` 类；适配器构造该类实例、设置标定颜色/目标类型，再将实例传给 `pylink.openGraphicsEx(...)`。导入成功只表示软件包可加载，不会连接眼动仪、验证网络或执行标定。

## 检查与运行

以下示例使用项目的会话 JSON、默认配置和 dummy tracker。请按实际会话文件调整路径：

```powershell
.\.venv\Scripts\python.exe .\run_experiment.py --session .\sessions\your-session.json --tracker dummy --config .\config\default.json --validate
```

需要屏幕预览时，可用 dummy tracker 做短时检查：

```powershell
.\.venv\Scripts\python.exe .\run_experiment.py --session .\sessions\your-session.json --tracker dummy --config .\config\default.json --smoke-seconds 3
```

`--smoke-seconds N` 只做短屏幕检查，不会完成实验。`--headless` 用于无屏幕的模拟验证，不采集眼动数据，也不代表显示、标定或硬件已经通过验证。dummy 模式不会生成伪 EDF 文件。

## 新 GUI 与数据目录

先安装 Node.js，并在项目根目录运行 `npm install`。然后在 `eye_movement_version` 目录运行 `.\.venv\Scripts\python.exe .\run_experiment.py` 打开 GUI。选择实验、输入被试序号、性别、年龄和 tracker 后，GUI 自动生成新的 session JSON，并按以下目录保存：

```text
eye_movement_version/sessions/<subject_id>/<experiment_id>/<UTC timestamp>_<session_id>.json
```

生成器使用独占文件创建，已有 session 不会被覆盖。默认运行数据也按被试和实验归档：

```text
eye_movement_version/data/<subject_id>/<runtime_variant_id>/<runtime_variant_id>_<subject_id>_<UTC timestamp>_<unique id>/
```

第二层按 `runtime_variant_id` 归档，协议或运行版本不同的实验不会混在一起。每次运行目录包含 `session.json`、`config.json`、`software.json`、`status.json`、`behavior.csv`，以及运行过程中产生的 JSONL 记录和可能的 `recording.edf`。旧版本已经直接保存于 `data/` 下的运行目录继续保留，升级不会移动或覆盖它们；请按被试隐私要求限制整个 `sessions/` 和 `data/` 目录的访问。

只有准备开始一次真实实验时才选择 `--tracker eyelink`，例如：

```powershell
.\.venv\Scripts\python.exe .\run_experiment.py --session .\sessions\your-session.json --tracker eyelink --config .\config\default.json
```

真实采集前，请由实验操作者确认 EyeLink 主机与实验电脑的网络连接、配置中的 tracker IP、显示器分辨率与观察距离，并确认 EDF 输出和备份位置。运行真实模式会连接设备并可能开始实际记录；先选用经批准的短测试会话，按操作规程完成 EyeLink 校准和漂移检查，再确认记录停止、EDF 已传回且可以打开。仅安装依赖、成功导入 SDK 或运行 dummy/headless 检查，都不能证明硬件连接正常或受试者已校准。
