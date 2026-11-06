import type { GratingGeometry } from "../gratingGeometry";
import {
  drawGratingBars,
  pendulumLayoutFromGratingLayout,
  worldToCanvas,
  type GratingWorldLayout,
} from "./gratingCanvas";
import {
  drawPendulumEstimate,
  drawPendulumEstimateGuide,
  drawPendulumFeedbackTruth,
  pendulumAngleFromPointer,
  PENDULUM_GUIDE_ORANGE,
  type PendulumMotionRange,
} from "./pendulumCanvas";

const BG = "#f8fafc";
const GUIDE = "#94a3b8";

function background(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, layout.canvasW, layout.canvasH);
}

function guide(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  rodLengthM: number,
  amplitudeRad: number,
): void {
  const pivot = worldToCanvas(layout, 0, 0);
  ctx.strokeStyle = GUIDE;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(
    pivot.x,
    pivot.y,
    rodLengthM * layout.pxPerM,
    Math.PI / 2 - amplitudeRad,
    Math.PI / 2 + amplitudeRad,
  );
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function bob(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  rodLengthM: number,
  bobRadiusM: number,
  thetaRad: number,
): void {
  const p = worldToCanvas(
    layout,
    rodLengthM * Math.sin(thetaRad),
    -rodLengthM * Math.cos(thetaRad),
  );
  ctx.fillStyle = "#2563eb";
  ctx.strokeStyle = "#1d4ed8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, bobRadiusM * layout.pxPerM, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

export function drawProtocol2MotionFrame(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  geometry: GratingGeometry | null,
  rodLengthM: number,
  bobRadiusM: number,
  amplitudeRad: number,
  thetaRad: number,
  sceneAlpha = 1,
  showAmplitudeGuide = true,
): void {
  background(ctx, layout);
  const alpha = Math.max(0, Math.min(1, sceneAlpha));
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  bob(ctx, layout, rodLengthM, bobRadiusM, thetaRad);
  if (geometry) drawGratingBars(ctx, layout, geometry);
  if (showAmplitudeGuide) guide(ctx, layout, rodLengthM, amplitudeRad);
  else {
    const pivot = worldToCanvas(layout, 0, 0);
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBell(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  rodLengthM: number,
  thetaRad: number,
): void {
  // 铃铛中心与摆球中心共用同一条可达弧。
  const bellCenter = worldToCanvas(
    layout,
    rodLengthM * Math.sin(thetaRad),
    -rodLengthM * Math.cos(thetaRad),
  );
  const size = 0.18 * layout.pxPerM;
  ctx.save();
  ctx.translate(bellCenter.x, bellCenter.y);
  ctx.rotate(-thetaRad);
  ctx.fillStyle = "#f59e0b";
  ctx.strokeStyle = "#92400e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-0.55 * size, 0.35 * size);
  ctx.quadraticCurveTo(-0.5 * size, -0.55 * size, 0, -0.65 * size);
  ctx.quadraticCurveTo(0.5 * size, -0.55 * size, 0.55 * size, 0.35 * size);
  ctx.lineTo(0.7 * size, 0.55 * size);
  ctx.lineTo(-0.7 * size, 0.55 * size);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0.72 * size, 0.13 * size, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawProtocol2BellMotionFrame(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  geometry: GratingGeometry,
  rodLengthM: number,
  bobRadiusM: number,
  amplitudeRad: number,
  thetaRad: number,
  bellThetaRad: number,
  sceneAlpha = 1,
  showAmplitudeGuide = true,
): void {
  drawProtocol2MotionFrame(
    ctx,
    layout,
    geometry,
    rodLengthM,
    bobRadiusM,
    amplitudeRad,
    thetaRad,
    sceneAlpha,
    showAmplitudeGuide,
  );
  const alpha = Math.max(0, Math.min(1, sceneAlpha));
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawBell(ctx, layout, rodLengthM, bellThetaRad);
  ctx.restore();
}

export function drawProtocol2AngleReport(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  rodLengthM: number,
  amplitudeDeg: number,
  estimateRad: number,
  interacted: boolean,
): void {
  const pendulumLayout = pendulumLayoutFromGratingLayout(layout, rodLengthM);
  const range: PendulumMotionRange = {
    regime: "oscillation",
    wMaxDeg: amplitudeDeg,
  };
  if (interacted) {
    drawPendulumEstimate(ctx, pendulumLayout, estimateRad, range);
  } else {
    drawPendulumEstimateGuide(ctx, pendulumLayout, range, PENDULUM_GUIDE_ORANGE);
  }
}

export function drawProtocol2TrackingFeedback(
  ctx: CanvasRenderingContext2D,
  layout: GratingWorldLayout,
  rodLengthM: number,
  amplitudeDeg: number,
  estimateRad: number,
  truthRad: number,
): void {
  drawPendulumFeedbackTruth(
    ctx,
    pendulumLayoutFromGratingLayout(layout, rodLengthM),
    estimateRad,
    truthRad,
    { regime: "oscillation", wMaxDeg: amplitudeDeg },
  );
}

export function protocol2AngleFromPointer(
  layout: GratingWorldLayout,
  rodLengthM: number,
  amplitudeDeg: number,
  logicalX: number,
  logicalY: number,
): number {
  return pendulumAngleFromPointer(
    pendulumLayoutFromGratingLayout(layout, rodLengthM),
    logicalX,
    logicalY,
    { regime: "oscillation", wMaxDeg: amplitudeDeg },
  );
}
