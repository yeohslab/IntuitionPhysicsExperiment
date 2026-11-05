export function experiment5V2WelcomeText(yesKey: string, noKey: string): string {
  return `<h1>实验五 · 协议 2.0</h1><div class="instr-left">
  <p>摆球会在固定光栅后连续运动，铃铛会从运动开始前一直显示到全屏空白开始。</p>
  <p>看到三个可见运动片段和0.30秒空白后，请判断摆球继续运动是否可能到达铃铛。</p>
  <p><strong>${yesKey.toUpperCase()} = 会到达</strong>，<strong>${noKey.toUpperCase()} = 不会到达</strong>。本任务没有作答超时。</p>
  <p>练习有反馈，正式试次无反馈。</p></div><p>按空格继续</p>`;
}

export function experiment5V2StructureText(): string {
  return `<h1>实验结构</h1><p>先观看一个50°无遮挡完整周期，再完成6个练习试次。</p><p>正式阶段包含40°、60°、80°三个振幅区组，每区组36个试次。</p><p>按空格继续</p>`;
}

export function experiment5V2PracticeText(): string {
  return `<h1>练习阶段</h1><p>演示和练习使用正式实验中不会使用的50°振幅。</p><p>按空格观看无遮挡演示</p>`;
}

export function experiment5V2BlockText(index: number, total: number, amplitudeDeg: number): string {
  return `<h1>实验五协议2.0正式阶段</h1><p>区组 ${index} / ${total}（本区组振幅 ${amplitudeDeg}°）</p><p>按空格继续</p>`;
}
