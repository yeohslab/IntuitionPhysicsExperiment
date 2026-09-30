import { PENDULUM_BOB_RADIUS_PX } from "../../experiment/physics/render/pendulumCanvas";

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

type TurboCoefficients = readonly [
  constant: number,
  linear: number,
  quadratic: number,
  cubic: number,
  quartic: number,
  quintic: number,
];

// Google Research Turbo colormap polynomial approximation:
// https://research.google/blog/turbo-an-improved-rainbow-colormap-for-visualization/
const TURBO_RED: TurboCoefficients = [
  0.13572138,
  4.6153926,
  -42.66032258,
  132.13108234,
  -152.94239396,
  59.28637943,
];
const TURBO_GREEN: TurboCoefficients = [
  0.09140261,
  2.19418839,
  4.84296658,
  -14.18503333,
  4.27729857,
  2.82956604,
];
const TURBO_BLUE: TurboCoefficients = [
  0.1066733,
  12.64194608,
  -60.58204836,
  110.36276771,
  -89.90310912,
  27.34824973,
];

function turboChannel(level: number, coefficients: TurboCoefficients): number {
  const [c0, c1, c2, c3, c4, c5] = coefficients;
  const value =
    c0 + level * (c1 + level * (c2 + level * (c3 + level * (c4 + level * c5))));
  return Math.round(clamp01(value) * 255);
}

/** 0=深蓝紫，颜色连续经过亮蓝、青绿、亮黄和橙红，1=深红。 */
export function speedColorForLevel(level: number): string {
  const normalizedLevel = clamp01(level);
  const red = turboChannel(normalizedLevel, TURBO_RED);
  const green = turboChannel(normalizedLevel, TURBO_GREEN);
  const blue = turboChannel(normalizedLevel, TURBO_BLUE);
  return `rgb(${red} ${green} ${blue})`;
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
      PENDULUM_BOB_RADIUS_PX -
      gap -
      SPEED_COLOR_STRIP_HEIGHT_PX,
    bottomPx:
      opts.anchorY + opts.rodPx + PENDULUM_BOB_RADIUS_PX + gap,
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
