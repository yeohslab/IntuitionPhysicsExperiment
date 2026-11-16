import {
  EXPERIMENT_5_V3_FORMAL_BLOCKS,
  EXPERIMENT_5_V3_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_5_V3_FORMAL_TRIALS_PER_SIDE,
  EXPERIMENT_5_V3_PRACTICE_TRIALS,
} from "./protocol";

export function experiment5V3WelcomeText(): string {
  return `<h1>实验五 · 协议 3.0</h1><div class="instr-left">
  <p>画面被挡住，只留一条缝。不同试次里，这条缝的位置不同。摆球从铃铛对面出发，朝铃铛运动。铃铛从运动开始一直显示到画面空白。</p>
  <p>运动一开始就可以判断摆球能否到达铃铛。作出选择后直接进入下一试次。若尚未选择，画面会淡出 0.3 秒，然后变为空白。空白期间仍可以作答。</p>
  <p><strong>F = 会到达</strong>，<strong>J = 不会到达</strong>。本任务没有作答超时。</p>
  <p>练习有反馈，正式试次无反馈。</p></div><p>按空格继续</p>`;
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
