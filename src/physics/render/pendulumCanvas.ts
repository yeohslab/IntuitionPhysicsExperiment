import type { PendulumRegime } from "../pendulum";
import { PHYSICS_HIDDEN_FILL, PHYSICS_OCCLUSION_FILL_DEVELOPER } from "./canvasLayout";

/** 仿真阶段：摆球可达角度范围示意 */
export type PendulumMotionRange = {
  regime: PendulumRegime;
  wMaxDeg: number;
};

const MOTION_RANGE_STROKE = "#94a3b8";
const MOTION_RANGE_DASH: [number, number] = [8, 6];

/** 摆球 Canvas：θ=0 向下，顺时针为正（与 TODO 屏幕映射一致） */

export interface PendulumLayout {
  canvasW: number;
  canvasH: number;
  anchorX: number;
  anchorY: number;
  rodPx: number;
}

export function pendulumLayout(canvasW: number, canvasH: number): PendulumLayout {
  const rodPx = Math.min(canvasW, canvasH) * 0.36;
  const topMargin = 32;
  return {
    canvasW,
    canvasH,
    anchorX: canvasW / 2,
    anchorY: rodPx + topMargin,
    rodPx,
  };
}

function clearCanvas(ctx: CanvasRenderingContext2D, layout: PendulumLayout): void {
  ctx.clearRect(0, 0, layout.canvasW, layout.canvasH);
}

/** 角位置 → 摆球中心像素 */
export function pendulumBobPosition(layout: PendulumLayout, thetaRad: number): { x: number; y: number } {
  const { anchorX, anchorY, rodPx } = layout;
  return {
    x: anchorX + rodPx * Math.sin(thetaRad),
    y: anchorY + rodPx * Math.cos(thetaRad),
  };
}

/**
 * 摆球 θ（0=向下、顺时针为正）→ Canvas arc 角（0=向右、顺时针为正）。
 * 与 pendulumBobPosition 一致：bob 方向为 (sin θ, cos θ)。
 */
export function pendulumThetaToCanvasArcAngle(thetaRad: number): number {
  return Math.atan2(Math.cos(thetaRad), Math.sin(thetaRad));
}

/** 从鼠标位置估计 θ（弧度） */
export function pendulumAngleFromPointer(
  layout: PendulumLayout,
  logicalX: number,
  logicalY: number,
): number {
  const dx = logicalX - layout.anchorX;
  const dy = logicalY - layout.anchorY;
  return Math.atan2(dx, dy);
}

/** 摆杆 + 摆球（不清屏） */
export function drawPendulumRodAndBob(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaRad: number,
): void {
  const { anchorX, anchorY } = layout;
  const bob = pendulumBobPosition(layout, thetaRad);
  ctx.save();
  ctx.strokeStyle = "#334155";
  ctx.fillStyle = "#64748b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(anchorX, anchorY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  ctx.lineTo(bob.x, bob.y);
  ctx.stroke();
  ctx.fillStyle = "#0ea5e9";
  ctx.beginPath();
  ctx.arc(bob.x, bob.y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0369a1";
  ctx.stroke();
  ctx.restore();
}

/** 仿真底层：虚线角度范围（往复扇形 / 转圈整圆） */
export function drawPendulumMotionRangeGuide(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  range: PendulumMotionRange,
): void {
  const { anchorX, anchorY, rodPx } = layout;
  const { regime, wMaxDeg } = range;
  if (wMaxDeg <= 0) return;

  ctx.save();
  ctx.strokeStyle = MOTION_RANGE_STROKE;
  ctx.lineWidth = 2;
  ctx.setLineDash(MOTION_RANGE_DASH);

  if (regime === "rotation") {
    ctx.beginPath();
    ctx.arc(anchorX, anchorY, rodPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const halfRad = (wMaxDeg * Math.PI) / 180;
  const thetaLo = -halfRad;
  const thetaHi = halfRad;
  const steps = Math.max(8, Math.ceil((wMaxDeg / 90) * 24));
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  for (let i = 0; i <= steps; i++) {
    const t = thetaLo + ((thetaHi - thetaLo) * i) / steps;
    const bob = pendulumBobPosition(layout, t);
    ctx.lineTo(bob.x, bob.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function drawPendulumPractice(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaRad: number,
  motionRange?: PendulumMotionRange,
): void {
  ctx.save();
  clearCanvas(ctx, layout);
  if (motionRange) drawPendulumMotionRangeGuide(ctx, layout, motionRange);
  drawPendulumRodAndBob(ctx, layout, thetaRad);
  ctx.restore();
}

export function drawPendulumStimulusVisible(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaRad: number,
  motionRange?: PendulumMotionRange,
): void {
  drawPendulumPractice(ctx, layout, thetaRad, motionRange);
}

/** hide 时段叠加于运动画面之上的遮挡层 */
export function drawPendulumOcclusion(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  semiTransparent: boolean,
): void {
  ctx.save();
  ctx.fillStyle = semiTransparent ? PHYSICS_OCCLUSION_FILL_DEVELOPER : PHYSICS_HIDDEN_FILL;
  ctx.fillRect(0, 0, layout.canvasW, layout.canvasH);
  ctx.restore();
}

/** 汇报底图：清空 + 角度范围示意 + 悬挂点（无摆杆） */
export function drawPendulumEstimateGuide(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  motionRange?: PendulumMotionRange,
): void {
  const { anchorX, anchorY, rodPx } = layout;
  ctx.save();
  clearCanvas(ctx, layout);
  if (motionRange) {
    drawPendulumMotionRangeGuide(ctx, layout, motionRange);
  } else {
    ctx.strokeStyle = MOTION_RANGE_STROKE;
    ctx.lineWidth = 2;
    ctx.setLineDash(MOTION_RANGE_DASH);
    ctx.beginPath();
    ctx.arc(anchorX, anchorY, rodPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.arc(anchorX, anchorY, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#64748b";
  ctx.fill();
  ctx.restore();
}

function drawPendulumEstimateRod(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaEstRad: number,
): void {
  const { anchorX, anchorY } = layout;
  const bob = pendulumBobPosition(layout, thetaEstRad);
  ctx.save();
  ctx.strokeStyle = "#f97316";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  ctx.lineTo(bob.x, bob.y);
  ctx.stroke();
  ctx.restore();
}

/** 阶段 B 汇报：角度范围示意 + 估计摆杆（仅摆线，不画摆球） */
export function drawPendulumEstimate(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaEstRad: number,
  motionRange?: PendulumMotionRange,
): void {
  drawPendulumEstimateGuide(ctx, layout, motionRange);
  drawPendulumEstimateRod(ctx, layout, thetaEstRad);
}

/** 阶段 D 反馈：真实摆杆（蓝色，仅摆线） */
export function drawPendulumTruthRod(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaTruthRad: number,
): void {
  const { anchorX, anchorY } = layout;
  const bob = pendulumBobPosition(layout, thetaTruthRad);
  ctx.save();
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  ctx.lineTo(bob.x, bob.y);
  ctx.stroke();
  ctx.restore();
}

/** 阶段 D：保留橙色估计与扇形，叠加蓝色真实摆杆 */
export function drawPendulumFeedbackCompare(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaEstRad: number,
  arcHalfWidthDeg: number,
  thetaTruthRad: number,
  showEstimate: boolean,
  showArc: boolean,
): void {
  if (showEstimate) {
    drawPendulumEstimateWithArc(ctx, layout, thetaEstRad, arcHalfWidthDeg, showArc);
  } else {
    drawPendulumEstimateGuide(ctx, layout);
  }
  drawPendulumTruthRod(ctx, layout, thetaTruthRad);
}

/** 阶段 C：不确定度扇形（半宽为度） */
export function drawPendulumEstimateArc(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaEstRad: number,
  halfWidthDeg: number,
): void {
  if (halfWidthDeg <= 0) return;
  const { anchorX, anchorY } = layout;
  const halfRad = (halfWidthDeg * Math.PI) / 180;
  const thetaLo = thetaEstRad - halfRad;
  const thetaHi = thetaEstRad + halfRad;
  const steps = Math.max(8, Math.ceil((halfWidthDeg / 90) * 24));
  ctx.save();
  ctx.fillStyle = "rgba(249, 115, 22, 0.28)";
  ctx.strokeStyle = "rgba(194, 65, 12, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  for (let i = 0; i <= steps; i++) {
    const t = thetaLo + ((thetaHi - thetaLo) * i) / steps;
    const bob = pendulumBobPosition(layout, t);
    ctx.lineTo(bob.x, bob.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawPendulumEstimateWithArc(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaEstRad: number,
  halfWidthDeg: number,
  showArc: boolean,
): void {
  drawPendulumEstimate(ctx, layout, thetaEstRad);
  if (showArc && halfWidthDeg > 0) {
    drawPendulumEstimateArc(ctx, layout, thetaEstRad, halfWidthDeg);
  }
}

/** 反馈：角度范围示意 + 橙色估计摆杆 + 蓝色真实摆杆 */
export function drawPendulumFeedbackTruth(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaEstRad: number,
  thetaTruthRad: number,
  motionRange?: PendulumMotionRange,
): void {
  drawPendulumEstimate(ctx, layout, thetaEstRad, motionRange);
  drawPendulumTruthRod(ctx, layout, thetaTruthRad);
}
