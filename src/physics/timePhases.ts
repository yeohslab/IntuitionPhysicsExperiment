export type PhaseKind = "show" | "hide";

export interface TimePhase {
  kind: PhaseKind;
  /** 仿真时间（秒） */
  startSec: number;
  endSec: number;
}

export interface StimulusTimingMultiples {
  /** 与四段同步：show1T + show2T + (hide1T + hide2T) / T（需已知周期 T） */
  totalTimeT: number;
  /** 第一、二显示段时长（× 周期 T） */
  show1T: number;
  /** 第一、二隐藏段时长（秒） */
  hide1T: number;
  show2T: number;
  hide2T: number;
}

const SHOW_T_MIN = 0.75;
const SHOW_T_MAX = 1.25;
const HIDE_SEC_MIN = 0.5;
const HIDE_SEC_MAX = 1;

function uniform(lo: number, hi: number, rng: () => number): number {
  return lo + rng() * (hi - lo);
}

/** 均匀随机默认：显示 [0.75, 1.25] T；隐藏 [0.5, 1] s */
export function randomStimulusTiming(
  rng: () => number = Math.random,
): Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T"> {
  return {
    show1T: uniform(SHOW_T_MIN, SHOW_T_MAX, rng),
    hide1T: uniform(HIDE_SEC_MIN, HIDE_SEC_MAX, rng),
    show2T: uniform(SHOW_T_MIN, SHOW_T_MAX, rng),
    hide2T: uniform(HIDE_SEC_MIN, HIDE_SEC_MAX, rng),
  };
}

/** 刺激总时长（秒） */
export function stimulusTotalSec(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T">,
  periodSec: number,
): number {
  const T = Math.max(1e-12, periodSec);
  return mult.show1T * T + mult.hide1T + mult.show2T * T + mult.hide2T;
}

/** 刺激总时长（T 的倍数） */
export function stimulusTotalTimeT(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T">,
  periodSec: number,
): number {
  const T = Math.max(1e-12, periodSec);
  return stimulusTotalSec(mult, T) / T;
}

/** @deprecated 仅用于无周期时的粗校验；优先使用 stimulusTotalTimeT */
export function sumSegmentMultiples(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T">,
): number {
  return mult.show1T + mult.show2T + mult.hide1T + mult.hide2T;
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

/** 将四段展开为绝对秒（显示 ×T，隐藏为秒） */
export function buildTimePhases(mult: StimulusTimingMultiples, periodSec: number): TimePhase[] {
  const T = Math.max(1e-12, periodSec);
  const totalSec = Math.max(0, stimulusTotalSec(mult, T));
  const segments: Array<{ kind: PhaseKind; lenSec: number }> = [
    { kind: "show", lenSec: mult.show1T * T },
    { kind: "hide", lenSec: mult.hide1T },
    { kind: "show", lenSec: mult.show2T * T },
    { kind: "hide", lenSec: mult.hide2T },
  ];
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
