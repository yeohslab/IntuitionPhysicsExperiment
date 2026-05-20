# 预生成刺激集（schema 3）

本目录下的 `stimulus-01.json` … `stimulus-05.json` 由仓库脚本按固定随机种子 **91001–91005** 生成，可直接在编辑页「导入 JSON」使用。

生成规则概要：全局能量 \([1.96, 156.8]\,\mathrm{J}\)；先 **Practice** 段 3 个 Trial（能量 1.96 / 79.38 / 156.8 J）；再 **10 个 Block**，每段为全局能量的 1/10，每 Block **15** 个 Trial，能量在该段内等距；每 Trial 仅 **`pendulumStimulus`**（`rodLengthM=4`, `g=9.8`）；脚本内校验结构、目标能量与解析/可运行性。

重新生成（会覆盖现有文件）：

```bash
npm run generate-stimulate
```
