import {
  EXPERIMENT_4_OMEGA_MAX_RAD_PER_SEC,
  EXPERIMENT_4_ROD_LENGTH_M,
} from "../../experiments/experiment-4/protocol";

/** 实验四速度色带右端：最高能量在最低点的角速度（rad/s）。 */
export const SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC =
  EXPERIMENT_4_OMEGA_MAX_RAD_PER_SEC;

export const SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC =
  EXPERIMENT_4_ROD_LENGTH_M * SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC;

export function speedStripPositionFromAbsOmegaRadPerSec(
  absOmegaRadPerSec: number,
): number {
  if (!Number.isFinite(absOmegaRadPerSec) || SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC <= 0) {
    return 0;
  }
  return Math.max(
    0,
    Math.min(1, Math.abs(absOmegaRadPerSec) / SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC),
  );
}

export function absOmegaRadPerSecFromSpeedStripPosition(position: number): number {
  if (!Number.isFinite(position)) return 0;
  const p = Math.max(0, Math.min(1, position));
  return p * SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC;
}
