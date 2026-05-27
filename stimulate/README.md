# 预生成刺激集（schema 5）

本目录下的 `stimulus-01.json` … `stimulus-05.json` 为**唯一数据源**：实验首页按被试编号加载对应文件，编辑页无本地草稿时默认打开 `stimulus-01.json`（经 `src/stimulate/index.ts` 在构建时打入）。勿在 `public/` 等处维护副本。

文件可由脚本按固定随机种子 **91001–91005** 生成。指导语与结构模板见 [`instruction-template.json`](instruction-template.json)（欢迎 Rest、练习 1/4–4/4、任务 Rest、各 Block 前进度 Rest、注视点 `+`）。手改模板或 `stimulus-01.json` 文案后，可运行 `npm run sync-stimulate` 将结构同步到 01…05（保留各文件物理试次）。

生成规则概要：

- 全局能量 \([1.96, 156.8]\,\mathrm{J}\) 等分为 **26** 段；剔除含临界能量 \(E_c = 2mgl \approx 78.4\,\mathrm{J}\)（往返/转圈分界）的 **1** 段。
- **Practice** 段 **4** 个 Trial，能量 **1.96 / 40.67 / 118.09 / 159.8 J**（末点略高于正式上界，仅练习用）。
- **25** 个 Block，每 Block 对应 1 个保留能量段、**5** 个 Trial；每 Trial 目标能量为该段**中点**，独立随机 \((\theta,\omega)\) 与时序。
- 顶层顺序：**欢迎 Rest** → **Practice**（4 Trial）→ **任务 Rest** → 对每个 Block：**Block 前 Rest（进度）** → **Block**（5 Trial）。
- 每个 practice / block Trial：`textDisplay` 阶段说明（仅练习）→ 注视点 `+`（1 s）→ **`pendulumStimulus`**（`rodLengthM=4`, `g=9.8`）。
- 汇报范式：**点估计 + 不确定度滑块 + 单试次得分**（无 5AFC 字段）。

各刺激试次的时序（固定种子下每试次独立均匀随机）：`show1T` / `show2T` 为 \([0.75, 1.25]\) 倍周期 T；`hide1T` / `hide2T` 为 \([0.5, 1]\) 秒。

重新生成（会覆盖现有文件）：

```bash
npm run generate-stimulate
```

校验计分与 \(w_{\max}\)：

```bash
npx tsx scripts/verify-pendulum-arc-score.ts
npx tsx scripts/verify-spring-arc-score.ts
```

实验结束后下载的 `experiment_data.csv` 仅包含 `physics-stimulus` 试次行（练习段与正式 block 均保留），列为分析字段（被试编号、摆角/弹簧位移、不确定度、单试次得分等），不含指导语试次与 `unitId` / `segmentId` 等编排列。
