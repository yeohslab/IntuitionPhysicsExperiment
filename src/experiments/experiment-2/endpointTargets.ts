import { GRAVITY, ROD_LENGTH_M } from "../../experiment/physics/energySegments";
import { pendulumThetaMaxRad } from "../../experiment/physics/pendulumUnitFit";

/** 五段内分点基准角（rad），不含端点。 */
export function endpointBaselinesRadForEnergy(energyJ: number): number[] {
  const amplitudeRad = pendulumThetaMaxRad(energyJ, ROD_LENGTH_M, GRAVITY);
  return Array.from({ length: 5 }, (_, index) => {
    const k = index + 1;
    return -amplitudeRad + k * ((2 * amplitudeRad) / 6);
  });
}

/** 终点在基准两侧均匀抽样的半宽（rad）：A/24。 */
export function endpointSampleHalfWidthRadForEnergy(energyJ: number): number {
  const amplitudeRad = pendulumThetaMaxRad(energyJ, ROD_LENGTH_M, GRAVITY);
  return amplitudeRad / 24;
}

export function sampleTargetThetaEndRadNearBaseline(
  baselineRad: number,
  halfWidthRad: number,
  rng: () => number,
): number {
  return baselineRad + (rng() * 2 - 1) * halfWidthRad;
}
