import {
  drawPendulumEstimate,
  drawPendulumEstimateGuide,
  drawPendulumFeedbackTruth,
  pendulumAngleFromPointer,
  PENDULUM_GUIDE_GREY,
  PENDULUM_GUIDE_ORANGE,
  type PendulumLayout,
  type PendulumMotionRange,
} from "./pendulumCanvas";
import { gratingBarCentersM } from "../../../experiments/experiment-4/grating";
import {
  EXPERIMENT_4_BAR_WIDTH_M,
  EXPERIMENT_4_BOB_RADIUS_M,
  EXPERIMENT_4_ROD_LENGTH_M,
} from "../../../experiments/experiment-4/protocol";

/** 实验四使用独立的近 16:9 画布，不影响实验二。 */
export const GRATING_CANVAS_LOGICAL_W = 1000;
export const GRATING_CANVAS_LOGICAL_H = 560;

/** 完整下半圆到画布边缘的留白（逻辑像素）。 */
export const GRATING_EDGE_MARGIN_PX = 24;

/** 必须完全不透明，否则被遮挡的摆球会透出来。 */
const GRATING_BAR_FILL = "#64748b";
const GRATING_BG = "#f8fafc";
const GRATING_GUIDE_STROKE = "#94a3b8";

/** 世界坐标：x 向右、y 向上（m），悬挂点为原点并位于下半圆顶部。 */
export type GratingWorldLayout = {
  pxPerM: number;
  originX: number;
  originY: number;
  canvasW: number;
  canvasH: number;
};

/** 比例尺使完整下半圆（摆长 + 摆球半径）在画布内。 */
export function gratingWorldLayout(
  canvasW = GRATING_CANVAS_LOGICAL_W,
  canvasH = GRATING_CANVAS_LOGICAL_H,
  rodLengthM = EXPERIMENT_4_ROD_LENGTH_M,
): GratingWorldLayout {
  const reachM = rodLengthM + EXPERIMENT_4_BOB_RADIUS_M;
  const pxPerM = Math.min(
    (canvasW - 2 * GRATING_EDGE_MARGIN_PX) / (2 * reachM),
    (canvasH - 2 * GRATING_EDGE_MARGIN_PX) / reachM,
  );
  const reachPx = reachM * pxPerM;
  return {
    pxPerM,
    originX: canvasW / 2,
    originY: (canvasH - reachPx) / 2,
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

function drawLowerSemicircleReference(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  rodLengthM: number,
): void {
  const pivot = worldToCanvas(layout, 0, 0);
  ctx.strokeStyle = GRATING_GUIDE_STROKE;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, rodLengthM * layout.pxPerM, 0, Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPivot(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
): void {
  const pivot = worldToCanvas(layout, 0, 0);
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
  drawLowerSemicircleReference(ctx, layout, rodLengthM);
  drawPivot(ctx, layout);
  ctx.restore();
}

/** 在已画好的扇形与摆杆下面垫上光栅和背景，再补一个深色悬挂点（悬挂点与中央遮挡条同色）。 */
function underlayGrating(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  gapM: number,
  rodLengthM: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  drawLowerSemicircleReference(ctx, layout, rodLengthM);
  drawGratingBars(ctx, layout, gapM);
  ctx.fillStyle = GRATING_BG;
  ctx.fillRect(0, 0, layout.canvasW, layout.canvasH);
  ctx.restore();
  ctx.save();
  drawPivot(ctx, layout);
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
  underlayGrating(ctx, layout, gapM, EXPERIMENT_4_ROD_LENGTH_M);
}

/** 先报速度时的画布：光栅 + 灰色扇形（此时还不能点选角度）。 */
export function drawGratingIdleFrame(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  gapM: number,
  pendLayout: PendulumLayout,
  motionRange: PendulumMotionRange,
): void {
  drawPendulumEstimateGuide(ctx, pendLayout, motionRange, PENDULUM_GUIDE_GREY);
  underlayGrating(ctx, layout, gapM, EXPERIMENT_4_ROD_LENGTH_M);
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
  underlayGrating(ctx, layout, gapM, EXPERIMENT_4_ROD_LENGTH_M);
}

export function gratingAngleFromPointer(
  pendLayout: PendulumLayout,
  motionRange: PendulumMotionRange,
  logicalX: number,
  logicalY: number,
): number {
  return pendulumAngleFromPointer(pendLayout, logicalX, logicalY, motionRange);
}
