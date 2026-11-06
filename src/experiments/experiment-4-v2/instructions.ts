export function experiment4V2WelcomeText(): string {
  return `<h1>实验四 · 协议 2.0</h1><div class="instr-left">
  <p>摆球会在固定光栅后连续运动。每个试次开始前会提示起始侧和运动方向。</p>
  <p>三档光栅分别播放4、5、6个可见运动片段。空白前画面会在0.30秒内变淡，然后整个画面空白0.70秒。提示音响起后，请按屏幕要求只报告一项：带方向的角度，或速度大小。两种汇报各占一半。</p>
  <p>速度色带左端表示静止，右端表示从60°静止释放的摆球经过最低点时的速度。</p>
  <p>练习有反馈，正式试次无反馈。</p></div><p>按空格继续</p>`;
}

export function experiment4V2StructureText(): string {
  return `<h1>实验结构</h1><p>先完成6个练习试次，角度和速度汇报各3条。</p><p>正式阶段包含3个光栅区组，每区组26个试次。</p><p>按空格继续</p>`;
}

export function experiment4V2InitialCueText(
  side: "left" | "right",
  direction: "leftward" | "rightward",
): string {
  const sideLabel = side === "left" ? "左侧" : "右侧";
  const directionLabel = direction === "leftward" ? "向左" : "向右";
  return `<h1>本试次</h1><p>摆球从<strong>${sideLabel}</strong>某一位置开始，并<strong>${directionLabel}</strong>运动。</p>`;
}

export function experiment4V2PracticeText(): string {
  return `<h1>练习阶段</h1><p>按空格开始练习</p>`;
}

export function experiment4V2BlockText(index: number, total: number): string {
  return `<h1>实验四协议2.0正式阶段</h1><p>区组 ${index} / ${total}</p><p>按空格继续</p>`;
}
