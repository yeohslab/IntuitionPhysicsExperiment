import { EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC } from "./protocol";

export function experiment3WelcomeText(): string {
  return `<h1>欢迎参加实验三</h1>
<p class="instr-summary">每个试次包含可视、淡出、遮挡与汇报阶段；<strong>仅练习 Trial</strong>另有反馈阶段</p>
<div class="instr-left">
<p><strong>可视阶段</strong>: 观察蓝色单摆及其运动范围。</p>
<p><strong>淡出与遮挡阶段</strong>: 单摆逐渐消失后仍继续运动，请在心中模拟。</p>
<p><strong>汇报阶段</strong>: 在橙色虚线轨迹上报告遮挡结束瞬间的摆杆方向。</p>
<p><strong>反馈阶段</strong>（仅练习 Trial）: 橙色摆杆是您的选择，蓝色摆杆是真实位置。</p>
<p>仿真期间画面左右会显示两条同步竖向线速度条。底端表示 0 m/s，顶端表示 ${EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC.toFixed(2)} m/s；所有 Trial 使用同一尺度。</p>
</div>
<p>按空格键进入下一段文本</p>`;
}

export function experiment3StructureText(): string {
  return `<h1>实验结构</h1>
<p>共 1 个混合练习 Block（9 个练习 Trial，含反馈）和 20 个正式 Block（各 9 个正式 Trial，无反馈）。</p>
<p>正式 Block 包含摆动和旋转两类运动，顺序随机。</p>
<p>按空格开始练习阶段</p>`;
}

export function experiment3PracticeText(): string {
  return `<h1>练习说明</h1>
<p>练习 Block 含 9 个摆动与旋转混合的练习 Trial，并提供反馈；练习不计入正式数据分析。</p>
<p>按空格开始练习试次</p>`;
}

export function experiment3BlockRestText(current: number, total: number): string {
  return `<h1>实验三正式阶段</h1>
<p>Block ${current} / ${total}</p>
<p>按空格键继续</p>`;
}
