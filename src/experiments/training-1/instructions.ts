import { TRAINING_1_OMEGA_SCALE_RAD_PER_SEC, TRAINING_1_ROD_LENGTH_M } from "./protocol";

const vmax = TRAINING_1_ROD_LENGTH_M * TRAINING_1_OMEGA_SCALE_RAD_PER_SEC;

export function training1WelcomeText(): string {
  return `<h1>训练一：速度与颜色</h1>
<p class="instr-summary">学习瞬时速度大小与色带位置、颜色之间的对应关系。</p>
<div class="instr-left">
<p>色带左端表示<strong>静止</strong>，右端表示<strong>最高速</strong>（约 ${vmax.toFixed(2)} m/s，对应实验四最高能量在最低点的速度）。颜色沿 Turbo 标尺连续变化：深蓝紫 → 亮蓝 → 青绿 → 亮黄 → 橙红 → 深红。</p>
<p>本训练不包含光栅、遮挡、角度汇报或双任务，只练习观察摆球的瞬时速度并在色带上指定位置。</p>
</div>
<p>按空格键继续</p>`;
}

export function training1StructureText(): string {
  return `<h1>训练结构</h1>
<p>首先观看静止、较慢、中等、较快和最高速五个锚点示范。</p>
<p>随后开始作答。每次选择后会回放刚才的运动：橙色标记是您的选择，蓝色标记随真实速度移动。</p>
<p>至少完成 16 次；达到准确度要求后结束，否则每次增加 8 次，最多 40 次。</p>
<p>按空格继续</p>`;
}

export function training1AnchorText(): string {
  return `<h1>锚点示范</h1>
<p>观看蓝色标记如何随摆球的真实瞬时速度移动。每段结束时会突出本次锚点。</p>
<p>按空格开始</p>`;
}

export function training1ReportText(): string {
  return `<h1>速度指定</h1>
<p>摆球运动 0.8 秒后会停下。请在色带上点击停止瞬间的速度大小并确认。</p>
<p>反馈回放结束后按空格进入下一次。</p>
<p>按空格开始</p>`;
}

export function training1SummaryText(result: {
  passed: boolean;
  completedReportTrials: number;
  recentMeanAbsError: number | null;
  recentWithinThresholdCount: number;
}): string {
  const mean = result.recentMeanAbsError?.toFixed(3) ?? "—";
  if (result.passed) {
    return `<h1>训练一已达标</h1>
<p>共完成 ${result.completedReportTrials} 次速度指定；最近 8 次平均绝对位置误差为 ${mean}，其中 ${result.recentWithinThresholdCount}/8 次误差不超过 0.15。</p>
<p>按空格结束并导出。</p>`;
  }
  return `<h1>训练一尚未达标</h1>
<p>已完成 ${result.completedReportTrials} 次速度指定；最近 8 次平均绝对位置误差为 ${mean}，其中 ${result.recentWithinThresholdCount}/8 次误差不超过 0.15。</p>
<p>本轮将记录为未完成。请导出后重新开始训练一。</p>
<p>按空格结束并导出。</p>`;
}
