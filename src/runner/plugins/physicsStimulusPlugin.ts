import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import { analyzePendulum, pendulumThetaOscillationAt, PendulumRotationIntegrator } from "../../physics/pendulum";
import type { PendulumParams } from "../../physics/pendulum";
import {
  pendulumLayout,
  drawPendulumStimulusFrame,
  drawPendulumEstimate,
  drawPendulumEstimateGuide,
  drawPendulumFeedbackTruth,
  pendulumAngleFromPointer,
  pendulumGuideStrokeForSimVisibility,
  PENDULUM_GUIDE_ORANGE,
} from "../../physics/render/pendulumCanvas";
import {
  playEstimateCue,
  prepareMaskedAmbientForTrial,
  stopMaskedAmbientSound,
  syncMaskedAmbientFromVisibility,
} from "../../shared/playEstimateCue";
import type { SpringParams } from "../../physics/spring";
import { springAnalysis, springDisplacementAt, springMotion } from "../../physics/spring";
import {
  springLayout,
  drawSpringStimulusFrame,
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
  stimulusPhaseDurationsForExport,
  stimulusTotalSec,
  stimulusTotalTimeT,
  stimulusVisibilityAt,
  withSyncedTotalTimeT,
  type StimulusVisibilityKind,
} from "../../physics/timePhases";
import { normalizeKeyForJsPsych } from "../../shared/keys";
import { cancelStaleKeyboardListeners } from "../stimulusControl";

type KeyboardHandler = (e: KeyboardEvent) => void;
type TrialPhase = "sim" | "estimate" | "feedback";

const SPACE_KEY = normalizeKeyForJsPsych(" ");

function simDynamicsAlpha(
  vis: { kind: StimulusVisibilityKind; alpha: number },
  developerMode: boolean,
  hideSemiVisible: boolean,
): number {
  if (vis.kind === "hide" && (developerMode || hideSemiVisible)) return 0.45;
  return vis.alpha;
}

function mountEstimateFooter(footer: HTMLElement, simHint: HTMLElement, label: string): HTMLButtonElement {
  simHint.textContent = "仿真已结束。";
  footer.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "physics-estimate-ui";
  const surface =
    label === "摆杆"
      ? "在<strong>橙色虚线轨迹</strong>上"
      : "在<strong>轨道</strong>上";
  panel.innerHTML = `<p class="physics-hint">${surface}<strong>点击</strong>您认为${label}在试次结束瞬间的位置，可<strong>拖动</strong>微调，然后确认。</p>`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "physics-btn physics-btn--primary";
  btn.textContent = "确认位置";
  panel.appendChild(btn);
  footer.appendChild(panel);
  return btn;
}

const FEEDBACK_CONTINUE_DELAY_MS = 300;

function mountTruthOnlyFeedbackFooter(
  footer: HTMLElement,
  physicsKind: "pendulum" | "spring",
): HTMLParagraphElement {
  footer.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "physics-feedback-ui";
  const hint =
    physicsKind === "pendulum"
      ? "<strong>橙色摆杆</strong>为您的选择，<strong>蓝色摆杆</strong>为该试次结束瞬间的真实指向。"
      : "<strong>橙色物块</strong>为您的选择，<strong>蓝色物块</strong>为该试次结束瞬间的真实位置。";
  panel.innerHTML = `<p class="physics-hint muted">${hint}</p>`;
  const continueHint = document.createElement("p");
  continueHint.className = "physics-hint muted physics-feedback-continue";
  continueHint.textContent = "按空格键继续";
  continueHint.hidden = true;
  panel.appendChild(continueHint);
  footer.appendChild(panel);
  return continueHint;
}

function focusTrialForKeyboard(trialRoot: HTMLElement): void {
  blurActiveElement();
  trialRoot.setAttribute("tabindex", "-1");
  trialRoot.focus({ preventScroll: true });
}

function listenSpaceAfterFeedbackDelay(
  jsPsych: JsPsych,
  feedbackStartMs: number,
  onSpace: () => void,
): KeyboardHandler {
  return listenSpace(jsPsych, () => {
    if (performance.now() - feedbackStartMs < FEEDBACK_CONTINUE_DELAY_MS) return;
    onSpace();
  });
}

function beginFeedbackContinue(
  jsPsych: JsPsych,
  trialRoot: HTMLElement,
  continueHint: HTMLParagraphElement,
  onContinue: () => void,
): { feedbackStartMs: number; kb: KeyboardHandler } {
  const feedbackStartMs = performance.now();
  focusTrialForKeyboard(trialRoot);
  window.setTimeout(() => {
    continueHint.hidden = false;
  }, FEEDBACK_CONTINUE_DELAY_MS);
  const kb = listenSpaceAfterFeedbackDelay(jsPsych, feedbackStartMs, onContinue);
  return { feedbackStartMs, kb };
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
    show2T: { type: ParameterType.FLOAT, default: 0 },
    hide2T: { type: ParameterType.FLOAT, default: 0 },
    fadeMs: { type: ParameterType.FLOAT, default: 150 },
    massKg: { type: ParameterType.FLOAT, default: 1 },
    stiffness: { type: ParameterType.FLOAT, default: 4 },
    x0M: { type: ParameterType.FLOAT, default: 0.5 },
    v0Mps: { type: ParameterType.FLOAT, default: 0 },
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
    developerMode: { type: ParameterType.BOOL, default: false },
    hideSemiVisible: { type: ParameterType.BOOL, default: false },
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
  fadeMs: number;
  massKg: number;
  stiffness: number;
  x0M: number;
  v0Mps: number;
  unitMeta: Record<string, unknown>;
  developerMode: boolean;
  hideSemiVisible: boolean;
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
          <p class="physics-hint muted physics-sim-hint">观看运动；摆杆/物块将淡出消失，虚线轨迹仍保留。</p>
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
    const trialCleanups: Array<() => void> = [];

    const syncSimCursor = (p: TrialPhase) => {
      trialRoot.classList.toggle("physics-trial--sim", p === "sim");
    };

    const clearKb = () => {
      if (kbListener) {
        this.jsPsych.pluginAPI.cancelKeyboardResponse(kbListener);
        kbListener = null;
      }
    };

    const registerTrialCleanup = (fn: () => void) => {
      trialCleanups.push(fn);
    };

    const finish = (extra: Record<string, unknown>) => {
      clearKb();
      cancelAnimationFrame(raf);
      for (const fn of trialCleanups) fn();
      stopMaskedAmbientSound();
      this.jsPsych.finishTrial(extra);
    };

    const timing = withSyncedTotalTimeT({
      totalTimeT: trial.totalTimeT,
      show1T: trial.show1T,
      hide1T: trial.hide1T,
      show2T: trial.show2T,
      hide2T: trial.hide2T,
      fadeMs: trial.fadeMs,
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
        registerTrialCleanup,
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
      registerTrialCleanup,
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
    registerTrialCleanup: (fn: () => void) => void;
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
    let capturedPointerId: number | null = null;
    const maskedAudioActive = { current: false };

    prepareMaskedAmbientForTrial();

    const releasePointerCaptureIfNeeded = () => {
      if (capturedPointerId !== null) {
        try {
          canvas.releasePointerCapture(capturedPointerId);
        } catch {
          /* already released */
        }
        capturedPointerId = null;
      }
    };

    const thetaActualAtEnd = () => {
      if (rot) return rot.theta;
      return pendulumThetaOscillationAt(simEndSec, p, analysis);
    };

    const redrawEstimate = () => {
      if (!estimateInteracted) {
        drawPendulumEstimateGuide(ctx, layout, motionRange, PENDULUM_GUIDE_ORANGE);
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
      const phaseDur = stimulusPhaseDurationsForExport(synced, T);
      return {
        response_mode: "estimate_point",
        physicsKind: trial.physicsKind,
        pendulum_E_J: analysis.E,
        pendulum_T_sec: T,
        pendulum_regime: analysis.regime,
        stimulus_time_phases_json: JSON.stringify(phases),
        total_time_T: totalTimeT,
        ...phaseDur,
        theta_actual_deg: thetaActualDeg,
        theta_estimated_deg: thetaEstimatedDeg,
        delta_theta_deg: deltaThetaDeg,
        abs_delta_theta_deg: eDeg,
        theta_actual_rad: degToRad(thetaActualDeg),
        theta_estimated_rad: degToRad(thetaEstimatedDeg),
        delta_theta_rad: degToRad(deltaThetaDeg),
        abs_delta_theta_rad: degToRad(eDeg),
        rt_estimate_sec: rtEstimateSec,
        fade_ms: timing.fadeMs ?? 0,
        w_max_deg: wMaxDeg,
        unit_id: trial.unitMeta?.unitId ?? "",
        unit_type: trial.unitMeta?.unitType ?? "",
        segment_id: trial.unitMeta?.segmentId ?? "",
        segment_kind: trial.unitMeta?.segmentKind ?? "",
      };
    };

    const startFeedback = (payload: Record<string, unknown>) => {
      opts.setPhase("feedback");
      canvas.classList.remove("physics-canvas--estimate");
      releasePointerCaptureIfNeeded();
      const continueHint = mountTruthOnlyFeedbackFooter(footer, "pendulum");
      drawPendulumFeedbackTruth(ctx, layout, thetaEstRad, thetaActualRad, motionRange);
      const trialRoot = canvas.closest(".physics-trial") as HTMLElement;
      const { kb } = beginFeedbackContinue(opts.jsPsych, trialRoot, continueHint, () => {
        opts.finish(payload);
      });
      opts.setKb(kb);
    };

    const startEstimate = () => {
      opts.setPhase("estimate");
      thetaActualRad = thetaActualAtEnd();
      thetaEstRad = 0;
      estimateInteracted = false;
      estimateStartMs = performance.now();
      canvas.classList.add("physics-canvas--estimate");
      void playEstimateCue();
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
        releasePointerCaptureIfNeeded();
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
        capturedPointerId = e.pointerId;
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
      const onUp = (e: PointerEvent) => {
        dragging = false;
        if (capturedPointerId === e.pointerId) {
          try {
            canvas.releasePointerCapture(e.pointerId);
          } catch {
            /* */
          }
          capturedPointerId = null;
        }
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
      const vis = stimulusVisibilityAt(synced, T, t);
      maskedAudioActive.current = syncMaskedAmbientFromVisibility(vis);
      const dynAlpha = simDynamicsAlpha(vis, trial.developerMode, trial.hideSemiVisible);
      const guideStroke = pendulumGuideStrokeForSimVisibility(vis);
      drawPendulumStimulusFrame(ctx, layout, theta, motionRange, dynAlpha, guideStroke);

      if (elapsed >= simEndSec) {
        cancelAnimationFrame(opts.getRaf());
        stopMaskedAmbientSound();
        maskedAudioActive.current = false;
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
    registerTrialCleanup: (fn: () => void) => void;
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
    let capturedPointerId: number | null = null;
    const maskedAudioActive = { current: false };

    prepareMaskedAmbientForTrial();

    const releasePointerCaptureIfNeeded = () => {
      if (capturedPointerId !== null) {
        try {
          canvas.releasePointerCapture(capturedPointerId);
        } catch {
          /* already released */
        }
        capturedPointerId = null;
      }
    };

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
      const phaseDur = stimulusPhaseDurationsForExport(synced, T);
      return {
        response_mode: "estimate_point",
        physicsKind: trial.physicsKind,
        spring_E_J: E,
        spring_T_sec: T,
        stimulus_time_phases_json: JSON.stringify(phases),
        total_time_T: totalTimeT,
        ...phaseDur,
        x_actual_m: xActualM,
        x_estimated_m: xEstM,
        delta_x_m: xEstM - xActualM,
        abs_delta_x_m: eM,
        rt_estimate_sec: rtEstimateSec,
        fade_ms: timing.fadeMs ?? 0,
      };
    };

    const startFeedback = (payload: Record<string, unknown>) => {
      opts.setPhase("feedback");
      releasePointerCaptureIfNeeded();
      const continueHint = mountTruthOnlyFeedbackFooter(footer, "spring");
      drawSpringFeedbackTruth(ctx, layout, xEstM, xActualM);
      const trialRoot = canvas.closest(".physics-trial") as HTMLElement;
      const { kb } = beginFeedbackContinue(opts.jsPsych, trialRoot, continueHint, () => {
        opts.finish(payload);
      });
      opts.setKb(kb);
    };

    const startEstimate = () => {
      opts.setPhase("estimate");
      xActualM = springDisplacementAt(simEndSec, sp);
      xEstM = 0;
      estimateInteracted = false;
      estimateStartMs = performance.now();
      void playEstimateCue();
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
        releasePointerCaptureIfNeeded();
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
        capturedPointerId = e.pointerId;
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
      const onUp = (e: PointerEvent) => {
        dragging = false;
        if (capturedPointerId === e.pointerId) {
          try {
            canvas.releasePointerCapture(e.pointerId);
          } catch {
            /* */
          }
          capturedPointerId = null;
        }
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
      const vis = stimulusVisibilityAt(synced, T, t);
      maskedAudioActive.current = syncMaskedAmbientFromVisibility(vis);
      const dynAlpha = simDynamicsAlpha(vis, trial.developerMode, trial.hideSemiVisible);
      drawSpringStimulusFrame(ctx, layout, x, dynAlpha);
      if (elapsed >= simEndSec) {
        cancelAnimationFrame(opts.getRaf());
        stopMaskedAmbientSound();
        maskedAudioActive.current = false;
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
