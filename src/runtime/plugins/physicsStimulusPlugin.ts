import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import {
  analyzePendulum,
  pendulumThetaOmegaAt,
  PendulumRotationIntegrator,
} from "../../experiment/physics/pendulum";
import type { PendulumParams } from "../../experiment/physics/pendulum";
import {
  pendulumLayout,
  drawPendulumStimulusFrame,
  drawPendulumEstimate,
  drawPendulumEstimateGuide,
  drawPendulumFeedbackTruth,
  pendulumAngleFromPointer,
  pendulumGuideStrokeForSimVisibility,
  PENDULUM_GUIDE_ORANGE,
} from "../../experiment/physics/render/pendulumCanvas";
import {
  playEstimateCue,
  prepareMaskedAmbientForTrial,
  stopMaskedAmbientSound,
  syncMaskedAmbientFromVisibility,
} from "../../shared/playEstimateCue";
import {
  setupHiDpiCanvas,
  pointerToLogical,
} from "../../experiment/physics/render/canvasCoords";
import {
  PHYSICS_CANVAS_LOGICAL_H,
  PHYSICS_CANVAS_LOGICAL_W,
} from "../../experiment/physics/render/canvasLayout";
import {
  pendulumAngularErrorDeg,
  pendulumWMaxDeg,
  pendulumAngleDegFromRad,
  degToRad,
  wrapDeltaThetaDeg,
} from "../../experiment/physics/pendulumArcScore";
import {
  stimulusTotalSec,
  stimulusVisibilityAt,
  withSyncedTotalTimeT,
} from "../../experiment/physics/timePhases";
import { normalizeKeyForJsPsych } from "../../shared/keys";
import { cancelStaleKeyboardListeners } from "../stimulusControl";
import {
  absoluteSpeedBarLevel,
  mountSpeedIndicatorBar,
} from "../components/speedIndicatorBar";
import { pendulumStateAtSimEnd } from "../../experiment/physics/simEndState";
import {
  updateRecoveryCursor,
  type RecoveryPhase,
} from "../../shared/recovery";

type KeyboardHandler = (e: KeyboardEvent) => void;
type TrialPhase = "sim" | "estimate" | "feedback";

const SPACE_KEY = normalizeKeyForJsPsych(" ");
export const PHYSICS_ABORT_EVENT = "intuition-physics-abort";

function mountEstimateFooter(footer: HTMLElement, simHint: HTMLElement): HTMLButtonElement {
  simHint.textContent = "仿真已结束。";
  footer.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "physics-estimate-ui";
  panel.innerHTML =
    "<p class=\"physics-hint\">在<strong>橙色虚线轨迹</strong>上<strong>点击</strong>您认为摆杆在试次结束瞬间的位置，可<strong>拖动</strong>微调，然后确认。</p>";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "physics-btn physics-btn--primary";
  btn.textContent = "确认位置";
  panel.appendChild(btn);
  footer.appendChild(panel);
  return btn;
}

const FEEDBACK_CONTINUE_DELAY_MS = 300;

function mountTruthOnlyFeedbackFooter(footer: HTMLElement): HTMLParagraphElement {
  footer.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "physics-feedback-ui";
  panel.innerHTML =
    "<p class=\"physics-hint muted\"><strong>橙色摆杆</strong>为您的选择，<strong>蓝色摆杆</strong>为该试次结束瞬间的真实指向。</p>";
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

function blurActiveElement(): void {
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
}

const info = {
  name: "physics-stimulus",
  version: "0.6.0",
  parameters: {
    theta0Deg: { type: ParameterType.FLOAT, default: 45 },
    omega0DegPerSec: { type: ParameterType.FLOAT, default: 0 },
    rodLengthM: { type: ParameterType.FLOAT, default: 4 },
    gravity: { type: ParameterType.FLOAT, default: 9.8 },
    totalTimeT: { type: ParameterType.FLOAT, default: 5 },
    show1T: { type: ParameterType.FLOAT, default: 1 },
    hide1T: { type: ParameterType.FLOAT, default: 1 },
    fadeMs: { type: ParameterType.FLOAT, default: 0 },
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
  },
  data: {},
} as const;

type Trial = {
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  totalTimeT: number;
  show1T: number;
  hide1T: number;
  fadeMs: number;
  unitMeta: Record<string, unknown>;
};

class PhysicsStimulusPlugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: Trial): void {
    cancelStaleKeyboardListeners(this.jsPsych);
    display_element.innerHTML = `
      <div class="physics-trial physics-trial--stimulus physics-trial--sim">
        <div class="physics-canvas-frame">
          <canvas class="physics-canvas" width="${PHYSICS_CANVAS_LOGICAL_W}" height="${PHYSICS_CANVAS_LOGICAL_H}"></canvas>
        </div>
        <div class="physics-footer">
          <p class="physics-hint muted physics-sim-hint">观看运动；摆杆将淡出消失，虚线轨迹仍保留。</p>
        </div>
      </div>`;

    const canvas = display_element.querySelector("canvas") as HTMLCanvasElement;
    const logicalW = canvas.width;
    const logicalH = canvas.height;
    const { ctx, cssW, cssH } = setupHiDpiCanvas(canvas, logicalW, logicalH);

    const trialRoot = display_element.querySelector(".physics-trial") as HTMLElement;
    const canvasFrame = display_element.querySelector(".physics-canvas-frame") as HTMLElement;
    const footer = display_element.querySelector(".physics-footer") as HTMLElement;
    const simHint = display_element.querySelector(".physics-sim-hint") as HTMLElement;
    const layout = pendulumLayout(cssW, cssH);

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

    const timing = {
      totalTimeT: trial.totalTimeT,
      show1T: trial.show1T,
      hide1T: trial.hide1T,
      fadeMs: trial.fadeMs,
    };

    const pointerLogical = (e: PointerEvent) =>
      pointerToLogical(e.clientX, e.clientY, canvas, logicalW, logicalH);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearKb();
      cancelAnimationFrame(raf);
      stopMaskedAmbientSound();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(PHYSICS_ABORT_EVENT, cleanup);
    };

    const finish = (extra: Record<string, unknown>) => {
      cleanup();
      this.jsPsych.finishTrial(extra);
    };

    const p: PendulumParams = {
      theta0Rad: degToRad(trial.theta0Deg),
      omega0RadPerSec: degToRad(trial.omega0DegPerSec),
      rodLengthM: trial.rodLengthM,
      gravity: trial.gravity,
    };
    const analysis = analyzePendulum(p);
    const T = analysis.T;
    const synced = withSyncedTotalTimeT(timing, T);
    const simEndSec = stimulusTotalSec(synced, T);
    const rot = analysis.regime === "rotation" ? new PendulumRotationIntegrator(p) : null;
    const wMaxDeg = pendulumWMaxDeg(analysis.E, analysis.regime, trial.rodLengthM, trial.gravity);
    const motionRange = { regime: analysis.regime, wMaxDeg };
    const rodL = trial.rodLengthM;
    const speedBarVMax = Number(trial.unitMeta.speed_bar_v_max_m_per_sec);
    const speedBar = mountSpeedIndicatorBar(canvasFrame, {
      rodPx: layout.rodPx,
      canvasCssW: cssW,
      canvasCssH: cssH,
      anchorX: layout.anchorX,
      anchorY: layout.anchorY,
    });

    let thetaActualRad = 0;
    let thetaEstRad = 0;
    let estimateInteracted = false;
    let dragging = false;
    let estimateStartMs = 0;
    let capturedPointerId: number | null = null;
    let simStartMs = 0;
    let pausedTotalMs = 0;
    let hiddenStartedMs: number | null = null;
    let visibilityPauseCount = 0;
    let visibilityPauseMs = 0;
    let simFrameCount = 0;
    let simMaxFrameGapMs = 0;
    let simEndOvershootMs = 0;
    let simElapsedActualSec = 0;
    let previousFrameMs: number | null = null;
    let lastRecoveryPhase: RecoveryPhase | null = null;

    prepareMaskedAmbientForTrial();

    const checkpointPhase = (recoveryPhase: RecoveryPhase) => {
      if (lastRecoveryPhase === recoveryPhase) return;
      lastRecoveryPhase = recoveryPhase;
      updateRecoveryCursor({
        segment_kind: String(trial.unitMeta.segment_kind ?? ""),
        block_index: Number(trial.unitMeta.block_index ?? 0),
        trial_index_in_block: Number(trial.unitMeta.trial_index_in_block ?? 0),
        formal_trial_index:
          trial.unitMeta.formal_trial_index === null
            ? null
            : Number(trial.unitMeta.formal_trial_index ?? 0),
        phase: recoveryPhase,
      });
    };

    function onVisibilityChange() {
      const now = performance.now();
      if (document.hidden) {
        if (hiddenStartedMs === null) {
          hiddenStartedMs = now;
          visibilityPauseCount += 1;
        }
        if (phase === "sim") {
          cancelAnimationFrame(raf);
          raf = 0;
          stopMaskedAmbientSound();
        }
        return;
      }
      if (hiddenStartedMs !== null) {
        const hiddenDuration = Math.max(0, now - hiddenStartedMs);
        hiddenStartedMs = null;
        visibilityPauseMs += hiddenDuration;
        if (phase === "sim") pausedTotalMs += hiddenDuration;
      }
      if (phase === "sim" && raf === 0) {
        previousFrameMs = null;
        raf = requestAnimationFrame(simTick);
      }
    }

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

    const stateActualAtEnd = (): { theta: number; omega: number } => {
      return pendulumStateAtSimEnd(p, synced);
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
      const currentHiddenMs =
        hiddenStartedMs === null ? 0 : Math.max(0, performance.now() - hiddenStartedMs);
      return {
        ...trial.unitMeta,
        response_mode: "estimate_point",
        theta_estimated_deg: thetaEstimatedDeg,
        delta_theta_deg: deltaThetaDeg,
        abs_delta_theta_deg: eDeg,
        theta_estimated_rad: degToRad(thetaEstimatedDeg),
        delta_theta_rad: degToRad(deltaThetaDeg),
        abs_delta_theta_rad: degToRad(eDeg),
        rt_estimate_sec: rtEstimateSec,
        sim_frame_count: simFrameCount,
        sim_max_frame_gap_ms: simMaxFrameGapMs,
        sim_end_overshoot_ms: simEndOvershootMs,
        sim_elapsed_actual_sec: simElapsedActualSec,
        visibility_pause_count: visibilityPauseCount,
        visibility_pause_sec: (visibilityPauseMs + currentHiddenMs) / 1000,
      };
    };

    const startFeedback = (payload: Record<string, unknown>) => {
      phase = "feedback";
      checkpointPhase("feedback");
      syncSimCursor("feedback");
      canvas.classList.remove("physics-canvas--estimate");
      releasePointerCaptureIfNeeded();
      const continueHint = mountTruthOnlyFeedbackFooter(footer);
      drawPendulumFeedbackTruth(ctx, layout, thetaEstRad, thetaActualRad, motionRange);
      const { kb } = beginFeedbackContinue(this.jsPsych, trialRoot, continueHint, () => {
        finish(payload);
      });
      kbListener = kb;
    };

    const startEstimate = () => {
      speedBar.hide();
      phase = "estimate";
      checkpointPhase("estimate");
      syncSimCursor("estimate");
      const endState = stateActualAtEnd();
      thetaActualRad = endState.theta;
      thetaEstRad = 0;
      estimateInteracted = false;
      estimateStartMs = performance.now();
      canvas.classList.add("physics-canvas--estimate");
      void playEstimateCue();
      redrawEstimate();
      const confirmBtn = mountEstimateFooter(footer, simHint);
      confirmBtn.disabled = true;
      const confirm = () => {
        if (!estimateInteracted) return;
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
        confirmBtn.removeEventListener("click", confirm);
        releasePointerCaptureIfNeeded();
        clearKb();
        const payload = buildPayload();
        if (trial.unitMeta.segment_kind === "practice") {
          startFeedback(payload);
        } else {
          finish(payload);
        }
      };
      confirmBtn.addEventListener("click", confirm);
      kbListener = listenSpace(this.jsPsych, confirm);

      const onDown = (e: PointerEvent) => {
        if (phase !== "estimate") return;
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
        if (!dragging || phase !== "estimate") return;
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
      if (phase !== "sim") return;
      raf = 0;
      simFrameCount += 1;
      if (previousFrameMs !== null) {
        simMaxFrameGapMs = Math.max(simMaxFrameGapMs, now - previousFrameMs);
      }
      previousFrameMs = now;
      const elapsed = Math.max(0, (now - simStartMs - pausedTotalMs) / 1000);
      const t = Math.min(elapsed, simEndSec);
      let theta: number;
      let omega: number;
      if (rot) {
        rot.step(t - rot.tAccum);
        theta = rot.theta;
        omega = rot.omega;
      } else {
        const state = pendulumThetaOmegaAt(t, p, analysis);
        theta = state.theta;
        omega = state.omega;
      }
      const vis = stimulusVisibilityAt(synced, T, t);
      checkpointPhase(
        vis.kind === "show" ? "show" : vis.kind === "fadeOut" ? "fade" : "hide",
      );
      syncMaskedAmbientFromVisibility(vis);
      const guideStroke = pendulumGuideStrokeForSimVisibility(vis);
      drawPendulumStimulusFrame(ctx, layout, theta, motionRange, vis.alpha, guideStroke);
      // 组级绝对速度：v/V_max_group，v=l|ω|
      const v = rodL * Math.abs(omega);
      const level = absoluteSpeedBarLevel(v, speedBarVMax);
      speedBar.setLevels(level, level);

      if (elapsed >= simEndSec) {
        simElapsedActualSec = elapsed;
        simEndOvershootMs = Math.max(0, (elapsed - simEndSec) * 1000);
        stopMaskedAmbientSound();
        startEstimate();
        return;
      }
      raf = requestAnimationFrame(simTick);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(PHYSICS_ABORT_EVENT, cleanup);
    simStartMs = performance.now();
    checkpointPhase("show");
    if (document.hidden) {
      onVisibilityChange();
    } else {
      raf = requestAnimationFrame(simTick);
    }
  }
}

export default PhysicsStimulusPlugin;
export { PhysicsStimulusPlugin };
