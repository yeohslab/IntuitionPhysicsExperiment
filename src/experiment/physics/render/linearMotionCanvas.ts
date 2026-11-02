import {
  EXPERIMENT_4_BOB_RADIUS_M,
  EXPERIMENT_4_ROD_LENGTH_M,
} from "../../../experiments/experiment-4/protocol";
import { TRAINING_1_TRACK_HALF_SPAN_M } from "../../../experiments/training-1/protocol";
import {
  GRATING_CANVAS_LOGICAL_H,
  GRATING_CANVAS_LOGICAL_W,
  gratingWorldLayout,
  type GratingWorldLayout,
} from "./gratingCanvas";

export const LINEAR_MOTION_CANVAS_LOGICAL_W = GRATING_CANVAS_LOGICAL_W;
export const LINEAR_MOTION_CANVAS_LOGICAL_H = GRATING_CANVAS_LOGICAL_H;

const BACKGROUND = "#f8fafc";
const TRACK_STROKE = "#cbd5e1";
const BALL_FILL = "#2563eb";
const BALL_STROKE = "#1d4ed8";

export function linearMotionWorldLayout(
  canvasW = LINEAR_MOTION_CANVAS_LOGICAL_W,
  canvasH = LINEAR_MOTION_CANVAS_LOGICAL_H,
): GratingWorldLayout {
  return gratingWorldLayout(canvasW, canvasH, EXPERIMENT_4_ROD_LENGTH_M);
}

export type LinearMotionTrackGeometry = {
  leftCenterPx: number;
  rightCenterPx: number;
  yPx: number;
  ballRadiusPx: number;
};

export function linearMotionTrackGeometry(
  layout: GratingWorldLayout,
): LinearMotionTrackGeometry {
  return {
    leftCenterPx: layout.originX - TRAINING_1_TRACK_HALF_SPAN_M * layout.pxPerM,
    rightCenterPx: layout.originX + TRAINING_1_TRACK_HALF_SPAN_M * layout.pxPerM,
    yPx: layout.canvasH / 2,
    ballRadiusPx: EXPERIMENT_4_BOB_RADIUS_M * layout.pxPerM,
  };
}

export function drawLinearMotionFrame(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  xM: number | null,
): void {
  const geometry = linearMotionTrackGeometry(layout);
  ctx.save();
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, layout.canvasW, layout.canvasH);
  ctx.strokeStyle = TRACK_STROKE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(geometry.leftCenterPx, geometry.yPx);
  ctx.lineTo(geometry.rightCenterPx, geometry.yPx);
  ctx.stroke();
  if (xM !== null) {
    const x = layout.originX + xM * layout.pxPerM;
    ctx.fillStyle = BALL_FILL;
    ctx.strokeStyle = BALL_STROKE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, geometry.yPx, geometry.ballRadiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
