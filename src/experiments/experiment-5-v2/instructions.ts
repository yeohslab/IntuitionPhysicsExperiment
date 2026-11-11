import {
  EXPERIMENT_5_V2_AMPLITUDES_DEG,
  EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_5_V2_FORMAL_TRIALS_PER_SIDE,
  EXPERIMENT_5_V2_PRACTICE_TRIALS,
} from "./protocol";

export function experiment5V2WelcomeText(): string {
  return `<h1>实验五 · 协议 2.0</h1><div class="instr-left">
  <p>摆球会从对面最外侧遮挡条的外沿出发，朝铃铛运动。铃铛从运动开始一直显示到画面空白。</p>
  <p>摆球进入第一条朝向铃铛的间隙时，光栅变为橙色，这时就可以判断它能否到达铃铛。作出选择后直接进入下一试次。若尚未选择，画面会淡出 0.3 秒，再全空白 0.1 秒；这时摆球到达最低的那个铃铛位置。空白会继续，直到摆球到达这一侧的最高点。</p>
  <p><strong>F = 会到达</strong>，<strong>J = 不会到达</strong>。本任务没有作答超时。</p>
  <p>练习有反馈，正式试次无反馈。</p></div><p>按空格继续</p>`;
}

export function experiment5V2StructureText(): string {
  const practicePerSide = EXPERIMENT_5_V2_PRACTICE_TRIALS / 2;
  const amplitudes = EXPERIMENT_5_V2_AMPLITUDES_DEG.map((deg) => `${deg}°`).join("、");
  return `<h1>实验结构</h1><p>先完成${EXPERIMENT_5_V2_PRACTICE_TRIALS}个练习试次，左右方向各${practicePerSide}条。</p><p>正式阶段包含${amplitudes}三个振幅区组，每区组${EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK}个试次，左右方向各${EXPERIMENT_5_V2_FORMAL_TRIALS_PER_SIDE}条。区组顺序随机。</p><p>按空格继续</p>`;
}

export function experiment5V2InitialCueText(
  side: "left" | "right",
  direction: "leftward" | "rightward",
): string {
  const sideLabel = side === "left" ? "左侧" : "右侧";
  const directionLabel = direction === "leftward" ? "向左" : "向右";
  return `<h1>本试次</h1><p>摆球从<strong>${sideLabel}</strong>某一位置开始，并<strong>${directionLabel}</strong>运动。</p>`;
}

export function experiment5V2PracticeText(): string {
  return `<h1>练习阶段</h1><p>按空格开始练习</p>`;
}

export function experiment5V2BlockText(index: number, total: number, amplitudeDeg: number): string {
  return `<h1>实验五协议2.0正式阶段</h1><p>区组 ${index} / ${total}（本区组振幅 ${amplitudeDeg}°）</p><p>按空格继续</p>`;
}
