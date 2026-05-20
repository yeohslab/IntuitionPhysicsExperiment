/**
 * 横向弹簧振子（显示模型）
 * - 物理：小球在平衡位置 x=0 附近振动，位移 x 相对平衡位置（向右为正）
 * - 显示：左侧墙面固定；弹簧仅作连接示意；平衡位置在屏幕上右移，使 [-A,+A] 落在画布内
 */

export const SPRING_BALL_RADIUS = 12;

export interface SpringLayout {
  canvasW: number;
  canvasH: number;
  /** 左墙锚点 x */
  anchorX: number;
  anchorY: number;
  /** 平衡位置 (x=0) 时弹簧自然长度（像素） */
  restSpringLenPx: number;
  pixelsPerMeter: number;
  ballRadius: number;
  /** 本次运动振幅 A（米） */
  amplitudeM: number;
}

/** 由振幅决定布局：平衡位置右移，使 x∈[-A,A] 时小球不越界 */
export function springLayout(canvasW: number, canvasH: number, amplitudeM: number): SpringLayout {
  const ballRadius = SPRING_BALL_RADIUS;
  const amp = Math.max(1e-6, amplitudeM);
  const wallX = 24;
  const marginPx = ballRadius + 12;
  const usableW = canvasW - wallX - 2 * marginPx;
  const preferredPpm = Math.min(canvasW, canvasH) * 0.55;
  const pixelsPerMeter = Math.max(40, Math.min(preferredPpm, usableW / (2 * amp)));
  const restSpringLenPx = marginPx + amp * pixelsPerMeter;
  return {
    canvasW,
    canvasH,
    anchorX: wallX,
    anchorY: canvasH * 0.5,
    restSpringLenPx,
    pixelsPerMeter,
    ballRadius,
    amplitudeM: amp,
  };
}

/** 相对平衡位置的振动区间（米） */
export function springOscillationRangeM(layout: SpringLayout): { minM: number; maxM: number } {
  return { minM: -layout.amplitudeM, maxM: layout.amplitudeM };
}

function clearCanvas(ctx: CanvasRenderingContext2D, layout: SpringLayout): void {
  ctx.clearRect(0, 0, layout.canvasW, layout.canvasH);
}

/** 平衡位置像素 x */
export function springEquilibriumPx(layout: SpringLayout): number {
  return layout.anchorX + layout.restSpringLenPx;
}

/** 位移 x（米，相对平衡位置）→ 小球中心像素 */
export function ballCenterX(layout: SpringLayout, xMeters: number): number {
  return springEquilibriumPx(layout) + xMeters * layout.pixelsPerMeter;
}

/** 汇报/拖动：钳制在真实振动范围 [-A, A] */
export function clampSpringXMeters(layout: SpringLayout, xM: number): number {
  const { minM, maxM } = springOscillationRangeM(layout);
  return Math.max(minM, Math.min(maxM, xM));
}

function oscillationLineSpan(layout: SpringLayout): { start: number; end: number } {
  const { minM, maxM } = springOscillationRangeM(layout);
  return { start: ballCenterX(layout, minM), end: ballCenterX(layout, maxM) };
}

function drawZigzagSpring(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  turns: number,
  amplitude: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const seg = len / (turns * 2);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  let cx = x0;
  let cy = y0;
  let sign = 1;
  for (let i = 0; i < turns * 2; i++) {
    const mx = cx + ux * seg * 0.5 + px * amplitude * sign;
    const my = cy + uy * seg * 0.5 + py * amplitude * sign;
    ctx.lineTo(mx, my);
    cx += ux * seg;
    cy += uy * seg;
    ctx.lineTo(cx, cy);
    sign *= -1;
  }
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function drawWall(ctx: CanvasRenderingContext2D, layout: SpringLayout): void {
  const { anchorX, anchorY } = layout;
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(anchorX - 8, anchorY - 40);
  ctx.lineTo(anchorX - 8, anchorY + 40);
  ctx.stroke();
}

function drawSpringBall(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  fill: string,
  stroke: string,
  radius: number,
): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function springLengthPx(layout: SpringLayout, xMeters: number): number {
  return layout.restSpringLenPx + xMeters * layout.pixelsPerMeter;
}

/** 仿真：按物理位移绘制（不额外钳制，|x|≤A 由运动保证） */
export function drawSpringPractice(
  ctx: CanvasRenderingContext2D,
  layout: SpringLayout,
  xMeters: number,
): void {
  const { anchorX, anchorY, ballRadius } = layout;
  const ballX = ballCenterX(layout, xMeters);
  const springLen = springLengthPx(layout, xMeters);
  const turns = Math.max(8, Math.round(12 + springLen / 28));
  ctx.save();
  clearCanvas(ctx, layout);
  drawWall(ctx, layout);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 2;
  drawZigzagSpring(ctx, anchorX, anchorY, ballX, anchorY, turns, 10);
  drawSpringBall(ctx, ballX, anchorY, "#0ea5e9", "#0369a1", ballRadius);
  ctx.restore();
}

export function drawSpringHidden(ctx: CanvasRenderingContext2D, layout: SpringLayout): void {
  clearCanvas(ctx, layout);
}

/** 汇报：振动轨迹参考线（±A）+ 估计位置上的球与弹簧 */
export function drawSpringEstimate(
  ctx: CanvasRenderingContext2D,
  layout: SpringLayout,
  xEstMeters: number,
): void {
  const { anchorX, anchorY, ballRadius } = layout;
  const xClamped = clampSpringXMeters(layout, xEstMeters);
  const { start: lineStart, end: lineEnd } = oscillationLineSpan(layout);
  const ballX = ballCenterX(layout, xClamped);
  const springLen = springLengthPx(layout, xClamped);
  const turns = Math.max(8, Math.round(12 + springLen / 28));
  const eqX = springEquilibriumPx(layout);
  ctx.save();
  clearCanvas(ctx, layout);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(lineStart, anchorY);
  ctx.lineTo(lineEnd, anchorY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#cbd5e1";
  ctx.beginPath();
  ctx.arc(eqX, anchorY, 4, 0, Math.PI * 2);
  ctx.fill();
  drawWall(ctx, layout);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 2;
  drawZigzagSpring(ctx, anchorX, anchorY, ballX, anchorY, turns, 10);
  drawSpringBall(ctx, ballX, anchorY, "#f97316", "#c2410c", ballRadius);
  ctx.restore();
}

/** 汇报引导：仅显示 ±A 轨迹与平衡位置，不显示估计球 */
export function drawSpringEstimateGuide(ctx: CanvasRenderingContext2D, layout: SpringLayout): void {
  const { anchorY } = layout;
  const { start: lineStart, end: lineEnd } = oscillationLineSpan(layout);
  const eqX = springEquilibriumPx(layout);
  ctx.save();
  clearCanvas(ctx, layout);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(lineStart, anchorY);
  ctx.lineTo(lineEnd, anchorY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#cbd5e1";
  ctx.beginPath();
  ctx.arc(eqX, anchorY, 4, 0, Math.PI * 2);
  ctx.fill();
  drawWall(ctx, layout);
  ctx.restore();
}

/** 指针 → 相对平衡位置的位移（米），汇报时钳制在 [-A, A] */
export function springDisplacementFromLogicalX(layout: SpringLayout, logicalX: number): number {
  const raw = (logicalX - springEquilibriumPx(layout)) / layout.pixelsPerMeter;
  return clampSpringXMeters(layout, raw);
}
