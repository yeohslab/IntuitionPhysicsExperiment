/** 将屏幕指针坐标映射到 Canvas 逻辑坐标（与 ctx.setTransform(dpr) 后的绘制空间一致） */

export function pointerToLogical(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  logicalW: number,
  logicalH: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: ((clientX - rect.left) / rect.width) * logicalW,
    y: ((clientY - rect.top) / rect.height) * logicalH,
  };
}

export function setupHiDpiCanvas(
  canvas: HTMLCanvasElement,
  logicalW: number,
  logicalH: number,
): { ctx: CanvasRenderingContext2D; cssW: number; cssH: number } {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, cssW: logicalW, cssH: logicalH };
}
