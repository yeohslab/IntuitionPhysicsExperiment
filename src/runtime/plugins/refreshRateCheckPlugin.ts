import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";

const info = {
  name: "refresh-rate-check",
  version: "1.0.0",
  parameters: {
    minimumHz: { type: ParameterType.FLOAT, default: 59 },
    sampleFrames: { type: ParameterType.INT, default: 120 },
  },
  data: {},
} as const;

type Trial = { minimumHz: number; sampleFrames: number };

export default class RefreshRateCheckPlugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display: HTMLElement, trial: Trial): void {
    display.innerHTML = `<div class="runner-panel"><h2>正在检测显示刷新率</h2><p class="hint muted">请保持此页面位于前台。</p></div>`;
    const intervals: number[] = [];
    let previous: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      if (previous !== null) intervals.push(now - previous);
      previous = now;
      if (intervals.length < trial.sampleFrames) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const sorted = intervals.slice().sort((a, b) => a - b);
      const medianMs = sorted[Math.floor(sorted.length / 2)]!;
      const estimatedHz = 1000 / medianMs;
      if (estimatedHz < trial.minimumHz) {
        display.innerHTML = `<div class="runner-panel runner-panel--error"><h2>刷新率不足</h2><p>检测到约 ${estimatedHz.toFixed(1)} Hz；协议2.0要求至少60 Hz。请调整显示器或浏览器设置后重新进入实验。</p></div>`;
        return;
      }
      cancelAnimationFrame(raf);
      this.jsPsych.finishTrial({
        refresh_rate_estimate_hz: estimatedHz,
        refresh_rate_median_interval_ms: medianMs,
        refresh_rate_valid: true,
      });
    };
    raf = requestAnimationFrame(tick);
  }
}
