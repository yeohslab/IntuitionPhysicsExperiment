import {
  drawPendulumEstimate,
  drawPendulumEstimateGuide,
  drawPendulumFeedbackTruth,
  pendulumAngleFromPointer,
  PENDULUM_GUIDE_ORANGE,
  type PendulumLayout,
  type PendulumMotionRange,
} from "./pendulumCanvas";
import {
  PHYSICS_CANVAS_LOGICAL_H,
  PHYSICS_CANVAS_LOGICAL_W,
} from "./canvasLayout";
import { gratingBarCentersM } from "../../../experiments/experiment-4/grating";
import {
  EXPERIMENT_4_BAR_WIDTH_M,
  EXPERIMENT_4_BOB_RADIUS_M,
  EXPERIMENT_4_ROD_LENGTH_M,
} from "../../../experiments/experiment-4/protocol";

export const GRATING_CANVAS_LOGICAL_W = PHYSICS_CANVAS_LOGICAL_W;
export const GRATING_CANVAS_LOGICAL_H = PHYSICS_CANVAS_LOGICAL_H;

/** 悬挂点到画布上下边缘的最小留白（逻辑像素）。 */
const GRATING_EDGE_MARGIN_PX = 16;

/** 必须完全不透明，否则被遮挡的摆球会透出来。 */
const GRATING_BAR_FILL = "#64748b";
const GRATING_BG = "#f8fafc";
const GRATING_GUIDE_STROKE = "#94a3b8";

/** 世界坐标：x 向右、y 向上（m），悬挂点在原点并位于画布中心。 */
export type GratingWorldLayout = {
  pxPerM: number;
  originX: number;
  originY: number;
  canvasW: number;
  canvasH: number;
};

/** 比例尺使整圈（摆长 + 摆球半径）在画布内，摆动与转动共用同一画面。 */
export function gratingWorldLayout(
  canvasW = GRATING_CANVAS_LOGICAL_W,
  canvasH = GRATING_CANVAS_LOGICAL_H,
  rodLengthM = EXPERIMENT_4_ROD_LENGTH_M,
): GratingWorldLayout {
  const reachM = rodLengthM + EXPERIMENT_4_BOB_RADIUS_M;
  const pxPerM =
    (Math.min(canvasW, canvasH) - 2 * GRATING_EDGE_MARGIN_PX) / (2 * reachM);
  return {
    pxPerM,
    originX: canvasW / 2,
    originY: canvasH / 2,
    canvasW,
    canvasH,
  };
}

/** 汇报与反馈复用刺激画面的悬挂点与比例尺。 */
export function pendulumLayoutFromGratingLayout(
  layout: GratingWorldLayout,
  rodLengthM: number,
): PendulumLayout {
  return {
    canvasW: layout.canvasW,
    canvasH: layout.canvasH,
    anchorX: layout.originX,
    anchorY: layout.originY,
    rodPx: rodLengthM * layout.pxPerM,
  };
}

export function worldToCanvas(
  layout: GratingWorldLayout,
  xM: number,
  yM: number,
): { x: number; y: number } {
  return {
    x: layout.originX + xM * layout.pxPerM,
    y: layout.originY - yM * layout.pxPerM,
  };
}

function drawGratingBars(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  gapM: number,
): void {
  const halfBarPx = (EXPERIMENT_4_BAR_WIDTH_M / 2) * layout.pxPerM;
  const visibleHalfWidthM = layout.canvasW / 2 / layout.pxPerM;
  ctx.fillStyle = GRATING_BAR_FILL;
  for (const centerM of gratingBarCentersM(gapM, visibleHalfWidthM)) {
    const centerPx = worldToCanvas(layout, centerM, 0).x;
    ctx.fillRect(centerPx - halfBarPx, 0, halfBarPx * 2, layout.canvasH);
  }
}

function drawStaticReferences(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  rodLengthM: number,
): void {
  const pivot = worldToCanvas(layout, 0, 0);
  ctx.strokeStyle = GRATING_GUIDE_STROKE;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, rodLengthM * layout.pxPerM, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawGratingBob(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  rodLengthM: number,
  thetaRad: number,
): void {
  const { x, y } = worldToCanvas(
    layout,
    rodLengthM * Math.sin(thetaRad),
    -rodLengthM * Math.cos(thetaRad),
  );
  ctx.fillStyle = "#2563eb";
  ctx.strokeStyle = "#1d4ed8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, EXPERIMENT_4_BOB_RADIUS_M * layout.pxPerM, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** 绘制顺序：背景 → 摆球 → 遮挡条 → 静态圆周与悬挂点（遮挡条盖住摆球）。 */
export function drawGratingStimulusFrame(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  gapM: number,
  rodLengthM: number,
  thetaRad: number,
): void {
  ctx.save();
  ctx.fillStyle = GRATING_BG;
  ctx.fillRect(0, 0, layout.canvasW, layout.canvasH);
  drawGratingBob(ctx, layout, rodLengthM, thetaRad);
  drawGratingBars(ctx, layout, gapM);
  drawStaticReferences(ctx, layout, rodLengthM);
  ctx.restore();
}

/** 在已画好的扇形与摆杆下面垫上光栅和背景，再补一个深色悬挂点（悬挂点与中央遮挡条同色）。 */
function underlayGrating(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  gapM: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  drawGratingBars(ctx, layout, gapM);
  ctx.fillStyle = GRATING_BG;
  ctx.fillRect(0, 0, layout.canvasW, layout.canvasH);
  ctx.restore();
  const pivot = worldToCanvas(layout, 0, 0);
  ctx.save();
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawGratingReportFrame(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  gapM: number,
  pendLayout: PendulumLayout,
  motionRange: PendulumMotionRange,
  thetaEstRad: number,
  estimateInteracted: boolean,
): void {
  if (estimateInteracted) {
    drawPendulumEstimate(ctx, pendLayout, thetaEstRad, motionRange);
  } else {
    drawPendulumEstimateGuide(ctx, pendLayout, motionRange, PENDULUM_GUIDE_ORANGE);
  }
  underlayGrating(ctx, layout, gapM);
}

export function drawGratingFeedbackFrame(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  gapM: number,
  pendLayout: PendulumLayout,
  motionRange: PendulumMotionRange,
  thetaEstRad: number,
  thetaTruthRad: number,
): void {
  drawPendulumFeedbackTruth(ctx, pendLayout, thetaEstRad, thetaTruthRad, motionRange);
  underlayGrating(ctx, layout, gapM);
}

export function gratingAngleFromPointer(
  pendLayout: PendulumLayout,
  motionRange: PendulumMotionRange,
  logicalX: number,
  logicalY: number,
): number {
  return pendulumAngleFromPointer(pendLayout, logicalX, logicalY, motionRange);
}
