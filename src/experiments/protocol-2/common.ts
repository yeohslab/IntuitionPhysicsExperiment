import {
  analyzePendulum,
  pendulumThetaOmegaAt,
  type PendulumParams,
} from "../../experiment/physics/pendulum";
import {
  isBobExposedAtX,
  type GratingGeometry,
} from "../../experiment/physics/gratingGeometry";
import type {
  Protocol2GratingCondition,
  Protocol2VisibleSegment,
} from "../../shared/experimentTypes";

export const PROTOCOL_2_ROD_LENGTH_M = 4;
export const PROTOCOL_2_GRAVITY = 9.8;
export const PROTOCOL_2_BOB_RADIUS_M = 0.08;
export const PROTOCOL_2_BLANK_DURATION_SEC = 0.7;
export const PROTOCOL_2_FADE_SEC = 0.3;
export const PROTOCOL_2_MODEL_DT_SEC = 0.05;

/** 空白开始前的整幅淡出透明度。淡出不延长时间轴；空白前不足 0.3 秒时从播放起点淡起。 */
export function protocol2SceneAlpha(elapsedSec: number, blankStartSec: number): number {
  if (!Number.isFinite(elapsedSec) || !Number.isFinite(blankStartSec)) return 1;
  const fadeStart = Math.max(0, blankStartSec - PROTOCOL_2_FADE_SEC);
  if (elapsedSec <= fadeStart) return 1;
  if (elapsedSec >= blankStartSec) return 0;
  const span = blankStartSec - fadeStart;
  if (span <= 1e-12) return 0;
  return Math.max(0, Math.min(1, 1 - (elapsedSec - fadeStart) / span));
}

/** 可见片段数 = 光栅编号 + 3。G1 为 4，G2 为 5，G3 为 6。 */
export function protocol2VisibleSegmentCount(
  gratingId: Protocol2GratingCondition,
): number {
  const gratingNumber = Number(gratingId.slice(1));
  if (!Number.isInteger(gratingNumber) || gratingNumber < 1) {
    throw new Error(`无法读取光栅编号：${gratingId}`);
  }
  return gratingNumber + 3;
}
export const PROTOCOL_2_MIN_SEGMENT_SEC = 2 / 60;

export type Protocol2GratingGeometry = GratingGeometry & {
  id: Protocol2GratingCondition;
  referenceBandCount: 2 | 4 | 6;
};

export const PROTOCOL_2_GRATING_CONDITIONS: Record<
  Protocol2GratingCondition,
  Protocol2GratingGeometry
> = {
  G1: {
    id: "G1",
    referenceBandCount: 2,
    gapM: 0.45,
    barWidthM: 3.014102,
    periodM: 3.464102,
    offsetM: 0,
  },
  G2: {
    id: "G2",
    referenceBandCount: 4,
    gapM: 0.45,
    barWidthM: 1.282051,
    periodM: 1.732051,
    offsetM: 0,
  },
  G3: {
    id: "G3",
    referenceBandCount: 6,
    gapM: 0.45,
    barWidthM: 0.704701,
    periodM: 1.154701,
    offsetM: 0,
  },
};

export const PROTOCOL_2_GRATING_ORDER = ["G1", "G2", "G3"] as const;

export type Protocol2StateSite = {
  id: string;
  magnitudeIndex: number;
  arcFractionNumerator: 1 | 3 | 5 | 7 | 9 | 11;
  thetaRad: number;
  omegaRadPerSec: number;
};

const quadrantSiteCache = new Map<string, Array<{ thetaRad: number; omegaRadPerSec: number }>>();
const stateSiteCache = new Map<number, Protocol2StateSite[]>();

function interp(x: number, xs: Float64Array, ys: Float64Array): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (xs[mid]! < x) lo = mid;
    else hi = mid;
  }
  const x0 = xs[lo]!;
  const x1 = xs[hi]!;
  if (x1 <= x0) return ys[lo]!;
  const u = (x - x0) / (x1 - x0);
  return ys[lo]! + u * (ys[hi]! - ys[lo]!);
}

export function protocol2QuadrantSites(
  amplitudeDeg: number,
  m = 6,
): Array<{ thetaRad: number; omegaRadPerSec: number }> {
  const cacheKey = `${amplitudeDeg}:${m}`;
  const cached = quadrantSiteCache.get(cacheKey);
  if (cached) return cached.map((site) => ({ ...site }));
  const amplitudeRad = (amplitudeDeg * Math.PI) / 180;
  const count = 20_001;
  const theta = new Float64Array(count);
  const speedNorm = new Float64Array(count);
  const arc = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    theta[i] = (amplitudeRad * i) / (count - 1);
    speedNorm[i] = Math.sqrt(
      Math.max(0, 2 * (Math.cos(theta[i]!) - Math.cos(amplitudeRad))),
    );
    if (i > 0) {
      arc[i] =
        arc[i - 1]! +
        Math.hypot(
          (theta[i]! - theta[i - 1]!) / Math.PI,
          (speedNorm[i]! - speedNorm[i - 1]!) / 2,
        );
    }
  }
  const scale = Math.sqrt(PROTOCOL_2_GRAVITY / PROTOCOL_2_ROD_LENGTH_M);
  const result: Array<{ thetaRad: number; omegaRadPerSec: number }> = [];
  for (let i = 0; i < m; i += 1) {
    const target = ((i + 0.5) * arc[count - 1]!) / m;
    const angle = interp(target, arc, theta);
    result.push({
      thetaRad: angle,
      omegaRadPerSec:
        scale *
        Math.sqrt(
          Math.max(0, 2 * (Math.cos(angle) - Math.cos(amplitudeRad))),
        ),
    });
  }
  quadrantSiteCache.set(cacheKey, result);
  return result.map((site) => ({ ...site }));
}

const SIGN_COMBINATIONS = [
  { theta: 1, omega: 1, suffix: "pp" },
  { theta: 1, omega: -1, suffix: "pn" },
  { theta: -1, omega: 1, suffix: "np" },
  { theta: -1, omega: -1, suffix: "nn" },
] as const;

export function protocol2StateSites(amplitudeDeg: number): Protocol2StateSite[] {
  const cached = stateSiteCache.get(amplitudeDeg);
  if (cached) return cached.map((site) => ({ ...site }));
  const numerators = [1, 3, 5, 7, 9, 11] as const;
  const result = protocol2QuadrantSites(amplitudeDeg).flatMap((site, magnitudeIndex) =>
    SIGN_COMBINATIONS.map((sign) => ({
      id: `a${amplitudeDeg}-s${numerators[magnitudeIndex]}-${sign.suffix}`,
      magnitudeIndex,
      arcFractionNumerator: numerators[magnitudeIndex]!,
      thetaRad: sign.theta * site.thetaRad,
      omegaRadPerSec: sign.omega * site.omegaRadPerSec,
    })),
  );
  stateSiteCache.set(amplitudeDeg, result);
  return result.map((site) => ({ ...site }));
}

export function protocol2ReleaseParams(amplitudeDeg: number): PendulumParams {
  return {
    theta0Rad: (amplitudeDeg * Math.PI) / 180,
    omega0RadPerSec: 0,
    rodLengthM: PROTOCOL_2_ROD_LENGTH_M,
    gravity: PROTOCOL_2_GRAVITY,
  };
}

export function protocol2EnergyJ(amplitudeDeg: number): number {
  return (
    PROTOCOL_2_GRAVITY *
    PROTOCOL_2_ROD_LENGTH_M *
    (1 - Math.cos((amplitudeDeg * Math.PI) / 180))
  );
}

function phaseForState(
  amplitudeDeg: number,
  site: Protocol2StateSite,
): { phaseSec: number; periodSec: number } {
  const params = protocol2ReleaseParams(amplitudeDeg);
  const analysis = analyzePendulum(params);
  const thetaSign = Math.sign(site.thetaRad);
  const omegaSign = Math.sign(site.omegaRadPerSec);
  let quarter = 0;
  if (thetaSign > 0 && omegaSign < 0) quarter = 0;
  else if (thetaSign < 0 && omegaSign < 0) quarter = 1;
  else if (thetaSign < 0 && omegaSign > 0) quarter = 2;
  else quarter = 3;
  let lo = (quarter * analysis.T) / 4;
  let hi = ((quarter + 1) * analysis.T) / 4;
  const increasing = quarter >= 2;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const theta = pendulumThetaOmegaAt(mid, params, analysis).theta;
    if (increasing ? theta < site.thetaRad : theta > site.thetaRad) lo = mid;
    else hi = mid;
  }
  return { phaseSec: (lo + hi) / 2, periodSec: analysis.T };
}

type AbsoluteVisibleSegment = {
  tStartSec: number;
  tEndSec: number;
  truncatedByBlank: boolean;
};

function refineVisibilityBoundary(
  params: PendulumParams,
  geometry: Protocol2GratingGeometry,
  t0: number,
  t1: number,
  exposedAtT0: boolean,
): number {
  const analysis = analyzePendulum(params);
  let lo = t0;
  let hi = t1;
  for (let i = 0; i < 46; i += 1) {
    const mid = (lo + hi) / 2;
    const theta = pendulumThetaOmegaAt(mid, params, analysis).theta;
    const exposed = isBobExposedAtX(
      params.rodLengthM * Math.sin(theta),
      PROTOCOL_2_BOB_RADIUS_M,
      geometry,
    );
    if (exposed === exposedAtT0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function exposedSegmentsUntil(
  params: PendulumParams,
  geometry: Protocol2GratingGeometry,
  tEndSec: number,
): AbsoluteVisibleSegment[] {
  const analysis = analyzePendulum(params);
  const exposed = (t: number) => {
    const state = pendulumThetaOmegaAt(t, params, analysis);
    return isBobExposedAtX(
      params.rodLengthM * Math.sin(state.theta),
      PROTOCOL_2_BOB_RADIUS_M,
      geometry,
    );
  };
  const dt = 0.005;
  const segments: AbsoluteVisibleSegment[] = [];
  let prevT = 0;
  let prevExposed = exposed(0);
  let segmentStart = prevExposed ? 0 : null;
  while (prevT < tEndSec - 1e-12) {
    const nextT = Math.min(tEndSec, prevT + dt);
    const nextExposed = exposed(nextT);
    if (nextExposed !== prevExposed) {
      const boundary = refineVisibilityBoundary(
        params,
        geometry,
        prevT,
        nextT,
        prevExposed,
      );
      if (nextExposed) segmentStart = boundary;
      else if (segmentStart !== null) {
        segments.push({
          tStartSec: segmentStart,
          tEndSec: boundary,
          truncatedByBlank: false,
        });
        segmentStart = null;
      }
    }
    prevT = nextT;
    prevExposed = nextExposed;
  }
  if (segmentStart !== null) {
    segments.push({
      tStartSec: segmentStart,
      tEndSec,
      truncatedByBlank: true,
    });
  }
  return segments;
}

export type Protocol2MotionPlan = {
  amplitudeDeg: number;
  energyJ: number;
  stateSiteId: string;
  geometry: Protocol2GratingGeometry;
  theta0Deg: number;
  omega0DegPerSec: number;
  queryThetaDeg: number;
  queryOmegaRadPerSec: number;
  queryTimeSec: number;
  blankStartSec: number;
  blankDurationSec: number;
  visibleSegments: Protocol2VisibleSegment[];
  lastVisibleTimeSec: number;
  reversalTimeSec: number | null;
  absolutePlaybackStartSec: number;
  absoluteQueryTimeSec: number;
  periodSec: number;
};

const motionPlanCache = new Map<string, Protocol2MotionPlan>();

export function planProtocol2Motion(
  amplitudeDeg: number,
  site: Protocol2StateSite,
  geometry: Protocol2GratingGeometry,
): Protocol2MotionPlan {
  const cacheKey = `${amplitudeDeg}:${site.id}:${geometry.id}`;
  const cached = motionPlanCache.get(cacheKey);
  if (cached) return cached;
  const release = protocol2ReleaseParams(amplitudeDeg);
  const analysis = analyzePendulum(release);
  const { phaseSec, periodSec } = phaseForState(amplitudeDeg, site);
  const absoluteQueryTimeSec = phaseSec + 4 * periodSec;
  const absoluteBlankStartSec =
    absoluteQueryTimeSec - PROTOCOL_2_BLANK_DURATION_SEC;
  const segments = exposedSegmentsUntil(
    release,
    geometry,
    absoluteBlankStartSec,
  );
  const visibleCount = protocol2VisibleSegmentCount(geometry.id);
  const selected = segments.slice(-visibleCount);
  if (selected.length !== visibleCount) {
    throw new Error(`${site.id}/${geometry.id} 无法回溯到${visibleCount}个可见片段`);
  }
  for (const segment of selected) {
    if (segment.tEndSec - segment.tStartSec < PROTOCOL_2_MIN_SEGMENT_SEC - 1e-9) {
      throw new Error(`${site.id}/${geometry.id} 存在少于两个60 Hz帧的片段`);
    }
  }
  const playbackStart = selected[0]!.tStartSec;
  const initial = pendulumThetaOmegaAt(playbackStart, release, analysis);
  const query = pendulumThetaOmegaAt(absoluteQueryTimeSec, release, analysis);
  const lastVisibleAbsolute = selected[selected.length - 1]!.tEndSec;
  const firstTurnN = Math.floor((lastVisibleAbsolute + 1e-9) / (periodSec / 2)) + 1;
  const turnTime = firstTurnN * (periodSec / 2);
  const reversalTimeSec =
    turnTime < absoluteQueryTimeSec - 1e-9 ? turnTime - playbackStart : null;
  const result: Protocol2MotionPlan = {
    amplitudeDeg,
    energyJ: protocol2EnergyJ(amplitudeDeg),
    stateSiteId: site.id,
    geometry,
    theta0Deg: (initial.theta * 180) / Math.PI,
    omega0DegPerSec: (initial.omega * 180) / Math.PI,
    queryThetaDeg: (query.theta * 180) / Math.PI,
    queryOmegaRadPerSec: query.omega,
    queryTimeSec: absoluteQueryTimeSec - playbackStart,
    blankStartSec: absoluteBlankStartSec - playbackStart,
    blankDurationSec: PROTOCOL_2_BLANK_DURATION_SEC,
    visibleSegments: selected.map((segment) => ({
      tStartSec: segment.tStartSec - playbackStart,
      tEndSec: segment.tEndSec - playbackStart,
      truncatedByBlank: segment.truncatedByBlank,
    })),
    lastVisibleTimeSec: lastVisibleAbsolute - playbackStart,
    reversalTimeSec,
    absolutePlaybackStartSec: playbackStart,
    absoluteQueryTimeSec,
    periodSec,
  };
  motionPlanCache.set(cacheKey, result);
  return result;
}

export function protocol2TurnTimesInPlan(plan: Protocol2MotionPlan): number[] {
  const result: number[] = [];
  const half = plan.periodSec / 2;
  const startN = Math.ceil((plan.absolutePlaybackStartSec + 1e-9) / half);
  const endN = Math.floor((plan.absoluteQueryTimeSec - 1e-9) / half);
  for (let n = startN; n <= endN; n += 1) {
    result.push(n * half - plan.absolutePlaybackStartSec);
  }
  return result;
}

export function protocol2FirstVisibleTurnTime(
  plan: Protocol2MotionPlan,
): number | null {
  for (const turn of protocol2TurnTimesInPlan(plan)) {
    if (
      plan.visibleSegments.some(
        (segment) =>
          turn >= segment.tStartSec - 1e-9 && turn <= segment.tEndSec + 1e-9,
      )
    ) {
      return turn;
    }
  }
  return null;
}

function protocol2PlanParams(plan: Protocol2MotionPlan): PendulumParams {
  return {
    theta0Rad: (plan.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (plan.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: PROTOCOL_2_ROD_LENGTH_M,
    gravity: PROTOCOL_2_GRAVITY,
  };
}

export function protocol2FirstVisibleContactTime(
  plan: Protocol2MotionPlan,
  bellThetaRad: number,
): number | null {
  const params = protocol2PlanParams(plan);
  const analysis = analyzePendulum(params);
  const toleranceRad = PROTOCOL_2_BOB_RADIUS_M / PROTOCOL_2_ROD_LENGTH_M;
  for (const segment of plan.visibleSegments) {
    for (let t = segment.tStartSec; t <= segment.tEndSec + 1e-9; t += 1 / 240) {
      const theta = pendulumThetaOmegaAt(Math.min(t, segment.tEndSec), params, analysis).theta;
      if (Math.abs(theta - bellThetaRad) <= toleranceRad) return t;
    }
  }
  return null;
}

/** 全屏空白内摆球角度是否扫过铃铛。淡出和空白前的运动不算。 */
export function protocol2BlankSweepsBell(
  plan: Protocol2MotionPlan,
  bellThetaRad: number,
): boolean {
  const params = protocol2PlanParams(plan);
  const analysis = analyzePendulum(params);
  const toleranceRad = PROTOCOL_2_BOB_RADIUS_M / PROTOCOL_2_ROD_LENGTH_M;
  const t0 = plan.blankStartSec;
  const t1 = plan.queryTimeSec;
  const times = [t0, t1];
  for (const turn of protocol2TurnTimesInPlan(plan)) {
    if (turn >= t0 - 1e-9 && turn <= t1 + 1e-9) times.push(turn);
  }
  let minTheta = Number.POSITIVE_INFINITY;
  let maxTheta = Number.NEGATIVE_INFINITY;
  for (const time of times) {
    const theta = pendulumThetaOmegaAt(
      Math.min(Math.max(time, t0), t1),
      params,
      analysis,
    ).theta;
    minTheta = Math.min(minTheta, theta);
    maxTheta = Math.max(maxTheta, theta);
  }
  return bellThetaRad >= minTheta - toleranceRad && bellThetaRad <= maxTheta + toleranceRad;
}

export const THREE_CONDITION_PERMUTATIONS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
] as const;

export function subjectNumber(subjectId: string): number {
  const value = Number(subjectId.slice(subjectId.indexOf("-") + 1));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`无法从被试编号读取序号：${subjectId}`);
  }
  return value;
}
