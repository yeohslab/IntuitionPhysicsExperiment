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

export function drawPendulumPractice(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaRad: number,
): void {
  const { anchorX, anchorY } = layout;
  const bob = pendulumBobPosition(layout, thetaRad);
  ctx.save();
  clearCanvas(ctx, layout);
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

export function drawPendulumStimulusVisible(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaRad: number,
): void {
  drawPendulumPractice(ctx, layout, thetaRad);
}

export function drawPendulumHidden(ctx: CanvasRenderingContext2D, layout: PendulumLayout): void {
  clearCanvas(ctx, layout);
}

/** 估计阶段：参考圆 + 当前估计杆与球 */
export function drawPendulumEstimate(
  ctx: CanvasRenderingContext2D,
  layout: PendulumLayout,
  thetaEstRad: number,
): void {
  const { anchorX, anchorY, rodPx } = layout;
  const bob = pendulumBobPosition(layout, thetaEstRad);
  ctx.save();
  clearCanvas(ctx, layout);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(anchorX, anchorY, rodPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
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
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.arc(bob.x, bob.y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#c2410c";
  ctx.stroke();
  ctx.restore();
}
