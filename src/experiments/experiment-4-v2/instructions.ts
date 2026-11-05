export function experiment4V2WelcomeText(): string {
  return `<h1>实验四 · 协议 2.0</h1><div class="instr-left">
  <p>摆球会在固定光栅后连续运动。每个试次开始前会提示起始侧和运动方向。</p>
  <p>看到三个可见运动片段后，整个画面会空白0.30秒。提示音响起后，请先报告带方向的角度，再报告速度大小。</p>
  <p>速度色带左端表示静止，右端表示从60°静止释放的摆球经过最低点时的速度。</p>
  <p>练习有反馈，正式试次无反馈。</p></div><p>按空格继续</p>`;
}

export function experiment4V2StructureText(): string {
  return `<h1>实验结构</h1><p>先观看一个50°无遮挡完整周期，再完成3个练习试次。</p><p>正式阶段包含3个光栅区组，每区组26个试次。</p><p>按空格继续</p>`;
}

export function experiment4V2PracticeText(): string {
  return `<h1>练习阶段</h1><p>演示和练习使用正式实验中不会使用的50°振幅。</p><p>按空格观看无遮挡演示</p>`;
}

export function experiment4V2BlockText(index: number, total: number): string {
  return `<h1>实验四协议2.0正式阶段</h1><p>区组 ${index} / ${total}</p><p>按空格继续</p>`;
}
