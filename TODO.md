# 物理刺激单元：连续估计 + 不确定度区间（开发 TODO）

本文档约定 **`pendulumStimulus`** 与 **`springStimulus`** 的下一版汇报范式，替代二者当前的 **5AFC 键盘选择**。两单元**共用同一流程与计分逻辑**，仅一阶估计的几何与 $w_{\max}$ 来源不同。

文献参照：Fassold, Locke & Landy (2023) [*Feeling lucky?*](https://doi.org/10.1371/journal.pcbi.1010740)；Evans & Landy (2025) *Sensorimotor confidence during explicit motor adaptation*（弧/区间 + 单试次积分思想）。

---

## 0. 全局约定

### 0.1 计分范围

- **仅记录单试次** `trial_score`（$0$–$100$）；**不做** block / session **累计计分**，反馈 UI 也不显示累计分。

### 0.2 CSV 单位优先级（相对现版）

| 优先级       | 摆球                                           | 弹簧                                     |
| ------------ | ---------------------------------------------- | ---------------------------------------- |
| **主** | **度**（`_*_deg`）                     | **米**（`_*_m`，位移本身为线量） |
| **辅** | 弧度（`_*_rad`，可由度导出或内部计算后写入） | —                                       |

实现与文档默认以**度**报告摆球角度；`_*_rad` 字段保留便于与仿真内核对接，**分析时以度字段为准**。

### 0.3 共用计分（摆球 / 弹簧）

常数 $S_{\max}=100$。$w$ 为**半宽**（摆球：半张角，度；弹簧：半宽，米）。

$$
\mathrm{hit} = \begin{cases} 1 & \text{真值落在以估计点为中心、半宽为 } w \text{ 的区间内} \\ 0 & \text{否则} \end{cases}
$$

$$
\mathrm{score} = \begin{cases} 0 & \mathrm{hit}=0 \\[4pt] S_{\max}\,\left(1 - \dfrac{w}{w_{\max}}\right)^{2} & \mathrm{hit}=1 \end{cases}
$$

其中 $w_{\max}$ 为**该试次运动学可达范围对应的半宽上限**（见 §2.2、§5.2）。实现时对滑块读数 **clamp** 到 $[0,\, w_{\max}]$（见 §1.4）。

---

## 1. 汇报方式（摆球与弹簧相同）

| 阶段 | 名称     | 被试操作                                                                       | 界面                                                                 |
| ---- | -------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| A    | 仿真     | 无                                                                             | 显示/隐藏交替，后台物理连续                                          |
| B    | 点估计   | **点击** → **拖动微调** → **确认**                         | 摆球：虚线圆 + 估计摆；弹簧：轨迹线 + 估计滑块；**不显示**真值 |
| C    | 不确定度 | 页脚**滑块**（范围 $[0,\, w_{\max}]$）调节半宽 $w$ → **提交** | 扇形/区间随滑块实时变宽；**越宽越不确定**（详见 §1.4）        |
| D    | 得分反馈 | 阅读后继续                                                                     | **仅本试次**：命中、$w$、$w_{\max}$、`trial_score` / 100 |

**禁止**：阶段 C 再改 $\hat\theta$ 或 $\hat x$。

### 1.1 摆球（`pendulumStimulus`）

- 几何：$\theta=0$ 向下，顺时针为正；`pendulumAngleFromPointer`。
- 阶段 C：$w_{\mathrm{deg}} \in [0,\, w_{\max,\mathrm{deg}}]$（§1.4、§2.2）。

### 1.2 弹簧（`springStimulus`）

- 几何：水平位移 $x$（米），平衡位置为 $0$；指针/拖动映射到 $x$。
- 阶段 C：$w_{\mathrm{m}} \in [0,\, w_{\max,\mathrm{m}}]$（§1.4、§5.2）。

### 1.3 指导语要点

- 先报「最后停在哪里」，再报「真值可能落在的范围」；试次末显示**本试次**得分规则结果，不告知真值或残差。
- 阶段 C 说明：拖动滑块只会改变**范围宽窄**，范围最窄为 0、最宽为本试次允许的 $w_{\max}$（不同试次上限可能不同）。

### 1.4 不确定度滑块（阶段 C，摆球 / 弹簧共用）

被试在阶段 C **拖动滑块**调节「真值可能落在的范围」的**半宽** $w$。滑块的**可控范围**为：

$$
w \in [0,\, w_{\max}]
$$

即 **最小值恒为 $0$**，**最大值恒为该试次的 $w_{\max}$**（摆球 §2.2；弹簧 §5.2）。**不是**全局固定的 $0°$–$180°$ 或任意常数上限。

| 要求                 | 说明                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| **最小值**     | $0$（区间退化为估计点；若 $\mathrm{hit}=1$ 则计分为满分）                                       |
| **最大值**     | 本试次$w_{\max}$                                                                                  |
| **按试次更新** | 进入阶段 C 时重算$w_{\max}$，设置 `min=0`、`max=w_max`（`<input type="range">` 或等价控件） |
| **联动**       | 拖动时 Canvas 扇形/区间带以$\hat\theta$ 或 $\hat x$ 为中心、半宽为当前 $w$ **实时**重绘 |
| **标签**       | 不显示当前带宽的具体数值                                                                            |
| **初值**       | 一开始不显示, 被试第一次点的位置就是初值, 然后跟随拖动                                              |
| **提交**       | 提交瞬间滑块值 →`arc_half_width_deg` / `interval_half_width_m`                                 |


---

## 2. 摆球：反馈与 $w_{\max}$

### 2.1 误差与命中

$$
e_{\mathrm{deg}} = d(\hat\theta,\, \theta_{\mathrm{actual}}) \quad \text{（度）}
$$

- **转圈**（`pendulum_regime === "rotation"`）：圆周距离（度）。
- **往复**（`oscillation`）：$|\hat\theta_{\mathrm{deg}} - \theta_{\mathrm{actual,deg}}|$（可将 $\hat\theta$ clamp 到 $[-\theta_{\max,\mathrm{deg}},\, \theta_{\max,\mathrm{deg}}]$ 再比）。

内部可用弧度计算，导出以 $e_{\mathrm{deg}}$ 为主、$e_{\mathrm{rad}}$ 为辅。

$$
\mathrm{hit} = \mathbb{1}\bigl[ e_{\mathrm{deg}} \le w_{\mathrm{deg}} \bigr]
$$

### 2.2 试次 $w_{\max}$（摆球摆动范围）

| `pendulum_regime` | $w_{\max,\mathrm{deg}}$                                                         | 说明                                                                                      |
| ------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `oscillation`     | $\theta_{\max,\mathrm{deg}} = \mathrm{rad2deg}\bigl(\arccos(1 - E/(mgl))\bigr)$ | 能量决定的**最大摆角**（与 `pendulumPositionOptions` / `analyzePendulum` 一致） |
| `rotation`        | $180$                                                                           | 可绕圈：半张角上限为半圆                                                                  |

$w_{\max,\mathrm{deg}}$ 同时作为阶段 C 滑块的 **`max`**（§1.4）；转圈为 $180°$，往复为 $\theta_{\max,\mathrm{deg}}$（通常 $<180°$）。

### 2.3 得分与反馈 UI

沿用 §0.3，$w$ 取 $w_{\mathrm{deg}}$，$w_{\max}$ 取 $w_{\max,\mathrm{deg}}$。

**示例**（$\mathrm{hit}=1$）：$w_{\max}=60°$ 时，$w=0 \Rightarrow 100$ 分，$w=30° \Rightarrow 25$ 分

阶段 D 展示：命中 / 未命中；**本试次得分** `trial_score` / 100。

如果命中显示:

```
# 命中!

本次得分 $\trial_score / 100$

```

反之显示

```
# 未命中!

本次得分 $0$

```



---

## 3. 摆球：记录指标（CSV）

### 3.1 一阶（角度：度为主，弧度为辅）

| 字段                    | 主/辅        | 定义                                                           |
| ----------------------- | ------------ | -------------------------------------------------------------- |
| `response_mode`       | —           | `"estimate_arc"`                                             |
| `theta_actual_deg`    | **主** | 仿真终态角（度）                                               |
| `theta_estimated_deg` | **主** | 确认后的$\hat\theta$（度）                                   |
| `delta_theta_deg`     | **主** | $\mathrm{wrap}(\hat\theta - \theta_{\mathrm{actual}})$（度） |
| `abs_delta_theta_deg` | **主** | $e_{\mathrm{deg}}$                                           |
| `theta_actual_rad`    | 辅           | 度 → 弧度                                                     |
| `theta_estimated_rad` | 辅           | 度 → 弧度                                                     |
| `delta_theta_rad`     | 辅           | 度 → 弧度                                                     |
| `abs_delta_theta_rad` | 辅           | 度 → 弧度                                                     |
| `rt_estimate_sec`     | —           | 仿真结束 → 确认                                               |

**角度规范**：`theta_*_deg` 与有符号 `delta_theta_deg` 均折返到 **(-180°, 180°]**（与 `Math.atan2` 一致）；`_*_rad` 由规范化后的度再转弧度。`abs_delta_theta_deg` 为非负误差，不在此区间。

### 3.2 二阶（不确定度弧）

| 字段                      | 主/辅        | 定义                                               |
| ------------------------- | ------------ | -------------------------------------------------- |
| `arc_half_width_deg`    | **主** | 滑块$w_{\mathrm{deg}}$                           |
| `arc_span_deg`          | **主** | $2w_{\mathrm{deg}}$                              |
| `w_max_deg`             | **主** | 该试次 §2.2                                       |
| `interval_hit`          | —           | 0/1                                                |
| `interval_overflow_deg` | **主** | $\max(0,\, e_{\mathrm{deg}} - w_{\mathrm{deg}})$ |
| `arc_half_width_rad`    | 辅           | 可选                                               |
| `interval_overflow_rad` | 辅           | 可选                                               |
| `rt_arc_sec`            | —           | 确认 → 提交弧                                     |

### 3.3 计分（仅单试次）

| 字段            | 定义               |
| --------------- | ------------------ |
| `trial_score` | §0.3，$[0,100]$ |
| `score_max`   | 常数$100$        |

### 3.4 物理上下文（保留）

`physicsKind`, `pendulum_E_J`, `pendulum_T_sec`, `pendulum_regime`, `stimulus_time_phases_json`, `total_time_T`, `unitMeta` 等。

### 3.5 废弃（摆球）

`user_choice`, `correct_option`, `accuracy`, `choice1_theta_deg` … `choice5_theta_deg`。

---

## 4. 摆球：实现清单

### 4.1 `src/physics/pendulumArcScore.ts`（新）

- [ ] `pendulumWMaxDeg(E, regime, rodLengthM, g): number` — §2.2
- [ ] `pendulumAngularErrorDeg(...): number` → $e_{\mathrm{deg}}$
- [ ] `pendulumIntervalHit(eDeg, wDeg): boolean`
- [ ] `pendulumTrialScore(wDeg, wMaxDeg, hit): number` → $100(1-w/w_{\max})^2$ 或 $0$

### 4.2 `src/physics/render/pendulumCanvas.ts`

- [ ] `drawPendulumEstimate` / `drawPendulumEstimateArc`
- [ ] `angularDistance` 公共 util（度接口优先）

### 4.3 `src/runner/plugins/physicsStimulusPlugin.ts`

- [ ] 摆球四阶段；`finishTrial` 按 §3 写字段（**度在前**）
- [ ] 移除摆球 5AFC

### 4.4 类型 / 刺激 / 编辑器

- [ ] `PendulumStimulusUnit` 去掉 5AFC 字段；`generate-stimulate` 不再 enrich 摆球 5AFC
- [ ] README / `stimulate/README.md` 更新

### 4.5 不确定度滑块 UI（§1.4）

- [ ] 进入阶段 C 时：`w_max_deg = pendulumWMaxDeg(...)`，设置 `range` 的 `min=0`、`max=w_max_deg`（**禁止**写死 180）。
- [ ] `input` 的 `step`：摆球建议 `0.1`° 或 `0.5`°；`input` 事件驱动扇形重绘。
- [ ] 页脚文案：`不确定度半宽：{w}° / 最大 {w_max}°`（可选显示总张角 `2w`°）。
- [ ] 提交时读取滑块值 → `arc_half_width_deg`；`w_max_deg` 写入 CSV。

### 4.6 样式与指导语

- [ ] `physics.css`：滑块轨道/拇指样式；窄屏下 footer 不遮挡 Canvas。
- [ ] 指导语：$(1-w/w_{\max})^2$、滑块范围 $[0,\, w_{\max}]$，**无累计分**

### 4.7 脚本

- [ ] `scripts/verify-pendulum-arc-score.ts`（含 regime 两种 $w_{\max}$、$w=w_{\max}$ 时 score=0）

---

## 5. 弹簧：反馈与 $w_{\max}$（与摆球同构）

### 5.1 误差与命中

$$
e_{\mathrm{m}} = \bigl| \hat x - x_{\mathrm{actual}} \bigr|
$$

$$
\mathrm{hit} = \mathbb{1}\bigl[ e_{\mathrm{m}} \le w_{\mathrm{m}} \bigr]
$$

### 5.2 试次 $w_{\max}$（弹簧振动范围）

线弹簧谐振子，振幅 $A$（米）由初值与 `springAnalysis` 给出：

$$
A = \sqrt{x_0^2 + (v_0/\omega)^2}, \quad \omega=\sqrt{k/m}
$$

| 量                                | 值                       |
| --------------------------------- | ------------------------ |
| 位移可达区间                      | $[-A,\, A]$            |
| **$w_{\max,\mathrm{m}}$** | $A$（半宽上限 = 振幅） |

$w_{\max,\mathrm{m}} = A$ 同时作为阶段 C 滑块的 **`max`**（§1.4）。

### 5.3 得分与反馈 UI

§0.3，$w \leftarrow w_{\mathrm{m}}$，$w_{\max} \leftarrow w_{\max,\mathrm{m}}$。

阶段 D：命中；$w_{\mathrm{m}}$ / $w_{\max,\mathrm{m}}$；本试次 `trial_score` / 100。

---

## 6. 弹簧：记录指标（CSV）

### 6.1 一阶（米）

| 字段                | 定义                             |
| ------------------- | -------------------------------- |
| `response_mode`   | `"estimate_arc"`               |
| `x_actual_m`      | 仿真终态位移                     |
| `x_estimated_m`   | $\hat x$                       |
| `delta_x_m`       | $\hat x - x_{\mathrm{actual}}$ |
| `abs_delta_x_m`   | $e_{\mathrm{m}}$               |
| `rt_estimate_sec` | 仿真结束 → 确认                 |

### 6.2 二阶（不确定度区间）

| 字段                      | 定义                                           |
| ------------------------- | ---------------------------------------------- |
| `interval_half_width_m` | 滑块$w_{\mathrm{m}}$                         |
| `interval_span_m`       | $2w_{\mathrm{m}}$                            |
| `w_max_m`               | 该试次$A$                                    |
| `interval_hit`          | 0/1                                            |
| `interval_overflow_m`   | $\max(0,\, e_{\mathrm{m}} - w_{\mathrm{m}})$ |
| `rt_arc_sec`            | 确认 → 提交                                   |

### 6.3 计分（仅单试次）

同 §3.3：`trial_score`, `score_max`。

### 6.4 物理上下文

`spring_*` / `physicsKind: "spring"` 等现字段保留。

### 6.5 废弃（弹簧）

`user_choice`, `correct_option`, `accuracy`, `choice1_x_m` … `choice5_x_m`。

---

## 7. 弹簧：实现清单

### 7.1 `src/physics/springArcScore.ts`（新）

- [ ] `springWMaxM(params): number` → $A$
- [ ] `springIntervalHit` / `springTrialScore` — 同 §0.3

### 7.2 `src/physics/render/springCanvas.ts`

- [ ] 估计态绘制 + 区间带（以 $\hat x$ 为中心）

### 7.3 `src/runner/plugins/physicsStimulusPlugin.ts`

- [ ] 弹簧四阶段（与摆球并行）；移除弹簧 5AFC
- [ ] `finishTrial` §6 字段

### 7.4 不确定度滑块 UI（§1.4）

- [ ] 进入阶段 C：`w_max_m = springWMaxM(params)`，`min=0`，`max=w_max_m`。
- [ ] 滑块拖动 → 以 $\hat x$ 为中心、$[\hat x-w,\,\hat x+w]$ 区间带重绘（像素坐标由 layout 换算）。
- [ ] 页脚：`不确定度半宽：{w} m / 最大 {w_max} m`。
- [ ] 提交 → `interval_half_width_m`、`w_max_m`。

### 7.5 类型 / 刺激 / 编辑器

- [ ] `SpringStimulusUnit` 去掉 5AFC；`enrichSpringStimulusAfc5` 废弃

### 7.6 脚本

- [ ] `scripts/verify-spring-arc-score.ts`

---

## 8. 与现版差异

| 项目            | 现版 5AFC   | 目标版                                               |
| --------------- | ----------- | ---------------------------------------------------- |
| 摆球 / 弹簧汇报 | 键盘 1–5   | 点击 + 拖动 + 确认 + 半宽滑块                        |
| CSV 摆角        | 以 rad 为主 | **以 deg 为主**，rad 为辅                      |
| 计分            | 无          | 单试次 `trial_score` only                          |
| 公式            | —          | $\mathrm{hit}\cdot 100(1-w/w_{\max})^2$            |
| $w_{\max}$    | —          | 摆球：$\theta_{\max}$ 或 $180°$；弹簧：$A$    |
| 滑块范围        | —          | **每试次** $[0,\, w_{\max}]$，非全局固定上限 |

---

## 9. 分析派生（不写入试次 CSV）

| 指标        | 摆球                                                                             | 弹簧                                       |
| ----------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| 校准        | 按 `arc_half_width_deg` bin 看 `interval_hit`、`mean(abs_delta_theta_deg)` | 按 `interval_half_width_m` bin           |
| 相关        | $\rho(w_{\mathrm{deg}},\, e_{\mathrm{deg}})$                                   | $\rho(w_{\mathrm{m}},\, e_{\mathrm{m}})$ |
| 过度自信    | `hit=0` 且 $w$ 低于分位                                                      | 同左                                       |
| Manley 对照 | 覆盖率、`trial_score` 分布                                                     | 同左                                       |

**不导出** session 累计分或「总积分效率」列；若论文需要 session 均值，由分析脚本对 `trial_score` **事后求和/平均**。

---

## 10. 验收标准

1. 摆球、弹簧试次均走通 B→C→D；CSV 含单试次 `trial_score`，无累计分字段。
2. 摆球 CSV 角度字段以 `_*_deg` 为主，`*_rad` 与度一致。
3. 往复摆：$w_{\max,\mathrm{deg}}=\theta_{\max,\mathrm{deg}}$；转圈：$w_{\max,\mathrm{deg}}=180$；弹簧：$w_{\max,\mathrm{m}}=A$。
4. hit/score 与 $w=w_{\max}$、$w=0$、hit=0 手算一致。
5. `npm run build` 通过；刺激 JSON / 编辑器 / README 与 schema 一致。

---

*方案锁定：单试次计分 $\mathrm{score}=\mathrm{hit}\cdot 100(1-w/w_{\max})^2$；不确定度滑块可控范围 $[0,\, w_{\max}]$（按试次设 max）；摆球 $w_{\max}$=摆动半角上限（转圈 $180°$）；弹簧 $w_{\max}=A$；CSV 摆角以度为主。*
