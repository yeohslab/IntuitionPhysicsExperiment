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

export const SPEED_COLOR_STRIP_HEIGHT_PX = 28;
export const SPEED_COLOR_STRIP_GAP_PX = 4;

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

/** 固定饱和度/亮度的色相插值：0=蓝，0.5=紫红，1=红。 */
export function speedColorForLevel(level: number): string {
  const hue = 240 + 120 * clamp01(level);
  return `hsl(${hue.toFixed(3)} 90% 50%)`;
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

export type SpeedColorStripGeometry = {
  leftPx: number;
  widthPx: number;
  heightPx: number;
  topPx: number;
  bottomPx: number;
};

export function calculateSpeedColorStripGeometry(
  opts: Pick<
    MountSpeedColorStripsOpts,
    "rodPx" | "anchorX" | "anchorY" | "gapPx"
  >,
): SpeedColorStripGeometry {
  const gap = opts.gapPx ?? SPEED_COLOR_STRIP_GAP_PX;
  return {
    leftPx: opts.anchorX - opts.rodPx,
    widthPx: 2 * opts.rodPx,
    heightPx: SPEED_COLOR_STRIP_HEIGHT_PX,
    topPx:
      opts.anchorY -
      opts.rodPx -
      gap -
      SPEED_COLOR_STRIP_HEIGHT_PX,
    bottomPx: opts.anchorY + opts.rodPx + gap,
  };
}

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
  const w = Math.max(1e-6, opts.canvasCssW);
  const h = Math.max(1e-6, opts.canvasCssH);
  const geometry = calculateSpeedColorStripGeometry(opts);

  const wrap = document.createElement("div");
  wrap.className = "physics-speed-color-strips";
  wrap.setAttribute("aria-hidden", "true");

  const top = makeStrip("top");
  const bottom = makeStrip("bottom");
  for (const strip of [top, bottom]) {
    strip.style.left = `${(geometry.leftPx / w) * 100}%`;
    strip.style.width = `${(geometry.widthPx / w) * 100}%`;
    strip.style.height = `${geometry.heightPx}px`;
  }
  top.style.top = `${(geometry.topPx / h) * 100}%`;
  bottom.style.top = `${(geometry.bottomPx / h) * 100}%`;

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
