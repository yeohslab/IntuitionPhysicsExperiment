/** 实验二只读速度提示：上下两条固定尺寸色块，以颜色编码绝对线速度。 */
export type SpeedColorStrips = {
  root: HTMLElement;
  setSpeed: (linearSpeedMPerSec: number) => void;
  show: () => void;
  hide: () => void;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function absoluteSpeedColorLevel(
  linearSpeedMPerSec: number,
  vMaxMPerSec: number,
): number {
  if (
    !Number.isFinite(linearSpeedMPerSec) ||
    !Number.isFinite(vMaxMPerSec) ||
    vMaxMPerSec <= 0
  ) {
    return 0;
  }
  return clamp01(Math.abs(linearSpeedMPerSec) / vMaxMPerSec);
}

/** 固定饱和度/亮度的色相插值：0=绿，0.5=黄，1=红。 */
export function speedColorForLevel(level: number): string {
  const hue = 120 * (1 - clamp01(level));
  return `hsl(${hue.toFixed(3)} 80% 45%)`;
}

export type MountSpeedColorStripsOpts = {
  rodPx: number;
  canvasCssW: number;
  canvasCssH: number;
  anchorX: number;
  anchorY: number;
  vMaxMPerSec: number;
  gapPx?: number;
};

function makeStrip(position: "top" | "bottom"): HTMLElement {
  const strip = document.createElement("div");
  strip.className = `physics-speed-color-strip physics-speed-color-strip--${position}`;
  strip.setAttribute("aria-hidden", "true");
  return strip;
}

/** @param canvasFrame 包住 canvas 的 `.physics-canvas-frame`。 */
export function mountSpeedColorStrips(
  canvasFrame: HTMLElement,
  opts: MountSpeedColorStripsOpts,
): SpeedColorStrips {
  const gap = opts.gapPx ?? 10;
  const w = Math.max(1e-6, opts.canvasCssW);
  const h = Math.max(1e-6, opts.canvasCssH);
  const stripW = 2 * opts.rodPx;
  const stripH = 14;
  const left = opts.anchorX - opts.rodPx;

  const wrap = document.createElement("div");
  wrap.className = "physics-speed-color-strips";
  wrap.setAttribute("aria-hidden", "true");

  const top = makeStrip("top");
  const bottom = makeStrip("bottom");
  for (const strip of [top, bottom]) {
    strip.style.left = `${(left / w) * 100}%`;
    strip.style.width = `${(stripW / w) * 100}%`;
    strip.style.height = `${stripH}px`;
  }
  top.style.top = `${((opts.anchorY - opts.rodPx - gap - stripH) / h) * 100}%`;
  bottom.style.top = `${((opts.anchorY + opts.rodPx + gap) / h) * 100}%`;

  wrap.append(top, bottom);
  canvasFrame.appendChild(wrap);

  const setSpeed = (linearSpeedMPerSec: number) => {
    const color = speedColorForLevel(
      absoluteSpeedColorLevel(linearSpeedMPerSec, opts.vMaxMPerSec),
    );
    top.style.backgroundColor = color;
    bottom.style.backgroundColor = color;
  };
  const show = () => wrap.classList.remove("physics-speed-color-strips--hidden");
  const hide = () => wrap.classList.add("physics-speed-color-strips--hidden");

  setSpeed(0);
  return { root: wrap, setSpeed, show, hide };
}
