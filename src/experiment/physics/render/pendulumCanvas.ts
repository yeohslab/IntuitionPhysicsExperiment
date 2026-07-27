import type { PendulumRegime } from "../pendulum";
import type { StimulusVisibilityKind } from "../timePhases";

/** 仿真阶段：摆球可达角度范围示意 */
export type PendulumMotionRange = {
  regime: PendulumRegime;
  wMaxDeg: number;
};

export const PENDULUM_GUIDE_BLUE = "#2563eb";
export const PENDULUM_GUIDE_BLACK = "#0f172a";
export const PENDULUM_GUIDE_ORANGE = "#f97316";
export const PENDULUM_GUIDE_GREY = "#94a3b8";

/** 摆球半径（逻辑/绘制像素） */
export const PENDULUM_BOB_RADIUS_PX = 12;

const PENDULUM_SIM_ROD = "#2563eb";
const PENDULUM_SIM_BOB_FILL = "#2563eb";
const PENDULUM_SIM_BOB_STROKE = "#1d4ed8";

const MOTION_RANGE_DASH: [number, number] = [8, 6];

/** 摆球 Canvas：θ=0 向下，顺时针为正（与 TODO 屏幕映射一致） */

export interface PendulumLayout {
  canvasW: number;
  canvasH: number;
  anchorX: number;
  anchorY: number;
  rodPx: number;
}

function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHexByte(v: number): string {
  return Math.round(Math.max(0, Math.min(255, v)))
    .toString(16)
    .padStart(2, "0");
}

/** 轨迹虚线颜色插值（fade：蓝 → 黑） */
export function lerpGuideColor(fromHex: string, toHex: string, t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const [r0, g0, b0] = parseHexColor(fromHex);
  const [r1, g1, b1] = parseHexColor(toHex);
  return `#${toHexByte(r0 + (r1 - r0) * u)}${toHexByte(g0 + (g1 - g0) * u)}${toHexByte(b0 + (b1 - b0) * u)}`;
}

export function pendulumGuideStrokeForSimVisibility(vis: {
  kind: StimulusVisibilityKind;
  alpha: number;
}): string {
  if (vis.kind === "show") return PENDULUM_GUIDE_BLUE;
  if (vis.kind === "fadeOut") {
    return lerpGuideColor(PENDULUM_GUIDE_BLUE, PENDULUM_GUIDE_BLACK, 1 - vis.alpha);
  }
  return PENDULUM_GUIDE_BLACK;
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

function drawPendulumAnchor(ctx: CanvasRenderingContext2D, layout: PendulumLayout): void {
  const { anchorX, anchorY } = layout;
  ctx.fillStyle = "#64748b";
  ctx.beginPath();
  ctx.arc(anchorX, anchorY, 5, 0, Math.PI * 2);
  ctx.fill();
}

/** 摆杆 + 摆球（不清屏；默认含悬挂点；仿真蓝色） */
function drawPendulumRodAndBob(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaRad: number,
  alpha = 1,
  includeAnchor = true,
): void {
  const { anchorX, anchorY } = layout;
  const bob = pendulumBobPosition(layout, thetaRad);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (includeAnchor) drawPendulumAnchor(ctx, layout);
  ctx.strokeStyle = PENDULUM_SIM_ROD;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  ctx.lineTo(bob.x, bob.y);
  ctx.stroke();
  ctx.fillStyle = PENDULUM_SIM_BOB_FILL;
  ctx.beginPath();
  ctx.arc(bob.x, bob.y, PENDULUM_BOB_RADIUS_PX, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PENDULUM_SIM_BOB_STROKE;
  ctx.stroke();
  ctx.restore();
}

/** 仿真底图：清屏 + 角度范围 + 悬挂点 */
function drawPendulumSimBackground(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  motionRange: PendulumMotionRange | undefined,
  guideStrokeColor: string,
): void {
  ctx.save();
  clearCanvas(ctx, layout);
  if (motionRange) drawPendulumMotionRangeGuide(ctx, layout, motionRange, guideStrokeColor);
  drawPendulumAnchor(ctx, layout);
  ctx.restore();
}

/** 仿真底层：虚线角度范围（往复扇形 / 转圈整圆） */
function drawPendulumMotionRangeGuide(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  range: PendulumMotionRange,
  strokeColor: string,
): void {
  const { anchorX, anchorY, rodPx } = layout;
  const { regime, wMaxDeg } = range;
  if (wMaxDeg <= 0) return;

  ctx.save();
  ctx.strokeStyle = strokeColor;
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

function drawPendulumFallbackCircleGuide(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  strokeColor: string,
): void {
  const { anchorX, anchorY, rodPx } = layout;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.setLineDash(MOTION_RANGE_DASH);
  ctx.beginPath();
  ctx.arc(anchorX, anchorY, rodPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** 正式试次仿真帧：参照系常显；动力学按 alpha 绘制 */
export function drawPendulumStimulusFrame(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaRad: number,
  motionRange: PendulumMotionRange | undefined,
  dynamicsAlpha: number,
  guideStrokeColor: string,
): void {
  drawPendulumSimBackground(ctx, layout, motionRange, guideStrokeColor);
  if (dynamicsAlpha > 0) {
    drawPendulumRodAndBob(ctx, layout, thetaRad, dynamicsAlpha, false);
  }
}

/** 汇报底图：清空 + 角度范围示意 + 悬挂点（无摆杆） */
export function drawPendulumEstimateGuide(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  motionRange?: PendulumMotionRange,
  guideStrokeColor: string = PENDULUM_GUIDE_GREY,
): void {
  const { anchorX, anchorY } = layout;
  ctx.save();
  clearCanvas(ctx, layout);
  if (motionRange) {
    drawPendulumMotionRangeGuide(ctx, layout, motionRange, guideStrokeColor);
  } else {
    drawPendulumFallbackCircleGuide(ctx, layout, guideStrokeColor);
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
  drawPendulumEstimateGuide(ctx, layout, motionRange, PENDULUM_GUIDE_ORANGE);
  drawPendulumEstimateRod(ctx, layout, thetaEstRad);
}

/** 阶段 D 反馈：真实摆杆（蓝色，仅摆线） */
function drawPendulumTruthRod(
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

/** 反馈：角度范围示意 + 橙色被试选择 + 蓝色真实摆杆 */
export function drawPendulumFeedbackTruth(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaEstRad: number,
  thetaTruthRad: number,
  motionRange?: PendulumMotionRange,
): void {
  drawPendulumEstimateGuide(ctx, layout, motionRange, PENDULUM_GUIDE_GREY);
  drawPendulumEstimateRod(ctx, layout, thetaEstRad);
  drawPendulumTruthRod(ctx, layout, thetaTruthRad);
}
