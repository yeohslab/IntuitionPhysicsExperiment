import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import { analyzePendulum, pendulumThetaOmegaAt } from "../../experiment/physics/pendulum";
import { setupHiDpiCanvas } from "../../experiment/physics/render/canvasCoords";
import {
  GRATING_CANVAS_LOGICAL_H,
  GRATING_CANVAS_LOGICAL_W,
  gratingWorldLayout,
} from "../../experiment/physics/render/gratingCanvas";
import { drawProtocol2MotionFrame } from "../../experiment/physics/render/protocol2Canvas";
import { PHYSICS_ABORT_EVENT } from "./physicsStimulusPlugin";

const info = {
  name: "protocol2-pendulum-demo",
  version: "1.0.0",
  parameters: {
    amplitudeDeg: { type: ParameterType.FLOAT, default: 50 },
    rodLengthM: { type: ParameterType.FLOAT, default: 4 },
    gravity: { type: ParameterType.FLOAT, default: 9.8 },
    bobRadiusM: { type: ParameterType.FLOAT, default: 0.08 },
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
  },
  data: {},
} as const;

type Trial = {
  amplitudeDeg: number;
  rodLengthM: number;
  gravity: number;
  bobRadiusM: number;
  unitMeta: Record<string, unknown>;
};

export default class Protocol2PendulumDemoPlugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display: HTMLElement, trial: Trial): void {
    display.innerHTML = `<div class="physics-trial physics-trial--sim">
      <div class="physics-canvas-frame"><canvas class="physics-canvas physics-canvas--grating" width="${GRATING_CANVAS_LOGICAL_W}" height="${GRATING_CANVAS_LOGICAL_H}"></canvas></div>
      <div class="physics-footer"><p class="physics-hint muted">练习演示：无遮挡完整周期（50°）</p></div>
    </div>`;
    const canvas = display.querySelector("canvas") as HTMLCanvasElement;
    const { ctx } = setupHiDpiCanvas(canvas, canvas.width, canvas.height);
    const layout = gratingWorldLayout(
      GRATING_CANVAS_LOGICAL_W,
      GRATING_CANVAS_LOGICAL_H,
      trial.rodLengthM,
    );
    const params = {
      theta0Rad: (trial.amplitudeDeg * Math.PI) / 180,
      omega0RadPerSec: 0,
      rodLengthM: trial.rodLengthM,
      gravity: trial.gravity,
    };
    const analysis = analyzePendulum(params);
    const started = performance.now();
    let raf = 0;
    let frames = 0;
    let previous = started;
    let maxGap = 0;
    let finished = false;
    const cleanup = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(PHYSICS_ABORT_EVENT, cleanup);
    };
    const tick = (now: number) => {
      if (finished) return;
      frames += 1;
      maxGap = Math.max(maxGap, now - previous);
      previous = now;
      const elapsed = (now - started) / 1000;
      const state = pendulumThetaOmegaAt(Math.min(elapsed, analysis.T), params, analysis);
      drawProtocol2MotionFrame(
        ctx,
        layout,
        null,
        trial.rodLengthM,
        trial.bobRadiusM,
        (trial.amplitudeDeg * Math.PI) / 180,
        state.theta,
      );
      if (elapsed >= analysis.T) {
        finished = true;
        cleanup();
        this.jsPsych.finishTrial({
          ...trial.unitMeta,
          demo_amplitude_deg: trial.amplitudeDeg,
          demo_period_sec: analysis.T,
          sim_frame_count: frames,
          sim_max_frame_gap_ms: maxGap,
        });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener(PHYSICS_ABORT_EVENT, cleanup);
    raf = requestAnimationFrame(tick);
  }
}
