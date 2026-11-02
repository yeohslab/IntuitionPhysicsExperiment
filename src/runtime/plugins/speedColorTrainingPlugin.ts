import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import {
  drawLinearMotionFrame,
  LINEAR_MOTION_CANVAS_LOGICAL_H,
  LINEAR_MOTION_CANVAS_LOGICAL_W,
  linearMotionWorldLayout,
} from "../../experiment/physics/render/linearMotionCanvas";
import { setupHiDpiCanvas } from "../../experiment/physics/render/canvasCoords";
import {
  linearSpeedMPerSecFromSpeedStripPosition,
  SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC,
  SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC,
  SPEED_STRIP_SCALE_ENERGY_J,
  speedStripPositionFromLinearSpeedMPerSec,
} from "../../experiment/physics/speedStripScale";
import {
  TRAINING_1_FEEDBACK_HOLD_MS,
  TRAINING_1_FEEDBACK_PHASE_TIMELINE,
} from "../../experiments/training-1/protocol";
import { training1AssessmentAttemptFromCompletedTrials } from "../../experiments/training-1/mastery";
import { trainingMotionStateAt } from "../../experiments/training-1/trialPhysics";
import { transitionMaskedAmbientToEstimateCue } from "../../shared/playEstimateCue";
import type {
  SpeedColorTrainingDirection,
  SpeedColorTrainingLoopMode,
  SpeedColorTrainingMode,
  SpeedColorTrainingSegment,
} from "../../shared/experimentTypes";
import { cancelStaleKeyboardListeners } from "../stimulusControl";
import { mountSpeedReportStrip, type SpeedReportStrip } from "../components/speedReportStrip";
import { PHYSICS_ABORT_EVENT } from "./physicsStimulusPlugin";

const info = {
  name: "speed-color-training",
  version: "1.0.0",
  parameters: {
    mode: { type: ParameterType.STRING, default: "guided" },
    trainingSegment: { type: ParameterType.STRING, default: "guided_1" },
    initialDirection: { type: ParameterType.STRING, default: "rightward" },
    loopMode: { type: ParameterType.STRING, default: "ping_pong" },
    linearSpeedMPerSec: { type: ParameterType.FLOAT, default: 0 },
    trackLeftXM: { type: ParameterType.FLOAT, default: -4 },
    trackRightXM: { type: ParameterType.FLOAT, default: 4 },
    initialXM: { type: ParameterType.FLOAT, default: -4 },
    reportDelaySec: { type: ParameterType.FLOAT, default: null },
    firstTraversalDurationSec: { type: ParameterType.FLOAT, default: null },
    feedbackShown: { type: ParameterType.BOOL, default: true },
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
  },
  data: {},
} as const;

type Trial = {
  mode: SpeedColorTrainingMode;
  trainingSegment: SpeedColorTrainingSegment;
  initialDirection: SpeedColorTrainingDirection;
  loopMode: SpeedColorTrainingLoopMode;
  linearSpeedMPerSec: number;
  trackLeftXM: number;
  trackRightXM: number;
  initialXM: number;
  reportDelaySec: number | null;
  firstTraversalDurationSec: number | null;
  feedbackShown: boolean;
  unitMeta: Record<string, unknown>;
};

function feedbackLabel(delta: number): string {
  if (Math.abs(delta) <= 0.01) return "选择接近真实速度";
  return delta > 0 ? "选择偏快" : "选择偏慢";
}

class SpeedColorTrainingPlugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: Trial): void {
    cancelStaleKeyboardListeners(this.jsPsych);
    display_element.innerHTML = `
      <div class="physics-trial physics-trial--stimulus physics-trial--linear-training physics-trial--sim">
        <div class="physics-canvas-frame">
          <canvas class="physics-canvas physics-canvas--grating" width="${LINEAR_MOTION_CANVAS_LOGICAL_W}" height="${LINEAR_MOTION_CANVAS_LOGICAL_H}"></canvas>
        </div>
        <div class="physics-footer">
          <p class="physics-hint muted physics-sim-hint"></p>
          <div class="physics-report-controls">
            <div class="physics-speed-strip-host"></div>
            <div class="physics-phase-skip-host"></div>
            <div class="physics-report-actions"></div>
          </div>
        </div>
      </div>`;

    const canvas = display_element.querySelector("canvas") as HTMLCanvasElement;
    // Save logical dimensions before HiDPI setup expands the backing store.
    const logicalW = canvas.width;
    const logicalH = canvas.height;
    const { ctx } = setupHiDpiCanvas(canvas, logicalW, logicalH);
    const layout = linearMotionWorldLayout(logicalW, logicalH);
    const trialRoot = display_element.querySelector(".physics-trial") as HTMLElement;
    const hint = display_element.querySelector(".physics-sim-hint") as HTMLElement;
    const controls = display_element.querySelector(".physics-report-controls") as HTMLElement;
    const stripHost = controls.querySelector(".physics-speed-strip-host") as HTMLElement;
    const skipHost = controls.querySelector(".physics-phase-skip-host") as HTMLElement;
    const actions = controls.querySelector(".physics-report-actions") as HTMLElement;
    const canSkipFeedbackPhase = trial.mode === "guided" &&
      trial.trainingSegment.startsWith("guided_");
    const truthPosition = speedStripPositionFromLinearSpeedMPerSec(
      trial.linearSpeedMPerSec,
    );
    const previousAssessmentTrials = (
      this.jsPsych.data.get().values() as Record<string, unknown>[]
    ).filter((row) =>
      row.trial_type === "speed-color-training" && row.mode === "assessment"
    ).length;
    const runtimeAssessmentAttempt = trial.mode === "assessment"
      ? training1AssessmentAttemptFromCompletedTrials(previousAssessmentTrials)
      : null;

    let raf = 0;
    let timerId: number | null = null;
    const motionStartMs = performance.now();
    let reportStartMs: number | null = null;
    let confirmationMs: number | null = null;
    let confirmationMotionElapsedSec: number | null = null;
    let speedPosition: number | null = null;
    let rtSpeedSec: number | null = null;
    let speedStrip: SpeedReportStrip | null = null;
    let reportOpened = false;
    let feedbackPhaseSkipped = false;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      cancelAnimationFrame(raf);
      if (timerId !== null) window.clearTimeout(timerId);
      window.removeEventListener(PHYSICS_ABORT_EVENT, cleanup);
    };
    const finish = (payload: Record<string, unknown>) => {
      cleanup();
      this.jsPsych.finishTrial(payload);
    };

    const buildPayload = (): Record<string, unknown> => {
      const delta = speedPosition === null ? null : speedPosition - truthPosition;
      return {
        ...trial.unitMeta,
        mode: trial.mode,
        training_segment: trial.trainingSegment,
        assessment_attempt: runtimeAssessmentAttempt,
        feedback_shown: trial.feedbackShown,
        initial_direction: trial.initialDirection,
        motion_loop_mode: trial.loopMode,
        track_left_x_m: trial.trackLeftXM,
        track_right_x_m: trial.trackRightXM,
        initial_x_m: trial.initialXM,
        report_available_at_sec: trial.reportDelaySec,
        first_traversal_duration_sec: trial.firstTraversalDurationSec,
        motion_elapsed_at_confirmation_sec: confirmationMotionElapsedSec,
        feedback_phase_skipped: feedbackPhaseSkipped,
        linear_speed_m_per_sec: trial.linearSpeedMPerSec,
        speed_strip_position: speedPosition,
        speed_strip_truth_position: truthPosition,
        delta_strip_position: delta,
        abs_delta_strip_position: delta === null ? null : Math.abs(delta),
        speed_scale_energy_j: SPEED_STRIP_SCALE_ENERGY_J,
        speed_scale_linear_v_max_m_per_sec:
          SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC,
        speed_scale_omega_max_rad_per_sec:
          SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC,
        speed_reported_m_per_sec: speedPosition === null
          ? null
          : linearSpeedMPerSecFromSpeedStripPosition(speedPosition),
        rt_speed_sec: rtSpeedSec,
        rt_total_sec: reportStartMs === null || confirmationMs === null
          ? null
          : (confirmationMs - reportStartMs) / 1000,
      };
    };

    const startReport = () => {
      if (reportOpened) return;
      reportOpened = true;
      transitionMaskedAmbientToEstimateCue();
      trialRoot.classList.remove("physics-trial--sim");
      reportStartMs = performance.now();
      hint.textContent = "请在色带上选择当前小球的速度；小球会持续往复运动。";
      speedStrip = mountSpeedReportStrip(stripHost);
      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "physics-btn physics-btn--primary";
      confirmBtn.textContent = "确认速度";
      confirmBtn.disabled = true;
      speedStrip.onChange((level) => {
        if (speedPosition === null && reportStartMs !== null) {
          rtSpeedSec = (performance.now() - reportStartMs) / 1000;
        }
        speedPosition = level;
        confirmBtn.disabled = false;
      });
      confirmBtn.onclick = () => {
        if (speedPosition === null) return;
        confirmationMs = performance.now();
        confirmationMotionElapsedSec = (confirmationMs - motionStartMs) / 1000;
        speedStrip?.lock();
        confirmBtn.remove();
        if (!trial.feedbackShown) {
          finish(buildPayload());
          return;
        }
        speedStrip?.showTruth(truthPosition);
        const delta = speedPosition - truthPosition;
        hint.innerHTML = `<strong>${feedbackLabel(delta)}</strong>。橙色为选择，蓝色为真实速度。`;
        const payload = buildPayload();
        timerId = window.setTimeout(
          () => finish(payload),
          TRAINING_1_FEEDBACK_HOLD_MS,
        );
      };
      actions.appendChild(confirmBtn);
    };

    if (canSkipFeedbackPhase) {
      const skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = "physics-btn physics-skip-phase";
      skipBtn.textContent = "跳过反馈阶段";
      skipBtn.onclick = () => {
        if (cleaned) return;
        confirmationMs = performance.now();
        confirmationMotionElapsedSec = (confirmationMs - motionStartMs) / 1000;
        feedbackPhaseSkipped = true;
        this.jsPsych.abortTimelineByName(TRAINING_1_FEEDBACK_PHASE_TIMELINE);
        finish(buildPayload());
      };
      skipHost.appendChild(skipBtn);
    }

    const tick = (now: number) => {
      const elapsedSec = Math.max(0, (now - motionStartMs) / 1000);
      const state = trainingMotionStateAt(trial, elapsedSec);
      drawLinearMotionFrame(ctx, layout, state.xM);

      if (!reportOpened && trial.reportDelaySec !== null &&
          elapsedSec >= trial.reportDelaySec) {
        startReport();
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener(PHYSICS_ABORT_EVENT, cleanup);
    hint.textContent = "请观察小球的匀速往复运动；4 秒后可作答。";
    drawLinearMotionFrame(ctx, layout, trial.initialXM);
    raf = requestAnimationFrame(tick);
  }
}

export default SpeedColorTrainingPlugin;
