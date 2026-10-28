import {
  gratingWorldLayout,
  worldToCanvas,
  type GratingWorldLayout,
} from "./gratingCanvas";

const BG = "#f8fafc";

export function reachabilityWorldLayout(width: number, height: number, rodLengthM: number): GratingWorldLayout {
  return gratingWorldLayout(width, height, rodLengthM);
}

function drawBase(ctx: CanvasRenderingContext2D, layout: GratingWorldLayout, rodLengthM: number): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, layout.canvasW, layout.canvasH);
  const pivot = worldToCanvas(layout, 0, 0);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, rodLengthM * layout.pxPerM, 0, Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawRadialTick(ctx: CanvasRenderingContext2D, layout: GratingWorldLayout, rodLengthM: number, thetaRad: number, color: string, width: number): void {
  const inner = rodLengthM - 0.18;
  const outer = rodLengthM + 0.18;
  const p0 = worldToCanvas(layout, inner * Math.sin(thetaRad), -inner * Math.cos(thetaRad));
  const p1 = worldToCanvas(layout, outer * Math.sin(thetaRad), -outer * Math.cos(thetaRad));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
}

export function drawReachabilityMotionFrame(ctx: CanvasRenderingContext2D, layout: GratingWorldLayout, rodLengthM: number, bobRadiusM: number, thetaRad: number): void {
  drawBase(ctx, layout, rodLengthM);
  const bob = worldToCanvas(layout, rodLengthM * Math.sin(thetaRad), -rodLengthM * Math.cos(thetaRad));
  ctx.fillStyle = "#2563eb";
  ctx.strokeStyle = "#1d4ed8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(bob.x, bob.y, bobRadiusM * layout.pxPerM, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

export function drawReachabilityTargetFrame(ctx: CanvasRenderingContext2D, layout: GratingWorldLayout, rodLengthM: number, targetThetaRad: number, amplitudeThetaRad?: number): void {
  drawBase(ctx, layout, rodLengthM);
  drawRadialTick(ctx, layout, rodLengthM, targetThetaRad, "#dc2626", 5);
  if (amplitudeThetaRad !== undefined) drawRadialTick(ctx, layout, rodLengthM, amplitudeThetaRad, "#2563eb", 4);
}
