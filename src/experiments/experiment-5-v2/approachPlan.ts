import { isBobExposedAtX } from "../../experiment/physics/gratingGeometry";
import {
  analyzePendulum,
  pendulumThetaOmegaAt,
  type PendulumAnalysis,
  type PendulumParams,
} from "../../experiment/physics/pendulum";
import type { Protocol2VisibleSegment } from "../../shared/experimentTypes";
import {
  subjectNumber,
  type Protocol2GratingGeometry,
} from "../protocol-2/common";
import {
  EXPERIMENT_5_V2_BOB_RADIUS_M,
  EXPERIMENT_5_V2_DELTA_H_M,
  EXPERIMENT_5_V2_GRAVITY,
  EXPERIMENT_5_V2_POST_TURN_SEC,
  EXPERIMENT_5_V2_ROD_LENGTH_M,
  EXPERIMENT_5_V2_VISIBILITY_MARGIN_M,
} from "./protocol";

const LOWEST_BELL_DELTA_M = EXPERIMENT_5_V2_DELTA_H_M[0];

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

export function experiment5V2VisibleHeightM(amplitudeDeg: number): number {
  const heightMax = EXPERIMENT_5_V2_ROD_LENGTH_M *
    (1 - Math.cos((amplitudeDeg * Math.PI) / 180));
  return heightMax + LOWEST_BELL_DELTA_M - EXPERIMENT_5_V2_VISIBILITY_MARGIN_M;
}

export function experiment5V2ApproachSide(
  subjectId: string,
  amplitudeIndex: number,
): Experiment5V2ApproachSide {
  return (subjectNumber(subjectId) - 1 + amplitudeIndex) % 2 === 0 ? "right" : "left";
}

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
  deltaHM: number,
  side: Experiment5V2ApproachSide,
): { height: number; theta: number } {
  const height = EXPERIMENT_5_V2_ROD_LENGTH_M *
    (1 - Math.cos((amplitudeDeg * Math.PI) / 180)) + deltaHM;
  if (height <= 0 || height >= 2 * EXPERIMENT_5_V2_ROD_LENGTH_M) {
    throw new Error(`铃铛高度 ${height} m 不在单摆轨道上`);
  }
  const magnitude = Math.acos(1 - height / EXPERIMENT_5_V2_ROD_LENGTH_M);
  return { height, theta: side === "right" ? magnitude : -magnitude };
}

export function planExperiment5V2Approach(
  amplitudeDeg: number,
  apexSide: Experiment5V2ApproachSide,
  geometry: Protocol2GratingGeometry,
): Experiment5V2ApproachPlan {
  const release = releaseParams(amplitudeDeg);
  const releaseAnalysis = analyzePendulum(release);
  const quarter = releaseAnalysis.T / 4;
  const thetaVis = Math.acos(
    1 - experiment5V2VisibleHeightM(amplitudeDeg) / EXPERIMENT_5_V2_ROD_LENGTH_M,
  );
  const playbackAbs = apexSide === "left"
    ? crossingTime(release, releaseAnalysis, 0, quarter, thetaVis)
    : crossingTime(release, releaseAnalysis, 2 * quarter, 3 * quarter, -thetaVis);
  const blankAbs = apexSide === "left"
    ? crossingTime(release, releaseAnalysis, quarter, 2 * quarter, -thetaVis)
    : crossingTime(release, releaseAnalysis, 3 * quarter, 4 * quarter, thetaVis);
  const apexAbs = apexSide === "left" ? 2 * quarter : 4 * quarter;
  const queryAbs = apexAbs + EXPERIMENT_5_V2_POST_TURN_SEC;
  const started = pendulumThetaOmegaAt(playbackAbs, release, releaseAnalysis);
  const params: PendulumParams = {
    theta0Rad: started.theta,
    omega0RadPerSec: started.omega,
    rodLengthM: EXPERIMENT_5_V2_ROD_LENGTH_M,
    gravity: EXPERIMENT_5_V2_GRAVITY,
  };
  const analysis = analyzePendulum(params);
  const blankStartSec = blankAbs - playbackAbs;
  const queryTimeSec = queryAbs - playbackAbs;
  const query = pendulumThetaOmegaAt(queryTimeSec, params, analysis);
  return {
    amplitudeDeg,
    energyJ: EXPERIMENT_5_V2_GRAVITY * EXPERIMENT_5_V2_ROD_LENGTH_M *
      (1 - Math.cos((amplitudeDeg * Math.PI) / 180)),
    stateSiteId: `approach-${amplitudeDeg}-${apexSide}`,
    geometry,
    theta0Deg: (started.theta * 180) / Math.PI,
    omega0DegPerSec: (started.omega * 180) / Math.PI,
    queryThetaDeg: (query.theta * 180) / Math.PI,
    queryOmegaRadPerSec: query.omega,
    queryTimeSec,
    blankStartSec,
    blankDurationSec: queryTimeSec - blankStartSec,
    visibleSegments: exposedSegments(params, analysis, geometry, blankStartSec),
    apexTimeSec: apexAbs - playbackAbs,
  };
}

function releaseParams(amplitudeDeg: number): PendulumParams {
  return {
    theta0Rad: (amplitudeDeg * Math.PI) / 180,
    omega0RadPerSec: 0,
    rodLengthM: EXPERIMENT_5_V2_ROD_LENGTH_M,
    gravity: EXPERIMENT_5_V2_GRAVITY,
  };
}

function crossingTime(
  params: PendulumParams,
  analysis: PendulumAnalysis,
  t0: number,
  t1: number,
  targetTheta: number,
): number {
  const start = pendulumThetaOmegaAt(t0, params, analysis).theta;
  const end = pendulumThetaOmegaAt(t1, params, analysis).theta;
  const increasing = end > start;
  let lo = t0;
  let hi = t1;
  for (let step = 0; step < 60; step += 1) {
    const mid = (lo + hi) / 2;
    const theta = pendulumThetaOmegaAt(mid, params, analysis).theta;
    const stillBefore = increasing ? theta < targetTheta : theta > targetTheta;
    if (stillBefore) lo = mid;
    else hi = mid;
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
