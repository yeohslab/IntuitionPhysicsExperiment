# 物理与运行时校验说明

本文档描述当前仓库**自动化校验**范围。正式实验刺激由运行时生成（见 [`stimulate/README.md`](stimulate/README.md)），不再维护五份固定 JSON 或 `npm run audit`。

最后更新：与当前 `verify-all` 脚本一致。

---

## 执行方式

```bash
npm run verify-all
```

等价于依次运行：

| 命令 | 内容 |
|------|------|
| `verify-physics` | 摆球周期、往复/转圈能量守恒、相位求解 |
| `verify-runtime-generator` | 组 1/2 各生成完整刺激集；15×9 结构；timing 全交叉；hide 无转向；无 spring 单元；ω₀ 符号抽检 |
| `verify-pendulum-arc-score` | 摆角误差、折返与区间命中 |

---

## 运行时生成器（verify-runtime-generator）

- 组 1：15 能量段，\(E_\mathrm{mid}\) 落在摆动区
- 组 2：15 能量段，\(E_\mathrm{mid}\) 落在旋转区
- 每 Block 9 Trial，3×3 timing 组合无重复、无遗漏
- `fitPendulumDiscreteTrial` 产出的试次满足 hide 无转向约束
- ω₀ 正/负符号在固定种子多次拟合中应大致均衡（非严格 50:50，但不应固定负号优先）

---

## 物理精度（verify-physics）

- 椭圆函数周期与小角近似对照
- 往复：初值闭合、能量漂移阈值
- 转圈：Verlet 积分相对能量漂移
- 相位求解数值误差

---

## 角度导出（verify-pendulum-arc-score）

- 往复/转圈误差度规与 `pendulumArcScore.ts` 一致
- 区间命中与得分函数边界

---

## 已移除的校验（历史）

以下脚本与审计项随旧版固定刺激集、弹簧范式、编辑器一并废弃，**勿再引用**：

- `scripts/generate-stimulate-sets.ts`、`scripts/audit-experiment-integrity.ts`
- `scripts/verify-pendulum-display-energy.ts`、`verify-spring-arc-score.ts`
- `src/runner/shuffleSequence.ts`（确定性 Block 打乱）
- 五份 `stimulus-01.json` … `stimulus-05.json`

---

## 运行时注意事项

- 仿真时间轴由 `requestAnimationFrame` 驱动，墙钟在后台标签页可能变慢；仿真物理时间仍 cap 于 `simEndSec`（设计行为）。
- CSV 中 `theta_*_rad` 由折返后的度换算，转圈试次不保留圈数信息。

---

## 既往审计数据

`data/formal_raw_data/` 与 `data_analysis/output/` 中的报告基于**旧版协议**（单旋转区、25×5、固定 JSON）。与新 2×3×3 运行时设计并列存档，分析时须区分协议版本。
