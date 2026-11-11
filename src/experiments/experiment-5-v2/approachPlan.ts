import {
  gratingBarCentersM,
  isBobExposedAtX,
  type GratingGeometry,
} from "../../experiment/physics/gratingGeometry";
import {
  analyzePendulum,
  pendulumThetaOmegaAt,
  type PendulumAnalysis,
  type PendulumParams,
} from "../../experiment/physics/pendulum";
import type { Protocol2VisibleSegment } from "../../shared/experimentTypes";
import {
  PROTOCOL_2_FADE_SEC,
  type Protocol2GratingGeometry,
} from "../protocol-2/common";
import {
  EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG,
  EXPERIMENT_5_V2_BLANK_BEFORE_LOWEST_BELL_SEC,
  EXPERIMENT_5_V2_BOB_RADIUS_M,
  EXPERIMENT_5_V2_GRAVITY,
  EXPERIMENT_5_V2_ROD_LENGTH_M,
} from "./protocol";

export type Experiment5V2ApproachSide = "left" | "right";

export type Experiment5V2ApproachPlan = {
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
  apexTimeSec: number;
};

/** 端点再加摆球角半径仍盖住铃铛，则这次上摆够得到。 */
export function experiment5V2EndpointReachesBell(
  amplitudeDeg: number,
  bellThetaRad: number,
): boolean {
  const amplitudeRad = (amplitudeDeg * Math.PI) / 180;
  const toleranceRad = EXPERIMENT_5_V2_BOB_RADIUS_M / EXPERIMENT_5_V2_ROD_LENGTH_M;
  return Math.abs(bellThetaRad) <= amplitudeRad + toleranceRad + 1e-12;
}

export function experiment5V2BellThetaRad(
  amplitudeDeg: number,
  angleOffsetDeg: number,
  side: Experiment5V2ApproachSide,
): { height: number; theta: number } {
  const thetaDeg = amplitudeDeg + angleOffsetDeg;
  const magnitude = Math.abs((thetaDeg * Math.PI) / 180);
  const height = EXPERIMENT_5_V2_ROD_LENGTH_M * (1 - Math.cos(magnitude));
  if (height <= 0 || height >= 2 * EXPERIMENT_5_V2_ROD_LENGTH_M) {
    throw new Error(`铃铛角度 ${thetaDeg}° 不在单摆轨道上`);
  }
  return { height, theta: side === "right" ? magnitude : -magnitude };
}

type DepartureBar = {
  innerEdgeM: number;
  outerEdgeM: number;
};

/** 出发侧与摆弧相交的最外遮挡条。铃铛在左时，出发侧是右侧。 */
export function experiment5V2DepartureBar(
  amplitudeDeg: number,
  apexSide: Experiment5V2ApproachSide,
  geometry: GratingGeometry,
): DepartureBar {
  const amplitudeRad = (amplitudeDeg * Math.PI) / 180;
  const xMax = EXPERIMENT_5_V2_ROD_LENGTH_M * Math.sin(amplitudeRad);
  const half = geometry.barWidthM / 2;
  const departureSign = apexSide === "left" ? 1 : -1;
  let bestCenter = Number.NaN;
  for (const center of gratingBarCentersM(geometry, xMax + geometry.periodM)) {
    const left = center - half;
    const right = center + half;
    const overlaps = departureSign > 0
      ? right > 0 && left < xMax
      : left < 0 && right > -xMax;
    if (!overlaps) continue;
    if (!Number.isFinite(bestCenter) ||
      (departureSign > 0 ? center > bestCenter : center < bestCenter)) {
      bestCenter = center;
    }
  }
  if (!Number.isFinite(bestCenter)) {
    throw new Error(`振幅 ${amplitudeDeg}° 的出发侧没有与摆弧相交的遮挡条`);
  }
  return departureSign > 0
    ? { innerEdgeM: bestCenter - half, outerEdgeM: bestCenter + half }
    : { innerEdgeM: bestCenter + half, outerEdgeM: bestCenter - half };
}

/** 摆球中心放在最外条外沿；外沿超出轨迹时改为该侧最高点、初速度为 0。 */
export function experiment5V2DepartureState(
  amplitudeDeg: number,
  apexSide: Experiment5V2ApproachSide,
  geometry: GratingGeometry,
): { thetaRad: number; omegaRadPerSec: number } {
  const amplitudeRad = (amplitudeDeg * Math.PI) / 180;
  const xMax = EXPERIMENT_5_V2_ROD_LENGTH_M * Math.sin(amplitudeRad);
  const departureSign = apexSide === "left" ? 1 : -1;
  const bar = experiment5V2DepartureBar(amplitudeDeg, apexSide, geometry);
  const outerReach = departureSign * bar.outerEdgeM;
  if (outerReach >= xMax - 1e-8) {
    return { thetaRad: departureSign * amplitudeRad, omegaRadPerSec: 0 };
  }
  const thetaRad = Math.asin(
    Math.max(-1, Math.min(1, bar.outerEdgeM / EXPERIMENT_5_V2_ROD_LENGTH_M)),
  );
  const speed = Math.sqrt(Math.max(
    0,
    (2 * EXPERIMENT_5_V2_GRAVITY / EXPERIMENT_5_V2_ROD_LENGTH_M) *
      (Math.cos(thetaRad) - Math.cos(amplitudeRad)),
  ));
  return {
    thetaRad,
    omegaRadPerSec: apexSide === "left" ? -speed : speed,
  };
}

/** 球心越过出发条朝向铃铛的内沿，进入第一条间隙的时刻。 */
export function experiment5V2ResponseOpenSec(
  amplitudeDeg: number,
  params: PendulumParams,
  analysis: PendulumAnalysis,
  geometry: GratingGeometry,
  apexSide: Experiment5V2ApproachSide,
  untilSec: number,
): number {
  const departureSign = apexSide === "left" ? 1 : -1;
  const bar = experiment5V2DepartureBar(amplitudeDeg, apexSide, geometry);
  const inward = (theta: number) => {
    const x = EXPERIMENT_5_V2_ROD_LENGTH_M * Math.sin(theta);
    return departureSign > 0 ? x < bar.innerEdgeM : x > bar.innerEdgeM;
  };
  if (inward(params.theta0Rad)) return 0;
  let lo = 0;
  let hi = untilSec;
  for (let step = 0; step < 50; step += 1) {
    const mid = (lo + hi) / 2;
    const theta = pendulumThetaOmegaAt(mid, params, analysis).theta;
    if (inward(theta)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function planExperiment5V2Approach(
  amplitudeDeg: number,
  apexSide: Experiment5V2ApproachSide,
  geometry: Protocol2GratingGeometry,
): Experiment5V2ApproachPlan {
  const started = experiment5V2DepartureState(amplitudeDeg, apexSide, geometry);
  const params: PendulumParams = {
    theta0Rad: started.thetaRad,
    omega0RadPerSec: started.omegaRadPerSec,
    rodLengthM: EXPERIMENT_5_V2_ROD_LENGTH_M,
    gravity: EXPERIMENT_5_V2_GRAVITY,
  };
  const analysis = analyzePendulum(params);
  const towardLeft = apexSide === "left";
  const apexTimeSec = timeUntilTheta(params, analysis, towardLeft);
  const lowestBellRad = ((amplitudeDeg + Math.min(...EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG)) * Math.PI) / 180;
  const lowestBellTimeSec = timeUntilSignedTheta(
    params,
    analysis,
    towardLeft ? -lowestBellRad : lowestBellRad,
    towardLeft,
    apexTimeSec,
  );
  const minimumLead = EXPERIMENT_5_V2_BLANK_BEFORE_LOWEST_BELL_SEC + PROTOCOL_2_FADE_SEC;
  if (lowestBellTimeSec <= minimumLead) {
    throw new Error(`振幅 ${amplitudeDeg}° 到达最低铃铛只用了 ${lowestBellTimeSec} s，不足以淡出并空白`);
  }
  const blankStartSec = lowestBellTimeSec - EXPERIMENT_5_V2_BLANK_BEFORE_LOWEST_BELL_SEC;
  const query = pendulumThetaOmegaAt(apexTimeSec, params, analysis);
  return {
    amplitudeDeg,
    energyJ: EXPERIMENT_5_V2_GRAVITY * EXPERIMENT_5_V2_ROD_LENGTH_M *
      (1 - Math.cos((amplitudeDeg * Math.PI) / 180)),
    stateSiteId: `approach-${amplitudeDeg}-${apexSide}`,
    geometry,
    theta0Deg: (started.thetaRad * 180) / Math.PI,
    omega0DegPerSec: (started.omegaRadPerSec * 180) / Math.PI,
    queryThetaDeg: (query.theta * 180) / Math.PI,
    queryOmegaRadPerSec: query.omega,
    queryTimeSec: apexTimeSec,
    blankStartSec,
    blankDurationSec: apexTimeSec - blankStartSec,
    visibleSegments: exposedSegments(params, analysis, geometry, blankStartSec),
    apexTimeSec,
  };
}

function timeUntilTheta(
  params: PendulumParams,
  analysis: PendulumAnalysis,
  decreasing: boolean,
): number {
  const dt = Math.min(0.01, analysis.T / 400);
  let previousOmega = params.omega0RadPerSec;
  let previousTime = 0;
  for (let time = dt; time <= analysis.T + dt; time += dt) {
    const omega = pendulumThetaOmegaAt(time, params, analysis).omega;
    const crossed = decreasing
      ? previousOmega < 0 && omega >= 0
      : previousOmega > 0 && omega <= 0;
    if (crossed) {
      let lo = previousTime;
      let hi = time;
      for (let step = 0; step < 50; step += 1) {
        const mid = (lo + hi) / 2;
        const midOmega = pendulumThetaOmegaAt(mid, params, analysis).omega;
        const before = decreasing ? midOmega < 0 : midOmega > 0;
        if (before) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    previousOmega = omega;
    previousTime = time;
  }
  throw new Error("摆球在一个周期内没有到达对侧最高点");
}

/** 朝向铃铛运动时，第一次到达目标角的时刻。目标角在最高点之前。 */
function timeUntilSignedTheta(
  params: PendulumParams,
  analysis: PendulumAnalysis,
  targetTheta: number,
  decreasing: boolean,
  untilSec: number,
): number {
  const reached = (time: number) => {
    const theta = pendulumThetaOmegaAt(time, params, analysis).theta;
    return decreasing ? theta <= targetTheta : theta >= targetTheta;
  };
  if (reached(0)) return 0;
  if (!reached(untilSec)) {
    throw new Error("摆球在到达最高点之前没有经过最低铃铛");
  }
  let lo = 0;
  let hi = untilSec;
  for (let step = 0; step < 60; step += 1) {
    const mid = (lo + hi) / 2;
    if (reached(mid)) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function exposedSegments(
  params: PendulumParams,
  analysis: PendulumAnalysis,
  geometry: Protocol2GratingGeometry,
  tEndSec: number,
): Protocol2VisibleSegment[] {
  const exposed = (time: number) => {
    const theta = pendulumThetaOmegaAt(time, params, analysis).theta;
    return isBobExposedAtX(
      params.rodLengthM * Math.sin(theta),
      EXPERIMENT_5_V2_BOB_RADIUS_M,
      geometry,
    );
  };
  const dt = 0.005;
  const segments: Protocol2VisibleSegment[] = [];
  let previousTime = 0;
  let previousExposed = exposed(0);
  let segmentStart = previousExposed ? 0 : null;
  while (previousTime < tEndSec - 1e-12) {
    const nextTime = Math.min(tEndSec, previousTime + dt);
    const nextExposed = exposed(nextTime);
    if (nextExposed !== previousExposed) {
      const boundary = refineBoundary(exposed, previousTime, nextTime, previousExposed);
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
    previousTime = nextTime;
    previousExposed = nextExposed;
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

function refineBoundary(
  exposed: (time: number) => boolean,
  t0: number,
  t1: number,
  exposedAtT0: boolean,
): number {
  let lo = t0;
  let hi = t1;
  for (let step = 0; step < 40; step += 1) {
    const mid = (lo + hi) / 2;
    if (exposed(mid) === exposedAtT0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
