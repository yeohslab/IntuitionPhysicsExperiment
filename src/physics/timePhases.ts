import type { PendulumRegime } from "./pendulum";

export type PhaseKind = "show" | "hide" | "fade";

export interface TimePhase {
  kind: PhaseKind;
  /** 仿真时间（秒） */
  startSec: number;
  endSec: number;
}

export type StimulusVisibilityKind = "show" | "fadeOut" | "hide";

export interface StimulusTimingMultiples {
  /** 与分段同步的总时长（×T）；需已知周期 T 时由 withSyncedTotalTimeT 写入 */
  totalTimeT: number;
  /** 第一显示段（× 周期 T） */
  show1T: number;
  /** 遮挡段（秒）；不含淡出时长 */
  hide1T: number;
  /** @deprecated 单次遮挡范式下为 0 */
  show2T: number;
  /** @deprecated 单次遮挡范式下为 0 */
  hide2T: number;
  /** show→hide 边界淡出（毫秒），不计入 hide1T */
  fadeMs?: number;
}

export const SHOW_T_MIN = 1;
export const SHOW_T_MAX = 2;
/** 弹簧等非摆球刺激：遮挡时长（秒） */
export const HIDE_SEC_MIN = 1;
export const HIDE_SEC_MAX = 1.5;
/** 摆球遮挡时长（秒）；JSON 中 hide1T 存此固定值 */
export const PENDULUM_HIDE_SEC = 0.5;
/** @deprecated 使用 PENDULUM_HIDE_SEC */
export const PENDULUM_HIDE_T = PENDULUM_HIDE_SEC;
/** 可见→遮挡边界淡出时长（固定，不计入 hide1T） */
export const STIMULUS_FADE_MS = 150;

function uniform(lo: number, hi: number, rng: () => number): number {
  return lo + rng() * (hi - lo);
}

function usesLegacyFourPhase(mult: Pick<StimulusTimingMultiples, "show2T" | "hide2T">): boolean {
  return (mult.show2T ?? 0) > 0 || (mult.hide2T ?? 0) > 0;
}

function fadeSec(mult: Pick<StimulusTimingMultiples, "fadeMs">): number {
  return (mult.fadeMs ?? 0) / 1000;
}

/** 摆球遮挡时长（秒），固定 0.5 */
export function pendulumHideSec(_periodSec?: number): number {
  return PENDULUM_HIDE_SEC;
}

/** @deprecated 使用 pendulumHideSec */
export function randomPendulumHideSec(
  _regime?: PendulumRegime,
  _periodSec?: number,
): number {
  return pendulumHideSec();
}

/** 摆球试次时序：show/fade 同通用；hide1T 固定 0.5 s */
export function randomPendulumStimulusTiming(
  _regime: PendulumRegime,
  _periodSec: number,
  rng: () => number = Math.random,
): Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T" | "fadeMs"> {
  return {
    show1T: uniform(SHOW_T_MIN, SHOW_T_MAX, rng),
    hide1T: PENDULUM_HIDE_SEC,
    show2T: 0,
    hide2T: 0,
    fadeMs: STIMULUS_FADE_MS,
  };
}

/** 通用（如弹簧）：显示 [1,2]T；隐藏 [1,1.5]s；淡出固定 150ms */
export function randomStimulusTiming(
  rng: () => number = Math.random,
): Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T" | "fadeMs"> {
  return {
    show1T: uniform(SHOW_T_MIN, SHOW_T_MAX, rng),
    hide1T: uniform(HIDE_SEC_MIN, HIDE_SEC_MAX, rng),
    show2T: 0,
    hide2T: 0,
    fadeMs: STIMULUS_FADE_MS,
  };
}

/** 刺激总时长（秒） */
export function stimulusTotalSec(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T" | "fadeMs">,
  periodSec: number,
): number {
  const T = Math.max(1e-12, periodSec);
  if (usesLegacyFourPhase(mult)) {
    return mult.show1T * T + mult.hide1T + mult.show2T * T + mult.hide2T;
  }
  return mult.show1T * T + fadeSec(mult) + mult.hide1T;
}

/** 刺激总时长（T 的倍数） */
export function stimulusTotalTimeT(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T" | "fadeMs">,
  periodSec: number,
): number {
  const T = Math.max(1e-12, periodSec);
  return stimulusTotalSec(mult, T) / T;
}

/** CSV 导出用：单次遮挡范式下 show / fade / hide 的秒数与 T 倍数 */
export interface StimulusPhaseDurationsExport {
  show_T: number;
  fade_T: number;
  hide_T: number;
  total_time_sec: number;
  show_sec: number;
  fade_sec: number;
  hide_sec: number;
}

export function stimulusPhaseDurationsForExport(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T" | "fadeMs">,
  periodSec: number,
): StimulusPhaseDurationsExport {
  const T = Math.max(1e-12, periodSec);
  const showSec = mult.show1T * T;
  const fade = fadeSec(mult);
  const hideSec = mult.hide1T;
  const totalSec = stimulusTotalSec(mult, T);
  return {
    show_T: mult.show1T,
    fade_T: fade / T,
    hide_T: hideSec / T,
    total_time_sec: totalSec,
    show_sec: showSec,
    fade_sec: fade,
    hide_sec: hideSec,
  };
}

/** @deprecated 仅用于无周期时的粗校验；优先使用 stimulusTotalTimeT */
export function sumSegmentMultiples(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T" | "fadeMs">,
): number {
  if (usesLegacyFourPhase(mult)) {
    return mult.show1T + mult.show2T + mult.hide1T + mult.hide2T;
  }
  return mult.show1T + mult.hide1T + fadeSec(mult);
}

export function withSyncedTotalTimeT<T extends StimulusTimingMultiples>(
  mult: T,
  periodSec?: number,
): T {
  const totalTimeT =
    periodSec !== undefined && periodSec > 0
      ? stimulusTotalTimeT(mult, periodSec)
      : sumSegmentMultiples(mult);
  return { ...mult, totalTimeT };
}

/** 仿真时刻 t 的可见性（含淡出 alpha） */
export function stimulusVisibilityAt(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T" | "fadeMs">,
  periodSec: number,
  tSec: number,
): { kind: StimulusVisibilityKind; alpha: number } {
  const T = Math.max(1e-12, periodSec);
  if (usesLegacyFourPhase(mult)) {
    const phases = buildTimePhasesLegacy(mult, T);
    const hide = phaseKindAtPhases(phases, tSec) === "hide";
    return { kind: hide ? "hide" : "show", alpha: hide ? 0 : 1 };
  }
  const showEnd = mult.show1T * T;
  const fSec = fadeSec(mult);
  const fadeEnd = showEnd + fSec;
  if (tSec < showEnd - 1e-12) return { kind: "show", alpha: 1 };
  if (fSec > 0 && tSec < fadeEnd - 1e-12) {
    const alpha = 1 - (tSec - showEnd) / fSec;
    return { kind: "fadeOut", alpha: Math.max(0, Math.min(1, alpha)) };
  }
  return { kind: "hide", alpha: 0 };
}

function phaseKindAtPhases(phases: TimePhase[], tSec: number): PhaseKind {
  if (phases.length === 0) return "show";
  let k: PhaseKind = "show";
  for (const p of phases) {
    if (tSec + 1e-12 >= p.startSec) k = p.kind === "fade" ? "hide" : p.kind;
  }
  return k;
}

function buildTimePhasesLegacy(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T">,
  periodSec: number,
): TimePhase[] {
  const T = Math.max(1e-12, periodSec);
  const totalSec = Math.max(0, stimulusTotalSec(mult, T));
  const segments: Array<{ kind: PhaseKind; lenSec: number }> = [
    { kind: "show", lenSec: mult.show1T * T },
    { kind: "hide", lenSec: mult.hide1T },
    { kind: "show", lenSec: mult.show2T * T },
    { kind: "hide", lenSec: mult.hide2T },
  ];
  return segmentsToPhases(segments, totalSec);
}

function segmentsToPhases(
  segments: Array<{ kind: PhaseKind; lenSec: number }>,
  totalSec: number,
): TimePhase[] {
  const phases: TimePhase[] = [];
  let cursor = 0;
  for (const seg of segments) {
    const lenSec = Math.max(0, seg.lenSec);
    const end = cursor + lenSec;
    if (end > cursor) {
      phases.push({ kind: seg.kind, startSec: cursor, endSec: Math.min(end, totalSec) });
    }
    cursor = end;
    if (cursor >= totalSec) break;
  }
  return phases;
}

/** 将分段展开为绝对秒（供 CSV / 调试） */
export function buildTimePhases(mult: StimulusTimingMultiples, periodSec: number): TimePhase[] {
  const T = Math.max(1e-12, periodSec);
  const totalSec = Math.max(0, stimulusTotalSec(mult, T));
  if (usesLegacyFourPhase(mult)) {
    return buildTimePhasesLegacy(mult, T);
  }
  const fSec = fadeSec(mult);
  const segments: Array<{ kind: PhaseKind; lenSec: number }> = [
    { kind: "show", lenSec: mult.show1T * T },
    ...(fSec > 0 ? [{ kind: "fade" as const, lenSec: fSec }] : []),
    { kind: "hide", lenSec: mult.hide1T },
  ];
  return segmentsToPhases(segments, totalSec);
}
