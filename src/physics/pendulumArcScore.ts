import { PENDULUM_MASS_KG, type PendulumRegime } from "./pendulum";

export const SCORE_MAX = 100;

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 折返到 (-π, π]（与 Math.atan2 一致） */
export function wrapAngleRad(rad: number): number {
  let x = rad;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x <= -Math.PI) x += 2 * Math.PI;
  return x;
}

/** 折返到 (-180°, 180°] */
export function wrapAngleDeg(deg: number): number {
  let x = deg;
  while (x > 180) x -= 360;
  while (x <= -180) x += 360;
  return x;
}

export function pendulumAngleDegFromRad(rad: number): number {
  return wrapAngleDeg(radToDeg(rad));
}

/** 试次半宽上限（度）：往复为最大摆角，转圈为 180° */
export function pendulumWMaxDeg(
  E: number,
  regime: PendulumRegime,
  rodLengthM: number,
  gravity: number,
): number {
  if (regime === "rotation") return 180;
  const m = PENDULUM_MASS_KG;
  const cosMax = Math.max(-1, Math.min(1, 1 - E / (m * gravity * rodLengthM)));
  return radToDeg(Math.acos(cosMax));
}

/** 点估计与真值的角距离 e（度） */
export function pendulumAngularErrorDeg(
  estimatedRad: number,
  actualRad: number,
  regime: PendulumRegime,
  wMaxDeg: number,
): number {
  const est = wrapAngleRad(estimatedRad);
  const act = wrapAngleRad(actualRad);
  if (regime === "rotation") {
    let d = Math.abs(est - act);
    d = Math.min(d, 2 * Math.PI - d);
    return radToDeg(d);
  }
  const maxRad = degToRad(wMaxDeg);
  const estClamped = Math.max(-maxRad, Math.min(maxRad, est));
  return radToDeg(Math.abs(estClamped - act));
}

/** wrap(θ̂ − θ_actual)（度），导出用；结果 ∈ (-180°, 180°] */
export function wrapDeltaThetaDeg(
  estimatedDeg: number,
  actualDeg: number,
  regime: PendulumRegime,
  wMaxDeg: number,
): number {
  const estDeg = wrapAngleDeg(estimatedDeg);
  const actDeg = wrapAngleDeg(actualDeg);
  const estRad = degToRad(estDeg);
  const actRad = degToRad(actDeg);
  if (regime === "rotation") {
    let d = estRad - actRad;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return wrapAngleDeg(radToDeg(d));
  }
  const maxRad = degToRad(wMaxDeg);
  const estClamped = Math.max(-maxRad, Math.min(maxRad, estRad));
  return wrapAngleDeg(radToDeg(estClamped - actRad));
}

export function pendulumIntervalHit(eDeg: number, wDeg: number): boolean {
  return eDeg <= wDeg + 1e-9;
}

export function pendulumTrialScore(wDeg: number, wMaxDeg: number, hit: boolean): number {
  if (!hit) return 0;
  if (wMaxDeg <= 0) return wDeg <= 0 ? SCORE_MAX : 0;
  const ratio = Math.max(0, Math.min(1, wDeg / wMaxDeg));
  return SCORE_MAX * (1 - ratio) ** 2;
}
