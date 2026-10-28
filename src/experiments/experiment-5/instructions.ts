export function experiment5WelcomeText(yesKey: string, noKey: string): string {
  return `<h1>欢迎参加实验五</h1>
<div class="instr-left">
<p>每个试次中，摆球会沿下半圆轨迹连续运动 0.40 秒，随后摆球消失，同时出现一条红色目标刻线并响起提示音。</p>
<p>请判断：如果运动继续，摆球是否会到达目标刻线。按 <strong>${yesKey.toUpperCase()}</strong> 表示“会到达”，按 <strong>${noKey.toUpperCase()}</strong> 表示“不会到达”。请在 4 秒内作答。</p>
<p>摆球只做往复摆动，不会转圈。目标在左、右两侧均可能出现；摆球出现前不会预告目标或最大摆幅。</p>
<p>练习有反馈，正式试次无反馈。</p>
</div><p>按空格键继续</p>`;
}

export function experiment5StructureText(): string {
  return `<h1>实验结构</h1><p>先完成 6 个练习试次，再完成 4 个正式区组，每区组 12 个试次。</p><p>按空格开始练习</p>`;
}

export function experiment5PracticeText(): string {
  return `<h1>练习说明</h1><p>请观察摆球运动方向和速度，并判断它能否到达随后出现的红色目标刻线。</p><p>按空格开始</p>`;
}

export function experiment5BlockText(index: number, total: number): string {
  return `<h1>实验五正式阶段</h1><p>区组 ${index} / ${total}</p><p>正式试次不提供反馈。按空格继续</p>`;
}
