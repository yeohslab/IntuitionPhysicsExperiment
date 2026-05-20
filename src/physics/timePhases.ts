export type PhaseKind = "show" | "hide";

export interface TimePhase {
  kind: PhaseKind;
  /** 仿真时间（秒） */
  startSec: number;
  endSec: number;
}

export interface StimulusTimingMultiples {
  /** 与四段之和同步，仅用于导出/展示 */
  totalTimeT: number;
  show1T: number;
  hide1T: number;
  show2T: number;
  hide2T: number;
}

export function sumSegmentMultiples(
  mult: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "show2T" | "hide2T">,
): number {
  return mult.show1T + mult.hide1T + mult.show2T + mult.hide2T;
}

/** 总时长 = 四段 T 倍数之和 */
export function withSyncedTotalTimeT<T extends StimulusTimingMultiples>(mult: T): T {
  return { ...mult, totalTimeT: sumSegmentMultiples(mult) };
}

/** 将各段 T 倍数展开为绝对秒（总时长 = 四段之和 × T） */
export function buildTimePhases(mult: StimulusTimingMultiples, periodSec: number): TimePhase[] {
  const totalSec = Math.max(0, sumSegmentMultiples(mult) * periodSec);
  const segments: Array<{ kind: PhaseKind; lenT: number }> = [
    { kind: "show", lenT: mult.show1T },
    { kind: "hide", lenT: mult.hide1T },
    { kind: "show", lenT: mult.show2T },
    { kind: "hide", lenT: mult.hide2T },
  ];
  const phases: TimePhase[] = [];
  let cursor = 0;
  for (const seg of segments) {
    const lenSec = Math.max(0, seg.lenT * periodSec);
    const end = cursor + lenSec;
    if (end > cursor) {
      phases.push({ kind: seg.kind, startSec: cursor, endSec: Math.min(end, totalSec) });
    }
    cursor = end;
    if (cursor >= totalSec) break;
  }
  return phases;
}
