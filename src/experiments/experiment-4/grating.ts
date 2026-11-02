import {
  analyzePendulum,
  PENDULUM_MASS_KG,
  pendulumThetaOmegaAt,
} from "../../experiment/physics/pendulum";
import type { PendulumParams } from "../../experiment/physics/pendulum";
import {
  EXPERIMENT_4_BAR_WIDTH_M,
  EXPERIMENT_4_BOB_RADIUS_M,
  EXPERIMENT_4_DURATION_SEC,
  EXPERIMENT_4_ENERGY_CENTER_J,
  EXPERIMENT_4_GAP_LEVELS,
  EXPERIMENT_4_GRAVITY,
  EXPERIMENT_4_INITIAL_TURN_MARGIN_FRACTION,
  EXPERIMENT_4_OCCLUSION_MARGIN_SEC,
  EXPERIMENT_4_QUERY_MIN_SEC,
  EXPERIMENT_4_ROD_LENGTH_M,
  type Experiment4GapLevel,
  type Experiment4InitialDirection,
} from "./protocol";

export type BobVisibility = "fully_occluded" | "fully_visible" | "partial";

export type OcclusionSegment = {
  kind: "fully_occluded" | "fully_visible" | "partial";
  tStartSec: number;
  tEndSec: number;
};

/** 遮挡时间表时间步（秒）；1 ms 精度过慢，5 ms 足够试次规划。 */
const DT_SEC = 0.005;

export function gratingPeriodM(gapM: number): number {
  return EXPERIMENT_4_BAR_WIDTH_M + gapM;
}

export function gratingBarCentersM(gapM: number, xMax = 8): number[] {
  const period = gratingPeriodM(gapM);
  const centers: number[] = [0];
  for (let k = 1; k * period <= xMax + period; k++) {
    centers.push(k * period, -k * period);
  }
  return centers.sort((a, b) => a - b);
}

export function classifyBobAtX(xM: number, gapM: number): BobVisibility {
  const r = EXPERIMENT_4_BOB_RADIUS_M;
  const halfBar = EXPERIMENT_4_BAR_WIDTH_M / 2;
  const period = gratingPeriodM(gapM);
  const n = Math.round(xM / period);
  const center = n * period;
  const d = Math.abs(xM - center);
  if (d <= halfBar - r) return "fully_occluded";
  if (d >= halfBar + r && d <= period - halfBar - r) return "fully_visible";
  return "partial";
}

export function bobVisibilityAtTime(
  tSec: number,
  params: PendulumParams,
  gapM: number,
): BobVisibility {
  const analysis = analyzePendulum(params);
  const { theta } = pendulumThetaOmegaAt(tSec, params, analysis);
  const x = params.rodLengthM * Math.sin(theta);
  return classifyBobAtX(x, gapM);
}

const occlusionTimelineCache = new Map<string, OcclusionSegment[]>();

export function buildOcclusionTimeline(
  params: PendulumParams,
  gapM: number,
  durationSec = EXPERIMENT_4_DURATION_SEC,
): OcclusionSegment[] {
  const cacheKey = [
    gapM,
    durationSec,
    params.theta0Rad,
    params.omega0RadPerSec,
    params.rodLengthM,
    params.gravity,
  ].join(":");
  const cached = occlusionTimelineCache.get(cacheKey);
  if (cached) return cached;

  const analysis = analyzePendulum(params);
  const visibilityAt = (tSec: number): BobVisibility => {
    const { theta } = pendulumThetaOmegaAt(tSec, params, analysis);
    return classifyBobAtX(params.rodLengthM * Math.sin(theta), gapM);
  };

  const segments: OcclusionSegment[] = [];
  let t = 0;
  let cur: BobVisibility = visibilityAt(0);
  let tStart = 0;
  while (t < durationSec - 1e-9) {
    const tNext = Math.min(durationSec, t + DT_SEC);
    const vis = visibilityAt(tNext);
    if (vis !== cur) {
      segments.push({
        kind: cur,
        tStartSec: tStart,
        tEndSec: tNext,
      });
      cur = vis;
      tStart = tNext;
    }
    t = tNext;
  }
  segments.push({
    kind: cur,
    tStartSec: tStart,
    tEndSec: durationSec,
  });
  occlusionTimelineCache.set(cacheKey, segments);
  return segments;
}

export function firstFullyVisibleTimeSec(
  segments: readonly OcclusionSegment[],
): number | null {
  const seg = segments.find((s) => s.kind === "fully_visible");
  return seg ? seg.tStartSec : null;
}

export function lastFullyVisibleEndBefore(
  segments: readonly OcclusionSegment[],
  tQuerySec: number,
): number | null {
  let last: number | null = null;
  for (const seg of segments) {
    if (seg.kind !== "fully_visible") continue;
    if (seg.tEndSec <= tQuerySec) last = seg.tEndSec;
    if (seg.tStartSec >= tQuerySec) break;
  }
  return last;
}

export type QueryableWindow = {
  tMinSec: number;
  tMaxSec: number;
  segmentIndex: number;
  /** 该次通过在合法时间域内的完整遮挡用时，用于光栅条概率加权。 */
  samplingWeightSec: number;
};

/**
 * 可询问窗口：完全遮挡段内部，满足 min 时间、首次可见、两端 margin；
 * 最后一段遮挡若延续到 duration，右端点为 durationSec。
 */
export function queryableWindows(
  segments: readonly OcclusionSegment[],
  durationSec: number,
  firstVisibleSec: number | null,
): QueryableWindow[] {
  const windows: QueryableWindow[] = [];
  const minT = Math.max(
    EXPERIMENT_4_QUERY_MIN_SEC,
    firstVisibleSec ?? EXPERIMENT_4_QUERY_MIN_SEC,
  );
  segments.forEach((seg, index) => {
    if (seg.kind !== "fully_occluded") return;
    const tEnd =
      index === segments.length - 1 && seg.tEndSec >= durationSec - 1e-9
        ? durationSec
        : seg.tEndSec;
    const tMin = seg.tStartSec + EXPERIMENT_4_OCCLUSION_MARGIN_SEC;
    const tMax = tEnd - EXPERIMENT_4_OCCLUSION_MARGIN_SEC;
    const lo = Math.max(tMin, minT);
    if (tMax > lo + 1e-9) {
      windows.push({
        tMinSec: lo,
        tMaxSec: tMax,
        segmentIndex: index,
        samplingWeightSec: tEnd - Math.max(seg.tStartSec, minT),
      });
    }
  });
  return windows;
}

export function sampleQueryTimeSec(
  windows: readonly QueryableWindow[],
  rng: () => number,
): { tQuerySec: number; segmentIndex: number } {
  // 先按该次通过的完整遮挡用时分配概率、再在安全窗口内部均匀取时刻。
  // 因此通过越慢、停留越久的光栅条被询问概率越高；0.15 s 安全边距
  // 只限制实际询问位置，不会反过来改变光栅条的抽样权重。
  const total = windows.reduce((z, w) => z + w.samplingWeightSec, 0);
  if (total <= 0) {
    throw new Error("无可询问时间窗口");
  }
  let u = rng() * total;
  for (const w of windows) {
    if (u <= w.samplingWeightSec) {
      return {
        tQuerySec:
          w.tMinSec +
          (u / w.samplingWeightSec) * (w.tMaxSec - w.tMinSec),
        segmentIndex: w.segmentIndex,
      };
    }
    u -= w.samplingWeightSec;
  }
  const last = windows[windows.length - 1]!;
  return {
    tQuerySec: last.tMaxSec,
    segmentIndex: last.segmentIndex,
  };
}

export function pendulumParamsForRelease(
  side: "left" | "right",
  energyJ = EXPERIMENT_4_ENERGY_CENTER_J,
): PendulumParams {
  const mgl = PENDULUM_MASS_KG * EXPERIMENT_4_GRAVITY * EXPERIMENT_4_ROD_LENGTH_M;
  if (energyJ <= 0 || energyJ >= 2 * mgl) {
    throw new Error(`实验四能量必须位于 (0, ${2 * mgl}) J，实际 ${energyJ} J`);
  }
  const sign = side === "right" ? 1 : -1;
  const thetaMaxRad = Math.acos(1 - energyJ / mgl);
  return {
    theta0Rad: sign * thetaMaxRad,
    omega0RadPerSec: 0,
    rodLengthM: EXPERIMENT_4_ROD_LENGTH_M,
    gravity: EXPERIMENT_4_GRAVITY,
  };
}

/**
 * 在给定能量轨道的一条“位置侧 × 运动方向”四分支上按运动时间均匀抽样。
 * 这让初始位置可变且初速度非零，同时不改变机械能。
 */
export function pendulumParamsForInitialState(
  side: "left" | "right",
  direction: Experiment4InitialDirection,
  energyJ: number,
  rng: () => number,
): PendulumParams {
  const canonical = pendulumParamsForRelease("right", energyJ);
  const analysis = analyzePendulum(canonical);
  const quarterIndex =
    side === "right"
      ? direction === "leftward" ? 0 : 3
      : direction === "leftward" ? 1 : 2;
  const branchStart =
    quarterIndex / 4 +
    (quarterIndex % 2 === 0 ? EXPERIMENT_4_INITIAL_TURN_MARGIN_FRACTION : 0);
  const branchEnd =
    (quarterIndex + 1) / 4 -
    (quarterIndex % 2 === 1 ? EXPERIMENT_4_INITIAL_TURN_MARGIN_FRACTION : 0);
  const u = Math.min(Math.max(rng(), 0), 1 - Number.EPSILON);
  const phaseFraction = branchStart + u * (branchEnd - branchStart);
  const state = pendulumThetaOmegaAt(phaseFraction * analysis.T, canonical, analysis);
  if (Math.abs(state.omega) <= 1e-9) {
    throw new Error("实验四初始角速度必须非零");
  }
  return {
    theta0Rad: state.theta,
    omega0RadPerSec: state.omega,
    rodLengthM: canonical.rodLengthM,
    gravity: canonical.gravity,
  };
}

/** 每个试次使用预注册能量区间的中点。 */
export function sampleExperiment4EnergyJ(): number {
  return EXPERIMENT_4_ENERGY_CENTER_J;
}

export function gapMFromLevel(level: Experiment4GapLevel): number {
  return EXPERIMENT_4_GAP_LEVELS[level];
}

export function planTrialQuery(
  side: "left" | "right",
  direction: Experiment4InitialDirection,
  gapLevel: Experiment4GapLevel,
  rng: () => number,
): {
  params: PendulumParams;
  energyJ: number;
  gapM: number;
  tQuerySec: number;
  occlusionSegmentIndex: number;
  timeline: OcclusionSegment[];
  firstVisibleSec: number | null;
  queryBarIndex: number;
} {
  const energyJ = sampleExperiment4EnergyJ();
  const params = pendulumParamsForInitialState(side, direction, energyJ, rng);
  const gapM = gapMFromLevel(gapLevel);
  const timeline = buildOcclusionTimeline(params, gapM);
  const firstVisibleSec = firstFullyVisibleTimeSec(timeline);
  const windows = queryableWindows(
    timeline,
    EXPERIMENT_4_DURATION_SEC,
    firstVisibleSec,
  );
  const { tQuerySec, segmentIndex } = sampleQueryTimeSec(windows, rng);
  const queryState = pendulumThetaOmegaAt(tQuerySec, params, analyzePendulum(params));
  const queryBarIndex = Math.round(
    (params.rodLengthM * Math.sin(queryState.theta)) / gratingPeriodM(gapM),
  );
  return {
    params,
    energyJ,
    gapM,
    tQuerySec,
    occlusionSegmentIndex: segmentIndex,
    timeline,
    firstVisibleSec,
    queryBarIndex,
  };
}
