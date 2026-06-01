import {
  PENDULUM_MASS_KG,
  pendulumEnergy,
  pendulumPeriod,
  pendulumRegime,
  type PendulumParams,
  type PendulumRegime,
} from "./pendulum";
import { wrapAngleRad } from "./pendulumArcScore";
import { pendulumThetaAtSimEnd } from "./simEndState";
import {
  PENDULUM_HIDE_SEC,
  SHOW_T_MAX,
  SHOW_T_MIN,
  STIMULUS_FADE_MS,
  withSyncedTotalTimeT,
  type StimulusTimingMultiples,
} from "./timePhases";

/** 仿真终态角与目标角的最大允许误差（rad） */
export const THETA_END_TOL_RAD = Math.PI / 180;

/** 目标终态角相对 θ_max 的采样半宽比例 */
export const TARGET_THETA_END_FRAC = 0.7;

const MAX_FIT_ATTEMPTS = 50_000;

function uniform(lo: number, hi: number, rng: () => number): number {
  return lo + rng() * (hi - lo);
}

/** 最大摆角（rad）：往复为 arccos(1−E/mgl)，转圈为 π */
export function pendulumThetaMaxRad(E: number, rodLengthM: number, gravity: number): number {
  const regime = pendulumRegime(E, rodLengthM, gravity);
  if (regime === "rotation") return Math.PI;
  const m = PENDULUM_MASS_KG;
  const cosMax = Math.max(-1, Math.min(1, 1 - E / (m * gravity * rodLengthM)));
  return Math.acos(cosMax);
}

/** 在 [-0.7·θ_max, 0.7·θ_max] 上均匀采样目标终态角（rad） */
export function sampleTargetSimEndThetaRad(
  E: number,
  rodLengthM: number,
  gravity: number,
  rng: () => number,
): number {
  const thetaMax = pendulumThetaMaxRad(E, rodLengthM, gravity);
  const half = TARGET_THETA_END_FRAC * thetaMax;
  return uniform(-half, half, rng);
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

export type FittedPendulumTimedFields = {
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  totalTimeT: number;
  show1T: number;
  hide1T: number;
  show2T: number;
  hide2T: number;
  fadeMs: number;
  targetThetaEndRad: number;
};

export function fitPendulumTimedUnit(opts: {
  targetEnergyJ: number;
  targetThetaEndRad: number;
  rodLengthM: number;
  gravity: number;
  rng: () => number;
  maxAttempts?: number;
}): FittedPendulumTimedFields {
  const { targetEnergyJ: E, targetThetaEndRad, rodLengthM: l, gravity: g, rng } = opts;
  const maxAttempts = opts.maxAttempts ?? MAX_FIT_ATTEMPTS;
  const regime = pendulumRegime(E, l, g);
  const thetaMax = pendulumThetaMaxRad(E, l, g);
  const T = pendulumPeriod(E, l, g);

  const half = TARGET_THETA_END_FRAC * thetaMax;
  if (
    targetThetaEndRad < -half - 1e-12 ||
    targetThetaEndRad > half + 1e-12
  ) {
    throw new Error(
      `目标终态角 ${targetThetaEndRad} rad 超出 [-${half}, ${half}]（E=${E} J）`,
    );
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const show1T = uniform(SHOW_T_MIN, SHOW_T_MAX, rng);
    const { thetaRad, omegaRad } = sampleStateForEnergy(E, l, g, rng);
    const theta0Deg = Math.round(((thetaRad * 180) / Math.PI) * 1e10) / 1e10;
    const omega0DegPerSec = Math.round(((omegaRad * 180) / Math.PI) * 1e10) / 1e10;
    const p: PendulumParams = {
      theta0Rad: (theta0Deg * Math.PI) / 180,
      omega0RadPerSec: (omega0DegPerSec * Math.PI) / 180,
      rodLengthM: l,
      gravity: g,
    };
    const draft: StimulusTimingMultiples = {
      totalTimeT: 0,
      show1T,
      hide1T: PENDULUM_HIDE_SEC,
      show2T: 0,
      hide2T: 0,
      fadeMs: STIMULUS_FADE_MS,
    };
    const timing = withSyncedTotalTimeT(draft, T);
    const actualEnd = pendulumThetaAtSimEnd(p, timing);
    const err = pendulumAngularErrorRad(actualEnd, targetThetaEndRad, regime, thetaMax);
    const half = TARGET_THETA_END_FRAC * thetaMax;
    const endClamped =
      regime === "rotation" ? wrapAngleRad(actualEnd) : actualEnd;
    const inBand =
      endClamped >= -half - 1e-9 && endClamped <= half + 1e-9;
    if (err <= THETA_END_TOL_RAD && inBand) {
      return {
        theta0Deg,
        omega0DegPerSec,
        rodLengthM: l,
        gravity: g,
        totalTimeT: timing.totalTimeT,
        show1T: timing.show1T,
        hide1T: timing.hide1T,
        show2T: timing.show2T,
        hide2T: timing.hide2T,
        fadeMs: timing.fadeMs ?? STIMULUS_FADE_MS,
        targetThetaEndRad,
      };
    }
  }

  throw new Error(
    `无法在 ${maxAttempts} 次内拟合终态角：E=${E} J，目标 θ_end=${targetThetaEndRad} rad（≈${((targetThetaEndRad * 180) / Math.PI).toFixed(2)}°）`,
  );
}

/** 校验单元终态角是否落在采样区间且接近目标（生成后断言用） */
export function assertUnitSimEndTheta(
  u: Pick<
    FittedPendulumTimedFields,
    "theta0Deg" | "omega0DegPerSec" | "rodLengthM" | "gravity" | "show1T" | "hide1T" | "show2T" | "hide2T" | "fadeMs" | "totalTimeT"
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
    show2T: u.show2T,
    hide2T: u.hide2T,
    fadeMs: u.fadeMs,
  };
  const actual = pendulumThetaAtSimEnd(p, timing);
  const err = pendulumAngularErrorRad(actual, targetThetaEndRad, regime, thetaMax);
  if (err > THETA_END_TOL_RAD) {
    throw new Error(
      `终态角误差 ${((err * 180) / Math.PI).toFixed(3)}° > ${((THETA_END_TOL_RAD * 180) / Math.PI).toFixed(3)}°（目标 ${((targetThetaEndRad * 180) / Math.PI).toFixed(2)}°，实际 ${((actual * 180) / Math.PI).toFixed(2)}°）`,
    );
  }
  const half = TARGET_THETA_END_FRAC * thetaMax;
  const allow = half + THETA_END_TOL_RAD;
  const wrapped = regime === "rotation" ? wrapAngleRad(actual) : actual;
  if (wrapped < -allow - 1e-6 || wrapped > allow + 1e-6) {
    throw new Error(`终态角 ${wrapped} rad 超出允许区间 [-${allow}, ${allow}]（名义 ±0.7θ_max）`);
  }
}
