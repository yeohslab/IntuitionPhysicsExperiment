import { analyzePendulum, pendulumThetaOscillationAt, PendulumRotationIntegrator } from "./pendulum";
import type { PendulumParams } from "./pendulum";
import { springAnalysis, springDisplacementAt } from "./spring";
import type { SpringParams } from "./spring";
import { stimulusTotalSec, withSyncedTotalTimeT, type StimulusTimingMultiples } from "./timePhases";

export function pendulumThetaAtSimEnd(
  p: PendulumParams,
  timing: StimulusTimingMultiples,
): number {
  const analysis = analyzePendulum(p);
  const T = analysis.T;
  const synced = withSyncedTotalTimeT(timing, T);
  const simEndSec = stimulusTotalSec(synced, T);
  if (analysis.regime === "rotation") {
    const rot = new PendulumRotationIntegrator(p);
    rot.step(simEndSec);
    return rot.theta;
  }
  return pendulumThetaOscillationAt(simEndSec, p, analysis);
}

export function springDisplacementAtSimEnd(
  sp: SpringParams,
  timing: StimulusTimingMultiples,
): number {
  const { T } = springAnalysis(sp);
  const synced = withSyncedTotalTimeT(timing, T);
  const simEndSec = stimulusTotalSec(synced, T);
  return springDisplacementAt(simEndSec, sp);
}
