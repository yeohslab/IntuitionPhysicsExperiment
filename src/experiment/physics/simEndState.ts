import { analyzePendulum, pendulumThetaOmegaAt, PendulumRotationIntegrator } from "./pendulum";
import type { PendulumParams } from "./pendulum";
import { stimulusTotalSec, withSyncedTotalTimeT, type StimulusTimingMultiples } from "./timePhases";

export function pendulumThetaAtSimEnd(
  p: PendulumParams,
  timing: StimulusTimingMultiples,
): number {
  return pendulumStateAtSimEnd(p, timing).theta;
}

/** 设计终止时刻（遮挡结束）的规范状态；旋转支固定使用 1/4000 s 子步。 */
export function pendulumStateAtSimEnd(
  p: PendulumParams,
  timing: StimulusTimingMultiples,
): { theta: number; omega: number } {
  const analysis = analyzePendulum(p);
  const T = analysis.T;
  const synced = withSyncedTotalTimeT(timing, T);
  const simEndSec = stimulusTotalSec(synced, T);
  if (analysis.regime === "rotation") {
    const rot = new PendulumRotationIntegrator(p);
    rot.step(simEndSec, 1 / 4000);
    return { theta: rot.theta, omega: rot.omega };
  }
  return pendulumThetaOmegaAt(simEndSec, p, analysis);
}
