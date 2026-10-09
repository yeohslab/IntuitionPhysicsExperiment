import {
  GRAVITY,
  OSCILLATION_E_MAX_J,
  OSCILLATION_E_MIN_J,
  ROD_LENGTH_M,
} from "../../experiment/physics/energySegments";
import { pendulumCriticalEnergy, pendulumRegime } from "../../experiment/physics/pendulum";

/** 实验二 V2 转动能量上界：1.5 Ec（J）。 */
export const EXPERIMENT_2_V2_ROTATION_E_MAX_J = 1.5 * pendulumCriticalEnergy(ROD_LENGTH_M, GRAVITY);

function uniformLevelsInRange(
  minJ: number,
  maxJ: number,
  count: number,
): number[] {
  if (count < 2) throw new Error("均匀能量采样至少需要2个点");
  return Array.from(
    { length: count },
    (_, index) => minJ + (index / (count - 1)) * (maxJ - minJ),
  );
}

function dropCriticalEnergy(levelsJ: readonly number[], criticalJ: number): number[] {
  const tol = 1e-9 * Math.max(1, Math.abs(criticalJ));
  const kept = levelsJ.filter((energyJ) => Math.abs(energyJ - criticalJ) > tol);
  if (kept.length !== levelsJ.length - 1) {
    throw new Error(`剔除临界能量 ${criticalJ} J 后应保留 ${levelsJ.length - 1} 个水平`);
  }
  return kept;
}

/** 摆动 7 + 转动 3，共 10 个正式能量（J）。 */
export function buildExperiment2V2FormalEnergyLevelsJ(): number[] {
  const criticalJ = OSCILLATION_E_MAX_J;
  const oscillation = dropCriticalEnergy(
    uniformLevelsInRange(OSCILLATION_E_MIN_J, OSCILLATION_E_MAX_J, 8),
    criticalJ,
  );
  const rotation = dropCriticalEnergy(
    uniformLevelsInRange(criticalJ, EXPERIMENT_2_V2_ROTATION_E_MAX_J, 4),
    criticalJ,
  );
  const levels = [...oscillation, ...rotation];
  for (const energyJ of levels) {
    const regime = pendulumRegime(energyJ, ROD_LENGTH_M, GRAVITY);
    if (regime === "critical") {
      throw new Error(`正式能量 ${energyJ} J 不应落在临界值`);
    }
  }
  if (levels.length !== 10) {
    throw new Error(`实验二 V2 应有 10 个正式能量，实际 ${levels.length}`);
  }
  return levels;
}

export const EXPERIMENT_2_V2_FORMAL_ENERGY_LEVELS_J = buildExperiment2V2FormalEnergyLevelsJ();

export function experiment2V2PracticeOscillationEnergyJ(): number {
  const oscillation = EXPERIMENT_2_V2_FORMAL_ENERGY_LEVELS_J.filter(
    (energyJ) => pendulumRegime(energyJ, ROD_LENGTH_M, GRAVITY) === "oscillation",
  );
  return oscillation[Math.floor(oscillation.length / 2)]!;
}

export function experiment2V2PracticeRotationEnergyJ(): number {
  const rotation = EXPERIMENT_2_V2_FORMAL_ENERGY_LEVELS_J.filter(
    (energyJ) => pendulumRegime(energyJ, ROD_LENGTH_M, GRAVITY) === "rotation",
  );
  return rotation[Math.floor(rotation.length / 2)]!;
}
