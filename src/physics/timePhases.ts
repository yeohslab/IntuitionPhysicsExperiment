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
  /** show→hide 边界淡出（毫秒），不计入 hide1T；正式实验由 fadeT×T 写入（摆动 0.25 / 旋转 0.5） */
  fadeMs?: number;
}

export const SHOW_T_MIN = 1;
/** 含旋转组最大可视水平 3.5T */
export const SHOW_T_MAX = 3.5;
/** 摆动组可视时间水平（×T） */
export const SHOW_LEVELS_T_OSCILLATION = [1.25, 1.5, 1.75] as const;
/** 旋转组可视时间水平（×T） */
export const SHOW_LEVELS_T_ROTATION = [2.5, 3, 3.5] as const;
/** @deprecated 默认摆动组；请用 showLevelsForGroup */
export const SHOW_LEVELS_T = SHOW_LEVELS_T_OSCILLATION;
/** 正式实验遮挡时长水平（秒） */
export const HIDE_LEVELS_SEC = [0.5, 0.6, 0.7] as const;
/** 摆动组淡出时长（×T），不计入 hide1T */
export const STIMULUS_FADE_T_OSCILLATION = 0.25;
/** 旋转组淡出时长（×T），不计入 hide1T */
export const STIMULUS_FADE_T_ROTATION = 0.5;
/** @deprecated 默认摆动组；请用 fadeTForGroup / fadeTForRegime */
export const STIMULUS_FADE_T = STIMULUS_FADE_T_OSCILLATION;
/** @deprecated 旧版固定淡出毫秒；新逻辑用 fadeMsForPeriod */
export const STIMULUS_FADE_MS = 150;

export type TimingMotionGroup = 1 | 2;

/** 组 1 摆动 / 组 2 旋转 的可视时间水平 */
export function showLevelsForGroup(group: TimingMotionGroup): readonly number[] {
  return group === 1 ? SHOW_LEVELS_T_OSCILLATION : SHOW_LEVELS_T_ROTATION;
}

/** 组 1 摆动 0.25T / 组 2 旋转 0.5T */
export function fadeTForGroup(group: TimingMotionGroup): number {
  return group === 1 ? STIMULUS_FADE_T_OSCILLATION : STIMULUS_FADE_T_ROTATION;
}

/** 由能量区制取淡出倍数（临界按摆动） */
export function fadeTForRegime(regime: "oscillation" | "rotation" | "critical"): number {
  return regime === "rotation" ? STIMULUS_FADE_T_ROTATION : STIMULUS_FADE_T_OSCILLATION;
}

function usesLegacyFourPhase(mult: Pick<StimulusTimingMultiples, "show2T" | "hide2T">): boolean {
  return (mult.show2T ?? 0) > 0 || (mult.hide2T ?? 0) > 0;
}

/** 由周期换算淡出毫秒：fadeT × T × 1000 */
export function fadeMsForPeriod(periodSec: number, fadeT: number = STIMULUS_FADE_T): number {
  return Math.max(0, fadeT) * Math.max(1e-12, periodSec) * 1000;
}

/**
 * 淡出秒数：优先用试次写入的 fadeMs（组间可不同）；
 * 无 fadeMs 且已知周期时回退默认摆动淡出 STIMULUS_FADE_T×T。
 */
export function fadeDurationSec(
  mult: Pick<StimulusTimingMultiples, "fadeMs">,
  periodSec?: number,
): number {
  if (mult.fadeMs !== undefined && Number.isFinite(mult.fadeMs)) {
    return Math.max(0, mult.fadeMs / 1000);
  }
  if (periodSec !== undefined && periodSec > 0) {
    return STIMULUS_FADE_T * periodSec;
  }
  return 0;
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
  return mult.show1T * T + fadeDurationSec(mult, T) + mult.hide1T;
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
  const fade = fadeDurationSec(mult, T);
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
  // hide1T 仍为秒，此处仅粗算；有周期时应走 stimulusTotalTimeT
  return mult.show1T + STIMULUS_FADE_T + mult.hide1T;
}

export function withSyncedTotalTimeT<T extends StimulusTimingMultiples>(
  mult: T,
  periodSec?: number,
): T {
  if (periodSec !== undefined && periodSec > 0) {
    // 保留已写入的 fadeMs（旋转组 0.5T）；缺失时按默认摆动淡出补齐
    const fadeMs =
      mult.fadeMs !== undefined && Number.isFinite(mult.fadeMs)
        ? mult.fadeMs
        : fadeMsForPeriod(periodSec);
    const synced = { ...mult, fadeMs };
    return { ...synced, totalTimeT: stimulusTotalTimeT(synced, periodSec) };
  }
  return { ...mult, totalTimeT: sumSegmentMultiples(mult) };
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
  const fSec = fadeDurationSec(mult, T);
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
  const fSec = fadeDurationSec(mult, T);
  const segments: Array<{ kind: PhaseKind; lenSec: number }> = [
    { kind: "show", lenSec: mult.show1T * T },
    ...(fSec > 0 ? [{ kind: "fade" as const, lenSec: fSec }] : []),
    { kind: "hide", lenSec: mult.hide1T },
  ];
  return segmentsToPhases(segments, totalSec);
}
