import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import { analyzePendulum, pendulumThetaOmegaAt } from "../../experiment/physics/pendulum";
import { setupHiDpiCanvas } from "../../experiment/physics/render/canvasCoords";
import {
  GRATING_CANVAS_LOGICAL_H,
  GRATING_CANVAS_LOGICAL_W,
  gratingWorldLayout,
} from "../../experiment/physics/render/gratingCanvas";
import { drawProtocol2BellMotionFrame } from "../../experiment/physics/render/protocol2Canvas";
import { playBoundaryCueNow } from "../../shared/playEstimateCue";
import { updateRecoveryCursor } from "../../shared/recovery";
import type { ExperimentId } from "../../experiments/types";
import { PHYSICS_ABORT_EVENT } from "./physicsStimulusPlugin";

const info = {
  name: "bell-reachability-v2-stimulus",
  version: "1.0.0",
  parameters: {
    unit: { type: ParameterType.COMPLEX, default: {} },
    practice: { type: ParameterType.BOOL, default: false },
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
  },
  data: {},
} as const;

type Unit = {
  theta0Deg: number; omega0DegPerSec: number; rodLengthM: number; gravity: number;
  bobRadiusM: number; amplitudeDeg: number; queryTimeSec: number; blankStartSec: number;
  queryThetaDeg: number; queryOmegaRadPerSec: number;
  visibleSegments: Array<{ tStartSec: number; tEndSec: number; truncatedByBlank: boolean }>;
  gapM: number; barWidthM: number; gratingPeriodM: number; gratingOffsetM: number;
  bellThetaDeg: number; correctResponse: "reachable" | "unreachable";
  yesKey: "f" | "j"; noKey: "f" | "j";
};

type Trial = { unit: Unit; practice: boolean; unitMeta: Record<string, unknown> };

export default class BellReachabilityV2Plugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display: HTMLElement, trial: Trial): void {
    const u = trial.unit;
    display.innerHTML = `<div class="physics-trial physics-trial--stimulus physics-trial--sim" tabindex="-1">
      <div class="physics-canvas-frame"><canvas class="physics-canvas physics-canvas--grating physics-canvas--reachability" width="${GRATING_CANVAS_LOGICAL_W}" height="${GRATING_CANVAS_LOGICAL_H}"></canvas></div>
      <div class="physics-footer"><p class="physics-hint" data-role="hint">观察摆球和铃铛</p><div data-role="feedback"></div></div>
    </div>`;
    const root = display.querySelector(".physics-trial") as HTMLElement;
    const canvas = display.querySelector("canvas") as HTMLCanvasElement;
    const hint = display.querySelector('[data-role="hint"]') as HTMLElement;
    const feedback = display.querySelector('[data-role="feedback"]') as HTMLElement;
    const { ctx } = setupHiDpiCanvas(canvas, GRATING_CANVAS_LOGICAL_W, GRATING_CANVAS_LOGICAL_H);
    const layout = gratingWorldLayout(GRATING_CANVAS_LOGICAL_W, GRATING_CANVAS_LOGICAL_H, u.rodLengthM);
    const geometry = { gapM: u.gapM, barWidthM: u.barWidthM, periodM: u.gratingPeriodM, offsetM: u.gratingOffsetM };
    const params = {
      theta0Rad: (u.theta0Deg * Math.PI) / 180,
      omega0RadPerSec: (u.omega0DegPerSec * Math.PI) / 180,
      rodLengthM: u.rodLengthM,
      gravity: u.gravity,
    };
    const analysis = analyzePendulum(params);
    const bellThetaRad = (u.bellThetaDeg * Math.PI) / 180;
    const variantId = (trial.unitMeta.runtime_experiment_id ?? "experiment-5-v2") as ExperimentId;
    const startedMs = performance.now();
    let phase: "motion" | "blank" | "response" | "feedback" = "motion";
    let raf = 0;
    let previousFrameMs = startedMs;
    let frameCount = 0;
    let maxFrameGapMs = 0;
    const segmentFrameCounts = [0, 0, 0];
    const previousOmegaSigns: Array<number | null> = [null, null, null];
    let actualVisibleTurn = false;
    let actualVisibleTurnFrame: number | null = null;
    let actualVisibleTurnTimeSec: number | null = null;
    let actualVisibleContact = false;
    let actualVisibleContactFrame: number | null = null;
    let actualVisibleContactTimeSec: number | null = null;
    let lastVisibleFrameSec: number | null = null;
    let blankStartMs = 0;
    let promptMs = 0;
    let audioAnchor: number | null = null;
    let pausedTotalMs = 0;
    let hiddenAt: number | null = null;
    let visibilityPauseCount = 0;
    let visibilityPauseMs = 0;
    let finished = false;
    let response: "reachable" | "unreachable" | null = null;
    let responseKey: string | null = null;
    let responseRtSec: number | null = null;

    const cursor = (value: "show" | "hide" | "estimate" | "feedback") => {
      updateRecoveryCursor({
        phase: value,
        segment_kind: String(trial.unitMeta.segment_kind ?? ""),
        block_index: Number(trial.unitMeta.block_index ?? 0),
        trial_index_in_block: Number(trial.unitMeta.trial_index_in_block ?? 0),
        formal_trial_index: trial.unitMeta.formal_trial_index == null
          ? null : Number(trial.unitMeta.formal_trial_index),
      }, variantId);
    };
    const blank = () => {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, GRATING_CANVAS_LOGICAL_W, GRATING_CANVAS_LOGICAL_H);
    };
    const cleanup = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PHYSICS_ABORT_EVENT, cleanup);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    const payload = () => ({
      ...trial.unitMeta,
      response_judgment: response,
      response_key: responseKey,
      correct: response === null ? null : response === u.correctResponse,
      rt_sec: responseRtSec,
      timed_out: false,
      blank_started_performance_ms: blankStartMs,
      prompt_performance_ms: promptMs,
      audio_context_boundary_sec: audioAnchor,
      actual_last_visible_frame_sec: lastVisibleFrameSec,
      actual_visible_segment_frame_counts: JSON.stringify(segmentFrameCounts),
      actual_visible_turn: actualVisibleTurn,
      actual_visible_turn_first_frame: actualVisibleTurnFrame,
      actual_visible_turn_first_time_sec: actualVisibleTurnTimeSec,
      actual_visible_contact: actualVisibleContact,
      actual_visible_contact_first_frame: actualVisibleContactFrame,
      actual_visible_contact_first_time_sec: actualVisibleContactTimeSec,
      sim_frame_count: frameCount,
      sim_max_frame_gap_ms: maxFrameGapMs,
      visibility_pause_count: visibilityPauseCount,
      visibility_pause_sec: visibilityPauseMs / 1000,
      timing_valid:
        segmentFrameCounts.every((count) => count >= 2) &&
        maxFrameGapMs <= 100 && visibilityPauseCount === 0,
    });
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      this.jsPsych.finishTrial(payload());
    };
    const showFeedback = () => {
      phase = "feedback";
      cursor("feedback");
      const correct = response === u.correctResponse;
      feedback.innerHTML = `<p class="physics-feedback ${correct ? "is-correct" : "is-error"}"><strong>${correct ? "正确" : "错误"}</strong>。这个铃铛${u.correctResponse === "reachable" ? "可以" : "不可以"}到达。按空格继续。</p>`;
      hint.textContent = "练习反馈";
    };
    function onKey(event: KeyboardEvent) {
      if (event.repeat) return;
      if (phase === "feedback" && event.code === "Space") { finish(); return; }
      if (phase !== "response") return;
      const key = event.key.toLowerCase();
      if (key !== u.yesKey && key !== u.noKey) return;
      responseKey = key;
      response = key === u.yesKey ? "reachable" : "unreachable";
      responseRtSec = (performance.now() - promptMs) / 1000;
      if (trial.practice) showFeedback();
      else finish();
    }
    const startResponse = () => {
      phase = "response";
      promptMs = performance.now();
      audioAnchor = playBoundaryCueNow();
      blank();
      hint.innerHTML = `铃铛是否可能到达？<strong>${u.yesKey.toUpperCase()} = 会到达</strong>，<strong>${u.noKey.toUpperCase()} = 不会到达</strong>`;
      cursor("estimate");
      root.focus({ preventScroll: true });
    };
    const tick = (now: number) => {
      if (phase !== "motion" && phase !== "blank") return;
      frameCount += 1;
      maxFrameGapMs = Math.max(maxFrameGapMs, now - previousFrameMs);
      previousFrameMs = now;
      const elapsed = Math.max(0, (now - startedMs - pausedTotalMs) / 1000);
      if (elapsed >= u.queryTimeSec) { startResponse(); return; }
      if (elapsed >= u.blankStartSec) {
        if (phase !== "blank") {
          phase = "blank";
          blankStartMs = now;
          blank();
          cursor("hide");
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      const state = pendulumThetaOmegaAt(elapsed, params, analysis);
      drawProtocol2BellMotionFrame(
        ctx, layout, geometry, u.rodLengthM, u.bobRadiusM,
        (u.amplitudeDeg * Math.PI) / 180, state.theta, bellThetaRad,
      );
      u.visibleSegments.forEach((segment, index) => {
        if (elapsed < segment.tStartSec || elapsed > segment.tEndSec) return;
        segmentFrameCounts[index] += 1;
        lastVisibleFrameSec = elapsed;
        const sign = Math.sign(state.omega);
        const previousSign = previousOmegaSigns[index];
        if (!actualVisibleTurn && previousSign !== null && sign !== 0 && sign !== previousSign) {
          actualVisibleTurn = true;
          actualVisibleTurnFrame = frameCount;
          actualVisibleTurnTimeSec = elapsed;
        }
        if (sign !== 0) previousOmegaSigns[index] = sign;
        if (!actualVisibleContact && Math.abs(state.theta - bellThetaRad) <= u.bobRadiusM / u.rodLengthM) {
          actualVisibleContact = true;
          actualVisibleContactFrame = frameCount;
          actualVisibleContactTimeSec = elapsed;
        }
      });
      raf = requestAnimationFrame(tick);
    };
    function onVisibility() {
      const now = performance.now();
      if (document.hidden) {
        hiddenAt = now;
        visibilityPauseCount += 1;
        cancelAnimationFrame(raf);
        return;
      }
      if (hiddenAt === null) return;
      const pause = now - hiddenAt;
      hiddenAt = null;
      visibilityPauseMs += pause;
      if (phase === "motion" || phase === "blank") {
        pausedTotalMs += pause;
        previousFrameMs = now;
        raf = requestAnimationFrame(tick);
      } else if (phase === "response" || phase === "feedback") {
        promptMs += pause;
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(PHYSICS_ABORT_EVENT, cleanup);
    document.addEventListener("visibilitychange", onVisibility);
    cursor("show");
    raf = requestAnimationFrame(tick);
  }
}
