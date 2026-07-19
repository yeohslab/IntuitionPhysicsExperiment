import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import { analyzePendulum, pendulumThetaOscillationAt, PendulumRotationIntegrator } from "../../physics/pendulum";
import type { PendulumParams } from "../../physics/pendulum";
import {
  pendulumLayout,
  drawPendulumStimulusFrame,
  PENDULUM_GUIDE_BLUE,
} from "../../physics/render/pendulumCanvas";
import { pendulumWMaxDeg } from "../../physics/pendulumArcScore";
import { setupHiDpiCanvas } from "../../physics/render/canvasCoords";
import {
  PHYSICS_CANVAS_LOGICAL_H,
  PHYSICS_CANVAS_LOGICAL_W,
} from "../../physics/render/canvasLayout";

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

const info = {
  name: "physics-display",
  version: "0.1.0",
  parameters: {
    theta0Deg: { type: ParameterType.FLOAT, default: 0 },
    omega0DegPerSec: { type: ParameterType.FLOAT, default: 0 },
    rodLengthM: { type: ParameterType.FLOAT, default: 4 },
    gravity: { type: ParameterType.FLOAT, default: 9.8 },
    displayTimeT: { type: ParameterType.FLOAT, default: 2 },
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
  },
  data: {},
} as const;

type Trial = {
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  displayTimeT: number;
  unitMeta: Record<string, unknown>;
};

class PhysicsPracticePlugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: Trial): void {
    display_element.innerHTML = `
      <div class="physics-trial physics-trial--stimulus physics-trial--sim">
        <canvas class="physics-canvas" width="${PHYSICS_CANVAS_LOGICAL_W}" height="${PHYSICS_CANVAS_LOGICAL_H}"></canvas>
        <p class="physics-hint muted">观看运动，结束后自动继续。</p>
      </div>`;
    const canvas = display_element.querySelector("canvas") as HTMLCanvasElement;
    const logicalW = canvas.width;
    const logicalH = canvas.height;
    const { ctx, cssW, cssH } = setupHiDpiCanvas(canvas, logicalW, logicalH);

    const t0 = performance.now();
    const p: PendulumParams = {
      theta0Rad: degToRad(trial.theta0Deg),
      omega0RadPerSec: degToRad(trial.omega0DegPerSec),
      rodLengthM: trial.rodLengthM,
      gravity: trial.gravity,
    };
    const analysis = analyzePendulum(p);
    const durationSec = trial.displayTimeT * analysis.T;
    const rot = analysis.regime === "rotation" ? new PendulumRotationIntegrator(p) : null;
    const layout = pendulumLayout(cssW, cssH);
    const wMaxDeg = pendulumWMaxDeg(analysis.E, analysis.regime, trial.rodLengthM, trial.gravity);
    const motionRange = { regime: analysis.regime, wMaxDeg };

    const tick = (now: number) => {
      const elapsed = (now - t0) / 1000;
      const t = Math.min(elapsed, durationSec);
      let theta: number;
      if (rot) {
        rot.step(t - rot.tAccum);
        theta = rot.theta;
      } else {
        theta = pendulumThetaOscillationAt(t, p, analysis);
      }
      drawPendulumStimulusFrame(ctx, layout, theta, motionRange, 1, PENDULUM_GUIDE_BLUE);
      if (elapsed >= durationSec) {
        this.jsPsych.finishTrial({
          ...trial.unitMeta,
          physicsKind: "pendulum",
          pendulum_E_J: analysis.E,
          pendulum_T_sec: analysis.T,
          pendulum_regime: analysis.regime,
          practice_duration_sec: durationSec,
        });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

export default PhysicsPracticePlugin;
export { PhysicsPracticePlugin };
