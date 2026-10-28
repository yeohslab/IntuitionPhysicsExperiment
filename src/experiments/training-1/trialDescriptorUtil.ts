import type { SpeedColorTrainingStimulusUnit } from "../../shared/experimentTypes";
import type { PendulumParams } from "../../experiment/physics/pendulum";

export function paramsFromDegrees(
  unit: Pick<
    SpeedColorTrainingStimulusUnit,
    "theta0Deg" | "omega0DegPerSec" | "rodLengthM" | "gravity"
  >,
): PendulumParams {
  return {
    theta0Rad: (unit.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: unit.rodLengthM,
    gravity: unit.gravity,
  };
}
