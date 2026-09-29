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

/**
 * Viridis 风格的连续速度色带。去掉原色带中辨识度较低的洋红段，
 * 以等距锚点覆盖深蓝→青绿→亮黄；锚点之间始终连续插值，不做速度分档。
 */
export const SPEED_COLOR_PALETTE_HEX = [
  "#3B528B",
  "#2C728E",
  "#21918C",
  "#28AE80",
  "#5EC962",
  "#ADDC30",
  "#FDE725",
] as const;

type RgbColor = readonly [red: number, green: number, blue: number];

const SPEED_COLOR_PALETTE_RGB: readonly RgbColor[] = [
  [59, 82, 139],
  [44, 114, 142],
  [33, 145, 140],
  [40, 174, 128],
  [94, 201, 98],
  [173, 220, 48],
  [253, 231, 37],
];

function interpolateChannel(from: number, to: number, amount: number): number {
  return Math.round(from + (to - from) * amount);
}

/** 0=深蓝，0.5=青绿，1=亮黄；相邻锚点间按 RGB 连续插值。 */
export function speedColorForLevel(level: number): string {
  const scaled = clamp01(level) * (SPEED_COLOR_PALETTE_RGB.length - 1);
  const fromIndex = Math.min(
    Math.floor(scaled),
    SPEED_COLOR_PALETTE_RGB.length - 2,
  );
  const amount = scaled - fromIndex;
  const from = SPEED_COLOR_PALETTE_RGB[fromIndex]!;
  const to = SPEED_COLOR_PALETTE_RGB[fromIndex + 1]!;
  const red = interpolateChannel(from[0], to[0], amount);
  const green = interpolateChannel(from[1], to[1], amount);
  const blue = interpolateChannel(from[2], to[2], amount);
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
