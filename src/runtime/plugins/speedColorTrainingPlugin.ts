import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import {
  analyzePendulum,
  pendulumThetaOmegaAt,
  type PendulumParams,
} from "../../experiment/physics/pendulum";
import { degToRad } from "../../experiment/physics/pendulumArcScore";
import {
  drawTrainingPendulumFrame,
  gratingWorldLayout,
  GRATING_CANVAS_LOGICAL_H,
  GRATING_CANVAS_LOGICAL_W,
} from "../../experiment/physics/render/gratingCanvas";
import { setupHiDpiCanvas } from "../../experiment/physics/render/canvasCoords";
import {
  absOmegaRadPerSecFromSpeedStripPosition,
  SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC,
  speedStripPositionFromAbsOmegaRadPerSec,
} from "../../experiment/physics/speedStripScale";
import { TRAINING_1_FEEDBACK_CLOSE_DELTA } from "../../experiments/training-1/protocol";
import { mountSpeedReportStrip, type SpeedReportStrip } from "../components/speedReportStrip";
import { transitionMaskedAmbientToEstimateCue } from "../../shared/playEstimateCue";
import { normalizeKeyForJsPsych } from "../../shared/keys";
import { cancelStaleKeyboardListeners } from "../stimulusControl";
import { PHYSICS_ABORT_EVENT } from "./physicsStimulusPlugin";

type KeyboardHandler = (e: KeyboardEvent) => void;
type Phase = "sim" | "report" | "replay" | "feedback" | "demo_done";

const SPACE_KEY = normalizeKeyForJsPsych(" ");

const info = {
  name: "speed-color-training",
  version: "1.0.0",
  parameters: {
    mode: { type: ParameterType.STRING, default: "report" },
    trainingSegment: { type: ParameterType.STRING, default: "mastery_1" },
    theta0Deg: { type: ParameterType.FLOAT, default: 0 },
    omega0DegPerSec: { type: ParameterType.FLOAT, default: 0 },
    rodLengthM: { type: ParameterType.FLOAT, default: 4 },
    gravity: { type: ParameterType.FLOAT, default: 9.8 },
    queryTimeSec: { type: ParameterType.FLOAT, default: 1 },
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
  },
  data: {},
} as const;

type Trial = {
  mode: "demonstration" | "report";
  trainingSegment: string;
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  queryTimeSec: number;
  unitMeta: Record<string, unknown>;
};

function feedbackLabel(delta: number): string {
  if (Math.abs(delta) < TRAINING_1_FEEDBACK_CLOSE_DELTA) return "接近";
  return delta > 0 ? "偏快" : "偏慢";
}

class SpeedColorTrainingPlugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: Trial): void {
    cancelStaleKeyboardListeners(this.jsPsych);
    display_element.innerHTML = `
      <div class="physics-trial physics-trial--stimulus physics-trial--sim">
        <div class="physics-canvas-frame">
          <canvas class="physics-canvas physics-canvas--grating" width="${GRATING_CANVAS_LOGICAL_W}" height="${GRATING_CANVAS_LOGICAL_H}"></canvas>
        </div>
        <div class="physics-footer">
          <p class="physics-hint muted physics-sim-hint"></p>
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
    const isDemo = trial.mode === "demonstration";
    hint.textContent = isDemo
      ? "观看蓝色标记随摆球真实速度变化。"
      : "观看摆球运动。";

    const p: PendulumParams = {
      theta0Rad: degToRad(trial.theta0Deg),
      omega0RadPerSec: degToRad(trial.omega0DegPerSec),
      rodLengthM: trial.rodLengthM,
      gravity: trial.gravity,
    };
    const analysis = analyzePendulum(p);
    const tQuery = trial.queryTimeSec;
    const worldLayout = gratingWorldLayout(logicalW, logicalH, p.rodLengthM);
    let phase: Phase = "sim";
    let raf = 0;
    let kbListener: KeyboardHandler | null = null;
    let simStartMs = 0;
    let speedStrip: SpeedReportStrip | null = null;
    let speedPosition: number | null = null;
    let rtSpeedSec: number | null = null;
    let reportStartMs = 0;
    let omegaTruthRad = 0;
    let thetaFrozenRad = 0;

    const clearKb = () => {
      if (kbListener) {
        this.jsPsych.pluginAPI.cancelKeyboardResponse(kbListener);
        kbListener = null;
      }
    };

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearKb();
      cancelAnimationFrame(raf);
      window.removeEventListener(PHYSICS_ABORT_EVENT, cleanup);
    };
    const finish = (extra: Record<string, unknown>) => {
      cleanup();
      this.jsPsych.finishTrial(extra);
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

    const buildPayload = (): Record<string, unknown> => {
      const truthPos = speedStripPositionFromAbsOmegaRadPerSec(omegaTruthRad);
      const deltaStrip =
        speedPosition === null ? null : speedPosition - truthPos;
      return {
        ...trial.unitMeta,
        mode: trial.mode,
        training_segment: trial.trainingSegment,
        speed_strip_position: speedPosition,
        speed_strip_truth_position: truthPos,
        delta_strip_position: deltaStrip,
        abs_delta_strip_position:
          deltaStrip === null ? null : Math.abs(deltaStrip),
        speed_scale_omega_max_rad_per_sec: SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC,
        omega_reported_rad_per_sec:
          speedPosition === null
            ? null
            : absOmegaRadPerSecFromSpeedStripPosition(speedPosition),
        omega_q_rad_per_sec: omegaTruthRad,
        abs_omega_q_rad_per_sec: Math.abs(omegaTruthRad),
        theta_q_deg: (thetaFrozenRad * 180) / Math.PI,
        omega_q_deg_per_sec: (omegaTruthRad * 180) / Math.PI,
        query_time_sec: tQuery,
        rt_speed_sec: rtSpeedSec,
        rt_total_sec: speedPosition === null ? null : (performance.now() - reportStartMs) / 1000,
      };
    };

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "physics-btn physics-btn--primary";

    const startReportPhase = () => {
      transitionMaskedAmbientToEstimateCue();
      trialRoot.classList.remove("physics-trial--sim");
      const state = pendulumThetaOmegaAt(tQuery, p, analysis);
      thetaFrozenRad = state.theta;
      omegaTruthRad = state.omega;
      drawTrainingPendulumFrame(ctx, worldLayout, p.rodLengthM, thetaFrozenRad);
      phase = "report";
      reportStartMs = performance.now();
      hint.textContent =
        "请在色带上点击询问瞬间的速度大小，可拖动微调，然后确认速度。";
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
      confirmBtn.onclick = () => {
        if (speedPosition === null) return;
        speedStrip?.lock();
        clearKb();
        const payload = buildPayload();
        const delta = (payload.delta_strip_position as number) ?? 0;
        confirmBtn.remove();
        phase = "replay";
        hint.textContent = "反馈回放：橙色为您的选择，蓝色随真实速度移动。";
        const replayStartMs = performance.now();
        const replayTick = (now: number) => {
          if (phase !== "replay") return;
          raf = 0;
          const t = Math.min(Math.max(0, (now - replayStartMs) / 1000), tQuery);
          const state = pendulumThetaOmegaAt(t, p, analysis);
          drawTrainingPendulumFrame(ctx, worldLayout, p.rodLengthM, state.theta);
          speedStrip?.showTruth(speedStripPositionFromAbsOmegaRadPerSec(state.omega));
          if (t >= tQuery) {
            phase = "feedback";
            hint.innerHTML = `反馈：<strong>${feedbackLabel(delta)}</strong>（橙色为您的选择，蓝色为真实速度位置）。按空格继续。`;
            kbListener = listenSpace(() => finish(payload));
            return;
          }
          raf = requestAnimationFrame(replayTick);
        };
        raf = requestAnimationFrame(replayTick);
      };
      controls.appendChild(confirmBtn);
      kbListener = listenSpace(() => confirmBtn.click());
    };

    const simTick = (now: number) => {
      if (phase !== "sim") return;
      raf = 0;
      const elapsed = Math.max(0, (now - simStartMs) / 1000);
      const t = Math.min(elapsed, tQuery);
      const { theta, omega } = pendulumThetaOmegaAt(t, p, analysis);
      drawTrainingPendulumFrame(ctx, worldLayout, p.rodLengthM, theta);
      if (isDemo) {
        if (!speedStrip) {
          speedStrip = mountSpeedReportStrip(controls, { interactive: false });
        }
        speedStrip.showTruth(speedStripPositionFromAbsOmegaRadPerSec(omega));
      }
      if (elapsed >= tQuery) {
        if (isDemo) {
          drawTrainingPendulumFrame(ctx, worldLayout, p.rodLengthM, theta);
          phase = "demo_done";
          hint.textContent = "锚点已显示。按空格继续。";
          kbListener = listenSpace(() => finish(buildPayload()));
          return;
        }
        startReportPhase();
        return;
      }
      raf = requestAnimationFrame(simTick);
    };

    window.addEventListener(PHYSICS_ABORT_EVENT, cleanup);
    simStartMs = performance.now();
    if (isDemo) {
      speedStrip = mountSpeedReportStrip(controls, { interactive: false });
    }
    raf = requestAnimationFrame(simTick);
  }
}

export default SpeedColorTrainingPlugin;
