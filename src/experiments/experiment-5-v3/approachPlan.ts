import {
  analyzePendulum,
  pendulumThetaOmegaAt,
  type PendulumAnalysis,
  type PendulumParams,
} from "../../experiment/physics/pendulum";
import { PROTOCOL_2_FADE_SEC } from "../protocol-2/common";
import {
  experiment5V2BellThetaRad,
  experiment5V2EndpointReachesBell,
  type Experiment5V2ApproachSide,
} from "../experiment-5-v2/approachPlan";
import {
  EXPERIMENT_5_V3_BLANK_BEFORE_LOWEST_BELL_SEC,
  EXPERIMENT_5_V3_GRAVITY,
  EXPERIMENT_5_V3_LOWEST_BELL_OFFSET_DEG,
  EXPERIMENT_5_V3_ROD_LENGTH_M,
} from "./protocol";

export type Experiment5V3ApproachSide = Experiment5V2ApproachSide;

export type Experiment5V3ApproachPlan = {
  amplitudeDeg: number;
  energyJ: number;
  stateSiteId: string;
  theta0Deg: number;
  omega0DegPerSec: number;
  queryThetaDeg: number;
  queryOmegaRadPerSec: number;
  queryTimeSec: number;
  blankStartSec: number;
  blankDurationSec: number;
  apexTimeSec: number;
  lowestBellTimeSec: number;
};

export { experiment5V2BellThetaRad as experiment5V3BellThetaRad };
export { experiment5V2EndpointReachesBell as experiment5V3EndpointReachesBell };

/** 从铃铛对侧的最低询问角出发，初速度朝向铃铛。 */
export function experiment5V3DepartureState(
  amplitudeDeg: number,
  apexSide: Experiment5V3ApproachSide,
): { thetaRad: number; omegaRadPerSec: number } {
  const amplitudeRad = (amplitudeDeg * Math.PI) / 180;
  const departureSign = apexSide === "left" ? 1 : -1;
  const thetaRad = departureSign *
    ((amplitudeDeg + EXPERIMENT_5_V3_LOWEST_BELL_OFFSET_DEG) * Math.PI) / 180;
  const speed = Math.sqrt(Math.max(
    0,
    (2 * EXPERIMENT_5_V3_GRAVITY / EXPERIMENT_5_V3_ROD_LENGTH_M) *
      (Math.cos(thetaRad) - Math.cos(amplitudeRad)),
  ));
  return {
    thetaRad,
    omegaRadPerSec: apexSide === "left" ? -speed : speed,
  };
}

export function planExperiment5V3Approach(
  amplitudeDeg: number,
  apexSide: Experiment5V3ApproachSide,
): Experiment5V3ApproachPlan {
  const started = experiment5V3DepartureState(amplitudeDeg, apexSide);
  const params: PendulumParams = {
    theta0Rad: started.thetaRad,
    omega0RadPerSec: started.omegaRadPerSec,
    rodLengthM: EXPERIMENT_5_V3_ROD_LENGTH_M,
    gravity: EXPERIMENT_5_V3_GRAVITY,
  };
  const analysis = analyzePendulum(params);
  const towardLeft = apexSide === "left";
  const apexTimeSec = timeUntilApex(params, analysis, towardLeft);
  const lowestBellRad = Math.abs(started.thetaRad);
  const lowestBellTimeSec = timeUntilSignedTheta(
    params,
    analysis,
    towardLeft ? -lowestBellRad : lowestBellRad,
    towardLeft,
    apexTimeSec,
  );
  const minimumLead = EXPERIMENT_5_V3_BLANK_BEFORE_LOWEST_BELL_SEC + PROTOCOL_2_FADE_SEC;
  if (lowestBellTimeSec <= minimumLead) {
    throw new Error(`振幅 ${amplitudeDeg}° 到达最低询问角只用了 ${lowestBellTimeSec} s，不足以淡出并空白`);
  }
  const blankStartSec = lowestBellTimeSec - EXPERIMENT_5_V3_BLANK_BEFORE_LOWEST_BELL_SEC;
  const query = pendulumThetaOmegaAt(apexTimeSec, params, analysis);
  return {
    amplitudeDeg,
    energyJ: EXPERIMENT_5_V3_GRAVITY * EXPERIMENT_5_V3_ROD_LENGTH_M *
      (1 - Math.cos((amplitudeDeg * Math.PI) / 180)),
    stateSiteId: `open-${amplitudeDeg}-${apexSide}`,
    theta0Deg: (started.thetaRad * 180) / Math.PI,
    omega0DegPerSec: (started.omegaRadPerSec * 180) / Math.PI,
    queryThetaDeg: (query.theta * 180) / Math.PI,
    queryOmegaRadPerSec: query.omega,
    queryTimeSec: apexTimeSec,
    blankStartSec,
    blankDurationSec: apexTimeSec - blankStartSec,
    apexTimeSec,
    lowestBellTimeSec,
  };
}

function timeUntilApex(
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
  if (!reached(untilSec)) throw new Error("摆球在到达最高点之前没有经过最低询问角");
  let lo = 0;
  let hi = untilSec;
  for (let step = 0; step < 60; step += 1) {
    const mid = (lo + hi) / 2;
    if (reached(mid)) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
