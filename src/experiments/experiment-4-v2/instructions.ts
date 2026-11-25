import {
  EXPERIMENT_4_V2_PRACTICE_ANGLE_TRIALS,
  EXPERIMENT_4_V2_PRACTICE_SPEED_TRIALS,
} from "./protocol";

export function experiment4V2WelcomeText(): string {
  return `<h1>实验四 · 协议 2.0</h1>
<p class="instr-summary">请观察摆球在竖条后面的运动，并报告画面消失那一瞬间它的角度或速度。</p>
<div class="instr-left">
<p>每个试次开始前，屏幕会告诉你摆球从哪一侧出发、朝哪个方向运动。请看着它运动。画面随后会变淡并变成空白。</p>
<p>提示音响起时，请报告空白结束那一瞬间的情况。每次只报告一项，屏幕会说明是哪一项。如果要求报告角度，请在橙色圆弧上点出摆杆方向，然后按「确认角度」。如果要求报告速度，请在色带上点出快慢，然后按「确认速度」。</p>
<p>色带左端是<strong>静止</strong>，右端是<strong>最高速</strong>。摆球越快，就要点得越靠右。</p>
<p>练习时会显示正确答案。正式试次不再显示。</p>
</div>
<p>按空格继续</p>`;
}

export function experiment4V2StructureText(): string {
  return `<h1>实验结构</h1><p>先完成${EXPERIMENT_4_V2_PRACTICE_ANGLE_TRIALS}次位置练习，只报告角度。再完成${EXPERIMENT_4_V2_PRACTICE_SPEED_TRIALS}次速度练习，只报告速度。</p><p>正式阶段包含3个光栅区组，每区组32个试次，角度和速度汇报各16条。</p><p>按空格继续</p>`;
}

export function experiment4V2InitialCueText(
  side: "left" | "right",
  direction: "leftward" | "rightward",
): string {
  const sideLabel = side === "left" ? "左侧" : "右侧";
  const directionLabel = direction === "leftward" ? "向左" : "向右";
  return `<h1>本试次</h1><p>摆球从<strong>${sideLabel}</strong>某一位置开始，并<strong>${directionLabel}</strong>运动。</p>`;
}

export function experiment4V2AnglePracticeText(): string {
  return `<h1>位置练习</h1><p>这一部分只报告角度。请在橙色圆弧上点出空白结束那一瞬间的摆杆方向，然后按「确认角度」。</p><p>确认后会看到正确答案。共 ${EXPERIMENT_4_V2_PRACTICE_ANGLE_TRIALS} 次。</p><p>按空格开始</p>`;
}

export function experiment4V2SpeedPracticeText(): string {
  return `<h1>速度练习</h1><p>这一部分只报告速度。请在色带上点出空白结束那一瞬间的快慢，然后按「确认速度」。</p><p>色带左端是静止，右端是最高速。确认后会用蓝线标出真实速度，并说明色带的读法。共 ${EXPERIMENT_4_V2_PRACTICE_SPEED_TRIALS} 次。</p><p>按空格开始</p>`;
}

export function experiment4V2BlockText(index: number, total: number): string {
  return `<h1>实验四协议2.0正式阶段</h1><p>区组 ${index} / ${total}</p><p>按空格继续</p>`;
}
