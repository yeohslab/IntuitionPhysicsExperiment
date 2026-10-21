import { EXPERIMENT_4_OMEGA_MAX_RAD_PER_SEC } from "./protocol";

export const EXPERIMENT_4_FIXATION_TEXT = "+";

export function experiment4WelcomeText(): string {
  return `<h1>欢迎参加实验四</h1>
<p class="instr-summary">光栅遮挡下的单摆运动：在询问时刻报告角度与速度大小</p>
<div class="instr-left">
<p><strong>运动</strong>：每个试次开始前会提示摆球从左侧还是右侧水平位置释放。随后摆球在竖条光栅后运动，直到询问时刻。</p>
<p>画面上只有<strong>摆球</strong>和静态圆弧参考，没有摆杆。灰色竖条遮挡摆球。</p>
<p><strong>询问</strong>：短促提示音响起时运动停止。请回忆<strong>那一瞬间</strong>摆杆的角度与速度大小。</p>
<p><strong>汇报</strong>：每个试次要报告两项：在橙色圆弧上点击摆杆角度，在色带上点击速度大小（左端静止，右端最快，约 ${EXPERIMENT_4_OMEGA_MAX_RAD_PER_SEC.toFixed(2)} rad/s）。先报哪一项由屏幕提示决定，两种顺序各占一半，请按提示依次完成。</p>
<p>练习试次会显示正确答案；正式试次无反馈。</p>
</div>
<p>按空格键继续</p>`;
}

export function experiment4StructureText(): string {
  return `<h1>实验结构</h1>
<p>练习 3 个试次（小、中、大间隙各 1 个）。</p>
<p>正式 3 个区组，每区组 20 个试次，对应一种间隙宽度；区组顺序随机。</p>
<p>按空格开始练习</p>`;
}

export function experiment4PracticeText(): string {
  return `<h1>练习说明</h1>
<p>请熟悉光栅、提示音与双重汇报操作。练习数据不纳入正式分析。</p>
<p>按空格开始练习试次</p>`;
}

export function experiment4ReleaseCueText(side: "left" | "right"): string {
  const label = side === "left" ? "左侧" : "右侧";
  return `<h1>本试次</h1><p>摆球从<strong>${label}</strong>水平位置释放。</p>`;
}

export function experiment4BlockRestText(current: number, total: number): string {
  return `<h1>实验四正式阶段</h1>
<p>区组 ${current} / ${total}</p>
<p>按空格键继续</p>`;
}
