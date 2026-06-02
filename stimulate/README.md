# 预生成刺激集（schema 5）

本目录下的 `stimulus-01.json` … `stimulus-05.json` 为**唯一数据源**：实验首页按被试编号加载对应文件，编辑页无本地草稿时默认打开 `stimulus-01.json`（经 `src/stimulate/index.ts` 在构建时打入）。勿在 `public/` 等处维护副本。

文件可由脚本按固定随机种子 **91001–91005** 生成。指导语与结构模板见 [`instruction-template.json`](instruction-template.json)（欢迎 Rest 两屏指导语、练习 1/6–6/6、各 Block 试次、Block 前进度 Rest、注视点 `+`）。手改模板或 `stimulus-01.json` 文案后，可先更新模板再运行 `npm run generate-stimulate` 全量重生成，或 `npm run sync-stimulate` 仅同步指导语到 01…05（保留各文件物理试次）。

生成规则概要：

- 全局能量 \([1.96, 78.4]\,\mathrm{J}\)（上界 \(E_c = 2mgl\)）等分为 **26** 段；剔除**最靠近** \(E_c \approx 78.4\,\mathrm{J}\) 的 **1** 段。
- **Practice** 段：**6** 个 Trial — **1**×`pendulumPractice` + **5**×`pendulumStimulus`，能量均为 \((1.96 + E_c)/2 \approx 40.18\,\mathrm{J}\)。
- **25** 个 Block，每 Block 对应 1 个保留能量段；**6** 个 Trial：**1**×`pendulumPractice` + **5**×`pendulumStimulus`，目标能量为段**中点** \(E_\mathrm{mid}\)。
- 每个摆球单元：在 \([-0.7\theta_{\max}, 0.7\theta_{\max}]\) 上均匀抽取**目标终态角**，再随机 `show1T` 与满足该能量的初态 \((\theta_0,\omega_0)\)，迭代拟合直至仿真终态角误差 ≤ 1°（`src/physics/pendulumUnitFit.ts`）。
- JSON 中 Block 按能量段**固定顺序**写入；**运行实验**时正式段（Practice 之后）仅将 **25 个 Block** 按**被试编号 + 刺激集索引**确定性打乱，Block 前进度 Rest 保持 JSON 顺序与 1/25…25/25 文案（`src/runner/shuffleSequence.ts`）。
- 顶层顺序（设计稿）：**欢迎 Rest**（阶段说明 + 实验结构，两屏）→ **Practice**（6 Trial）→ 对每个 Block：**Block 前 Rest（进度）** → **Block**（6 Trial）。
- 汇报范式：**点估计**（点击/拖动确认位置）；反馈显示**橙色**（被试选择）与**蓝色**（真值）。

各摆球刺激/练习试次的时序：`show1T` 为 \([1, 2]\) 倍周期 T（随机）；`fadeMs` 固定 **150** ms（不计入遮挡）；`hide1T` 固定 **0.5 s**。试次流程：蓝杆球 + 蓝虚线 → 淡出 150 ms（轨迹蓝→黑）→ 遮挡 0.5 s → 提示音 + 橙框/橙虚线作答；反馈约 0.3 s 后可按空格继续。`pendulumStimulus` 在 hide 时不绘制杆/球；`pendulumPractice` 在 hide 时杆/球半透明（0.45 alpha）。无全屏遮罩。

重新生成（会覆盖现有文件）：

```bash
npm run generate-stimulate
```

校验（物理精度、刺激集能量/时序、角度导出、Block 打乱等）：

```bash
npm run verify-all
```

单独审计报告见仓库根目录 `AUDIT_REPORT.md`（`npm run audit` 会更新该文件）。

实验结束后下载 **`experiment_data_subjectXXXX.csv`**（`XXXX` 为四位被试编号；无编号试跑时为 `experiment_data.csv`）。仅包含 `physics-stimulus` 摆球试次行（练习段与正式 block 均保留），**25 列**（含 `show_T`/`fade_T`/`hide_T` 与 `show_sec`/`fade_sec`/`hide_sec`/`total_time_sec` 等时序字段）。不含纯指导语试次。字段说明见 [`data_feature.md`](../data_feature.md)，列顺序见 [`src/runner/exportStimulusCsv.ts`](../src/runner/exportStimulusCsv.ts)。
