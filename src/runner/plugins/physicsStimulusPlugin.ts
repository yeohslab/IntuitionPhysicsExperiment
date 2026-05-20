import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import { analyzePendulum, pendulumThetaOscillationAt, PendulumRotationIntegrator } from "../../physics/pendulum";
import type { PendulumParams } from "../../physics/pendulum";
import {
  pendulumLayout,
  drawPendulumStimulusVisible,
  drawPendulumHidden,
  drawPendulumEstimate,
  pendulumAngleFromPointer,
} from "../../physics/render/pendulumCanvas";
import type { SpringParams } from "../../physics/spring";
import { springAnalysis, springDisplacementAt, springMotion } from "../../physics/spring";
import {
  springLayout,
  drawSpringPractice,
  drawSpringHidden,
  drawSpringEstimate,
  drawSpringEstimateGuide,
  springDisplacementFromLogicalX,
} from "../../physics/render/springCanvas";
import { pointerToLogical, setupHiDpiCanvas } from "../../physics/render/canvasCoords";
import {
  buildTimePhases,
  sumSegmentMultiples,
  withSyncedTotalTimeT,
  type TimePhase,
} from "../../physics/timePhases";
import { normalizeKeyForJsPsych } from "../../shared/keys";
import { cancelStaleKeyboardListeners } from "../stimulusControl";

type KeyboardHandler = (e: KeyboardEvent) => void;

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

function phaseKindAt(phases: TimePhase[], tSec: number): "show" | "hide" {
  if (phases.length === 0) return "show";
  let k: "show" | "hide" = "show";
  for (const p of phases) {
    if (tSec + 1e-12 >= p.startSec) k = p.kind;
  }
  return k;
}

function wrapDeltaAngle(d: number): number {
  let x = d;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

function mountEstimatePanel(footer: HTMLElement, simHint: HTMLElement): HTMLButtonElement {
  simHint.remove();
  const panel = document.createElement("div");
  panel.className = "physics-estimate-ui";
  panel.innerHTML = `
    <p class="physics-hint">请在画面上点击并拖动以给出估计，然后按空格或点击下方按钮确认。</p>
    <button type="button" class="btn btn-primary" id="physics-confirm">确认</button>`;
  footer.appendChild(panel);
  return panel.querySelector("#physics-confirm") as HTMLButtonElement;
}

const info = {
  name: "physics-stimulus",
  version: "0.1.0",
  parameters: {
    physicsKind: { type: ParameterType.STRING, default: "pendulum" },
    theta0Deg: { type: ParameterType.FLOAT, default: 45 },
    omega0DegPerSec: { type: ParameterType.FLOAT, default: 0 },
    rodLengthM: { type: ParameterType.FLOAT, default: 4 },
    gravity: { type: ParameterType.FLOAT, default: 9.8 },
    totalTimeT: { type: ParameterType.FLOAT, default: 5 },
    show1T: { type: ParameterType.FLOAT, default: 1.9 },
    hide1T: { type: ParameterType.FLOAT, default: 1.7 },
    show2T: { type: ParameterType.FLOAT, default: 1.3 },
    hide2T: { type: ParameterType.FLOAT, default: 1.1 },
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
  totalTimeT: number;
  show1T: number;
  hide1T: number;
  show2T: number;
  hide2T: number;
  massKg: number;
  stiffness: number;
  x0M: number;
  v0Mps: number;
  unitMeta: Record<string, unknown>;
};

class PhysicsStimulusPlugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: Trial): void {
    cancelStaleKeyboardListeners(this.jsPsych);
    display_element.innerHTML = `
      <div class="physics-trial physics-trial--stimulus">
        <canvas class="physics-canvas" width="800" height="520"></canvas>
        <div class="physics-footer">
          <p class="physics-hint muted physics-sim-hint">观看摆球/弹簧的运动（部分时段会隐藏）。</p>
        </div>
      </div>`;

    const canvas = display_element.querySelector("canvas") as HTMLCanvasElement;
    const logicalW = canvas.width;
    const logicalH = canvas.height;
    const { ctx, cssW, cssH } = setupHiDpiCanvas(canvas, logicalW, logicalH);

    const footer = display_element.querySelector(".physics-footer") as HTMLElement;
    const simHint = display_element.querySelector(".physics-sim-hint") as HTMLElement;

    const t0 = performance.now();
    let raf = 0;
    let phase: "sim" | "estimate" = "sim";

    const finish = (extra: Record<string, unknown>) => {
      this.jsPsych.finishTrial({ ...trial.unitMeta, ...extra });
    };

    const timing = withSyncedTotalTimeT({
      totalTimeT: trial.totalTimeT,
      show1T: trial.show1T,
      hide1T: trial.hide1T,
      show2T: trial.show2T,
      hide2T: trial.hide2T,
    });
    const totalTimeT = sumSegmentMultiples(timing);

    if (trial.physicsKind === "pendulum") {
      const p: PendulumParams = {
        theta0Rad: degToRad(trial.theta0Deg),
        omega0RadPerSec: degToRad(trial.omega0DegPerSec),
        rodLengthM: trial.rodLengthM,
        gravity: trial.gravity,
      };
      const analysis = analyzePendulum(p);
      const T = analysis.T;
      const phases = buildTimePhases(timing, T);
      const simEndSec = totalTimeT * T;
      const rot = analysis.regime === "rotation" ? new PendulumRotationIntegrator(p) : null;
      const layout = pendulumLayout(cssW, cssH);

      let thetaEst = 0;
      let dragging = false;
      let kbListener: KeyboardHandler | null = null;

      const pointerAngle = (e: PointerEvent) => {
        const pt = pointerToLogical(e.clientX, e.clientY, canvas, cssW, cssH);
        return pendulumAngleFromPointer(layout, pt.x, pt.y);
      };

      const paintEst = () => {
        drawPendulumEstimate(ctx, layout, thetaEst);
      };

      const startPendulumEstimate = (thetaActualFrozen: number) => {
        phase = "estimate";
        drawPendulumHidden(ctx, layout);
        paintEst();
        const confirmBtn = mountEstimatePanel(footer, simHint);

        const onDown = (e: PointerEvent) => {
          canvas.setPointerCapture(e.pointerId);
          dragging = true;
          thetaEst = pointerAngle(e);
          paintEst();
        };
        const onMove = (e: PointerEvent) => {
          if (!dragging) return;
          thetaEst = pointerAngle(e);
          paintEst();
        };
        const onUp = () => {
          dragging = false;
        };
        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp);
        canvas.addEventListener("pointercancel", onUp);

        const key = normalizeKeyForJsPsych(" ");

        const submit = () => {
          const thetaActualVal = thetaActualFrozen;
          const delta = wrapDeltaAngle(thetaEst - thetaActualVal);
          if (kbListener !== null) this.jsPsych.pluginAPI.cancelKeyboardResponse(kbListener);
          canvas.removeEventListener("pointerdown", onDown);
          canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp);
          canvas.removeEventListener("pointercancel", onUp);
          confirmBtn.removeEventListener("click", onConfirm);
          finish({
            physicsKind: trial.physicsKind,
            pendulum_E_J: analysis.E,
            pendulum_T_sec: T,
            pendulum_regime: analysis.regime,
            stimulus_time_phases_json: JSON.stringify(phases),
            total_time_T: totalTimeT,
            theta_actual_rad: thetaActualVal,
            theta_estimated_rad: thetaEst,
            delta_theta_rad: delta,
            delta_theta_deg: (delta * 180) / Math.PI,
          });
        };

        const onConfirm = () => {
          submit();
        };

        kbListener = this.jsPsych.pluginAPI.getKeyboardResponse({
          callback_function: () => {
            submit();
          },
          valid_responses: [key],
          rt_method: "performance",
          persist: true,
          allow_held_key: false,
        }) as KeyboardHandler;

        confirmBtn.addEventListener("click", onConfirm);
      };

      const simTick = (now: number) => {
        if (phase !== "sim") return;
        const elapsed = (now - t0) / 1000;
        const t = Math.min(elapsed, simEndSec);
        let theta: number;
        if (rot) {
          rot.step(t - rot.tAccum);
          theta = rot.theta;
        } else {
          theta = pendulumThetaOscillationAt(t, p, analysis);
        }
        const pk = phaseKindAt(phases, t);
        if (pk === "hide") drawPendulumHidden(ctx, layout);
        else drawPendulumStimulusVisible(ctx, layout, theta);

        if (elapsed >= simEndSec) {
          cancelAnimationFrame(raf);
          const thetaActual = rot ? rot.theta : pendulumThetaOscillationAt(simEndSec, p, analysis);
          startPendulumEstimate(thetaActual);
          return;
        }
        raf = requestAnimationFrame(simTick);
      };

      raf = requestAnimationFrame(simTick);
      return;
    }

    const sp: SpringParams = {
      massKg: trial.massKg,
      stiffness: trial.stiffness,
      x0M: trial.x0M,
      v0Mps: trial.v0Mps,
    };
    const { E, T } = springAnalysis(sp);
    const phases = buildTimePhases(timing, T);
    const simEndSec = totalTimeT * T;
    const { amplitudeM } = springMotion(sp);
    const layout = springLayout(cssW, cssH, amplitudeM);

    let xEst = 0;
    let dragging = false;
    let kbListener: KeyboardHandler | null = null;

    const pointerSpringX = (e: PointerEvent) => {
      const pt = pointerToLogical(e.clientX, e.clientY, canvas, cssW, cssH);
      return springDisplacementFromLogicalX(layout, pt.x);
    };

    const paintSpringEst = () => {
      drawSpringEstimate(ctx, layout, xEst);
    };

    const startSpringEstimate = (xActualFrozen: number) => {
      phase = "estimate";
      drawSpringHidden(ctx, layout);
      drawSpringEstimateGuide(ctx, layout);
      const confirmBtn = mountEstimatePanel(footer, simHint);
      xEst = 0;
      paintSpringEst();

      const onDown = (e: PointerEvent) => {
        canvas.setPointerCapture(e.pointerId);
        dragging = true;
        xEst = pointerSpringX(e);
        paintSpringEst();
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        xEst = pointerSpringX(e);
        paintSpringEst();
      };
      const onUp = () => {
        dragging = false;
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);

      const key = normalizeKeyForJsPsych(" ");

      const submitSpring = () => {
        const xActual = xActualFrozen;
        if (kbListener !== null) this.jsPsych.pluginAPI.cancelKeyboardResponse(kbListener);
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
        confirmBtn.removeEventListener("click", onConfirmSpring);
        finish({
          physicsKind: trial.physicsKind,
          spring_E_J: E,
          spring_T_sec: T,
          stimulus_time_phases_json: JSON.stringify(phases),
          total_time_T: totalTimeT,
          x_actual_m: xActual,
          x_estimated_m: xEst,
          delta_x_m: xEst - xActual,
        });
      };

      const onConfirmSpring = () => {
        submitSpring();
      };

      kbListener = this.jsPsych.pluginAPI.getKeyboardResponse({
        callback_function: () => {
          submitSpring();
        },
        valid_responses: [key],
        rt_method: "performance",
        persist: true,
        allow_held_key: false,
      }) as KeyboardHandler;

      confirmBtn.addEventListener("click", onConfirmSpring);
    };

    const simTick = (now: number) => {
      if (phase !== "sim") return;
      const elapsed = (now - t0) / 1000;
      const t = Math.min(elapsed, simEndSec);
      const x = springDisplacementAt(t, sp);
      const pk = phaseKindAt(phases, t);
      if (pk === "hide") drawSpringHidden(ctx, layout);
      else drawSpringPractice(ctx, layout, x);
      if (elapsed >= simEndSec) {
        cancelAnimationFrame(raf);
        const xActual = springDisplacementAt(simEndSec, sp);
        startSpringEstimate(xActual);
        return;
      }
      raf = requestAnimationFrame(simTick);
    };

    raf = requestAnimationFrame(simTick);
  }
}

export default PhysicsStimulusPlugin;
export { PhysicsStimulusPlugin };
