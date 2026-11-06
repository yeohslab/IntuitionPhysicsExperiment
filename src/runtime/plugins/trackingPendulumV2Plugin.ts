import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import { protocol2SceneAlpha } from "../../experiments/protocol-2/common";
import { analyzePendulum, pendulumThetaOmegaAt } from "../../experiment/physics/pendulum";
import { pointerToLogical, setupHiDpiCanvas } from "../../experiment/physics/render/canvasCoords";
import {
  GRATING_CANVAS_LOGICAL_H,
  GRATING_CANVAS_LOGICAL_W,
  gratingWorldLayout,
} from "../../experiment/physics/render/gratingCanvas";
import {
  drawProtocol2AngleReport,
  drawProtocol2MotionFrame,
  drawProtocol2TrackingFeedback,
  protocol2AngleFromPointer,
} from "../../experiment/physics/render/protocol2Canvas";
import { mountSpeedReportStrip, type SpeedReportStrip } from "../components/speedReportStrip";
import {
  prepareMaskedAmbientForTrial,
  stopMaskedAmbientSound,
  syncMaskedAmbientFromVisibility,
  transitionMaskedAmbientToEstimateCue,
} from "../../shared/playEstimateCue";
import { updateRecoveryCursor } from "../../shared/recovery";
import type { ExperimentId } from "../../experiments/types";
import { PHYSICS_ABORT_EVENT } from "./physicsStimulusPlugin";

const info = {
  name: "tracking-pendulum-v2-stimulus",
  version: "1.0.0",
  parameters: {
    unit: { type: ParameterType.COMPLEX, default: {} },
    practice: { type: ParameterType.BOOL, default: false },
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
  },
  data: {},
} as const;

type Trial = {
  unit: {
    theta0Deg: number; omega0DegPerSec: number; rodLengthM: number; gravity: number;
    bobRadiusM: number; amplitudeDeg: number; queryThetaDeg: number;
    queryOmegaRadPerSec: number; queryTimeSec: number; blankStartSec: number;
    blankDurationSec: number; cueDurationMs: number;
    visibleSegments: Array<{ tStartSec: number; tEndSec: number; truncatedByBlank: boolean }>;
    gapM: number; barWidthM: number; gratingPeriodM: number; gratingOffsetM: number;
    initialSide: "left" | "right"; initialDirection: "leftward" | "rightward";
    speedScaleLinearMPerSec: number;
    reportTarget: "angle" | "speed";
  };
  practice: boolean;
  unitMeta: Record<string, unknown>;
};

type Phase = "cue" | "motion" | "blank" | "angle" | "speed" | "feedback";

export default class TrackingPendulumV2Plugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display: HTMLElement, trial: Trial): void {
    const u = trial.unit;
    display.innerHTML = `<div class="physics-trial physics-trial--stimulus physics-trial--sim" tabindex="-1">
      <div class="physics-canvas-frame"><canvas class="physics-canvas physics-canvas--grating" width="${GRATING_CANVAS_LOGICAL_W}" height="${GRATING_CANVAS_LOGICAL_H}"></canvas></div>
      <div class="physics-footer">
        <p class="physics-hint" data-role="hint"></p>
        <div data-role="strip"></div><div class="physics-actions" data-role="actions"></div>
      </div>
    </div>`;
    const root = display.querySelector(".physics-trial") as HTMLElement;
    const canvas = display.querySelector("canvas") as HTMLCanvasElement;
    const hint = display.querySelector('[data-role="hint"]') as HTMLElement;
    const stripHost = display.querySelector('[data-role="strip"]') as HTMLElement;
    const actions = display.querySelector('[data-role="actions"]') as HTMLElement;
    const { ctx } = setupHiDpiCanvas(canvas, GRATING_CANVAS_LOGICAL_W, GRATING_CANVAS_LOGICAL_H);
    const layout = gratingWorldLayout(GRATING_CANVAS_LOGICAL_W, GRATING_CANVAS_LOGICAL_H, u.rodLengthM);
    const geometry = {
      gapM: u.gapM, barWidthM: u.barWidthM,
      periodM: u.gratingPeriodM, offsetM: u.gratingOffsetM,
    };
    const params = {
      theta0Rad: (u.theta0Deg * Math.PI) / 180,
      omega0RadPerSec: (u.omega0DegPerSec * Math.PI) / 180,
      rodLengthM: u.rodLengthM,
      gravity: u.gravity,
    };
    const analysis = analyzePendulum(params);
    const variantId = (trial.unitMeta.runtime_experiment_id ?? "experiment-4-v2") as ExperimentId;
    let phase: Phase = "cue";
    let raf = 0;
    let timer = 0;
    let motionStartMs = 0;
    let blankStartMs = 0;
    let promptMs = 0;
    let previousFrameMs: number | null = null;
    let maxFrameGapMs = 0;
    let frameCount = 0;
    const segmentFrameCounts = u.visibleSegments.map(() => 0);
    let lastVisibleFrameSec: number | null = null;
    let visibilityPauseCount = 0;
    let visibilityPauseMs = 0;
    let hiddenStartedMs: number | null = null;
    let pausedTotalMs = 0;
    let thetaEstimateRad = 0;
    let angleInteracted = false;
    let speedPosition: number | null = null;
    let rtAngleSec: number | null = null;
    let rtSpeedSec: number | null = null;
    let speedStrip: SpeedReportStrip | null = null;
    let audioAnchor: number | null = null;
    let cueStartedMs = performance.now();
    let cueEndedMs = 0;
    let finished = false;

    const cleanup = () => {
      stopMaskedAmbientSound();
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener(PHYSICS_ABORT_EVENT, cleanup);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onAnglePointer);
      canvas.removeEventListener("pointermove", onAnglePointerMove);
      canvas.removeEventListener("pointerup", onAnglePointerUp);
    };
    const setCursor = (value: "show" | "hide" | "estimate" | "response" | "feedback") => {
      updateRecoveryCursor({
        phase: value,
        segment_kind: String(trial.unitMeta.segment_kind ?? ""),
        block_index: Number(trial.unitMeta.block_index ?? 0),
        trial_index_in_block: Number(trial.unitMeta.trial_index_in_block ?? 0),
        formal_trial_index: trial.unitMeta.formal_trial_index == null
          ? null : Number(trial.unitMeta.formal_trial_index),
      }, variantId);
    };
    const fillBlank = () => {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, GRATING_CANVAS_LOGICAL_W, GRATING_CANVAS_LOGICAL_H);
    };
    const payload = () => {
      const thetaReportedDeg = angleInteracted ? (thetaEstimateRad * 180) / Math.PI : null;
      const speedReported = speedPosition === null
        ? null : speedPosition * u.speedScaleLinearMPerSec;
      const speedTruth = u.rodLengthM * Math.abs(u.queryOmegaRadPerSec);
      const hiddenNow = hiddenStartedMs === null ? 0 : performance.now() - hiddenStartedMs;
      return {
        ...trial.unitMeta,
        theta_reported_deg: thetaReportedDeg,
        theta_reported_rad: angleInteracted ? thetaEstimateRad : null,
        speed_strip_position: speedPosition,
        linear_speed_reported_m_per_sec: speedReported,
        linear_speed_q_m_per_sec: speedTruth,
        delta_theta_deg: thetaReportedDeg === null ? null : thetaReportedDeg - u.queryThetaDeg,
        abs_delta_theta_deg: thetaReportedDeg === null ? null : Math.abs(thetaReportedDeg - u.queryThetaDeg),
        delta_linear_speed_m_per_sec: speedReported === null ? null : speedReported - speedTruth,
        abs_delta_linear_speed_m_per_sec: speedReported === null ? null : Math.abs(speedReported - speedTruth),
        rt_angle_sec: rtAngleSec,
        rt_speed_sec: rtSpeedSec,
        cue_started_performance_ms: cueStartedMs,
        cue_ended_performance_ms: cueEndedMs,
        cue_actual_duration_ms: cueEndedMs - cueStartedMs,
        motion_started_performance_ms: motionStartMs,
        blank_started_performance_ms: blankStartMs,
        prompt_performance_ms: promptMs,
        audio_context_boundary_sec: audioAnchor,
        actual_last_visible_frame_sec: lastVisibleFrameSec,
        actual_visible_segment_frame_counts: JSON.stringify(segmentFrameCounts),
        sim_frame_count: frameCount,
        sim_max_frame_gap_ms: maxFrameGapMs,
        visibility_pause_count: visibilityPauseCount,
        visibility_pause_sec: (visibilityPauseMs + hiddenNow) / 1000,
        timing_valid:
          segmentFrameCounts.every((count) => count >= 2) &&
          maxFrameGapMs <= 100 && visibilityPauseCount === 0,
      };
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      this.jsPsych.finishTrial(payload());
    };
    const showResponseCursor = (visible: boolean) => {
      root.classList.toggle("physics-trial--sim", !visible);
    };
    const showFeedback = () => {
      phase = "feedback";
      setCursor("feedback");
      showResponseCursor(false);
      actions.innerHTML = "";
      if (u.reportTarget === "angle") {
        drawProtocol2TrackingFeedback(
          ctx, layout, u.rodLengthM, u.amplitudeDeg,
          thetaEstimateRad, (u.queryThetaDeg * Math.PI) / 180,
        );
        hint.innerHTML =
          "练习反馈：<strong>橙色</strong>为您的选择，<strong>蓝色</strong>为真实角度。按空格继续。";
      } else {
        fillBlank();
        const scale = u.speedScaleLinearMPerSec;
        const truthLevel = scale > 0
          ? Math.min(1, Math.max(0, (u.rodLengthM * Math.abs(u.queryOmegaRadPerSec)) / scale))
          : 0;
        speedStrip?.lock();
        speedStrip?.showTruth(truthLevel);
        hint.innerHTML =
          "练习反馈：<strong>橙色</strong>为您的选择，<strong>蓝色</strong>为真实速度。按空格继续。";
      }
      const onKey = (event: KeyboardEvent) => {
        if (event.code !== "Space" || event.repeat) return;
        window.removeEventListener("keydown", onKey);
        finish();
      };
      window.addEventListener("keydown", onKey);
    };
    const confirmSpeed = () => {
      if (speedPosition === null) return;
      speedStrip?.lock();
      if (trial.practice) showFeedback();
      else finish();
    };
    const startSpeed = () => {
      phase = "speed";
      setCursor("response");
      showResponseCursor(true);
      actions.innerHTML = "";
      canvas.removeEventListener("pointerdown", onAnglePointer);
      canvas.removeEventListener("pointermove", onAnglePointerMove);
      canvas.removeEventListener("pointerup", onAnglePointerUp);
      hint.textContent = "请在色带上报告空白结束瞬间的速度大小，然后确认。";
      speedStrip = mountSpeedReportStrip(stripHost);
      speedStrip.onChange((value) => {
        if (speedPosition === null) rtSpeedSec = (performance.now() - promptMs) / 1000;
        speedPosition = value;
        confirm.disabled = false;
      });
      const confirm = document.createElement("button");
      confirm.className = "physics-btn physics-btn--primary";
      confirm.type = "button";
      confirm.textContent = "确认速度";
      confirm.disabled = true;
      confirm.onclick = confirmSpeed;
      actions.appendChild(confirm);
    };
    const confirmAngle = () => {
      if (!angleInteracted) return;
      if (trial.practice) showFeedback();
      else finish();
    };
    const startAngle = () => {
      phase = "angle";
      setCursor("estimate");
      showResponseCursor(true);
      fillBlank();
      drawProtocol2AngleReport(ctx, layout, u.rodLengthM, u.amplitudeDeg, thetaEstimateRad, false);
      hint.textContent = "请在橙色圆弧上报告空白结束瞬间的摆杆角度。";
      const confirm = document.createElement("button");
      confirm.className = "physics-btn physics-btn--primary";
      confirm.type = "button";
      confirm.textContent = "确认角度";
      confirm.disabled = true;
      confirm.onclick = confirmAngle;
      actions.appendChild(confirm);
      canvas.addEventListener("pointerdown", onAnglePointer);
      canvas.addEventListener("pointermove", onAnglePointerMove);
      canvas.addEventListener("pointerup", onAnglePointerUp);
      angleConfirmButton = confirm;
    };
    let angleConfirmButton: HTMLButtonElement | null = null;
    let dragging = false;
    function updateAngle(event: PointerEvent) {
      const point = pointerToLogical(event.clientX, event.clientY, canvas, GRATING_CANVAS_LOGICAL_W, GRATING_CANVAS_LOGICAL_H);
      thetaEstimateRad = protocol2AngleFromPointer(
        layout, u.rodLengthM, u.amplitudeDeg, point.x, point.y,
      );
      if (!angleInteracted) rtAngleSec = (performance.now() - promptMs) / 1000;
      angleInteracted = true;
      if (angleConfirmButton) angleConfirmButton.disabled = false;
      drawProtocol2AngleReport(ctx, layout, u.rodLengthM, u.amplitudeDeg, thetaEstimateRad, true);
    }
    function onAnglePointer(event: PointerEvent) {
      if (phase !== "angle") return;
      dragging = true;
      canvas.setPointerCapture(event.pointerId);
      updateAngle(event);
    }
    function onAnglePointerMove(event: PointerEvent) {
      if (phase === "angle" && dragging) updateAngle(event);
    }
    function onAnglePointerUp() { dragging = false; }

    const startPrompt = () => {
      promptMs = performance.now();
      audioAnchor = transitionMaskedAmbientToEstimateCue();
      if (u.reportTarget === "speed") startSpeed();
      else startAngle();
    };
    const tick = (now: number) => {
      if (phase !== "motion" && phase !== "blank") return;
      frameCount += 1;
      if (previousFrameMs !== null) maxFrameGapMs = Math.max(maxFrameGapMs, now - previousFrameMs);
      previousFrameMs = now;
      const elapsed = Math.max(0, (now - motionStartMs - pausedTotalMs) / 1000);
      if (elapsed >= u.queryTimeSec) { startPrompt(); return; }
      if (elapsed >= u.blankStartSec) {
        if (phase !== "blank") {
          phase = "blank";
          blankStartMs = now;
          setCursor("hide");
          fillBlank();
          syncMaskedAmbientFromVisibility({ kind: "hide", alpha: 0 });
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      const sceneAlpha = protocol2SceneAlpha(elapsed, u.blankStartSec);
      syncMaskedAmbientFromVisibility({
        kind: sceneAlpha < 1 ? "fadeOut" : "show",
        alpha: sceneAlpha,
      });
      const state = pendulumThetaOmegaAt(elapsed, params, analysis);
      drawProtocol2MotionFrame(
        ctx, layout, geometry, u.rodLengthM, u.bobRadiusM,
        (u.amplitudeDeg * Math.PI) / 180, state.theta, sceneAlpha,
      );
      u.visibleSegments.forEach((segment, index) => {
        if (elapsed >= segment.tStartSec && elapsed <= segment.tEndSec) {
          segmentFrameCounts[index] += 1;
          lastVisibleFrameSec = elapsed;
        }
      });
      raf = requestAnimationFrame(tick);
    };
    const startMotion = () => {
      phase = "motion";
      cueEndedMs = performance.now();
      hint.textContent = "观察摆球通过光栅运动";
      motionStartMs = performance.now();
      previousFrameMs = motionStartMs;
      setCursor("show");
      prepareMaskedAmbientForTrial();
      raf = requestAnimationFrame(tick);
    };
    function onVisibility() {
      const now = performance.now();
      if (document.hidden) {
        hiddenStartedMs = now;
        visibilityPauseCount += 1;
        cancelAnimationFrame(raf);
        window.clearTimeout(timer);
        return;
      }
      if (hiddenStartedMs === null) return;
      const pause = now - hiddenStartedMs;
      hiddenStartedMs = null;
      visibilityPauseMs += pause;
      if (phase === "cue") {
        cueStartedMs += pause;
        timer = window.setTimeout(startMotion, Math.max(0, u.cueDurationMs - (now - cueStartedMs)));
      } else if (phase === "motion" || phase === "blank") {
        pausedTotalMs += pause;
        previousFrameMs = now;
        raf = requestAnimationFrame(tick);
      }
    }
    fillBlank();
    setCursor("show");
    window.addEventListener(PHYSICS_ABORT_EVENT, cleanup);
    document.addEventListener("visibilitychange", onVisibility);
    startMotion();
    root.focus({ preventScroll: true });
  }
}
