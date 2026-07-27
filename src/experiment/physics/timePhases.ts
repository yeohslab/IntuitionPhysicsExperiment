export type StimulusVisibilityKind = "show" | "fadeOut" | "hide";

/** 当前单次遮挡范式的完整时序字段。hide1T 的历史名称保留，但单位为秒。 */
export interface StimulusTimingMultiples {
  totalTimeT: number;
  show1T: number;
  hide1T: number;
  /** show→hide 边界淡出（毫秒），不计入 hide1T。 */
  fadeMs?: number;
}

/** 摆动组可视时间水平（×T）。 */
export const SHOW_LEVELS_T_OSCILLATION = [1.25, 1.5, 1.75] as const;
/** 旋转组可视时间水平（×T）。 */
export const SHOW_LEVELS_T_ROTATION = [2.5, 3, 3.5] as const;
/** 正式实验遮挡时长水平（秒）。 */
export const HIDE_LEVELS_SEC = [0.8, 1, 1.2] as const;
/** 摆动组淡出时长（×T）。 */
export const STIMULUS_FADE_T_OSCILLATION = 0.25;
/** 旋转组淡出时长（×T）。 */
export const STIMULUS_FADE_T_ROTATION = 0.5;

export type TimingMotionGroup = 1 | 2;

export function showLevelsForGroup(group: TimingMotionGroup): readonly number[] {
  return group === 1 ? SHOW_LEVELS_T_OSCILLATION : SHOW_LEVELS_T_ROTATION;
}

export function fadeTForGroup(group: TimingMotionGroup): number {
  return group === 1 ? STIMULUS_FADE_T_OSCILLATION : STIMULUS_FADE_T_ROTATION;
}

export function fadeTForRegime(
  regime: "oscillation" | "rotation" | "critical",
): number {
  return regime === "rotation"
    ? STIMULUS_FADE_T_ROTATION
    : STIMULUS_FADE_T_OSCILLATION;
}

export function fadeMsForPeriod(periodSec: number, fadeT: number): number {
  return Math.max(0, fadeT) * Math.max(1e-12, periodSec) * 1000;
}

export function fadeDurationSec(
  mult: Pick<StimulusTimingMultiples, "fadeMs">,
): number {
  return mult.fadeMs !== undefined && Number.isFinite(mult.fadeMs)
    ? Math.max(0, mult.fadeMs / 1000)
    : 0;
}

export function stimulusTotalSec(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "fadeMs">,
  periodSec: number,
): number {
  const T = Math.max(1e-12, periodSec);
  return mult.show1T * T + fadeDurationSec(mult) + mult.hide1T;
}

export function stimulusTotalTimeT(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "fadeMs">,
  periodSec: number,
): number {
  const T = Math.max(1e-12, periodSec);
  return stimulusTotalSec(mult, T) / T;
}

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
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "fadeMs">,
  periodSec: number,
): StimulusPhaseDurationsExport {
  const T = Math.max(1e-12, periodSec);
  const showSec = mult.show1T * T;
  const fadeSec = fadeDurationSec(mult);
  const hideSec = mult.hide1T;
  return {
    show_T: mult.show1T,
    fade_T: fadeSec / T,
    hide_T: hideSec / T,
    total_time_sec: showSec + fadeSec + hideSec,
    show_sec: showSec,
    fade_sec: fadeSec,
    hide_sec: hideSec,
  };
}

export function withSyncedTotalTimeT<T extends StimulusTimingMultiples>(
  mult: T,
  periodSec: number,
): T {
  return {
    ...mult,
    totalTimeT: stimulusTotalTimeT(mult, periodSec),
  };
}

/** 仿真时刻 t 的可见性（含淡出 alpha）。 */
export function stimulusVisibilityAt(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "fadeMs">,
  periodSec: number,
  tSec: number,
): { kind: StimulusVisibilityKind; alpha: number } {
  const T = Math.max(1e-12, periodSec);
  const showEnd = mult.show1T * T;
  const fadeSec = fadeDurationSec(mult);
  const fadeEnd = showEnd + fadeSec;
  if (tSec < showEnd - 1e-12) return { kind: "show", alpha: 1 };
  if (fadeSec > 0 && tSec < fadeEnd - 1e-12) {
    const alpha = 1 - (tSec - showEnd) / fadeSec;
    return { kind: "fadeOut", alpha: Math.max(0, Math.min(1, alpha)) };
  }
  return { kind: "hide", alpha: 0 };
}
