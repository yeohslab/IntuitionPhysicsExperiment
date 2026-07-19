# Data Feature

实验结束后由运行页自动下载 CSV，文件名为 `experiment_data_subjectXXXX.csv`（`XXXX` 为四位被试编号）。仅包含 `trial_type = physics-stimulus` 的摆球正式刺激试次（`pendulumStimulus` 且 `segment_kind = block`），共 **28 列**，列顺序与 [`src/runner/exportStimulusCsv.ts`](../src/runner/exportStimulusCsv.ts) 中 `STIMULUS_CSV_COLUMNS` 一致。

当前协议下每名被试预期 **135** 行（15 Block × 9 Trial）。练习 Block（`segment_kind=practice`）不导出。

**摆角约定**：θ = 0 为竖直向下，**顺时针为正**（度与弧度字段同一约定）。质量固定 $m = 1\,\mathrm{kg}$，势能零点在最低点。

刺激参数由会话开始时 [`generateRuntimeStimulusSet`](../src/stimulate/generateRuntimeSet.ts) 生成，不来自预置 JSON 文件。

## subject_id

被试编号。在实验首页输入并经校验后格式化为四位字符串（如前导零的 `0001`），写入 jsPsych 全局属性，导出时合并到每一行。

## motion_group

组间运动方式，与首页「组别编号」一致：

- `1`：摆动组（能量区间 \([1.96,\, 78.4]\,\mathrm{J}\)，`pendulum_regime` 多为 `oscillation`）
- `2`：旋转组（能量区间 \([78.4,\, 156.8]\,\mathrm{J}\)，`pendulum_regime` 多为 `rotation`）

由 `RunnerView` 从 `sessionStorage` 写入 jsPsych 全局属性。

## unit_type

刺激单元类型。当前正式导出均为 `pendulumStimulus`。

## segment_kind

该试次所属段落种类。正式分析使用 `block`。`practice` / `rest` 不产生本 CSV 行。

## physicsKind

物理刺激种类。当前均为 `pendulum`。

## pendulum_E_J

该试次**初始条件** $(\theta_0,\,\omega_0)$ 对应的机械能 $E$（单位 J），由程序根据摆球参数即时计算：

$$E = \frac{1}{2} m (l\omega_0)^2 + m g l \,(1 - \cos\theta_0)$$

其中 $l$ 为杆长 `rodLengthM`，$g$ 为重力 `gravity`，$\theta_0$、$\omega_0$ 为初态角与角速度（弧度制代入公式）。

## pendulum_T_sec

该试次动力学周期 $T$（单位 s），由能量 $E$ 与 $l,g$ 通过椭圆积分等数值方法求得（`analyzePendulum`），随 regime 不同使用往复或转圈周期公式。

## pendulum_regime

运动类型，由 $E$ 与临界能量 $E_c = 2 m g l$ 比较得到：

- `oscillation`：$E < E_c$，往复；
- `critical`：$E \approx E_c$；
- `rotation`：$E > E_c$，可绕顶转过圈。

## total_time_T

单次仿真（从 $t=0$ 到作答前仿真结束）的总时长，以周期 $T$ 为单位的倍数：

$$\texttt{total\_time\_T} = \frac{t_{\mathrm{sim,end}}}{T}$$

其中 $t_{\mathrm{sim,end}} = \texttt{show\_sec} + \texttt{fade\_sec} + \texttt{hide\_sec}$，且 $\texttt{total\_time\_sec} = t_{\mathrm{sim,end}} = \texttt{total\_time\_T} \cdot T$。各段时长由试次的 `show1T`、`fadeMs`、`hide1T` 与 $T$ 在试次结束时计算（[`stimulusPhaseDurationsForExport`](../src/physics/timePhases.ts)）。

## show_T

可见（蓝杆/蓝虚线）段的时长，以周期 $T$ 为单位的倍数，等于刺激参数 `show1T`：

- 摆动组：1.25、1.5、1.75
- 旋转组：2.5、3、3.5

$$\texttt{show\_T} = \texttt{show1T}$$

## fade_T

可见→遮挡边界的淡出段时长（T 倍数），不计入 `hide1T`；`fadeMs` 为换算后的毫秒快照：

- 摆动组：\(0.25\,T\)
- 旋转组：\(0.5\,T\)

$$\texttt{fade\_T} = \frac{\texttt{fade\_sec}}{T} = \frac{\texttt{fadeMs}/1000}{T}$$

## hide_T

遮挡段时长（T 倍数）。`hide1T` 以**秒**存储（当前水平：0.5、0.6、0.7）：

$$\texttt{hide\_T} = \frac{\texttt{hide\_sec}}{T} = \frac{\texttt{hide1T}}{T}$$

## total_time_sec

仿真总时长（秒），从 $t=0$ 到点估计开始前，等于三段之和：

$$\texttt{total\_time\_sec} = \texttt{show\_sec} + \texttt{fade\_sec} + \texttt{hide\_sec}$$

## show_sec

可见段时长（秒）：

$$\texttt{show\_sec} = \texttt{show1T} \cdot T$$

## fade_sec

淡出段时长（秒），等于试次写入的 `fadeMs`：

$$\texttt{fade\_sec} = \texttt{fadeMs}/1000$$

（摆动 \(0.25\,T\)；旋转 \(0.5\,T\)）
## hide_sec

遮挡段时长（秒），等于 `hide1T`：

$$\texttt{hide\_sec} = \texttt{hide1T}$$

## w_max_deg

该试次运动可达摆角的半宽上限（度），用于点估计误差计算与作答界面运动范围示意：

- **往复**（`oscillation` / `critical`）：$\theta_{\max} = \arccos\!\bigl(1 - E/(m g l)\bigr)$，再转为度；
- **转圈**（`rotation`）：固定为 $180°$。

## theta_actual_deg

仿真**全部时段结束瞬间**（$t = t_{\mathrm{sim,end}}$）的摆角真值，单位度。先由动力学积分得到弧度 $\theta_{\mathrm{actual}}$，再折返到 $(-180°, 180°]$ 后写入（`pendulumAngleDegFromRad`）。**不是**可见段结束或遮挡开始时的角度。

## theta_estimated_deg

被试在点估计阶段确认时的摆角，单位度。由指针在摆弧上的位置换算为 $\hat\theta$（弧度），再折返到 $(-180°, 180°]$ 后写入。

## delta_theta_deg

有符号角差（度），$\hat\theta - \theta_{\mathrm{actual}}$ 经 regime 相关规则处理后的结果（`wrapDeltaThetaDeg`），取值落在 $(-180°, 180°]$：

- **转圈**：先将 $\hat\theta$、$\theta_{\mathrm{actual}}$ 折返到 $(-\pi,\pi]$，求差后再折返到度；
- **往复**：先将 $\hat\theta$ 钳位到 $[-\theta_{\max},\, \theta_{\max}]$（$\theta_{\max}$ 由 `w_max_deg` 给出），再算 $\hat\theta_{\mathrm{clamped}} - \theta_{\mathrm{actual}}$ 并折返到 $(-180°, 180°]$。

## abs_delta_theta_deg

点估计角距离 $e$（度），恒非负（`pendulumAngularErrorDeg`）：

- **转圈**：$e = \min\bigl(|\mathrm{wrap}(\hat\theta) - \mathrm{wrap}(\theta_{\mathrm{actual}})|,\; 2\pi - |\cdots|\bigr)$，再转为度；
- **往复**：$e = |\mathrm{clamp}(\hat\theta) - \theta_{\mathrm{actual}}|$（clamp 区间同 `w_max_deg`），再转为度。

与 `delta_theta_deg` 的绝对值在往复/转圈规则下不一定相等（往复时先钳位估计角）。

## theta_actual_rad

`theta_actual_deg` 经 $\pi/180$ 换算得到的弧度值（由度字段导出，与折返后的度一致）。

## theta_estimated_rad

`theta_estimated_deg` 经 $\pi/180$ 换算得到的弧度值。

## delta_theta_rad

`delta_theta_deg` 经 $\pi/180$ 换算得到的弧度值。

## abs_delta_theta_rad

`abs_delta_theta_deg` 经 $\pi/180$ 换算得到的弧度值。

## omega_actual_deg_per_sec

仿真**全部时段结束瞬间**（$t = t_{\mathrm{sim,end}}$）的摆角速度真值，单位 °/s。与 `theta_actual_*` 同一时刻；由动力学状态（转圈用数值积分器，往复用解析解）读取，再由弧度制换算：$\omega_{\mathrm{deg/s}} = \omega_{\mathrm{rad/s}} \cdot 180/\pi$。符号约定与摆角一致（顺时针为正）。

## omega_actual_rad_per_sec

仿真结束瞬间的摆角速度真值，单位 rad/s（与 `omega_actual_deg_per_sec` 同一时刻、同一符号约定）。

## rt_estimate_sec

反应时（秒）：从进入点估计界面（仿真结束、提示音后）到被试点击确认按钮为止，$(t_{\mathrm{confirm}} - t_{\mathrm{estimate,start}})/1000$，基于 `performance.now()`。

---

## 协议版本说明

`data/formal_raw_data/` 中 CSV 来自**旧版**实验（单旋转区、25 Block × 5 Trial、固定 JSON 刺激集），列中可能**无** `motion_group`，试次数为 125/被试。分析时须与当前 2×3×3 运行时生成协议区分。
