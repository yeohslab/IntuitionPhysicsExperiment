import {
  analyzePendulum,
  PENDULUM_MASS_KG,
  pendulumThetaOmegaAt,
  type PendulumAnalysis,
} from "../../experiment/physics/pendulum";
import type { PendulumParams } from "../../experiment/physics/pendulum";
import {
  EXPERIMENT_4_BOB_RADIUS_M,
  EXPERIMENT_4_DURATION_SEC,
  EXPERIMENT_4_ENERGY_CENTER_J,
  EXPERIMENT_4_GRATING_CONDITIONS,
  EXPERIMENT_4_GRAVITY,
  EXPERIMENT_4_INITIAL_TURN_MARGIN_FRACTION,
  EXPERIMENT_4_OCCLUSION_MARGIN_SEC,
  EXPERIMENT_4_QUERY_MIN_SEC,
  EXPERIMENT_4_ROD_LENGTH_M,
  type Experiment4GratingGeometry,
  type Experiment4InitialDirection,
  type Experiment4VisibleWindowCount,
} from "./protocol";

export type BobVisibility = "fully_occluded" | "fully_visible" | "partial";

export type OcclusionSegment = {
  kind: "fully_occluded" | "fully_visible" | "partial";
  tStartSec: number;
  tEndSec: number;
};

/** 遮挡时间表时间步（秒）；1 ms 精度过慢，5 ms 足够试次规划。 */
const DT_SEC = 0.005;

export function gratingGeometryForVisibleWindowCount(
  visibleWindowCount: Experiment4VisibleWindowCount,
): Experiment4GratingGeometry {
  return EXPERIMENT_4_GRATING_CONDITIONS[visibleWindowCount];
}

export function gratingPeriodM(geometry: Experiment4GratingGeometry): number {
  return geometry.periodM;
}

export function gratingBarIndexAtX(
  xM: number,
  geometry: Experiment4GratingGeometry,
): number {
  return Math.round((xM - geometry.offsetM) / geometry.periodM);
}

export function gratingBarCentersM(
  geometry: Experiment4GratingGeometry,
  xMax = 8,
): number[] {
  const kMin = Math.floor((-xMax - geometry.offsetM) / geometry.periodM) - 1;
  const kMax = Math.ceil((xMax - geometry.offsetM) / geometry.periodM) + 1;
  const centers: number[] = [];
  for (let k = kMin; k <= kMax; k += 1) {
    centers.push(geometry.offsetM + k * geometry.periodM);
  }
  return centers;
}

export function classifyBobAtX(
  xM: number,
  geometry: Experiment4GratingGeometry,
): BobVisibility {
  const r = EXPERIMENT_4_BOB_RADIUS_M;
  const halfBar = geometry.barWidthM / 2;
  const period = geometry.periodM;
  const n = gratingBarIndexAtX(xM, geometry);
  const center = geometry.offsetM + n * period;
  const d = Math.abs(xM - center);
  if (d <= halfBar - r) return "fully_occluded";
  if (d >= halfBar + r && d <= period - halfBar - r) return "fully_visible";
  return "partial";
}

export function bobVisibilityAtTime(
  tSec: number,
  params: PendulumParams,
  geometry: Experiment4GratingGeometry,
): BobVisibility {
  const analysis = analyzePendulum(params);
  const { theta } = pendulumThetaOmegaAt(tSec, params, analysis);
  const x = params.rodLengthM * Math.sin(theta);
  return classifyBobAtX(x, geometry);
}

export type FullyVisibleSpatialInterval = { xStartM: number; xEndM: number };

export function fullyVisibleIntervalsBetween(
  xMinM: number,
  xMaxM: number,
  geometry: Experiment4GratingGeometry,
): FullyVisibleSpatialInterval[] {
  const lo = Math.min(xMinM, xMaxM);
  const hi = Math.max(xMinM, xMaxM);
  const halfBar = geometry.barWidthM / 2;
  const inset = halfBar + EXPERIMENT_4_BOB_RADIUS_M;
  const centers = gratingBarCentersM(geometry, Math.max(Math.abs(lo), Math.abs(hi)) + geometry.periodM);
  const intervals: FullyVisibleSpatialInterval[] = [];
  for (let index = 0; index < centers.length - 1; index += 1) {
    const xStartM = Math.max(lo, centers[index]! + inset);
    const xEndM = Math.min(hi, centers[index + 1]! - inset);
    if (xEndM > xStartM + 1e-12) intervals.push({ xStartM, xEndM });
  }
  return intervals;
}

const occlusionTimelineCache = new Map<string, OcclusionSegment[]>();

export function buildOcclusionTimeline(
  params: PendulumParams,
  geometry: Experiment4GratingGeometry,
  durationSec = EXPERIMENT_4_DURATION_SEC,
): OcclusionSegment[] {
  const cacheKey = [
    geometry.visibleWindowCount,
    geometry.gapM,
    geometry.barWidthM,
    geometry.periodM,
    geometry.offsetM,
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
    return classifyBobAtX(params.rodLengthM * Math.sin(theta), geometry);
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
  /** 该可询问遮挡段上摆球中心走过的轨迹弧长（米）。 */
  samplingWeightM: number;
};

type ArcPiece = { t0Sec: number; t1Sec: number; arcM: number };

/** 往复摆的转折时刻。从任意非零速度出发，下一次 ω=0 相隔半个周期。 */
function firstTurningTimeSec(params: PendulumParams, analysis: PendulumAnalysis): number {
  if (analysis.regime === "rotation" || !(analysis.T > 0)) return Number.POSITIVE_INFINITY;
  const omega0 = pendulumThetaOmegaAt(0, params, analysis).omega;
  if (Math.abs(omega0) <= 1e-8) return 0;
  const half = analysis.T / 2;
  let lo = 0;
  let hi = half;
  const sign = Math.sign(omega0);
  for (let i = 0; i < 70; i += 1) {
    const mid = (lo + hi) / 2;
    const omega = pendulumThetaOmegaAt(mid, params, analysis).omega;
    if (omega * sign > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function turningTimesBetween(
  turnRefSec: number,
  periodSec: number,
  t0Sec: number,
  t1Sec: number,
): number[] {
  if (!(t1Sec > t0Sec) || !(periodSec > 0) || !Number.isFinite(turnRefSec)) return [];
  const half = periodSec / 2;
  const turns: number[] = [];
  const nStart = Math.ceil((t0Sec - turnRefSec) / half + 1e-9);
  const nEnd = Math.floor((t1Sec - turnRefSec) / half - 1e-9);
  for (let n = nStart; n <= nEnd; n += 1) {
    const t = turnRefSec + n * half;
    if (t > t0Sec && t < t1Sec) turns.push(t);
  }
  return turns;
}

function arcPieces(
  params: PendulumParams,
  analysis: PendulumAnalysis,
  turnRefSec: number,
  t0Sec: number,
  t1Sec: number,
): ArcPiece[] {
  if (!(t1Sec > t0Sec)) return [];
  const bounds = [
    t0Sec,
    ...turningTimesBetween(turnRefSec, analysis.T, t0Sec, t1Sec),
    t1Sec,
  ];
  const pieces: ArcPiece[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const t0 = bounds[i]!;
    const t1 = bounds[i + 1]!;
    if (t1 <= t0) continue;
    const theta0 = pendulumThetaOmegaAt(t0, params, analysis).theta;
    const theta1 = pendulumThetaOmegaAt(t1, params, analysis).theta;
    pieces.push({
      t0Sec: t0,
      t1Sec: t1,
      arcM: params.rodLengthM * Math.abs(theta1 - theta0),
    });
  }
  return pieces;
}

/** 摆球中心在 [t0, t1] 上走过的弧长。折返时去程和回程都计入。 */
export function bobTrajectoryArcLengthM(
  params: PendulumParams,
  t0Sec: number,
  t1Sec: number,
  analysis = analyzePendulum(params),
): number {
  const pieces = arcPieces(params, analysis, firstTurningTimeSec(params, analysis), t0Sec, t1Sec);
  return pieces.reduce((sum, piece) => sum + piece.arcM, 0);
}

function timeAtArcFraction(
  params: PendulumParams,
  analysis: PendulumAnalysis,
  turnRefSec: number,
  t0Sec: number,
  t1Sec: number,
  fraction: number,
): number {
  const pieces = arcPieces(params, analysis, turnRefSec, t0Sec, t1Sec);
  if (pieces.length === 0) return t0Sec;
  const total = pieces.reduce((sum, piece) => sum + piece.arcM, 0);
  if (total <= 1e-15) return t0Sec;
  let remaining = Math.min(Math.max(fraction, 0), 1) * total;
  const last = pieces[pieces.length - 1]!;
  for (const piece of pieces) {
    const takesRest = piece === last || remaining <= piece.arcM;
    if (!takesRest) {
      remaining -= piece.arcM;
      continue;
    }
    if (piece.arcM <= 1e-15) return piece.t1Sec;
    const target = Math.min(remaining, piece.arcM);
    const theta0 = pendulumThetaOmegaAt(piece.t0Sec, params, analysis).theta;
    let lo = piece.t0Sec;
    let hi = piece.t1Sec;
    for (let i = 0; i < 56; i += 1) {
      const mid = (lo + hi) / 2;
      const theta = pendulumThetaOmegaAt(mid, params, analysis).theta;
      const arc = params.rodLengthM * Math.abs(theta - theta0);
      if (arc < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  return last.t1Sec;
}

/**
 * 可询问窗口：完全遮挡段内部，满足 min 时间、首次可见、两端 margin；
 * 最后一段遮挡若延续到 duration，右端点为 durationSec。
 * 抽样权重是窗口内的轨迹弧长，不是遮挡用时。
 */
export function queryableWindows(
  segments: readonly OcclusionSegment[],
  durationSec: number,
  firstVisibleSec: number | null,
  params: PendulumParams,
): QueryableWindow[] {
  const windows: QueryableWindow[] = [];
  const analysis = analyzePendulum(params);
  const turnRefSec = firstTurningTimeSec(params, analysis);
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
    if (!(tMax > lo + 1e-9)) return;
    const arcM = arcPieces(params, analysis, turnRefSec, lo, tMax)
      .reduce((sum, piece) => sum + piece.arcM, 0);
    if (arcM <= 1e-9) return;
    windows.push({
      tMinSec: lo,
      tMaxSec: tMax,
      segmentIndex: index,
      samplingWeightM: arcM,
    });
  });
  return windows;
}

export function sampleQueryTimeSec(
  windows: readonly QueryableWindow[],
  params: PendulumParams,
  rng: () => number,
): { tQuerySec: number; segmentIndex: number } {
  // 先按可询问遮挡段的轨迹弧长分配概率，再沿该段弧长均匀取位置。
  // 停留时间长只说明速度慢，不提高该位置被抽到的概率。
  const analysis = analyzePendulum(params);
  const turnRefSec = firstTurningTimeSec(params, analysis);
  const total = windows.reduce((sum, window) => sum + window.samplingWeightM, 0);
  if (total <= 0) {
    throw new Error("无可询问弧长");
  }
  let u = rng() * total;
  for (const window of windows) {
    if (u <= window.samplingWeightM) {
      const fraction = window.samplingWeightM <= 0 ? 0 : u / window.samplingWeightM;
      return {
        tQuerySec: timeAtArcFraction(
          params,
          analysis,
          turnRefSec,
          window.tMinSec,
          window.tMaxSec,
          fraction,
        ),
        segmentIndex: window.segmentIndex,
      };
    }
    u -= window.samplingWeightM;
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

export function planTrialQuery(
  side: "left" | "right",
  direction: Experiment4InitialDirection,
  visibleWindowCount: Experiment4VisibleWindowCount,
  rng: () => number,
): {
  params: PendulumParams;
  energyJ: number;
  geometry: Experiment4GratingGeometry;
  tQuerySec: number;
  occlusionSegmentIndex: number;
  timeline: OcclusionSegment[];
  firstVisibleSec: number | null;
  queryBarIndex: number;
} {
  const energyJ = sampleExperiment4EnergyJ();
  const params = pendulumParamsForInitialState(side, direction, energyJ, rng);
  const geometry = gratingGeometryForVisibleWindowCount(visibleWindowCount);
  const timeline = buildOcclusionTimeline(params, geometry);
  const firstVisibleSec = firstFullyVisibleTimeSec(timeline);
  const windows = queryableWindows(
    timeline,
    EXPERIMENT_4_DURATION_SEC,
    firstVisibleSec,
    params,
  );
  const { tQuerySec, segmentIndex } = sampleQueryTimeSec(windows, params, rng);
  const queryState = pendulumThetaOmegaAt(tQuerySec, params, analyzePendulum(params));
  const queryBarIndex = gratingBarIndexAtX(
    params.rodLengthM * Math.sin(queryState.theta),
    geometry,
  );
  return {
    params,
    energyJ,
    geometry,
    tQuerySec,
    occlusionSegmentIndex: segmentIndex,
    timeline,
    firstVisibleSec,
    queryBarIndex,
  };
}
