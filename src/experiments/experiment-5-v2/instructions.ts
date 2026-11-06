import { EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK } from "./protocol";

export function experiment5V2WelcomeText(yesKey: string, noKey: string): string {
  return `<h1>实验五 · 协议 2.0</h1><div class="instr-left">
  <p>摆球会在固定光栅后连续运动。每个试次开始前会提示起始侧和运动方向。铃铛会从运动开始一直显示到画面空白。</p>
  <p>画面会在摆球靠近铃铛之前变成空白，并盖住这次上摆的端点。请判断摆球继续运动是否可能到达铃铛。</p>
  <p><strong>${yesKey.toUpperCase()} = 会到达</strong>，<strong>${noKey.toUpperCase()} = 不会到达</strong>。本任务没有作答超时。</p>
  <p>练习有反馈，正式试次无反馈。</p></div><p>按空格继续</p>`;
}

export function experiment5V2StructureText(): string {
  return `<h1>实验结构</h1><p>先完成6个练习试次。</p><p>正式阶段包含40°、60°、80°三个振幅区组，每区组${EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK}个试次。</p><p>按空格继续</p>`;
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
