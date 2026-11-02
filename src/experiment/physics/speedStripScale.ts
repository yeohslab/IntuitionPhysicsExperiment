import {
  EXPERIMENT_4_OMEGA_MAX_RAD_PER_SEC,
  EXPERIMENT_4_ROD_LENGTH_M,
  EXPERIMENT_4_SPEED_SCALE_ENERGY_J,
} from "../../experiments/experiment-4/protocol";

/** 训练一和实验四共用的速度色带标定能量。 */
export const SPEED_STRIP_SCALE_ENERGY_J = EXPERIMENT_4_SPEED_SCALE_ENERGY_J;

/** 实验四固定能量在最低点的最大角速度（rad/s）。 */
export const SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC =
  EXPERIMENT_4_OMEGA_MAX_RAD_PER_SEC;

export const SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC =
  EXPERIMENT_4_ROD_LENGTH_M * SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC;

export function speedStripPositionFromLinearSpeedMPerSec(
  linearSpeedMPerSec: number,
): number {
  if (!Number.isFinite(linearSpeedMPerSec) || SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC <= 0) {
    return 0;
  }
  return Math.max(
    0,
    Math.min(1, Math.abs(linearSpeedMPerSec) / SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC),
  );
}

export function linearSpeedMPerSecFromSpeedStripPosition(position: number): number {
  if (!Number.isFinite(position)) return 0;
  const p = Math.max(0, Math.min(1, position));
  return p * SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC;
}

export function speedStripPositionFromAbsOmegaRadPerSec(
  absOmegaRadPerSec: number,
): number {
  return speedStripPositionFromLinearSpeedMPerSec(
    EXPERIMENT_4_ROD_LENGTH_M * Math.abs(absOmegaRadPerSec),
  );
}

export function absOmegaRadPerSecFromSpeedStripPosition(position: number): number {
  return linearSpeedMPerSecFromSpeedStripPosition(position) /
    EXPERIMENT_4_ROD_LENGTH_M;
}
