# 直觉物理实验：PsychoPy 眼动版

本目录提供 PsychoPy 呈现与 EyeLink 采集程序，对应训练一 1.0.0、实验二 2.0.0、实验四 v2 2.0.0 和实验五 v3 3.0.0。启动页自动调用原项目生成器创建会话，需安装 Node.js 和项目依赖；运行已有会话只需 Python 环境，不依赖浏览器或 Node.js。

## 安装

在 Windows x64 安装 Python 3.11 x64，按 [安装说明](docs/INSTALL.md) 运行 `install.ps1`。本目录已有 `.venv` 时安装脚本不会覆盖它。要在另一台电脑使用时，请在该电脑重新安装依赖。

## 用新 GUI 为每位被试生成会话

在项目根目录安装原项目 Node 依赖和本目录导出器的开发依赖（只需一次）：

```powershell
npm install
npm install --prefix eye_movement_version/tools
```

在 `eye_movement_version` 目录运行 `.\.venv\Scripts\python.exe .\run_experiment.py` 会打开新的 GUI。选择实验、输入 1–9999 的被试序号、性别、年龄和 tracker；“实验窗口大小”下拉框可选 50%、60%、70%、80%、90%、100%，默认 80%。点击开始后，GUI 自动生成带实验前缀的编号并调用会话生成器，把新会话独占写入：

```text
eye_movement_version/sessions/<subject_id>/<experiment_id>/<UTC timestamp>_<session_id>.json
```

GUI 按配置中目标屏幕的实际工作区计算窗口，保留标题栏和边框，按 2560×1600（16:10）窗口比例等比缩放；内部逻辑界面和 1000:560 刺激画布由渲染器保持比例。100% 表示整屏居中时可完全落入工作区的最大窗口，因此会扣除任务栏、标题栏、边框和整数定位余量；其余百分比缩放这个最大尺寸。GUI 始终采用带边框的窗口模式。

Windows 上读取原生显示器工作区，并用不可见的同类 pyglet 窗口实测客户区、外框及其坐标转换；不根据系统缩放设置猜测 HiDPI 倍率。传入 PsychoPy 的尺寸为客户区坐标，实际帧缓冲尺寸由运行时读取并记录。若工作区读取失败或屏幕与客户区单位不一致，启动页会显示错误并保留输入，不生成新会话。其他平台目前请使用命令行 `--config` 明确配置窗口尺寸。

GUI 会保留已有会话，不覆盖相同路径的文件；正式开始前会显示该被试的历史运行摘要。每次点击开始都会从当前网页源码生成指导语与试次参数，并记录源码 SHA-256；选择 `eyelink` 或 `dummy` 使用同一份新会话。修改网页后，请通过 GUI 开始或命令行 `--experiment` 生成新会话。显式 `--session` 会按归档内容运行，不会自动替换其中的旧指导语或参数；`--validate` 只验证结构与物理参数，不验证是否为最新源码。若需要脚本化生成，也可使用：

```powershell
npx tsx eye_movement_version/tools/exportSession.ts --experiment experiment-4-v2 --subject E4-0001 --gender 0 --age 25 --seed 37 --output eye_movement_version/sessions/E4-0001.json
```

`--experiment` 可选 `training-1`、`experiment-2`、`experiment-4-v2`、`experiment-5-v3`；相应编号前缀为 `T1-`、`E2-`、`E4-`、`E5-`，后接 0001–9999。性别编码沿用原项目的 0/1。可省略 `--seed` 以自动生成随机种子；保留 seed 可重现刺激参数，独立生成的 UUID 会不同。会话含被试信息，请按实验室隐私规则保管，不要提交到公开仓库。更多字段见 [会话格式](docs/session-schema.md)。

## 验证与启动

在本目录执行：

```powershell
.\.venv\Scripts\python.exe .\run_experiment.py --session .\sessions\E4-0001.json --validate
.\.venv\Scripts\python.exe .\run_experiment.py --session .\sessions\E4-0001.json --tracker dummy --smoke-seconds 8
.\.venv\Scripts\python.exe .\run_experiment.py --session .\sessions\E4-0001.json --tracker eyelink
```

不带参数启动可选择实验及 tracker，并自动生成新会话；自定义配置可通过命令行的 `--config` 指定。`dummy` 不连接眼动仪，也不生成 EDF；`--headless` 使用虚拟时钟和自动回答，仅用于流程排查。`--smoke-seconds` 是短时窗口检查，并非完整实验。Esc 可中止并保留已写入的数据。

默认配置在 [default.json](config/default.json)：命令行当前使用 1000×700 窗口模式；GUI 会用所选百分比覆盖本次运行的尺寸并保持窗口模式，运行配置快照记录 `window.launcher_percent` 和计算出的 `window.size`。命令行 `--session` / `--experiment` 的尺寸与全屏行为仍完全由配置决定。可在了解实验室屏幕设置后调整窗口尺寸、全屏、屏幕、预期刷新率、EyeLink IP、采样率、HV13 标定、音量与输出位置。用 `--config 自定义配置.json` 覆盖需要的项；自定义配置中的相对输出或音频路径相对于该配置文件所在目录。默认输出位于 `data/`，每次运行按被试和实验归档为：

```text
data/<subject_id>/<runtime_variant_id>/<runtime_variant_id>_<subject_id>_<UTC timestamp>_<unique id>/
```

第二层使用 `runtime_variant_id`，让不同协议或版本计划彼此隔离。运行目录保存会话与配置快照、行为 CSV、JSONL 事件/逐帧记录和状态；真实 EyeLink 成功传回后另有 EDF。每个运行目录使用独占创建，即使同一被试重复同一实验也会保留所有记录。升级前已经直接放在 `data/` 下的旧运行目录仍可读取，不会被移动或覆盖。采集和模拟结果均含被试资料，请备份并控制访问。

## 与网页版的参数一致性

四个实验的提示/注视时长、可视与空白时长、淡出范围、声音及反馈规则已逐项核对，详见 [参数核对记录](docs/protocol-parity.md)。实验二淡出时长随周期变化，实验五空白时长按试次计算；请勿统一改成固定 300 ms 淡出或 700 ms 空白。默认声音采用网页相同的 WAV、1.5 倍遮蔽增益及 880 Hz / 80 ms 指数衰减提示音。失焦后眼动版重新开始当前试次，属于保留的恢复策略差异。

## 正式采集前的设备验收

在实际采集电脑确认系统显示缩放、显示分辨率、刷新率和眼动仪主机坐标设置一致；PsychoPy 全屏可能使用实际屏幕尺寸而非配置请求的尺寸，应查看启动提示及运行记录。确认眼动仪网络和 IP、采样率、HV13 标定点、漂移检查、音频设备、按键和鼠标；用短测试验证事件标记、注视坐标及 EDF 在 EyeLink 软件中可打开。逐帧日志和翻屏回调时间用于软件时序分析，不能替代光电二极管或音频回路的物理延迟测量。请在真实设备上完成这些验证后再采集正式数据。
