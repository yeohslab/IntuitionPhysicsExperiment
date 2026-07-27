import {
  PENDULUM_MASS_KG,
  pendulumEnergy,
  pendulumPeriod,
  pendulumRegime,
  type PendulumParams,
  type PendulumRegime,
} from "./pendulum";
import { simulatePendulumTrialOutcome } from "./pendulumHideConstraint";
import { pendulumThetaAtSimEnd } from "./simEndState";
import {
  fadeMsForPeriod,
  fadeTForRegime,
  withSyncedTotalTimeT,
  type StimulusTimingMultiples,
} from "./timePhases";

/** 仿真终态角与目标角的最大允许误差（rad） */
export const THETA_END_TOL_RAD = Math.PI / 180;

const MAX_TARGET_ATTEMPTS = 48;

function uniform(lo: number, hi: number, rng: () => number): number {
  return lo + rng() * (hi - lo);
}

/** 最大摆角（rad）：往复为 arccos(1−E/mgl)，转圈为 π（终点 = 180°×x，x∼U[−1,1]） */
export function pendulumThetaMaxRad(E: number, rodLengthM: number, gravity: number): number {
  const regime = pendulumRegime(E, rodLengthM, gravity);
  if (regime === "rotation") return Math.PI;
  const m = PENDULUM_MASS_KG;
  const cosMax = Math.max(-1, Math.min(1, 1 - E / (m * gravity * rodLengthM)));
  return Math.acos(cosMax);
}

/** 在 [-θ_max, θ_max] 上均匀采样目标终态角（rad） */
export function sampleTargetSimEndThetaRad(
  E: number,
  rodLengthM: number,
  gravity: number,
  rng: () => number,
): number {
  const thetaMax = pendulumThetaMaxRad(E, rodLengthM, gravity);
  return uniform(-thetaMax, thetaMax, rng);
}

export function pendulumAngularErrorRad(
  actualRad: number,
  targetRad: number,
  regime: PendulumRegime,
  thetaMaxRad: number,
): number {
  if (regime === "rotation") {
    let d = actualRad - targetRad;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  }
  const a = Math.max(-thetaMaxRad, Math.min(thetaMaxRad, actualRad));
  const t = Math.max(-thetaMaxRad, Math.min(thetaMaxRad, targetRad));
  return Math.abs(a - t);
}

/** 随机 (θ, ω) 使 E = ½m(lω)² + mgl(1−cosθ)，m=1。 */
export function sampleStateForEnergy(
  E: number,
  rodLengthM: number,
  gravity: number,
  rng: () => number,
): { thetaRad: number; omegaRad: number } {
  const m = PENDULUM_MASS_KG;
  const mgl = m * gravity * rodLengthM;
  for (let attempt = 0; attempt < 40000; attempt++) {
    const thetaRad = (rng() * 2 - 1) * Math.PI;
    const U = mgl * (1 - Math.cos(thetaRad));
    const K = E - U;
    if (K < -1e-8) continue;
    const Kclamped = Math.max(0, K);
    const omegaAbs = Math.sqrt(2 * Kclamped) / rodLengthM;
    const omegaRad = omegaAbs * (rng() < 0.5 ? -1 : 1);
    const Echeck = 0.5 * m * (rodLengthM * omegaRad) ** 2 + mgl * (1 - Math.cos(thetaRad));
    const eTol = 1e-9 * Math.max(1, Math.abs(E));
    if (Math.abs(Echeck - E) > eTol) continue;
    return { thetaRad, omegaRad };
  }
  throw new Error(`无法在足够尝试内采样能量 E=${E} J（l=${rodLengthM}, g=${gravity}）`);
}

/** 给定初始位置 θ₀，由能量算 |ω₀|，ω₀ 符号均匀随机 */
export function sampleInitialStateForEnergy(
  E: number,
  rodLengthM: number,
  gravity: number,
  rng: () => number,
): { thetaRad: number; omegaRad: number } | null {
  const m = PENDULUM_MASS_KG;
  const mgl = m * gravity * rodLengthM;
  const regime = pendulumRegime(E, rodLengthM, gravity);
  const thetaMax = pendulumThetaMaxRad(E, rodLengthM, gravity);
  const thetaRad =
    regime === "rotation" ? uniform(-Math.PI, Math.PI, rng) : uniform(-thetaMax, thetaMax, rng);
  const U = mgl * (1 - Math.cos(thetaRad));
  const K = E - U;
  if (K < -1e-8) return null;
  const omegaAbs = Math.sqrt((2 * Math.max(0, K)) / (m * rodLengthM * rodLengthM));
  const omegaRad = omegaAbs * (rng() < 0.5 ? -1 : 1);
  const Echeck = 0.5 * m * (rodLengthM * omegaRad) ** 2 + mgl * (1 - Math.cos(thetaRad));
  const eTol = 1e-9 * Math.max(1, Math.abs(E));
  if (Math.abs(Echeck - E) > eTol) return null;
  return { thetaRad, omegaRad };
}

export type FittedPendulumTimedFields = {
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  totalTimeT: number;
  show1T: number;
  hide1T: number;
  fadeMs: number;
  targetThetaEndRad: number;
};

/** 给定 θ₀ 与能量，按符号取 ω₀（rad/s） */
function omegaForEnergyAtTheta(
  E: number,
  thetaRad: number,
  sign: -1 | 1,
  rodLengthM: number,
  gravity: number,
): number | null {
  const m = PENDULUM_MASS_KG;
  const mgl = m * gravity * rodLengthM;
  const K = E - mgl * (1 - Math.cos(thetaRad));
  if (K < -1e-8) return null;
  return sign * Math.sqrt((2 * Math.max(0, K)) / (m * rodLengthM * rodLengthM));
}

function theta0ScanRange(regime: PendulumRegime, thetaMax: number): { lo: number; hi: number } {
  if (regime === "rotation") return { lo: -Math.PI, hi: Math.PI };
  return { lo: -thetaMax, hi: thetaMax };
}

function tryInitialState(
  thetaRad: number,
  omegaRad: number,
  timing: StimulusTimingMultiples,
  targetThetaEndRad: number,
  regime: PendulumRegime,
  thetaMax: number,
  l: number,
  g: number,
): FittedPendulumTimedFields | null {
  const theta0Deg = Math.round(((thetaRad * 180) / Math.PI) * 1e10) / 1e10;
  const omega0DegPerSec = Math.round(((omegaRad * 180) / Math.PI) * 1e10) / 1e10;
  const p: PendulumParams = {
    theta0Rad: (theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (omega0DegPerSec * Math.PI) / 180,
    rodLengthM: l,
    gravity: g,
  };
  const { thetaEnd: actualEnd, hideOk } = simulatePendulumTrialOutcome(p, timing, thetaMax, regime);
  if (!hideOk) return null;
  const err = pendulumAngularErrorRad(actualEnd, targetThetaEndRad, regime, thetaMax);
  if (err > THETA_END_TOL_RAD) return null;
  return {
    theta0Deg,
    omega0DegPerSec,
    rodLengthM: l,
    gravity: g,
    totalTimeT: timing.totalTimeT,
    show1T: timing.show1T,
    hide1T: timing.hide1T,
    fadeMs: timing.fadeMs ?? 0,
    targetThetaEndRad,
  };
}

/** 每次拟合随机 ω₀ 符号扫描顺序，避免固定负号优先 */
function signOrderForFit(rng: () => number): readonly [-1, 1] | readonly [1, -1] {
  return rng() < 0.5 ? ([-1, 1] as const) : ([1, -1] as const);
}

function scanFitForTarget(
  E: number,
  targetThetaEndRad: number,
  timing: StimulusTimingMultiples,
  regime: PendulumRegime,
  thetaMax: number,
  l: number,
  g: number,
  rng: () => number,
): FittedPendulumTimedFields | null {
  const { lo, hi } = theta0ScanRange(regime, thetaMax);
  const coarseSteps = regime === "rotation" ? 360 : 200;
  let bestTheta = 0;
  let bestErr = Number.POSITIVE_INFINITY;
  let bestSign: -1 | 1 = 1;
  const signOrder = signOrderForFit(rng);

  for (const sign of signOrder) {
    for (let k = 0; k <= coarseSteps; k++) {
      const thetaRad = lo + (k / coarseSteps) * (hi - lo);
      const omegaRad = omegaForEnergyAtTheta(E, thetaRad, sign, l, g);
      if (omegaRad === null) continue;
      const p: PendulumParams = {
        theta0Rad: thetaRad,
        omega0RadPerSec: omegaRad,
        rodLengthM: l,
        gravity: g,
      };
      const { thetaEnd, hideOk } = simulatePendulumTrialOutcome(p, timing, thetaMax, regime);
      if (!hideOk) continue;
      const err = pendulumAngularErrorRad(thetaEnd, targetThetaEndRad, regime, thetaMax);
      if (err < bestErr) {
        bestErr = err;
        bestTheta = thetaRad;
        bestSign = sign;
      }
      if (err <= THETA_END_TOL_RAD) {
        return tryInitialState(thetaRad, omegaRad, timing, targetThetaEndRad, regime, thetaMax, l, g);
      }
    }
  }

  if (!Number.isFinite(bestErr)) return null;

  const halfWin = (hi - lo) / coarseSteps;
  let a = Math.max(lo, bestTheta - halfWin);
  let b = Math.min(hi, bestTheta + halfWin);
  const errAt = (thetaRad: number) => {
    const omegaRad = omegaForEnergyAtTheta(E, thetaRad, bestSign, l, g);
    if (omegaRad === null) return Number.POSITIVE_INFINITY;
    const p: PendulumParams = {
      theta0Rad: thetaRad,
      omega0RadPerSec: omegaRad,
      rodLengthM: l,
      gravity: g,
    };
    const { thetaEnd, hideOk } = simulatePendulumTrialOutcome(p, timing, thetaMax, regime);
    if (!hideOk) return Number.POSITIVE_INFINITY;
    return pendulumAngularErrorRad(thetaEnd, targetThetaEndRad, regime, thetaMax);
  };

  for (let i = 0; i < 40; i++) {
    const m1 = a + (b - a) / 3;
    const m2 = b - (b - a) / 3;
    const f1 = errAt(m1);
    const f2 = errAt(m2);
    if (f1 <= THETA_END_TOL_RAD) {
      const omegaRad = omegaForEnergyAtTheta(E, m1, bestSign, l, g)!;
      return tryInitialState(m1, omegaRad, timing, targetThetaEndRad, regime, thetaMax, l, g);
    }
    if (f2 <= THETA_END_TOL_RAD) {
      const omegaRad = omegaForEnergyAtTheta(E, m2, bestSign, l, g)!;
      return tryInitialState(m2, omegaRad, timing, targetThetaEndRad, regime, thetaMax, l, g);
    }
    if (f1 < f2) b = m2;
    else a = m1;
  }

  const omegaRad = omegaForEnergyAtTheta(E, 0.5 * (a + b), bestSign, l, g);
  if (omegaRad === null) return null;
  return tryInitialState(0.5 * (a + b), omegaRad, timing, targetThetaEndRad, regime, thetaMax, l, g);
}

/** 离散 show/hide 水平下的试次拟合：终点角均匀、初速符号随机、hide 无转向 */
export function fitPendulumDiscreteTrial(opts: {
  targetEnergyJ: number;
  show1T: number;
  hide1T: number;
  rodLengthM: number;
  gravity: number;
  rng: () => number;
  maxAttempts?: number;
}): FittedPendulumTimedFields {
  const { targetEnergyJ: E, show1T, hide1T, rodLengthM: l, gravity: g, rng } = opts;
  const maxTargets = opts.maxAttempts ?? MAX_TARGET_ATTEMPTS;
  const regime = pendulumRegime(E, l, g);
  const thetaMax = pendulumThetaMaxRad(E, l, g);
  const T = pendulumPeriod(E, l, g);
  const fadeT = fadeTForRegime(regime);
  const draft: StimulusTimingMultiples = {
    totalTimeT: 0,
    show1T,
    hide1T,
    fadeMs: fadeMsForPeriod(T, fadeT),
  };
  const timing = withSyncedTotalTimeT(draft, T);

  for (let attempt = 0; attempt < maxTargets; attempt++) {
    const targetThetaEndRad = sampleTargetSimEndThetaRad(E, l, g, rng);
    const fitted = scanFitForTarget(E, targetThetaEndRad, timing, regime, thetaMax, l, g, rng);
    if (fitted) return fitted;
  }

  throw new Error(
    `无法在 ${maxTargets} 个目标角内拟合离散试次：E=${E} J，show=${show1T}T，hide=${hide1T}s`,
  );
}

/** 校验单元终态角是否接近目标（生成后断言用） */
export function assertUnitSimEndTheta(
  u: Pick<
    FittedPendulumTimedFields,
    "theta0Deg" | "omega0DegPerSec" | "rodLengthM" | "gravity" | "show1T" | "hide1T" | "fadeMs" | "totalTimeT"
  >,
  targetEnergyJ: number,
  targetThetaEndRad: number,
): void {
  const p: PendulumParams = {
    theta0Rad: (u.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (u.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: u.rodLengthM,
    gravity: u.gravity,
  };
  const E = pendulumEnergy(p);
  if (Math.abs(E - targetEnergyJ) > 2e-3) {
    throw new Error(`能量 ${E.toFixed(4)} J 偏离目标 ${targetEnergyJ} J`);
  }
  const regime = pendulumRegime(targetEnergyJ, u.rodLengthM, u.gravity);
  const thetaMax = pendulumThetaMaxRad(targetEnergyJ, u.rodLengthM, u.gravity);
  const timing: StimulusTimingMultiples = {
    totalTimeT: u.totalTimeT,
    show1T: u.show1T,
    hide1T: u.hide1T,
    fadeMs: u.fadeMs,
  };
  const actual = pendulumThetaAtSimEnd(p, timing);
  const err = pendulumAngularErrorRad(actual, targetThetaEndRad, regime, thetaMax);
  if (err > THETA_END_TOL_RAD) {
    throw new Error(
      `终态角误差 ${((err * 180) / Math.PI).toFixed(3)}° > ${((THETA_END_TOL_RAD * 180) / Math.PI).toFixed(3)}°（目标 ${((targetThetaEndRad * 180) / Math.PI).toFixed(2)}°，实际 ${((actual * 180) / Math.PI).toFixed(2)}°）`,
    );
  }
}
