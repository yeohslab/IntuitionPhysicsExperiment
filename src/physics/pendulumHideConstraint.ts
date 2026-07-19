import {
  analyzePendulum,
  pendulumThetaOmegaAt,
  pendulumThetaOscillationAt,
  PendulumRotationIntegrator,
  type PendulumParams,
  type PendulumRegime,
} from "./pendulum";
import {
  fadeDurationSec,
  stimulusTotalSec,
  withSyncedTotalTimeT,
  type StimulusTimingMultiples,
} from "./timePhases";

const HIDE_SAMPLE_STEPS = 32;
const ENDPOINT_EPS_RAD = 1e-4;
const OMEGA_SIGN_EPS = 1e-8;
/** 生成器拟合用较大子步长（仍满足终态角 1° 容差） */
export const FIT_ROTATION_SUBSTEP_SEC = 1 / 800;

function checkHideSample(
  theta: number,
  omega: number,
  prevSign: number,
  thetaMaxRad: number,
  regime: PendulumRegime,
): { ok: boolean; nextSign: number } {
  const sign = Math.abs(omega) < OMEGA_SIGN_EPS ? 0 : Math.sign(omega);
  let nextSign = prevSign;
  if (sign !== 0) {
    if (prevSign !== 0 && sign !== prevSign) return { ok: false, nextSign };
    nextSign = sign;
  }
  if (regime === "oscillation" || regime === "critical") {
    if (Math.abs(theta) >= thetaMaxRad - ENDPOINT_EPS_RAD) return { ok: false, nextSign };
  } else if (regime === "rotation") {
    if (Math.abs(Math.abs(theta) - Math.PI) < ENDPOINT_EPS_RAD && Math.abs(omega) < OMEGA_SIGN_EPS) {
      return { ok: false, nextSign };
    }
  }
  return { ok: true, nextSign };
}

function hideOkRotationSegment(
  rot: PendulumRotationIntegrator,
  hideStart: number,
  hideEnd: number,
  thetaMaxRad: number,
  regime: PendulumRegime,
  maxSubStep: number,
): boolean {
  let prevSign = Math.abs(rot.omega) < OMEGA_SIGN_EPS ? 0 : Math.sign(rot.omega);
  let cursor = rot.tAccum;
  for (let i = 1; i <= HIDE_SAMPLE_STEPS; i++) {
    const target = hideStart + (i / HIDE_SAMPLE_STEPS) * (hideEnd - hideStart);
    rot.step(target - cursor, maxSubStep);
    cursor = target;
    const chk = checkHideSample(rot.theta, rot.omega, prevSign, thetaMaxRad, regime);
    if (!chk.ok) return false;
    prevSign = chk.nextSign;
  }
  return true;
}

function hideOkOscillationSegment(
  p: PendulumParams,
  analysis: ReturnType<typeof analyzePendulum>,
  hideStart: number,
  hideEnd: number,
  thetaMaxRad: number,
  regime: PendulumRegime,
): boolean {
  let prevSign = 0;
  for (let i = 0; i <= HIDE_SAMPLE_STEPS; i++) {
    const t = hideStart + (i / HIDE_SAMPLE_STEPS) * (hideEnd - hideStart);
    const { theta, omega } = pendulumThetaOmegaAt(t, p, analysis);
    const chk = checkHideSample(theta, omega, prevSign, thetaMaxRad, regime);
    if (!chk.ok) return false;
    prevSign = chk.nextSign;
  }
  return true;
}

/** 一次前向仿真：终态角 + hide 无转向（拟合用） */
export function simulatePendulumTrialOutcome(
  p: PendulumParams,
  timing: StimulusTimingMultiples,
  thetaMaxRad: number,
  regime: PendulumRegime,
  maxSubStep = FIT_ROTATION_SUBSTEP_SEC,
): { thetaEnd: number; hideOk: boolean } {
  const analysis = analyzePendulum(p);
  const T = analysis.T;
  const synced = withSyncedTotalTimeT(timing, T);
  const fadeSec = fadeDurationSec(synced, T);
  const showEnd = synced.show1T * T;
  const hideStart = showEnd + fadeSec;
  const hideEnd = hideStart + synced.hide1T;
  const simEndSec = stimulusTotalSec(synced, T);

  if (regime === "rotation") {
    const rot = new PendulumRotationIntegrator(p);
    rot.step(hideStart, maxSubStep);
    const hideOk = hideOkRotationSegment(rot, hideStart, hideEnd, thetaMaxRad, regime, maxSubStep);
    rot.step(simEndSec - rot.tAccum, maxSubStep);
    return { thetaEnd: rot.theta, hideOk };
  }

  const hideOk = hideOkOscillationSegment(p, analysis, hideStart, hideEnd, thetaMaxRad, regime);
  const thetaEnd = pendulumThetaOscillationAt(simEndSec, p, analysis);
  return { thetaEnd, hideOk };
}

/** hide 时段内角速度不变号，且不触及摆动端点 / 旋转最高点 */
export function hideIntervalHasNoTurning(
  p: PendulumParams,
  timing: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "fadeMs">,
  thetaMaxRad: number,
  regime: PendulumRegime,
): boolean {
  const draft: StimulusTimingMultiples = {
    totalTimeT: 0,
    show1T: timing.show1T,
    hide1T: timing.hide1T,
    show2T: 0,
    hide2T: 0,
    fadeMs: timing.fadeMs,
  };
  return simulatePendulumTrialOutcome(p, draft, thetaMaxRad, regime, 1 / 4000).hideOk;
}
