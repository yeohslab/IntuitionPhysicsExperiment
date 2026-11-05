import type { Training1MasteryResult } from "./mastery";
import {
  TRAINING_1_LINEAR_SPEED_SCALE_M_PER_SEC,
  TRAINING_1_MASTERY_SINGLE_THRESHOLD,
} from "./protocol";

export function training1WelcomeText(): string {
  return `<h1>训练一：速度与颜色</h1>
<p class="instr-summary">学习匀速小球的速度大小与色带位置、颜色之间的对应关系。</p>
<div class="instr-left">
<p>色带左端表示<strong>静止</strong>，右端表示<strong>最高速</strong>（约 ${TRAINING_1_LINEAR_SPEED_SCALE_M_PER_SEC.toFixed(2)} m/s，对应 60° 静止释放的单摆在最低点的速度）。颜色沿 Turbo 标尺连续变化：深蓝紫 → 亮蓝 → 青绿 → 亮黄 → 橙红 → 深红。</p>
<p>小球只沿水平直线做匀速运动。本训练不包含单摆、圆弧、摆杆、光栅、遮挡或角度判断。</p>
</div>
<p>按空格键继续</p>`;
}

export function training1StructureText(): string {
  return `<h1>训练结构</h1>
<div class="instr-left">
<p>直接完成 24 次有反馈练习，随后进行 6 次无反馈测验，不再设置速度示范。</p>
<p>如果测验未达到要求，会进行 8 次覆盖全部速度范围的有反馈补强，再进行一套新的 6 次无反馈测验；该过程持续到达标。</p>
<p>提问试次中，小球从左端开始匀速往复运动；4 秒后色带出现并开放作答。作答时小球仍会持续运动，且没有作答时限。</p>
</div>
<p>按空格键继续</p>`;
}

export function training1GuidedText(): string {
  return `<h1>有反馈练习</h1>
<p>每次小球先运动 4 秒，随后显示色带。请在小球持续往复运动时选择速度并确认，作答没有时间上限。</p>
<p>确认后小球继续运动 2 秒；橙色标记是您的选择，蓝色标记是真实速度。</p>
<p>画面右侧有“跳过反馈阶段”按钮，可一次跳过剩余的全部有反馈练习，直接进入无反馈测验。</p>
<p>共 24 次，反馈结束后自动进入下一次，不会重新回放运动。</p>
<p>按空格键开始</p>`;
}

export function training1AssessmentText(): string {
  return `<h1>无反馈测验</h1>
<p>接下来完成 6 次速度判断：小球运动 4 秒后开放作答，作答时仍持续往复。确认后立即进入下一次，不显示正确答案。</p>
<p>请独立判断小球速度与色带位置的对应关系。</p>
<p>按空格键开始</p>`;
}

export function training1RemediationText(): string {
  return `<h1>补强练习</h1>
<p>上一轮测验尚未达到要求。接下来完成 8 次覆盖全部速度范围的有反馈练习。</p>
<p>请比较橙色选择与蓝色真值的位置，重新校准速度与颜色的对应关系。</p>
<p>按空格键开始</p>`;
}

export function training1ReassessmentText(): string {
  return `<h1>再次进行无反馈测验</h1>
<p>接下来完成一套 6 次无反馈测验；若仍未达标，将继续补强并再次测验。</p>
<p>按空格键开始</p>`;
}

export function training1SummaryText(result: Training1MasteryResult): string {
  const mean = result.finalMeanAbsError?.toFixed(3) ?? "—";
  if (result.passed) {
    return `<h1>训练一已达标</h1>
<p>您在第 ${result.passedAttempt} 次测验中达到要求；最终测验平均绝对位置误差为 ${mean}，其中 ${result.finalWithinThresholdCount}/6 次误差不超过 ${TRAINING_1_MASTERY_SINGLE_THRESHOLD.toFixed(2)}。</p>
<p>按空格结束并导出。</p>`;
  }
  return `<h1>训练一尚未达标</h1>
<p>测验尚未完成或训练被中断；当前测验平均绝对位置误差为 ${mean}，其中 ${result.finalWithinThresholdCount}/6 次误差不超过 ${TRAINING_1_MASTERY_SINGLE_THRESHOLD.toFixed(2)}。</p>
<p>本轮将记录为未完成。</p>
<p>按空格结束并导出。</p>`;
}
