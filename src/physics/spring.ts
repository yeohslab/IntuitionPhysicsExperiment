export type SpringRegime = "linear";

export interface SpringParams {
  massKg: number;
  stiffness: number;
  x0M: number;
  v0Mps: number;
}

export function springEnergy(params: SpringParams): number {
  const { massKg, stiffness, x0M, v0Mps } = params;
  return 0.5 * stiffness * x0M * x0M + 0.5 * massKg * v0Mps * v0Mps;
}

export function springPeriod(params: SpringParams): number {
  const { massKg, stiffness } = params;
  if (massKg <= 0 || stiffness <= 0) return Number.NaN;
  return 2 * Math.PI * Math.sqrt(massKg / stiffness);
}

export function springMotion(params: SpringParams): {
  omega: number;
  amplitudeM: number;
  phaseRad: number;
  regime: SpringRegime;
} {
  const { massKg, stiffness, x0M, v0Mps } = params;
  const omega = Math.sqrt(stiffness / massKg);
  const amplitudeM = Math.sqrt(x0M * x0M + (v0Mps / omega) * (v0Mps / omega));
  const phaseRad = Math.atan2(-v0Mps / omega, x0M);
  return { omega, amplitudeM, phaseRad, regime: "linear" };
}

export function springDisplacementAt(tSec: number, params: SpringParams): number {
  const { omega, amplitudeM, phaseRad } = springMotion(params);
  return amplitudeM * Math.cos(omega * tSec + phaseRad);
}

/** 供试次与编辑器使用的 E、T 摘要 */
export function springAnalysis(params: SpringParams): { E: number; T: number } {
  return { E: springEnergy(params), T: springPeriod(params) };
}

export function springVelocityAt(tSec: number, params: SpringParams): number {
  const { massKg, stiffness, x0M, v0Mps } = params;
  const omega = Math.sqrt(stiffness / massKg);
  const amplitudeM = Math.sqrt(x0M * x0M + (v0Mps / omega) * (v0Mps / omega));
  const phaseRad = Math.atan2(-v0Mps / omega, x0M);
  return -omega * amplitudeM * Math.sin(omega * tSec + phaseRad);
}
