import { pendulumCriticalEnergy, pendulumRegime, type PendulumRegime } from "./pendulum";

export const ROD_LENGTH_M = 4;
export const GRAVITY = 9.8;
export const OSCILLATION_E_MIN_J = 1.96;
export const OSCILLATION_E_MAX_J = pendulumCriticalEnergy(ROD_LENGTH_M, GRAVITY);
export const ROTATION_E_MIN_J = OSCILLATION_E_MAX_J;
export const ROTATION_E_MAX_J = 2 * OSCILLATION_E_MAX_J;
export const NUM_ENERGY_SEGMENTS = 16;
export const NUM_FORMAL_BLOCKS = 15;
export const TRIALS_PER_FORMAL_BLOCK = 9;

export type MotionGroup = 1 | 2;

export interface KeptEnergySegment {
  index: number;
  Emin: number;
  Emax: number;
  Emid: number;
}

export function energyBoundsForGroup(group: MotionGroup): { Emin: number; Emax: number; regime: PendulumRegime } {
  if (group === 1) {
    return { Emin: OSCILLATION_E_MIN_J, Emax: OSCILLATION_E_MAX_J, regime: "oscillation" };
  }
  return { Emin: ROTATION_E_MIN_J, Emax: ROTATION_E_MAX_J, regime: "rotation" };
}

export function practiceEnergyForGroup(group: MotionGroup): number {
  const { Emin, Emax } = energyBoundsForGroup(group);
  return 0.5 * (Emin + Emax);
}

function distanceToEnergySegment(Ec: number, Emin: number, Emax: number): number {
  if (Emin <= Ec && Ec <= Emax) return 0;
  return Math.min(Math.abs(Ec - Emin), Math.abs(Ec - Emax));
}

/** 等分 [Emin, Emax] 后剔除最靠近 Ec 的一段，保留 15 个能量中点 */
export function buildKeptEnergySegmentsForGroup(group: MotionGroup): KeptEnergySegment[] {
  const { Emin, Emax, regime } = energyBoundsForGroup(group);
  const Ec = pendulumCriticalEnergy(ROD_LENGTH_M, GRAVITY);
  const edges = Array.from(
    { length: NUM_ENERGY_SEGMENTS + 1 },
    (_, i) => Emin + (i / NUM_ENERGY_SEGMENTS) * (Emax - Emin),
  );
  const all: KeptEnergySegment[] = [];
  for (let i = 0; i < NUM_ENERGY_SEGMENTS; i++) {
    const segEmin = edges[i]!;
    const segEmax = edges[i + 1]!;
    all.push({ index: i, Emin: segEmin, Emax: segEmax, Emid: 0.5 * (segEmin + segEmax) });
  }
  let dropIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < all.length; i++) {
    const seg = all[i]!;
    const dist = distanceToEnergySegment(Ec, seg.Emin, seg.Emax);
    if (dist < bestDist || (dist === bestDist && i > dropIdx)) {
      bestDist = dist;
      dropIdx = i;
    }
  }
  const kept = all.filter((_, i) => i !== dropIdx);
  if (kept.length !== NUM_FORMAL_BLOCKS) {
    throw new Error(`保留能量段应为 ${NUM_FORMAL_BLOCKS}，实际 ${kept.length}`);
  }
  for (const seg of kept) {
    const r = pendulumRegime(seg.Emid, ROD_LENGTH_M, GRAVITY);
    if (r !== regime && r !== "critical") {
      throw new Error(`组 ${group} 段 ${seg.index} 中点 ${seg.Emid} J 应为 ${regime}，实际 ${r}`);
    }
  }
  return kept;
}
