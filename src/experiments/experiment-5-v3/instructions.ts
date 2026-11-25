import {
  EXPERIMENT_5_V3_FORMAL_BLOCKS,
  EXPERIMENT_5_V3_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_5_V3_FORMAL_TRIALS_PER_SIDE,
  EXPERIMENT_5_V3_PRACTICE_TRIALS,
} from "./protocol";

export function experiment5V3WelcomeText(): string {
  return `<h1>实验五 · 协议 3.0</h1>
<p class="instr-summary">请判断摆球能不能到达铃铛。</p>
<div class="instr-left">
<p>画面大部分被挡住，只留一条缝。不同试次里，这条缝的位置不同。每个试次开始前，屏幕会告诉你摆球从哪一侧出发、朝哪个方向运动。摆球从铃铛对面出发，朝铃铛运动。铃铛一直能看见，直到画面变成空白。</p>
<p>运动一开始就可以作答。按 <strong>F</strong> 表示会到达，按 <strong>J</strong> 表示不会到达。选好后进入下一次。</p>
<p>如果还没选择，画面会变淡并变成空白。空白时仍可以作答，没有时间限制。</p>
<p>练习时会告诉你对错，并再看一次遮挡后面的运动。正式试次不再显示对错。</p>
</div>
<p>按空格继续</p>`;
}

export function experiment5V3StructureText(): string {
  const practicePerSide = EXPERIMENT_5_V3_PRACTICE_TRIALS / 2;
  return `<h1>实验结构</h1><p>先完成${EXPERIMENT_5_V3_PRACTICE_TRIALS}个练习试次，左右方向各${practicePerSide}条。</p><p>正式阶段包含${EXPERIMENT_5_V3_FORMAL_BLOCKS}个区组，每区组${EXPERIMENT_5_V3_FORMAL_TRIALS_PER_BLOCK}个试次，左右方向各${EXPERIMENT_5_V3_FORMAL_TRIALS_PER_SIDE}条。每做完一个区组可以休息。</p><p>按空格继续</p>`;
}

export function experiment5V3InitialCueText(
  side: "left" | "right",
  direction: "leftward" | "rightward",
): string {
  const sideLabel = side === "left" ? "左侧" : "右侧";
  const directionLabel = direction === "leftward" ? "向左" : "向右";
  return `<h1>本试次</h1><p>摆球从<strong>${sideLabel}</strong>出发，并<strong>${directionLabel}</strong>运动。</p>`;
}

export function experiment5V3PracticeText(): string {
  return `<h1>练习阶段</h1><p>按空格开始练习</p>`;
}

export function experiment5V3BlockText(index: number, total: number): string {
  return `<h1>实验五协议3.0正式阶段</h1><p>区组 ${index} / ${total}</p><p>按空格继续</p>`;
}
