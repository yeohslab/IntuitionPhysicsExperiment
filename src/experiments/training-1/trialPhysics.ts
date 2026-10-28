import {
  analyzePendulum,
  PENDULUM_MASS_KG,
  pendulumEnergy,
  pendulumThetaOmegaAt,
  type PendulumParams,
} from "../../experiment/physics/pendulum";
import { speedStripPositionFromAbsOmegaRadPerSec } from "../../experiment/physics/speedStripScale";
import type { SpeedColorTrainingStimulusUnit } from "../../shared/experimentTypes";
import {
  TRAINING_1_ENERGY_MAX_J,
  TRAINING_1_ENERGY_MIN_J,
  TRAINING_1_GRAVITY,
  TRAINING_1_MIN_VISIBLE_BEFORE_QUERY_SEC,
  TRAINING_1_OMEGA_SCALE_RAD_PER_SEC,
  TRAINING_1_ROD_LENGTH_M,
} from "./protocol";

type TrainingUnitFields = Omit<SpeedColorTrainingStimulusUnit, "id" | "type">;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

function turningPointParams(energyJ: number, side: "left" | "right"): PendulumParams {
  const mgl = PENDULUM_MASS_KG * TRAINING_1_GRAVITY * TRAINING_1_ROD_LENGTH_M;
  const amplitude = Math.acos(Math.max(-1, Math.min(1, 1 - energyJ / mgl)));
  return {
    theta0Rad: side === "right" ? amplitude : -amplitude,
    omega0RadPerSec: 0,
    rodLengthM: TRAINING_1_ROD_LENGTH_M,
    gravity: TRAINING_1_GRAVITY,
  };
}

function stateAtTime(tSec: number, params: PendulumParams) {
  return pendulumThetaOmegaAt(tSec, params, analyzePendulum(params));
}

function firstBottomTime(params: PendulumParams): number {
  const analysis = analyzePendulum(params);
  const startSign = Math.sign(params.theta0Rad) || 1;
  let lo = 0;
  let hi = analysis.T / 2;
  for (let i = 0; i < 90; i += 1) {
    const mid = (lo + hi) / 2;
    const theta = pendulumThetaOmegaAt(mid, params, analysis).theta;
    if (startSign * theta > 1e-9) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function targetHitTime(
  params: PendulumParams,
  targetAbsOmega: number,
  preferredBranch: "inward" | "outward",
): number {
  const analysis = analyzePendulum(params);
  const bottom = firstBottomTime(params);
  const bottomSpeed = Math.abs(pendulumThetaOmegaAt(bottom, params, analysis).omega);
  if (targetAbsOmega > bottomSpeed + 1e-9) throw new Error("训练一目标速度不可实现");

  const solve = (branch: "inward" | "outward") => {
    let lo = branch === "inward" ? 0 : bottom;
    let hi = branch === "inward" ? bottom : analysis.T / 2;
    for (let i = 0; i < 90; i += 1) {
      const mid = (lo + hi) / 2;
      const speed = Math.abs(pendulumThetaOmegaAt(mid, params, analysis).omega);
      if (branch === "inward") {
        if (speed >= targetAbsOmega) hi = mid;
        else lo = mid;
      } else if (speed > targetAbsOmega) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  };

  const inward = solve("inward");
  return preferredBranch === "inward" && inward >= TRAINING_1_MIN_VISIBLE_BEFORE_QUERY_SEC
    ? inward
    : solve("outward");
}

function targetAbsOmega(position: number): number {
  return position * TRAINING_1_OMEGA_SCALE_RAD_PER_SEC;
}

export function truthStripPositionAtQuery(
  params: PendulumParams,
  queryTimeSec: number,
): number {
  return speedStripPositionFromAbsOmegaRadPerSec(
    stateAtTime(queryTimeSec, params).omega,
  );
}

export function trainingStateAtQuery(
  params: PendulumParams,
  queryTimeSec: number,
) {
  return stateAtTime(queryTimeSec, params);
}

export function pickContinuousTrainingEnergy(
  targetStripPosition: number,
  rng: () => number,
): number {
  const required = 0.5 * PENDULUM_MASS_KG *
    (TRAINING_1_ROD_LENGTH_M * targetAbsOmega(targetStripPosition)) ** 2;
  const lower = Math.max(TRAINING_1_ENERGY_MIN_J, required);
  if (lower > TRAINING_1_ENERGY_MAX_J + 1e-9) {
    throw new Error(`目标色带位置 ${targetStripPosition} 不可实现`);
  }
  return lower + (TRAINING_1_ENERGY_MAX_J - lower) * rng();
}

export function buildContinuousTrainingUnit(
  targetStripPosition: number,
  energyJ: number,
  side: "left" | "right",
  preferredBranch: "inward" | "outward",
  meta: Pick<
    TrainingUnitFields,
    "mode" | "trainingSegment" | "blockIndex" | "targetBinIndex"
  >,
): TrainingUnitFields {
  const turning = turningPointParams(energyJ, side);
  if (analyzePendulum(turning).regime !== "oscillation") throw new Error("训练一必须为摆动轨迹");
  const hitTime = targetHitTime(turning, targetAbsOmega(targetStripPosition), preferredBranch);
  const start = stateAtTime(hitTime - TRAINING_1_MIN_VISIBLE_BEFORE_QUERY_SEC, turning);
  const params: PendulumParams = {
    theta0Rad: start.theta,
    omega0RadPerSec: start.omega,
    rodLengthM: TRAINING_1_ROD_LENGTH_M,
    gravity: TRAINING_1_GRAVITY,
  };
  const truth = truthStripPositionAtQuery(params, TRAINING_1_MIN_VISIBLE_BEFORE_QUERY_SEC);
  if (Math.abs(truth - targetStripPosition) > 1e-6) throw new Error("训练一目标速度重算不一致");
  if (Math.abs(pendulumEnergy(params) - energyJ) > 1e-6) throw new Error("训练一机械能重算不一致");
  return {
    ...meta,
    startSide: side,
    targetStripPosition,
    theta0Deg: toDeg(params.theta0Rad),
    omega0DegPerSec: toDeg(params.omega0RadPerSec),
    rodLengthM: params.rodLengthM,
    gravity: params.gravity,
    energyJ,
    queryTimeSec: TRAINING_1_MIN_VISIBLE_BEFORE_QUERY_SEC,
  };
}
