# 运行时刺激生成

正式实验**不再**使用预置 `stimulus-01.json` … `stimulus-05.json`。被试在首页输入组别与被试编号后，由 [`src/stimulate/generateRuntimeSet.ts`](../src/stimulate/generateRuntimeSet.ts) 当场生成完整 `ExperimentStimulusSet`，写入 `sessionStorage` 后进入运行页。

## 入口

```
StartView → generateRuntimeStimulusSet({ group, subjectId }) → sessionStorage → RunnerView → buildTimeline
```

- 随机源：[`cryptoRandom`](../src/stimulate/cryptoRandom.ts)（`crypto.getRandomValues`）
- 指导语文案：[`instructions.ts`](../src/stimulate/instructions.ts)（内联 HTML，经 DOMPurify 消毒后渲染）

## 生成规则

### 能量分段

- **组 1（摆动）**：\([1.96,\, E_c]\,\mathrm{J}\)，\(E_c = 2mgl = 78.4\,\mathrm{J}\)
- **组 2（旋转）**：\([E_c,\, 2E_c] = [78.4,\, 156.8]\,\mathrm{J}\)
- 各区间等分为 **16** 段，剔除最靠近 \(E_c\) 的 **1** 段，保留 **15** 个能量中点 \(E_\mathrm{mid}\)

实现见 [`energySegments.ts`](../src/physics/energySegments.ts)。

### 宏观 sequence

```
欢迎 Rest → 结构说明 Rest → 练习 Rest → 练习 Block（9 Trial）
→ [Block 前 Rest 1/15 → Block 1] → … → [Block 前 Rest 15/15 → Block 15]
```

- **15 个正式 Block** 在生成时随机打乱；Block 前 Rest 的进度文案**不**随打乱改变
- **练习 Block**：能量为区间中点，timing 3×3 全交叉共 9 个**练习 Trial**；单元类型 `pendulumStimulus`，`segment_kind=practice`，含反馈阶段，不计入正式分析
### 每个正式 Block

- **9** 个 Trial，每个 Trial：`注视点 +` → `pendulumStimulus`
- **timing 全交叉**：`hide1T` ∈ {0.5, 0.6, 0.7} s × 组专属 `show1T`（摆动 {1.25, 1.5, 1.75} T；旋转 {2.5, 3, 3.5} T），共 9 种组合各出现一次，Block 内顺序随机
- **淡出**：摆动 \(0.25\,T\)；旋转 \(0.5\,T\)（写入 `fadeMs`，不计入 `hide1T`）
- 目标能量：该 Block 对应段的 \(E_\mathrm{mid}\)
- 初态拟合：[`fitPendulumDiscreteTrial`](../src/physics/pendulumUnitFit.ts)（θ₀ 网格扫描 + 局部求精；ω₀ 符号顺序由 rng 随机；淡出按区制）

### 约束

- 组 1 试次 `pendulum_regime` 为 `oscillation`；组 2 为 `rotation`（临界附近允许 `critical`）
- hide 时段无转向（[`hideIntervalHasNoTurning`](../src/physics/pendulumHideConstraint.ts)）
- 生成后执行 [`assertRuntimeStimulusSet`](../src/stimulate/generateRuntimeSet.ts)

## 校验

```bash
npm run verify-runtime-generator
```

抽检两组（摆动/旋转）完整生成结果，并统计 ω₀ 符号分布。

## 终点角分布图

对 `stimulate/stimulus_set_group*_subject*.json` 中正式 Block 试次，用物理引擎重算仿真终点角并绘制直方图：

```bash
npx tsx scripts/plot-stimulate-end-theta-hist.ts
```

输出：

- `end_theta_hist_group1.png` — 组1（摆动）
- `end_theta_hist_group2.png` — 组2（旋转）
- `end_theta_by_group.csv` — 逐试次终点角数据

## 相关文件

| 文件 | 作用 |
|------|------|
| `src/start/StartView.ts` | 采集组别/编号，调用生成器 |
| `src/shared/storage.ts` | `SESSION_STIMULUS_KEY`、`SESSION_MOTION_GROUP_KEY` |
| `src/runner/buildTimeline.ts` | 将 sequence 转为 jsPsych 时间线 |
| `scripts/verify-runtime-generator.ts` | 生成器集成测试 |

## 归档说明

`data/formal_raw_data/` 下 CSV 为**既往正式实验**导出数据（旧版协议，可能与当前 2×3×3 设计不同）。勿与当前运行时生成逻辑混用。
