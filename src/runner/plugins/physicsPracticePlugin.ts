import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import { analyzePendulum, pendulumThetaOscillationAt, PendulumRotationIntegrator } from "../../physics/pendulum";
import type { PendulumParams } from "../../physics/pendulum";
import { pendulumLayout, drawPendulumPractice } from "../../physics/render/pendulumCanvas";
import type { SpringParams } from "../../physics/spring";
import { springAnalysis, springDisplacementAt, springMotion } from "../../physics/spring";
import { springLayout, drawSpringPractice } from "../../physics/render/springCanvas";
import { setupHiDpiCanvas } from "../../physics/render/canvasCoords";

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

const info = {
  name: "physics-practice",
  version: "0.1.0",
  parameters: {
    physicsKind: { type: ParameterType.STRING, default: "pendulum" },
    theta0Deg: { type: ParameterType.FLOAT, default: 45 },
    omega0DegPerSec: { type: ParameterType.FLOAT, default: 0 },
    rodLengthM: { type: ParameterType.FLOAT, default: 4 },
    gravity: { type: ParameterType.FLOAT, default: 9.8 },
    displayTimeT: { type: ParameterType.FLOAT, default: 4 },
    massKg: { type: ParameterType.FLOAT, default: 1 },
    stiffness: { type: ParameterType.FLOAT, default: 4 },
    x0M: { type: ParameterType.FLOAT, default: 0.5 },
    v0Mps: { type: ParameterType.FLOAT, default: 0 },
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
  },
  data: {},
} as const;

type Trial = {
  physicsKind: "pendulum" | "spring";
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  displayTimeT: number;
  massKg: number;
  stiffness: number;
  x0M: number;
  v0Mps: number;
  unitMeta: Record<string, unknown>;
};

class PhysicsPracticePlugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: Trial): void {
    display_element.innerHTML = `
      <div class="physics-trial physics-trial--practice">
        <canvas class="physics-canvas" width="800" height="520"></canvas>
        <p class="physics-hint muted">练习试次：观看动画，结束后自动进入下一单元。</p>
      </div>`;
    const canvas = display_element.querySelector("canvas") as HTMLCanvasElement;
    const logicalW = canvas.width;
    const logicalH = canvas.height;
    const { ctx, cssW, cssH } = setupHiDpiCanvas(canvas, logicalW, logicalH);

    const t0 = performance.now();

    if (trial.physicsKind === "pendulum") {
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
        drawPendulumPractice(ctx, layout, theta);
        if (elapsed >= durationSec) {
          this.jsPsych.finishTrial({
            ...trial.unitMeta,
            physicsKind: trial.physicsKind,
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
      return;
    }

    const sp: SpringParams = {
      massKg: trial.massKg,
      stiffness: trial.stiffness,
      x0M: trial.x0M,
      v0Mps: trial.v0Mps,
    };
    const { E, T } = springAnalysis(sp);
    const durationSec = trial.displayTimeT * T;
    const { amplitudeM } = springMotion(sp);
    const layout = springLayout(cssW, cssH, amplitudeM);

    const tick = (now: number) => {
      const elapsed = (now - t0) / 1000;
      const t = Math.min(elapsed, durationSec);
      const x = springDisplacementAt(t, sp);
      drawSpringPractice(ctx, layout, x);
      if (elapsed >= durationSec) {
        this.jsPsych.finishTrial({
          ...trial.unitMeta,
          physicsKind: trial.physicsKind,
          spring_E_J: E,
          spring_T_sec: T,
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
