# 预生成刺激集（schema 3）

本目录下的 `stimulus-01.json` … `stimulus-05.json` 为**唯一数据源**：实验首页按被试编号加载对应文件，编辑页无本地草稿时默认打开 `stimulus-01.json`（经 `src/stimulate/index.ts` 在构建时打入）。勿在 `public/` 等处维护副本。

文件可由脚本按固定随机种子 **91001–91005** 生成；指导语以 `stimulus-01.json` 为准时运行 `npm run sync-stimulate` 同步到其余四份。

生成规则概要：全局能量 \([1.96, 156.8]\,\mathrm{J}\)；先 **Practice** 段 3 个 Trial（能量 1.96 / 79.38 / 156.8 J）；再 **10 个 Block**，每段为全局能量的 1/10，每 Block **15** 个 Trial，能量在该段内等距；每 Trial 仅 **`pendulumStimulus`**（`rodLengthM=4`, `g=9.8`）；脚本内校验结构、目标能量与解析/可运行性。

重新生成（会覆盖现有文件）：

```bash
npm run generate-stimulate
```
