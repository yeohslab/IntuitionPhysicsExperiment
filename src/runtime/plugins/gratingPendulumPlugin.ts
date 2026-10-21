import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import {
  analyzePendulum,
  pendulumOmegaRadForEnergyAtBottom,
  pendulumThetaOmegaAt,
  PendulumRotationIntegrator,
} from "../../experiment/physics/pendulum";
import type { PendulumParams } from "../../experiment/physics/pendulum";
import { classifyBobAtX } from "../../experiments/experiment-4/grating";
import {
  drawGratingFeedbackFrame,
  drawGratingReportFrame,
  drawGratingStimulusFrame,
  gratingAngleFromPointer,
  gratingWorldLayout,
  GRATING_CANVAS_LOGICAL_H,
  GRATING_CANVAS_LOGICAL_W,
  pendulumLayoutFromGratingLayout,
} from "../../experiment/physics/render/gratingCanvas";
import type { PendulumMotionRange } from "../../experiment/physics/render/pendulumCanvas";
import {
  pendulumAngleDegFromRad,
  pendulumWMaxDeg,
  degToRad,
  wrapDeltaThetaDeg,
} from "../../experiment/physics/pendulumArcScore";
import { setupHiDpiCanvas, pointerToLogical } from "../../experiment/physics/render/canvasCoords";
import { mountSpeedReportStrip, type SpeedReportStrip } from "../components/speedReportStrip";
import { transitionMaskedAmbientToEstimateCue } from "../../shared/playEstimateCue";
import { normalizeKeyForJsPsych } from "../../shared/keys";
import { cancelStaleKeyboardListeners } from "../stimulusControl";
import {
  updateRecoveryCursor,
  type RecoveryPhase,
} from "../../shared/recovery";
import type { ExperimentId } from "../../experiments/types";
import { PHYSICS_ABORT_EVENT } from "./physicsStimulusPlugin";

type KeyboardHandler = (e: KeyboardEvent) => void;
type TrialPhase = "sim" | "angle" | "speed" | "feedback";

const SPACE_KEY = normalizeKeyForJsPsych(" ");

const info = {
  name: "grating-pendulum-stimulus",
  version: "1.1.0",
  parameters: {
    theta0Deg: { type: ParameterType.FLOAT, default: -90 },
    omega0DegPerSec: { type: ParameterType.FLOAT, default: 0 },
    rodLengthM: { type: ParameterType.FLOAT, default: 4 },
    gravity: { type: ParameterType.FLOAT, default: 9.8 },
    durationSec: { type: ParameterType.FLOAT, default: 8 },
    queryTimeSec: { type: ParameterType.FLOAT, default: 2 },
    gapM: { type: ParameterType.FLOAT, default: 0.45 },
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
  },
  data: {},
} as const;

type Trial = {
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  durationSec: number;
  queryTimeSec: number;
  gapM: number;
  unitMeta: Record<string, unknown>;
};

class GratingPendulumPlugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: Trial): void {
    cancelStaleKeyboardListeners(this.jsPsych);
    display_element.innerHTML = `
      <div class="physics-trial physics-trial--stimulus physics-trial--sim">
        <div class="physics-canvas-frame">
          <canvas class="physics-canvas" width="${GRATING_CANVAS_LOGICAL_W}" height="${GRATING_CANVAS_LOGICAL_H}"></canvas>
        </div>
        <div class="physics-footer">
          <p class="physics-hint muted physics-sim-hint">观看摆球在光栅后的运动。</p>
          <div class="physics-report-controls"></div>
        </div>
      </div>`;

    const canvas = display_element.querySelector("canvas") as HTMLCanvasElement;
    const logicalW = canvas.width;
    const logicalH = canvas.height;
    const { ctx } = setupHiDpiCanvas(canvas, logicalW, logicalH);
    const trialRoot = display_element.querySelector(".physics-trial") as HTMLElement;
    const hint = display_element.querySelector(".physics-sim-hint") as HTMLElement;
    const controls = display_element.querySelector(".physics-report-controls") as HTMLElement;

    const p: PendulumParams = {
      theta0Rad: degToRad(trial.theta0Deg),
      omega0RadPerSec: degToRad(trial.omega0DegPerSec),
      rodLengthM: trial.rodLengthM,
      gravity: trial.gravity,
    };
    const analysis = analyzePendulum(p);
    const regime = analysis.regime === "rotation" ? "rotation" : "oscillation";
    const motionRange: PendulumMotionRange = {
      regime,
      wMaxDeg: pendulumWMaxDeg(analysis.E, regime, p.rodLengthM, p.gravity),
    };
    const omegaMax = pendulumOmegaRadForEnergyAtBottom(analysis.E, p.rodLengthM);
    const rot = regime === "rotation" ? new PendulumRotationIntegrator(p) : null;
    const thetaAt = (t: number): number => {
      if (rot) {
        rot.step(t - rot.tAccum);
        return rot.theta;
      }
      return pendulumThetaOmegaAt(t, p, analysis).theta;
    };

    const worldLayout = gratingWorldLayout(logicalW, logicalH, p.rodLengthM);
    const pendLayout = pendulumLayoutFromGratingLayout(worldLayout, p.rodLengthM);

    const recoveryExperimentId = (trial.unitMeta.runtime_experiment_id ??
      "experiment-4") as ExperimentId;
    const tQuery = trial.queryTimeSec;

    let phase: TrialPhase = "sim";
    let raf = 0;
    let kbListener: KeyboardHandler | null = null;
    let simStartMs = 0;
    let pausedTotalMs = 0;
    let hiddenStartedMs: number | null = null;
    let visibilityPauseCount = 0;
    let visibilityPauseMs = 0;
    let simFrameCount = 0;
    let simMaxFrameGapMs = 0;
    let simQueryOvershootMs = 0;
    let visibleFrameCount = 0;
    let previousFrameMs: number | null = null;
    let lastRecoveryPhase: RecoveryPhase | null = null;

    let thetaTruthRad = 0;
    let omegaTruthRad = 0;
    let thetaEstRad = 0;
    let angleInteracted = false;
    let speedPosition: number | null = null;
    let rtAngleSec: number | null = null;
    let rtSpeedSec: number | null = null;
    let reportStartMs = 0;
    let angleDragging = false;
    let speedStrip: SpeedReportStrip | null = null;

    const pointerLogical = (e: PointerEvent) =>
      pointerToLogical(e.clientX, e.clientY, canvas, logicalW, logicalH);

    // jsPsych 只在实验根节点上监听 keydown；按钮被移走后焦点会落到 body，空格失效。
    trialRoot.setAttribute("tabindex", "-1");
    const focusTrialRoot = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && !trialRoot.contains(active)) active.blur();
      if (!trialRoot.contains(document.activeElement)) {
        trialRoot.focus({ preventScroll: true });
      }
    };

    const clearKb = () => {
      if (kbListener) {
        this.jsPsych.pluginAPI.cancelKeyboardResponse(kbListener);
        kbListener = null;
      }
    };

    const onAngleDown = (e: PointerEvent) => {
      if (phase !== "angle") return;
      angleDragging = true;
      canvas.setPointerCapture(e.pointerId);
      const { x, y } = pointerLogical(e);
      thetaEstRad = gratingAngleFromPointer(pendLayout, motionRange, x, y);
      if (!angleInteracted) {
        angleInteracted = true;
        rtAngleSec = (performance.now() - reportStartMs) / 1000;
      }
      drawGratingReportFrame(ctx, worldLayout, trial.gapM, pendLayout, motionRange, thetaEstRad, true);
      confirmBtn.disabled = false;
    };
    const onAngleMove = (e: PointerEvent) => {
      if (!angleDragging || phase !== "angle") return;
      const { x, y } = pointerLogical(e);
      thetaEstRad = gratingAngleFromPointer(pendLayout, motionRange, x, y);
      drawGratingReportFrame(ctx, worldLayout, trial.gapM, pendLayout, motionRange, thetaEstRad, true);
    };
    const onAngleUp = () => {
      angleDragging = false;
    };
    const detachAnglePointer = () => {
      canvas.removeEventListener("pointerdown", onAngleDown);
      canvas.removeEventListener("pointermove", onAngleMove);
      canvas.removeEventListener("pointerup", onAngleUp);
      canvas.removeEventListener("pointercancel", onAngleUp);
    };

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearKb();
      cancelAnimationFrame(raf);
      detachAnglePointer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(PHYSICS_ABORT_EVENT, cleanup);
    };
    const finish = (extra: Record<string, unknown>) => {
      cleanup();
      this.jsPsych.finishTrial(extra);
    };

    const checkpointPhase = (recoveryPhase: RecoveryPhase) => {
      if (lastRecoveryPhase === recoveryPhase) return;
      lastRecoveryPhase = recoveryPhase;
      updateRecoveryCursor(
        {
          segment_kind: String(trial.unitMeta.segment_kind ?? ""),
          block_index: Number(trial.unitMeta.block_index ?? 0),
          trial_index_in_block: Number(trial.unitMeta.trial_index_in_block ?? 0),
          formal_trial_index:
            trial.unitMeta.formal_trial_index === null
              ? null
              : Number(trial.unitMeta.formal_trial_index ?? 0),
          phase: recoveryPhase,
        },
        recoveryExperimentId,
      );
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

    const buildPayload = (): Record<string, unknown> => {
      const omegaReported =
        speedPosition === null ? null : speedPosition * omegaMax;
      const thetaReportedDeg = angleInteracted
        ? pendulumAngleDegFromRad(thetaEstRad)
        : null;
      const thetaTruthDeg = pendulumAngleDegFromRad(thetaTruthRad);
      const deltaThetaDeg =
        thetaReportedDeg === null
          ? null
          : wrapDeltaThetaDeg(thetaReportedDeg, thetaTruthDeg, regime, motionRange.wMaxDeg);
      const deltaOmega =
        omegaReported === null ? null : omegaReported - Math.abs(omegaTruthRad);
      const currentHiddenMs =
        hiddenStartedMs === null ? 0 : Math.max(0, performance.now() - hiddenStartedMs);
      return {
        ...trial.unitMeta,
        response_mode: "angle_then_speed",
        theta_reported_deg: thetaReportedDeg,
        theta_reported_rad:
          thetaReportedDeg === null ? null : degToRad(thetaReportedDeg),
        speed_strip_position: speedPosition,
        omega_reported_rad_per_sec: omegaReported,
        delta_theta_deg: deltaThetaDeg,
        abs_delta_theta_deg:
          deltaThetaDeg === null ? null : Math.abs(deltaThetaDeg),
        delta_omega_rad_per_sec: deltaOmega,
        abs_delta_omega_rad_per_sec:
          deltaOmega === null ? null : Math.abs(deltaOmega),
        response_order_first: "angle",
        rt_angle_sec: rtAngleSec,
        rt_speed_sec: rtSpeedSec,
        rt_total_sec: (performance.now() - reportStartMs) / 1000,
        sim_frame_count: simFrameCount,
        sim_max_frame_gap_ms: simMaxFrameGapMs,
        sim_query_overshoot_ms: simQueryOvershootMs,
        visible_frame_count: visibleFrameCount,
        visibility_pause_count: visibilityPauseCount,
        visibility_pause_sec: (visibilityPauseMs + currentHiddenMs) / 1000,
        gap_m: trial.gapM,
        query_time_sec: tQuery,
        theta_q_deg: thetaTruthDeg,
        omega_q_rad_per_sec: omegaTruthRad,
        abs_omega_q_rad_per_sec: Math.abs(omegaTruthRad),
      };
    };

    const listenSpace = (onSpace: () => void): KeyboardHandler =>
      this.jsPsych.pluginAPI.getKeyboardResponse({
        callback_function: (info: { key: string }) => {
          if (info.key === SPACE_KEY) onSpace();
        },
        valid_responses: [SPACE_KEY],
        rt_method: "performance",
        persist: true,
        allow_held_key: false,
      }) as KeyboardHandler;

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "physics-btn physics-btn--primary";

    const startFeedback = (payload: Record<string, unknown>) => {
      phase = "feedback";
      checkpointPhase("feedback");
      canvas.classList.remove("physics-canvas--estimate");
      drawGratingFeedbackFrame(ctx, worldLayout, trial.gapM, pendLayout, motionRange, thetaEstRad, thetaTruthRad);
      hint.innerHTML =
        "<strong>橙色</strong>为您的选择，<strong>蓝色</strong>为询问时刻的真实值（摆杆与色带相同）。按空格键继续。";
      confirmBtn.remove();
      speedStrip?.lock();
      speedStrip?.showTruth(Math.abs(omegaTruthRad) / omegaMax);
      focusTrialRoot();
      window.setTimeout(() => {
        if (!cleaned) kbListener = listenSpace(() => finish(payload));
      }, 300);
    };

    const confirmSpeed = () => {
      if (phase !== "speed" || speedPosition === null) return;
      clearKb();
      const payload = buildPayload();
      if (trial.unitMeta.segment_kind === "practice") {
        startFeedback(payload);
      } else {
        finish(payload);
      }
    };

    const startSpeedReport = () => {
      phase = "speed";
      detachAnglePointer();
      clearKb();
      hint.textContent = "请在色带上点击询问瞬间的速度大小，可拖动微调，然后确认速度。";
      speedStrip = mountSpeedReportStrip(controls);
      speedStrip.onChange((level) => {
        if (speedPosition === null) {
          rtSpeedSec = (performance.now() - reportStartMs) / 1000;
        }
        speedPosition = level;
        confirmBtn.disabled = false;
      });
      confirmBtn.textContent = "确认速度";
      confirmBtn.disabled = true;
      confirmBtn.onclick = confirmSpeed;
      controls.appendChild(confirmBtn);
      focusTrialRoot();
      kbListener = listenSpace(confirmSpeed);
    };

    const confirmAngle = () => {
      if (phase !== "angle" || !angleInteracted) return;
      startSpeedReport();
    };

    const startAngleReport = () => {
      transitionMaskedAmbientToEstimateCue();
      phase = "angle";
      checkpointPhase("estimate");
      trialRoot.classList.remove("physics-trial--sim");
      canvas.classList.add("physics-canvas--estimate");
      const state = pendulumThetaOmegaAt(tQuery, p, analysis);
      thetaTruthRad = state.theta;
      omegaTruthRad = state.omega;
      reportStartMs = performance.now();
      hint.textContent = "请先在橙色虚线上点击询问瞬间的摆杆位置，可拖动微调，然后确认角度。";
      drawGratingReportFrame(ctx, worldLayout, trial.gapM, pendLayout, motionRange, thetaEstRad, false);
      confirmBtn.textContent = "确认角度";
      confirmBtn.disabled = true;
      confirmBtn.onclick = confirmAngle;
      controls.appendChild(confirmBtn);
      focusTrialRoot();
      kbListener = listenSpace(confirmAngle);
      canvas.addEventListener("pointerdown", onAngleDown);
      canvas.addEventListener("pointermove", onAngleMove);
      canvas.addEventListener("pointerup", onAngleUp);
      canvas.addEventListener("pointercancel", onAngleUp);
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
      const theta = thetaAt(Math.min(elapsed, tQuery));
      if (classifyBobAtX(p.rodLengthM * Math.sin(theta), trial.gapM) === "fully_visible") {
        visibleFrameCount += 1;
      }
      drawGratingStimulusFrame(ctx, worldLayout, trial.gapM, p.rodLengthM, theta);
      if (elapsed >= tQuery) {
        simQueryOvershootMs = Math.max(0, (elapsed - tQuery) * 1000);
        startAngleReport();
        return;
      }
      raf = requestAnimationFrame(simTick);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(PHYSICS_ABORT_EVENT, cleanup);
    simStartMs = performance.now();
    checkpointPhase("show");
    if (document.hidden) onVisibilityChange();
    else raf = requestAnimationFrame(simTick);
  }
}

export default GratingPendulumPlugin;
export { GratingPendulumPlugin };
