import { speedColorForLevel } from "./speedColorStrips";

export type SpeedReportStrip = {
  root: HTMLElement;
  getPosition: () => number | null;
  onChange: (handler: (level: number) => void) => void;
  /** 反馈：在被试标记之外另画真值标记。 */
  showTruth: (level: number) => void;
  /** 停止响应点击和拖动。 */
  lock: () => void;
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function mountSpeedReportStrip(container: HTMLElement): SpeedReportStrip {
  const wrap = document.createElement("div");
  wrap.className = "physics-speed-report-strip";
  wrap.innerHTML = `
    <div class="physics-speed-report-strip__track" role="slider" aria-label="速度大小" aria-valuemin="0" aria-valuemax="1" tabindex="0">
      <div class="physics-speed-report-strip__gradient"></div>
      <div class="physics-speed-report-strip__marker physics-speed-report-strip__marker--response" hidden></div>
      <div class="physics-speed-report-strip__marker physics-speed-report-strip__marker--truth" hidden></div>
    </div>
    <div class="physics-speed-report-strip__labels">
      <span>静止</span>
      <span>最快</span>
    </div>`;
  container.appendChild(wrap);
  const track = wrap.querySelector(".physics-speed-report-strip__track") as HTMLElement;
  const gradient = wrap.querySelector(".physics-speed-report-strip__gradient") as HTMLElement;
  const responseMarker = wrap.querySelector(
    ".physics-speed-report-strip__marker--response",
  ) as HTMLElement;
  const truthMarker = wrap.querySelector(
    ".physics-speed-report-strip__marker--truth",
  ) as HTMLElement;

  const steps = 32;
  const stops: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stops.push(`${speedColorForLevel(t)} ${(t * 100).toFixed(2)}%`);
  }
  gradient.style.background = `linear-gradient(to right, ${stops.join(", ")})`;

  let position: number | null = null;
  let locked = false;
  let dragging = false;
  const handlers: Array<(level: number) => void> = [];

  const placeMarker = (marker: HTMLElement, level: number) => {
    marker.hidden = false;
    marker.style.left = `${clamp01(level) * 100}%`;
  };

  const commit = (clientX: number) => {
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    position = clamp01((clientX - rect.left) / rect.width);
    placeMarker(responseMarker, position);
    track.setAttribute("aria-valuenow", String(position));
    for (const handler of handlers) handler(position);
  };

  track.addEventListener("pointerdown", (e) => {
    if (locked) return;
    dragging = true;
    track.setPointerCapture(e.pointerId);
    commit(e.clientX);
  });
  track.addEventListener("pointermove", (e) => {
    if (!dragging || locked) return;
    commit(e.clientX);
  });
  const stopDrag = () => {
    dragging = false;
  };
  track.addEventListener("pointerup", stopDrag);
  track.addEventListener("pointercancel", stopDrag);

  return {
    root: wrap,
    getPosition: () => position,
    onChange: (handler) => handlers.push(handler),
    showTruth: (level) => placeMarker(truthMarker, level),
    lock: () => {
      locked = true;
      dragging = false;
      wrap.classList.add("physics-speed-report-strip--locked");
    },
  };
}
