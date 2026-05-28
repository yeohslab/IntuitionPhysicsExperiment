import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import { analyzePendulum, pendulumThetaOscillationAt, PendulumRotationIntegrator } from "../../physics/pendulum";
import type { PendulumParams } from "../../physics/pendulum";
import {
  pendulumLayout,
  drawPendulumOcclusion,
  drawPendulumStimulusVisible,
  drawPendulumEstimate,
  drawPendulumEstimateWithArc,
  drawPendulumFeedbackCompare,
  pendulumAngleFromPointer,
} from "../../physics/render/pendulumCanvas";
import type { SpringParams } from "../../physics/spring";
import { springAnalysis, springDisplacementAt, springMotion } from "../../physics/spring";
import {
  springLayout,
  drawSpringPractice,
  drawSpringOcclusion,
  drawSpringEstimateGuide,
  drawSpringEstimateWithInterval,
  springDisplacementFromLogicalX,
} from "../../physics/render/springCanvas";
import { setupHiDpiCanvas, pointerToLogical } from "../../physics/render/canvasCoords";
import {
  PHYSICS_CANVAS_LOGICAL_H,
  PHYSICS_CANVAS_LOGICAL_W,
} from "../../physics/render/canvasLayout";
import {
  pendulumAngularErrorDeg,
  pendulumIntervalHit,
  pendulumTrialScore,
  pendulumWMaxDeg,
  pendulumAngleDegFromRad,
  degToRad,
  wrapDeltaThetaDeg,
  SCORE_MAX,
} from "../../physics/pendulumArcScore";
import {
  springIntervalHit,
  springPositionErrorM,
  springTrialScore,
  springWMaxM,
} from "../../physics/springArcScore";
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
type TrialPhase = "sim" | "estimate" | "arc" | "feedback";

const SPACE_KEY = normalizeKeyForJsPsych(" ");

function phaseKindAt(phases: TimePhase[], tSec: number): "show" | "hide" {
  if (phases.length === 0) return "show";
  let k: "show" | "hide" = "show";
  for (const p of phases) {
    if (tSec + 1e-12 >= p.startSec) k = p.kind;
  }
  return k;
}

function valueFromRangePointer(range: HTMLInputElement, clientX: number): number {
  const rect = range.getBoundingClientRect();
  const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
  const min = Number(range.min);
  const max = Number(range.max);
  return min + ratio * (max - min);
}

function mountEstimateFooter(footer: HTMLElement, simHint: HTMLElement, label: string): HTMLButtonElement {
  simHint.textContent = "仿真已结束。";
  footer.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "physics-estimate-ui";
  panel.innerHTML = `<p class="physics-hint">在画面上<strong>点击</strong>${label}方向，<strong>拖动</strong>微调，然后确认。</p>`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "physics-btn physics-btn--primary";
  btn.textContent = "确认位置";
  panel.appendChild(btn);
  footer.appendChild(panel);
  return btn;
}

function mountArcFooter(
  footer: HTMLElement,
  hint: string,
): { range: HTMLInputElement; submitBtn: HTMLButtonElement } {
  footer.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "physics-arc-ui";
  panel.innerHTML = `<p class="physics-hint">${hint}</p>`;
  const range = document.createElement("input");
  range.type = "range";
  range.className = "physics-arc-range";
  range.min = "0";
  range.value = "0";
  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "physics-btn physics-btn--primary";
  submitBtn.textContent = "提交";
  panel.append(range, submitBtn);
  footer.appendChild(panel);
  return { range, submitBtn };
}

/** 被试所见得分（四舍五入）；CSV 仍记录原始 trial_score */
function trialScoreDisplay(score: number): number {
  return Math.round(score);
}

function mountFeedbackFooter(footer: HTMLElement, hit: boolean, score: number): void {
  footer.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = `physics-feedback-ui physics-feedback-ui--${hit ? "hit" : "miss"}`;
  const shown = hit ? trialScoreDisplay(score) : 0;
  const truthHint =
    '<p class="physics-hint muted"><strong>蓝色摆杆</strong>为该试次结束瞬间的真实指向（不显示角度数值）。</p>';
  if (hit) {
    panel.innerHTML = `<h3 class="physics-feedback-title">命中!</h3><p class="physics-hint">本次得分 ${shown} / ${SCORE_MAX}</p>${truthHint}<p class="physics-hint muted">按空格键继续</p>`;
  } else {
    panel.innerHTML = `<h3 class="physics-feedback-title">未命中!</h3><p class="physics-hint">本次得分 0</p>${truthHint}<p class="physics-hint muted">按空格键继续</p>`;
  }
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
  version: "0.3.0",
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

    let thetaActualRad = 0;
    let thetaEstRad = 0;
    let estimateInteracted = false;
    let arcHalfWidthDeg = 0;
    let arcInteracted = false;
    let dragging = false;
    let estimateStartMs = 0;
    let arcStartMs = 0;

    const thetaActualAtEnd = () => {
      if (rot) return rot.theta;
      return pendulumThetaOscillationAt(simEndSec, p, analysis);
    };

    const redrawEstimate = () => {
      if (!estimateInteracted) {
        drawPendulumEstimate(ctx, layout, 0);
        return;
      }
      drawPendulumEstimateWithArc(ctx, layout, thetaEstRad, arcHalfWidthDeg, false);
    };

    const redrawArc = () => {
      if (!estimateInteracted) return;
      drawPendulumEstimateWithArc(ctx, layout, thetaEstRad, arcHalfWidthDeg, arcInteracted);
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
        startArc();
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

    const startArc = () => {
      opts.setPhase("arc");
      arcStartMs = performance.now();
      arcHalfWidthDeg = 0;
      arcInteracted = false;
      redrawArc();
      const { range, submitBtn } = mountArcFooter(
        footer,
        "拖动下方滑块，调节您认为真值可能落在的范围（越宽表示越不确定），然后提交。",
      );
      range.max = String(wMaxDeg);
      range.step = "0.1";

      const applyRange = (w: number) => {
        arcHalfWidthDeg = Math.max(0, Math.min(wMaxDeg, w));
        redrawArc();
      };

      const onRangePointerDown = (e: PointerEvent) => {
        if (!arcInteracted) {
          arcInteracted = true;
          const v = valueFromRangePointer(range, e.clientX);
          range.value = String(v);
          applyRange(v);
        }
      };

      const onRangeInput = () => {
        if (!arcInteracted) arcInteracted = true;
        applyRange(Number(range.value));
      };

      range.addEventListener("pointerdown", onRangePointerDown);
      range.addEventListener("input", onRangeInput);

      const submit = () => {
        range.removeEventListener("pointerdown", onRangePointerDown);
        range.removeEventListener("input", onRangeInput);
        submitBtn.removeEventListener("click", submit);
        const rtEstimateSec = (arcStartMs - estimateStartMs) / 1000;
        const rtArcSec = (performance.now() - arcStartMs) / 1000;
        const thetaActualDeg = pendulumAngleDegFromRad(thetaActualRad);
        const thetaEstimatedDeg = pendulumAngleDegFromRad(thetaEstRad);
        const eDeg = pendulumAngularErrorDeg(thetaEstRad, thetaActualRad, analysis.regime, wMaxDeg);
        const deltaThetaDeg = wrapDeltaThetaDeg(
          thetaEstimatedDeg,
          thetaActualDeg,
          analysis.regime,
          wMaxDeg,
        );
        const hit = pendulumIntervalHit(eDeg, arcHalfWidthDeg);
        const trialScore = pendulumTrialScore(arcHalfWidthDeg, wMaxDeg, hit);
        startFeedback(hit, trialScore, {
          response_mode: "estimate_arc",
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
          arc_half_width_deg: arcHalfWidthDeg,
          arc_span_deg: 2 * arcHalfWidthDeg,
          w_max_deg: wMaxDeg,
          interval_hit: hit ? 1 : 0,
          interval_overflow_deg: Math.max(0, eDeg - arcHalfWidthDeg),
          arc_half_width_rad: degToRad(arcHalfWidthDeg),
          interval_overflow_rad: degToRad(Math.max(0, eDeg - arcHalfWidthDeg)),
          rt_arc_sec: rtArcSec,
          trial_score: trialScore,
          score_max: SCORE_MAX,
        });
      };
      submitBtn.addEventListener("click", submit);
    };

    const redrawFeedback = () => {
      drawPendulumFeedbackCompare(
        ctx,
        layout,
        thetaEstRad,
        arcHalfWidthDeg,
        thetaActualRad,
        estimateInteracted,
        arcInteracted && arcHalfWidthDeg > 0,
      );
    };

    const startFeedback = (
      hit: boolean,
      trialScore: number,
      payload: Record<string, unknown>,
    ) => {
      opts.setPhase("feedback");
      mountFeedbackFooter(footer, hit, trialScore);
      redrawFeedback();
      opts.setKb(
        listenSpaceAfterBlur(opts.jsPsych, () => {
          opts.finish(payload);
        }),
      );
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
      drawPendulumStimulusVisible(ctx, layout, theta);
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
    const wMaxM = springWMaxM(sp);

    let xActualM = 0;
    let xEstM = 0;
    let estimateInteracted = false;
    let intervalHalfWidthM = 0;
    let arcInteracted = false;
    let dragging = false;
    let estimateStartMs = 0;
    let arcStartMs = 0;

    const redrawEstimate = () => {
      if (!estimateInteracted) {
        drawSpringEstimateGuide(ctx, layout);
        return;
      }
      drawSpringEstimateWithInterval(ctx, layout, xEstM, intervalHalfWidthM, false);
    };

    const redrawArc = () => {
      drawSpringEstimateWithInterval(ctx, layout, xEstM, intervalHalfWidthM, arcInteracted);
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
        startArc();
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

    const startArc = () => {
      opts.setPhase("arc");
      arcStartMs = performance.now();
      intervalHalfWidthM = 0;
      arcInteracted = false;
      redrawArc();
      const { range, submitBtn } = mountArcFooter(
        footer,
        "拖动下方滑块，调节您认为真值可能落在的范围（越宽表示越不确定），然后提交。",
      );
      const stepM = Math.max(0.001, wMaxM / 200);
      range.max = String(wMaxM);
      range.step = String(stepM);

      const applyRange = (w: number) => {
        intervalHalfWidthM = Math.max(0, Math.min(wMaxM, w));
        redrawArc();
      };

      const onRangePointerDown = (e: PointerEvent) => {
        if (!arcInteracted) {
          arcInteracted = true;
          const v = valueFromRangePointer(range, e.clientX);
          range.value = String(v);
          applyRange(v);
        }
      };

      const onRangeInput = () => {
        if (!arcInteracted) arcInteracted = true;
        applyRange(Number(range.value));
      };

      range.addEventListener("pointerdown", onRangePointerDown);
      range.addEventListener("input", onRangeInput);

      const submit = () => {
        range.removeEventListener("pointerdown", onRangePointerDown);
        range.removeEventListener("input", onRangeInput);
        submitBtn.removeEventListener("click", submit);
        const rtEstimateSec = (arcStartMs - estimateStartMs) / 1000;
        const rtArcSec = (performance.now() - arcStartMs) / 1000;
        const eM = springPositionErrorM(xEstM, xActualM);
        const hit = springIntervalHit(eM, intervalHalfWidthM);
        const trialScore = springTrialScore(intervalHalfWidthM, wMaxM, hit);
        opts.setPhase("feedback");
        mountFeedbackFooter(footer, hit, trialScore);
        const payload: Record<string, unknown> = {
          response_mode: "estimate_arc",
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
          interval_half_width_m: intervalHalfWidthM,
          interval_span_m: 2 * intervalHalfWidthM,
          w_max_m: wMaxM,
          interval_hit: hit ? 1 : 0,
          interval_overflow_m: Math.max(0, eM - intervalHalfWidthM),
          rt_arc_sec: rtArcSec,
          trial_score: trialScore,
          score_max: SCORE_MAX,
        };
        opts.setKb(
          listenSpaceAfterBlur(opts.jsPsych, () => {
            opts.finish(payload);
          }),
        );
      };
      submitBtn.addEventListener("click", submit);
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
