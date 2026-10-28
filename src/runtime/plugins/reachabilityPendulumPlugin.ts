import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import { analyzePendulum, pendulumThetaOmegaAt } from "../../experiment/physics/pendulum";
import { setupHiDpiCanvas } from "../../experiment/physics/render/canvasCoords";
import { GRATING_CANVAS_LOGICAL_H, GRATING_CANVAS_LOGICAL_W } from "../../experiment/physics/render/gratingCanvas";
import { drawReachabilityMotionFrame, drawReachabilityTargetFrame, reachabilityWorldLayout } from "../../experiment/physics/render/reachabilityCanvas";
import { playBoundaryCueNow } from "../../shared/playEstimateCue";
import { updateRecoveryCursor } from "../../shared/recovery";
import type { ExperimentId } from "../../experiments/types";
import { PHYSICS_ABORT_EVENT } from "./physicsStimulusPlugin";

const info = {
  name: "reachability-pendulum-stimulus",
  version: "1.0.0",
  parameters: {
    theta0Deg: { type: ParameterType.FLOAT, default: 20 },
    omega0DegPerSec: { type: ParameterType.FLOAT, default: 20 },
    rodLengthM: { type: ParameterType.FLOAT, default: 4 },
    gravity: { type: ParameterType.FLOAT, default: 9.8 },
    bobRadiusM: { type: ParameterType.FLOAT, default: 0.08 },
    targetAngleDeg: { type: ParameterType.FLOAT, default: 45 },
    amplitudeDeg: { type: ParameterType.FLOAT, default: 40 },
    visibleDurationSec: { type: ParameterType.FLOAT, default: 0.4 },
    responseDeadlineSec: { type: ParameterType.FLOAT, default: 4 },
    yesKey: { type: ParameterType.STRING, default: "f" },
    noKey: { type: ParameterType.STRING, default: "j" },
    correctResponse: { type: ParameterType.STRING, default: "reachable" },
    practice: { type: ParameterType.BOOL, default: false },
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
  },
  data: {},
} as const;

type Trial = {
  theta0Deg: number; omega0DegPerSec: number; rodLengthM: number; gravity: number; bobRadiusM: number;
  targetAngleDeg: number; amplitudeDeg: number; visibleDurationSec: number; responseDeadlineSec: number;
  yesKey: "f" | "j"; noKey: "f" | "j"; correctResponse: "reachable" | "unreachable";
  practice: boolean; unitMeta: Record<string, unknown>;
};

export default class ReachabilityPendulumPlugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display: HTMLElement, trial: Trial): void {
    display.innerHTML = `<div class="physics-trial physics-trial--stimulus physics-trial--sim" tabindex="-1">
      <div class="physics-canvas-frame"><canvas class="physics-canvas physics-canvas--grating physics-canvas--reachability" width="${GRATING_CANVAS_LOGICAL_W}" height="${GRATING_CANVAS_LOGICAL_H}"></canvas></div>
      <div class="physics-footer"><p class="physics-hint muted" data-role="hint">观察摆球运动</p><div data-role="feedback"></div></div>
    </div>`;
    const root = display.querySelector(".physics-trial") as HTMLElement;
    const canvas = display.querySelector("canvas") as HTMLCanvasElement;
    const hint = display.querySelector('[data-role="hint"]') as HTMLElement;
    const feedback = display.querySelector('[data-role="feedback"]') as HTMLElement;
    const logicalW = canvas.width;
    const logicalH = canvas.height;
    const { ctx } = setupHiDpiCanvas(canvas, logicalW, logicalH);
    const layout = reachabilityWorldLayout(logicalW, logicalH, trial.rodLengthM);
    const params = { theta0Rad: trial.theta0Deg * Math.PI / 180, omega0RadPerSec: trial.omega0DegPerSec * Math.PI / 180, rodLengthM: trial.rodLengthM, gravity: trial.gravity };
    const analysis = analyzePendulum(params);
    const targetRad = trial.targetAngleDeg * Math.PI / 180;
    const amplitudeSignedRad = Math.sign(targetRad) * trial.amplitudeDeg * Math.PI / 180;
    const experimentId = (trial.unitMeta.runtime_experiment_id ?? "experiment-5") as ExperimentId;
    let raf = 0;
    let deadlineTimer = 0;
    let startMs = performance.now();
    let boundaryMs = 0;
    let responseStartMs = 0;
    let frameCount = 0;
    let maxFrameGapMs = 0;
    let lastFrameMs = startMs;
    let boundaryOvershootMs = 0;
    let visibilityPauseCount = 0;
    let visibilityPauseMs = 0;
    let hiddenAt: number | null = null;
    let feedbackKeyHandler: ((event: KeyboardEvent) => void) | null = null;
    let phase: "motion" | "response" | "feedback" = "motion";
    let finished = false;

    const cleanup = () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(deadlineTimer);
      window.removeEventListener("keydown", onKey);
      if (feedbackKeyHandler) window.removeEventListener("keydown", feedbackKeyHandler);
      window.removeEventListener(PHYSICS_ABORT_EVENT, cleanup);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    const finish = (response: "reachable" | "unreachable" | null, key: string | null, rt: number | null) => {
      if (finished) return;
      finished = true;
      cleanup();
      this.jsPsych.finishTrial({
        response_judgment: response,
        response_key: key,
        correct: response === null ? null : response === trial.correctResponse,
        rt_sec: rt,
        timed_out: response === null,
        boundary_performance_ms: boundaryMs,
        response_start_performance_ms: responseStartMs,
        audio_context_boundary_sec: playBoundaryAudioAnchor,
        sim_frame_count: frameCount,
        sim_max_frame_gap_ms: maxFrameGapMs,
        sim_boundary_overshoot_ms: boundaryOvershootMs,
        visibility_pause_count: visibilityPauseCount,
        visibility_pause_sec: visibilityPauseMs / 1000,
        timing_valid: visibilityPauseCount === 0 && maxFrameGapMs <= 100,
      });
    };
    let playBoundaryAudioAnchor: number | null = null;
    const showPracticeFeedback = (response: "reachable" | "unreachable" | null, key: string | null, rt: number | null) => {
      phase = "feedback";
      window.clearTimeout(deadlineTimer);
      const correct = response === trial.correctResponse;
      drawReachabilityTargetFrame(ctx, layout, trial.rodLengthM, targetRad, amplitudeSignedRad);
      const outcome = response === null ? "未在时限内作答" : correct ? "正确" : "错误";
      feedback.innerHTML = `<p class="physics-feedback ${correct ? "is-correct" : "is-error"}"><strong>${outcome}</strong>。红线为目标，蓝线为实际最大摆角；目标${trial.correctResponse === "reachable" ? "在最大摆角以内，所以会到达" : "超过最大摆角，所以不会到达"}。按空格继续。</p>`;
      hint.textContent = "练习反馈";
      updateRecoveryCursor({ ...cursorMeta(trial.unitMeta), phase: "feedback" }, experimentId);
      feedbackKeyHandler = (event: KeyboardEvent) => {
        if (event.code !== "Space" || event.repeat) return;
        window.removeEventListener("keydown", feedbackKeyHandler!);
        feedbackKeyHandler = null;
        finish(response, key, rt);
      };
      window.addEventListener("keydown", feedbackKeyHandler);
    };
    const timeout = () => trial.practice ? showPracticeFeedback(null, null, null) : finish(null, null, null);
    const showResponse = (now: number) => {
      phase = "response";
      boundaryMs = now;
      responseStartMs = now;
      boundaryOvershootMs = Math.max(0, now - startMs - trial.visibleDurationSec * 1000);
      drawReachabilityTargetFrame(ctx, layout, trial.rodLengthM, targetRad);
      playBoundaryAudioAnchor = playBoundaryCueNow();
      hint.innerHTML = `目标出现：<strong>${trial.yesKey.toUpperCase()} = 会到达</strong>，<strong>${trial.noKey.toUpperCase()} = 不会到达</strong>`;
      updateRecoveryCursor({ ...cursorMeta(trial.unitMeta), phase: "estimate" }, experimentId);
      deadlineTimer = window.setTimeout(timeout, trial.responseDeadlineSec * 1000);
      root.focus({ preventScroll: true });
    };
    const tick = (now: number) => {
      if (phase !== "motion" || document.hidden) return;
      frameCount += 1;
      maxFrameGapMs = Math.max(maxFrameGapMs, now - lastFrameMs);
      lastFrameMs = now;
      const elapsed = (now - startMs) / 1000;
      if (elapsed >= trial.visibleDurationSec) { showResponse(now); return; }
      drawReachabilityMotionFrame(ctx, layout, trial.rodLengthM, trial.bobRadiusM, pendulumThetaOmegaAt(elapsed, params, analysis).theta);
      raf = requestAnimationFrame(tick);
    };
    function onKey(event: KeyboardEvent) {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (phase === "response" && (key === trial.yesKey || key === trial.noKey)) {
        const response = key === trial.yesKey ? "reachable" : "unreachable";
        const rt = (performance.now() - responseStartMs) / 1000;
        window.clearTimeout(deadlineTimer);
        if (!trial.practice) { finish(response, key, rt); return; }
        showPracticeFeedback(response, key, rt);
      }
    }
    function onVisibility() {
      const now = performance.now();
      if (document.hidden) { hiddenAt = now; visibilityPauseCount += 1; cancelAnimationFrame(raf); window.clearTimeout(deadlineTimer); return; }
      if (hiddenAt !== null) {
        const pause = now - hiddenAt; visibilityPauseMs += pause; hiddenAt = null;
        if (phase === "motion") { startMs += pause; lastFrameMs = now; raf = requestAnimationFrame(tick); }
        else if (phase === "response") { responseStartMs += pause; deadlineTimer = window.setTimeout(timeout, Math.max(0, trial.responseDeadlineSec * 1000 - (now - responseStartMs))); }
      }
    }
    updateRecoveryCursor({ ...cursorMeta(trial.unitMeta), phase: "show" }, experimentId);
    window.addEventListener("keydown", onKey);
    window.addEventListener(PHYSICS_ABORT_EVENT, cleanup);
    document.addEventListener("visibilitychange", onVisibility);
    drawReachabilityMotionFrame(ctx, layout, trial.rodLengthM, trial.bobRadiusM, params.theta0Rad);
    raf = requestAnimationFrame(tick);
  }
}

function cursorMeta(meta: Record<string, unknown>) {
  return {
    segment_kind: String(meta.segment_kind ?? ""),
    block_index: Number(meta.block_index ?? 0),
    trial_index_in_block: Number(meta.trial_index_in_block ?? 0),
    formal_trial_index: meta.formal_trial_index === null ? null : Number(meta.formal_trial_index ?? 0),
  };
}
