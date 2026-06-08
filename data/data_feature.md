# Data Feature

实验结束后由运行页自动下载 CSV，文件名为 `experiment_data_subjectXXXX.csv`（`XXXX` 为四位被试编号；编辑页无编号试跑时为 `experiment_data.csv`）。仅包含 `trial_type = physics-stimulus` 的摆球试次（练习 `pendulumPractice` 与正式 `pendulumStimulus`），共 **25 列**，列顺序与 [`src/runner/exportStimulusCsv.ts`](../src/runner/exportStimulusCsv.ts) 中 `STIMULUS_CSV_COLUMNS` 一致。

**摆角约定**：θ = 0 为竖直向下，**顺时针为正**（度与弧度字段同一约定）。质量固定 $m = 1\,\mathrm{kg}$，势能零点在最低点。

## subject_id

被试编号。在实验首页输入并经校验后格式化为四位字符串（如前导零的 `0001`），写入 jsPsych 全局属性，导出时合并到每一行。

## unit_type

刺激单元类型，来自刺激 JSON 编排。当前预置集为 `pendulumPractice`（练习段，hide 时杆/球半透明可见）或 `pendulumStimulus`（正式试次，hide 时不绘制杆/球）。

## segment_kind

该试次所属顶层段落种类：`practice`（练习段）或 `block`（正式能量分段 block）。

## physicsKind

物理刺激种类。当前导出数据均为摆球试次，取值为 `pendulum`。

## pendulum_E_J

该试次**初始条件** $(\theta_0,\,\omega_0)$ 对应的机械能 $E$（单位 J），由程序根据摆球参数即时计算，不写入刺激 JSON：

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

其中 $t_{\mathrm{sim,end}} = \texttt{show\_sec} + \texttt{fade\_sec} + \texttt{hide\_sec}$，且 $\texttt{total\_time\_sec} = t_{\mathrm{sim,end}} = \texttt{total\_time\_T} \cdot T$。以下各段时长由刺激 JSON 的 `show1T`、`fadeMs`、`hide1T` 与 $T$ 在试次结束时计算（[`stimulusPhaseDurationsForExport`](../src/physics/timePhases.ts)）。

## show_T

可见（蓝杆/蓝虚线）段的时长，以周期 $T$ 为单位的倍数，等于刺激参数 `show1T`：

$$\texttt{show\_T} = \texttt{show1T}$$

## fade_T

可见→遮挡边界的淡出段时长（T 倍数）。淡出为固定 `fadeMs` 毫秒，不计入 `hide1T`：

$$\texttt{fade\_T} = \frac{\texttt{fade\_sec}}{T} = \frac{\texttt{fadeMs}/1000}{T}$$

## hide_T

遮挡段时长（T 倍数）。JSON 中 `hide1T` 以**秒**存储（摆球固定 0.5 s）：

$$\texttt{hide\_T} = \frac{\texttt{hide\_sec}}{T} = \frac{\texttt{hide1T}}{T}$$

## total_time_sec

仿真总时长（秒），从 $t=0$ 到点估计开始前，等于三段之和：

$$\texttt{total\_time\_sec} = \texttt{show\_sec} + \texttt{fade\_sec} + \texttt{hide\_sec}$$

## show_sec

可见段时长（秒）：

$$\texttt{show\_sec} = \texttt{show1T} \cdot T$$

## fade_sec

淡出段时长（秒）：

$$\texttt{fade\_sec} = \texttt{fadeMs} / 1000$$

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

## rt_estimate_sec

反应时（秒）：从进入点估计界面（仿真结束、提示音后）到被试点击确认按钮为止，$(t_{\mathrm{confirm}} - t_{\mathrm{estimate,start}})/1000$，基于 `performance.now()`。
