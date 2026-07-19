export function welcomeRestText(group: 1 | 2): string {
  void group;
  return `<h1>欢迎参加本实验</h1>
<p class="instr-summary">每个试次分为可视阶段，淡出阶段，遮挡阶段，汇报阶段，反馈阶段</p>
<div class="instr-left">
<p><strong>可视阶段</strong>: 你会看到蓝色的单摆和表示单摆可以到达的运动范围的蓝色虚线，在此阶段，你应该观察单摆的运动</p>
<p><strong>淡出阶段</strong>: 你会听到轻微的持续响声同时看到蓝色的单摆和虚线逐渐变为黑色</p>
<p><strong>遮挡阶段</strong>: 你会听到轻微的持续响声，只能看到黑色虚线，在此阶段，单摆运动仍在持续，只是不可见，你应该在心中模拟单摆运动</p>
<p><strong>汇报阶段</strong>: 你会看到橙色的边框与表示单摆可以到达的运动范围的橙色的虚线，你应该在画面上点击你认为单摆在提示音响起的瞬间的位置</p>
<p><strong>反馈阶段</strong>: 你会看到橙色和蓝色的摆杆，橙色的摆杆表示您的选择，蓝色的摆杆表示在提示音响起的瞬间，单摆的真实位置</p>
<p>除反馈阶段, 画面左右都会显示竖向线速度条辅助预测</p>
</div>
<p>按空格键进入下一段文本</p>`;
}

/** @deprecated 默认摆动组文案；请用 welcomeRestText(group) */
export const WELCOME_REST_TEXT = welcomeRestText(1);

export function structureRestText(group: 1 | 2): string {
  void group;
  return `<h1>实验结构</h1>
<p>共 15 个正式 Block 和 1 个练习 Block。</p>
<p>按空格开始练习阶段</p>`;
}

export function practiceRestText(group: 1 | 2): string {
  const motion = group === 1 ? "摆动" : "旋转";
  return `<h1>练习说明</h1>
<p>你当前为<strong>${motion}</strong>组。</p>
<p>练习 Block 含 9 个试次，流程与正式试次相同。练习不计入数据分析。</p>
<p>按空格开始练习试次</p>`;
}

export function blockRestText(current: number, total: number): string {
  return `<h1>正式实验</h1>
<p>Block ${current} / ${total}</p>
<p>按空格键继续</p>`;
}

export const FIXATION_TEXT = "+";
export const FIXATION_MS = 1000;
