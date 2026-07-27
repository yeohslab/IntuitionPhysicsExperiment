import { speedBarVMaxForGroup } from "../physics/energySegments";

export function welcomeRestText(group: 1 | 2): string {
  const speedMax = speedBarVMaxForGroup(group).toFixed(2);
  return `<h1>欢迎参加本实验</h1>
<p class="instr-summary">每个试次包含可视、淡出、遮挡与汇报阶段；<strong>仅练习 Trial</strong>另有反馈阶段</p>
<div class="instr-left">
<p><strong>可视阶段</strong>: 你会看到蓝色的单摆和表示单摆可以到达的运动范围的蓝色虚线，在此阶段，你应该观察单摆的运动</p>
<p><strong>淡出阶段</strong>: 你会听到轻微的持续响声同时看到蓝色的单摆和虚线逐渐变为黑色</p>
<p><strong>遮挡阶段</strong>: 你会听到轻微的持续响声，只能看到黑色虚线，在此阶段，单摆运动仍在持续，只是不可见，你应该在心中模拟单摆运动</p>
<p><strong>汇报阶段</strong>: 你会看到橙色的边框与表示单摆可以到达的运动范围的橙色的虚线，你应该在画面上点击你认为单摆在提示音响起的瞬间的位置</p>
<p><strong>反馈阶段</strong>（仅练习 Trial）: 你会看到橙色和蓝色的摆杆，橙色的摆杆表示您的选择，蓝色的摆杆表示在提示音响起的瞬间，单摆的真实位置</p>
<p>除练习中的反馈阶段外，画面左右都会显示竖向线速度条辅助预测。速度条表示绝对线速度，底端为 0，本组顶端为 ${speedMax} m/s；同组所有 Trial 使用相同尺度。</p>
</div>
<p>按空格键进入下一段文本</p>`;
}

export function structureRestText(group: 1 | 2): string {
  void group;
  return `<h1>实验结构</h1>
<p>共 1 个练习 Block（9 个练习 Trial，含反馈）和 15 个正式 Block（各 9 个正式 Trial，无反馈）。</p>
<p>按空格开始练习阶段</p>`;
}

export function practiceRestText(group: 1 | 2): string {
  const motion = group === 1 ? "摆动" : "旋转";
  return `<h1>练习说明</h1>
<p>你当前为<strong>${motion}</strong>组。</p>
<p>练习 Block 含 9 个练习 Trial，含反馈阶段；正式 Trial 在汇报确认后直接进入下一试次，无反馈。练习不计入数据分析。</p>
<p>按空格开始练习试次</p>`;
}

export function blockRestText(current: number, total: number): string {
  return `<h1>正式实验</h1>
<p>Block ${current} / ${total}</p>
<p>按空格键继续</p>`;
}

export const FIXATION_TEXT = "+";
export const FIXATION_MS = 1000;
