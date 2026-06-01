import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import { analyzePendulum, pendulumThetaOscillationAt, PendulumRotationIntegrator } from "../../physics/pendulum";
import type { PendulumParams } from "../../physics/pendulum";
import {
  pendulumLayout,
  drawPendulumOcclusion,
  drawPendulumStimulusVisible,
  drawPendulumEstimate,
  drawPendulumEstimateGuide,
  drawPendulumFeedbackTruth,
  pendulumAngleFromPointer,
} from "../../physics/render/pendulumCanvas";
import type { SpringParams } from "../../physics/spring";
import { springAnalysis, springDisplacementAt, springMotion } from "../../physics/spring";
import {
  springLayout,
  drawSpringPractice,
  drawSpringOcclusion,
  drawSpringEstimate,
  drawSpringEstimateGuide,
  drawSpringFeedbackTruth,
  springDisplacementFromLogicalX,
} from "../../physics/render/springCanvas";
import { setupHiDpiCanvas, pointerToLogical } from "../../physics/render/canvasCoords";
import {
  PHYSICS_CANVAS_LOGICAL_H,
  PHYSICS_CANVAS_LOGICAL_W,
} from "../../physics/render/canvasLayout";
import {
  pendulumAngularErrorDeg,
  pendulumWMaxDeg,
  pendulumAngleDegFromRad,
  degToRad,
  wrapDeltaThetaDeg,
} from "../../physics/pendulumArcScore";
import { springPositionErrorM } from "../../physics/springArcScore";
import {
  buildTimePhases,
  stimulusTotalSec,
  stimulusTotalTimeT,
  withSyncedTotalTimeT,
  type TimePhase,
} from "../../physics/timePhases";
import { normalizeKeyForJsPsych } from "../../shared/keys";
import { cancelStaleKeyboardListeners } from "../stimulusControl";

type KeyboardHandler = (e: KeyboardEvent) => void;
type TrialPhase = "sim" | "estimate" | "feedback";

const SPACE_KEY = normalizeKeyForJsPsych(" ");

function phaseKindAt(phases: TimePhase[], tSec: number): "show" | "hide" {
  if (phases.length === 0) return "show";
  let k: "show" | "hide" = "show";
  for (const p of phases) {
    if (tSec + 1e-12 >= p.startSec) k = p.kind;
  }
  return k;
}

function mountEstimateFooter(footer: HTMLElement, simHint: HTMLElement, label: string): HTMLButtonElement {
  simHint.textContent = "仿真已结束。";
  footer.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "physics-estimate-ui";
  panel.innerHTML = `<p class="physics-hint">在<strong>圆环/轨道</strong>上<strong>点击</strong>您认为${label}在试次结束瞬间的位置，可<strong>拖动</strong>微调，然后确认。</p>`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "physics-btn physics-btn--primary";
  btn.textContent = "确认位置";
  panel.appendChild(btn);
  footer.appendChild(panel);
  return btn;
}

function mountTruthOnlyFeedbackFooter(footer: HTMLElement, physicsKind: "pendulum" | "spring"): void {
  footer.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "physics-feedback-ui";
  const hint =
    physicsKind === "pendulum"
      ? "<strong>橙色摆杆</strong>为您的选择，<strong>蓝色摆杆</strong>为该试次结束瞬间的真实位置。"
      : "<strong>橙色物块</strong>为您的选择，<strong>蓝色物块</strong>为该试次结束瞬间的真实位置。";
  panel.innerHTML = `<p class="physics-hint muted">${hint}</p><p class="physics-hint muted">按空格键继续</p>`;
  footer.appendChild(panel);
}

function listenSpace(jsPsych: JsPsych, onSpace: () => void): KeyboardHandler {
  return jsPsych.pluginAPI.getKeyboardResponse({
    callback_function: (info: { key: string }) => {
      if (info.key === SPACE_KEY) onSpace();
    },
    valid_responses: [SPACE_KEY],
    rt_method: "performance",
    persist: true,
    allow_held_key: false,
  }) as KeyboardHandler;
}

/** 提交按钮会抢走焦点，导致空格无法触发 jsPsych 键盘监听 */
function blurActiveElement(): void {
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
}

function listenSpaceAfterBlur(jsPsych: JsPsych, onSpace: () => void): KeyboardHandler {
  blurActiveElement();
  return listenSpace(jsPsych, onSpace);
}

const info = {
  name: "physics-stimulus",
  version: "0.5.0",
  parameters: {
    physicsKind: { type: ParameterType.STRING, default: "pendulum" },
    theta0Deg: { type: ParameterType.FLOAT, default: 45 },
    omega0DegPerSec: { type: ParameterType.FLOAT, default: 0 },
    rodLengthM: { type: ParameterType.FLOAT, default: 4 },
    gravity: { type: ParameterType.FLOAT, default: 9.8 },
    totalTimeT: { type: ParameterType.FLOAT, default: 5 },
    show1T: { type: ParameterType.FLOAT, default: 1 },
    hide1T: { type: ParameterType.FLOAT, default: 0.75 },
    show2T: { type: ParameterType.FLOAT, default: 1 },
    hide2T: { type: ParameterType.FLOAT, default: 0.75 },
    massKg: { type: ParameterType.FLOAT, default: 1 },
    stiffness: { type: ParameterType.FLOAT, default: 4 },
    x0M: { type: ParameterType.FLOAT, default: 0.5 },
    v0Mps: { type: ParameterType.FLOAT, default: 0 },
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
    developerMode: { type: ParameterType.BOOL, default: false },
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
  developerMode: boolean;
};

class PhysicsStimulusPlugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: Trial): void {
    cancelStaleKeyboardListeners(this.jsPsych);
    display_element.innerHTML = `
      <div class="physics-trial physics-trial--stimulus physics-trial--sim">
        <canvas class="physics-canvas" width="${PHYSICS_CANVAS_LOGICAL_W}" height="${PHYSICS_CANVAS_LOGICAL_H}"></canvas>
        <div class="physics-footer">
          <p class="physics-hint muted physics-sim-hint">观看摆球/弹簧的运动（部分时段会隐藏）。</p>
        </div>
      </div>`;

    const canvas = display_element.querySelector("canvas") as HTMLCanvasElement;
    const logicalW = canvas.width;
    const logicalH = canvas.height;
    const { ctx, cssW, cssH } = setupHiDpiCanvas(canvas, logicalW, logicalH);

    const trialRoot = display_element.querySelector(".physics-trial") as HTMLElement;
    const footer = display_element.querySelector(".physics-footer") as HTMLElement;
    const simHint = display_element.querySelector(".physics-sim-hint") as HTMLElement;

    const t0 = performance.now();
    let raf = 0;
    let phase: TrialPhase = "sim";
    let kbListener: KeyboardHandler | null = null;

    const syncSimCursor = (p: TrialPhase) => {
      trialRoot.classList.toggle("physics-trial--sim", p === "sim");
    };

    const clearKb = () => {
      if (kbListener) {
        this.jsPsych.pluginAPI.cancelKeyboardResponse(kbListener);
        kbListener = null;
      }
    };

    const finish = (extra: Record<string, unknown>) => {
      clearKb();
      cancelAnimationFrame(raf);
      this.jsPsych.finishTrial(extra);
    };

    const timing = withSyncedTotalTimeT({
      totalTimeT: trial.totalTimeT,
      show1T: trial.show1T,
      hide1T: trial.hide1T,
      show2T: trial.show2T,
      hide2T: trial.hide2T,
    });

    const pointerLogical = (e: PointerEvent) =>
      pointerToLogical(e.clientX, e.clientY, canvas, logicalW, logicalH);

    if (trial.physicsKind === "pendulum") {
      this.runPendulumTrial({
        trial,
        timing,
        ctx,
        cssW,
        cssH,
        canvas,
        footer,
        simHint,
        t0,
        pointerLogical,
        getPhase: () => phase,
        setPhase: (p) => {
          phase = p;
          syncSimCursor(p);
        },
        getRaf: () => raf,
        setRaf: (id) => {
          raf = id;
        },
        finish,
        setKb: (h) => {
          clearKb();
          kbListener = h;
        },
        jsPsych: this.jsPsych,
      });
      return;
    }

    this.runSpringTrial({
      trial,
      timing,
      ctx,
      cssW,
      cssH,
      canvas,
      footer,
      simHint,
      t0,
      pointerLogical,
      getPhase: () => phase,
      setPhase: (p) => {
        phase = p;
        syncSimCursor(p);
      },
      getRaf: () => raf,
      setRaf: (id) => {
        raf = id;
      },
      finish,
      setKb: (h) => {
        clearKb();
        kbListener = h;
      },
      jsPsych: this.jsPsych,
    });
  }

  private runPendulumTrial(opts: {
    trial: Trial;
    timing: ReturnType<typeof withSyncedTotalTimeT>;
    ctx: CanvasRenderingContext2D;
    cssW: number;
    cssH: number;
    canvas: HTMLCanvasElement;
    footer: HTMLElement;
    simHint: HTMLElement;
    t0: number;
    pointerLogical: (e: PointerEvent) => { x: number; y: number };
    getPhase: () => TrialPhase;
    setPhase: (p: TrialPhase) => void;
    getRaf: () => number;
    setRaf: (id: number) => void;
    finish: (extra: Record<string, unknown>) => void;
    setKb: (h: KeyboardHandler | null) => void;
    jsPsych: JsPsych;
  }): void {
    const { trial, timing, ctx, cssW, cssH, canvas, footer, simHint, t0, pointerLogical } = opts;
    const p: PendulumParams = {
      theta0Rad: degToRad(trial.theta0Deg),
      omega0RadPerSec: degToRad(trial.omega0DegPerSec),
      rodLengthM: trial.rodLengthM,
      gravity: trial.gravity,
    };
    const analysis = analyzePendulum(p);
    const T = analysis.T;
    const synced = withSyncedTotalTimeT(timing, T);
    const totalTimeT = stimulusTotalTimeT(synced, T);
    const phases = buildTimePhases(synced, T);
    const simEndSec = stimulusTotalSec(synced, T);
    const rot = analysis.regime === "rotation" ? new PendulumRotationIntegrator(p) : null;
    const layout = pendulumLayout(cssW, cssH);
    const wMaxDeg = pendulumWMaxDeg(analysis.E, analysis.regime, trial.rodLengthM, trial.gravity);
    const motionRange = { regime: analysis.regime, wMaxDeg };

    let thetaActualRad = 0;
    let thetaEstRad = 0;
    let estimateInteracted = false;
    let dragging = false;
    let estimateStartMs = 0;

    const thetaActualAtEnd = () => {
      if (rot) return rot.theta;
      return pendulumThetaOscillationAt(simEndSec, p, analysis);
    };

    const redrawEstimate = () => {
      if (!estimateInteracted) {
        drawPendulumEstimateGuide(ctx, layout, motionRange);
        return;
      }
      drawPendulumEstimate(ctx, layout, thetaEstRad, motionRange);
    };

    const buildPayload = (): Record<string, unknown> => {
      const rtEstimateSec = (performance.now() - estimateStartMs) / 1000;
      const thetaActualDeg = pendulumAngleDegFromRad(thetaActualRad);
      const thetaEstimatedDeg = pendulumAngleDegFromRad(thetaEstRad);
      const eDeg = pendulumAngularErrorDeg(thetaEstRad, thetaActualRad, analysis.regime, wMaxDeg);
      const deltaThetaDeg = wrapDeltaThetaDeg(
        thetaEstimatedDeg,
        thetaActualDeg,
        analysis.regime,
        wMaxDeg,
      );
      return {
        response_mode: "estimate_point",
        physicsKind: trial.physicsKind,
        pendulum_E_J: analysis.E,
        pendulum_T_sec: T,
        pendulum_regime: analysis.regime,
        stimulus_time_phases_json: JSON.stringify(phases),
        total_time_T: totalTimeT,
        theta_actual_deg: thetaActualDeg,
        theta_estimated_deg: thetaEstimatedDeg,
        delta_theta_deg: deltaThetaDeg,
        abs_delta_theta_deg: eDeg,
        theta_actual_rad: degToRad(thetaActualDeg),
        theta_estimated_rad: degToRad(thetaEstimatedDeg),
        delta_theta_rad: degToRad(deltaThetaDeg),
        abs_delta_theta_rad: degToRad(eDeg),
        rt_estimate_sec: rtEstimateSec,
      };
    };

    const startFeedback = (payload: Record<string, unknown>) => {
      opts.setPhase("feedback");
      mountTruthOnlyFeedbackFooter(footer, "pendulum");
      drawPendulumFeedbackTruth(ctx, layout, thetaEstRad, thetaActualRad, motionRange);
      opts.setKb(
        listenSpaceAfterBlur(opts.jsPsych, () => {
          opts.finish(payload);
        }),
      );
    };

    const startEstimate = () => {
      opts.setPhase("estimate");
      thetaActualRad = thetaActualAtEnd();
      thetaEstRad = 0;
      estimateInteracted = false;
      estimateStartMs = performance.now();
      redrawEstimate();
      const confirmBtn = mountEstimateFooter(footer, simHint, "摆杆");
      confirmBtn.disabled = true;
      const confirm = () => {
        if (!estimateInteracted) return;
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
        confirmBtn.removeEventListener("click", confirm);
        opts.setKb(null);
        startFeedback(buildPayload());
      };
      confirmBtn.addEventListener("click", confirm);
      opts.setKb(listenSpace(opts.jsPsych, confirm));

      const onDown = (e: PointerEvent) => {
        if (opts.getPhase() !== "estimate") return;
        estimateInteracted = true;
        confirmBtn.disabled = false;
        dragging = true;
        canvas.setPointerCapture(e.pointerId);
        const { x, y } = pointerLogical(e);
        thetaEstRad = pendulumAngleFromPointer(layout, x, y);
        redrawEstimate();
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging || opts.getPhase() !== "estimate") return;
        const { x, y } = pointerLogical(e);
        thetaEstRad = pendulumAngleFromPointer(layout, x, y);
        redrawEstimate();
      };
      const onUp = () => {
        dragging = false;
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);
    };

    const simTick = (now: number) => {
      if (opts.getPhase() !== "sim") return;
      const elapsed = (now - t0) / 1000;
      const t = Math.min(elapsed, simEndSec);
      let theta: number;
      if (rot) {
        rot.step(t - rot.tAccum);
        theta = rot.theta;
      } else {
        theta = pendulumThetaOscillationAt(t, p, analysis);
      }
      drawPendulumStimulusVisible(ctx, layout, theta, motionRange);
      if (phaseKindAt(phases, t) === "hide") {
        drawPendulumOcclusion(ctx, layout, trial.developerMode);
      }

      if (elapsed >= simEndSec) {
        cancelAnimationFrame(opts.getRaf());
        startEstimate();
        return;
      }
      opts.setRaf(requestAnimationFrame(simTick));
    };

    opts.setRaf(requestAnimationFrame(simTick));
  }

  private runSpringTrial(opts: {
    trial: Trial;
    timing: ReturnType<typeof withSyncedTotalTimeT>;
    ctx: CanvasRenderingContext2D;
    cssW: number;
    cssH: number;
    canvas: HTMLCanvasElement;
    footer: HTMLElement;
    simHint: HTMLElement;
    t0: number;
    pointerLogical: (e: PointerEvent) => { x: number; y: number };
    getPhase: () => TrialPhase;
    setPhase: (p: TrialPhase) => void;
    getRaf: () => number;
    setRaf: (id: number) => void;
    finish: (extra: Record<string, unknown>) => void;
    setKb: (h: KeyboardHandler | null) => void;
    jsPsych: JsPsych;
  }): void {
    const { trial, timing, ctx, cssW, cssH, canvas, footer, simHint, t0, pointerLogical } = opts;
    const sp: SpringParams = {
      massKg: trial.massKg,
      stiffness: trial.stiffness,
      x0M: trial.x0M,
      v0Mps: trial.v0Mps,
    };
    const { E, T } = springAnalysis(sp);
    const synced = withSyncedTotalTimeT(timing, T);
    const totalTimeT = stimulusTotalTimeT(synced, T);
    const phases = buildTimePhases(synced, T);
    const simEndSec = stimulusTotalSec(synced, T);
    const { amplitudeM } = springMotion(sp);
    const layout = springLayout(cssW, cssH, amplitudeM);

    let xActualM = 0;
    let xEstM = 0;
    let estimateInteracted = false;
    let dragging = false;
    let estimateStartMs = 0;

    const redrawEstimate = () => {
      if (!estimateInteracted) {
        drawSpringEstimateGuide(ctx, layout);
        return;
      }
      drawSpringEstimate(ctx, layout, xEstM);
    };

    const buildPayload = (): Record<string, unknown> => {
      const rtEstimateSec = (performance.now() - estimateStartMs) / 1000;
      const eM = springPositionErrorM(xEstM, xActualM);
      return {
        response_mode: "estimate_point",
        physicsKind: trial.physicsKind,
        spring_E_J: E,
        spring_T_sec: T,
        stimulus_time_phases_json: JSON.stringify(phases),
        total_time_T: totalTimeT,
        x_actual_m: xActualM,
        x_estimated_m: xEstM,
        delta_x_m: xEstM - xActualM,
        abs_delta_x_m: eM,
        rt_estimate_sec: rtEstimateSec,
      };
    };

    const startFeedback = (payload: Record<string, unknown>) => {
      opts.setPhase("feedback");
      mountTruthOnlyFeedbackFooter(footer, "spring");
      drawSpringFeedbackTruth(ctx, layout, xEstM, xActualM);
      opts.setKb(
        listenSpaceAfterBlur(opts.jsPsych, () => {
          opts.finish(payload);
        }),
      );
    };

    const startEstimate = () => {
      opts.setPhase("estimate");
      xActualM = springDisplacementAt(simEndSec, sp);
      xEstM = 0;
      estimateInteracted = false;
      estimateStartMs = performance.now();
      redrawEstimate();
      const confirmBtn = mountEstimateFooter(footer, simHint, "物块");
      confirmBtn.disabled = true;
      const confirm = () => {
        if (!estimateInteracted) return;
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
        confirmBtn.removeEventListener("click", confirm);
        opts.setKb(null);
        startFeedback(buildPayload());
      };
      confirmBtn.addEventListener("click", confirm);
      opts.setKb(listenSpace(opts.jsPsych, confirm));

      const onDown = (e: PointerEvent) => {
        if (opts.getPhase() !== "estimate") return;
        estimateInteracted = true;
        confirmBtn.disabled = false;
        dragging = true;
        canvas.setPointerCapture(e.pointerId);
        const { x } = pointerLogical(e);
        xEstM = springDisplacementFromLogicalX(layout, x);
        redrawEstimate();
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging || opts.getPhase() !== "estimate") return;
        const { x } = pointerLogical(e);
        xEstM = springDisplacementFromLogicalX(layout, x);
        redrawEstimate();
      };
      const onUp = () => {
        dragging = false;
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);
    };

    const simTick = (now: number) => {
      if (opts.getPhase() !== "sim") return;
      const elapsed = (now - t0) / 1000;
      const t = Math.min(elapsed, simEndSec);
      const x = springDisplacementAt(t, sp);
      drawSpringPractice(ctx, layout, x);
      if (phaseKindAt(phases, t) === "hide") {
        drawSpringOcclusion(ctx, layout, trial.developerMode);
      }
      if (elapsed >= simEndSec) {
        cancelAnimationFrame(opts.getRaf());
        startEstimate();
        return;
      }
      opts.setRaf(requestAnimationFrame(simTick));
    };

    opts.setRaf(requestAnimationFrame(simTick));
  }
}

export default PhysicsStimulusPlugin;
export { PhysicsStimulusPlugin };
