/**
 * 仿真阶段只读线速度条：摆左右各一条竖条（完全相同，高度对齐运动圆）。
 * 低端 = v_min，高端 = v_max；红条比例 = (v − v_min)/(v_max − v_min)，v = l|ω|。
 * 摆动 v_min=0；旋转 v_min=最高点线速度；v_max=最低点线速度。
 * 汇报阶段 visibility 隐藏。
 */
export type SpeedIndicatorBar = {
  root: HTMLElement;
  /** 左右竖条填充比例，各 ∈[0,1] */
  setLevels: (left: number, right: number) => void;
  show: () => void;
  hide: () => void;
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export type MountSpeedIndicatorBarOpts = {
  rodPx: number;
  canvasCssW: number;
  canvasCssH: number;
  anchorX: number;
  anchorY: number;
  gapPx?: number;
};

function makeOneBar(): { root: HTMLElement; fill: HTMLElement } {
  const root = document.createElement("div");
  root.className = "physics-speed-bar";
  root.setAttribute("aria-hidden", "true");

  const track = document.createElement("div");
  track.className = "physics-speed-bar__track";

  const fill = document.createElement("div");
  fill.className = "physics-speed-bar__fill";

  track.appendChild(fill);
  root.appendChild(track);
  return { root, fill };
}

/** @param canvasFrame 包住 canvas 的 `.physics-canvas-frame` */
export function mountSpeedIndicatorBar(
  canvasFrame: HTMLElement,
  opts: MountSpeedIndicatorBarOpts,
): SpeedIndicatorBar {
  const gap = opts.gapPx ?? 10;
  const w = Math.max(1e-6, opts.canvasCssW);
  const h = Math.max(1e-6, opts.canvasCssH);
  const barH = 2 * opts.rodPx;
  const top = opts.anchorY - opts.rodPx;
  const barW = 14;

  const wrap = document.createElement("div");
  wrap.className = "physics-speed-bar-pair";
  wrap.setAttribute("aria-hidden", "true");

  const left = makeOneBar();
  left.root.classList.add("physics-speed-bar--left");
  const right = makeOneBar();
  right.root.classList.add("physics-speed-bar--right");

  for (const bar of [left, right]) {
    bar.root.style.height = `${(barH / h) * 100}%`;
    bar.root.style.top = `${(top / h) * 100}%`;
    bar.root.style.width = `${barW}px`;
  }
  left.root.style.left = `${((opts.anchorX - opts.rodPx - gap - barW) / w) * 100}%`;
  right.root.style.left = `${((opts.anchorX + opts.rodPx + gap) / w) * 100}%`;

  wrap.appendChild(left.root);
  wrap.appendChild(right.root);
  canvasFrame.appendChild(wrap);

  const setLevels = (leftLevel: number, rightLevel: number) => {
    left.fill.style.height = `${clamp01(leftLevel) * 100}%`;
    right.fill.style.height = `${clamp01(rightLevel) * 100}%`;
  };

  const show = () => {
    wrap.classList.remove("physics-speed-bar-pair--hidden");
  };

  const hide = () => {
    wrap.classList.add("physics-speed-bar-pair--hidden");
  };

  setLevels(0, 0);
  return { root: wrap, setLevels, show, hide };
}
