import { completeEllipticK, jacobiCn, jacobiDn, jacobiSn } from "./elliptic";

export const PENDULUM_MASS_KG = 1;

export type PendulumRegime = "oscillation" | "rotation" | "critical";

export interface PendulumParams {
  theta0Rad: number;
  omega0RadPerSec: number;
  rodLengthM: number;
  gravity: number;
}

/** E = ½m(lω)² + mgl(1−cosθ)，势能零点在最低点 */
export function pendulumEnergy(p: PendulumParams): number {
  const m = PENDULUM_MASS_KG;
  const { theta0Rad, omega0RadPerSec, rodLengthM, gravity } = p;
  return (
    0.5 * m * (rodLengthM * omega0RadPerSec) ** 2 + m * gravity * rodLengthM * (1 - Math.cos(theta0Rad))
  );
}

export function pendulumCriticalEnergy(rodLengthM: number, gravity: number): number {
  const m = PENDULUM_MASS_KG;
  return 2 * m * gravity * rodLengthM;
}

export function pendulumRegime(E: number, rodLengthM: number, gravity: number): PendulumRegime {
  const Ec = pendulumCriticalEnergy(rodLengthM, gravity);
  const rel = E / Ec;
  if (rel < 1 - 1e-9) return "oscillation";
  if (rel > 1 + 1e-9) return "rotation";
  return "critical";
}

/** 周期 T（秒）：往复或绕圈，见 TODO.md */
export function pendulumPeriod(E: number, rodLengthM: number, gravity: number): number {
  const m = PENDULUM_MASS_KG;
  const g = gravity;
  const l = rodLengthM;
  const regime = pendulumRegime(E, l, g);
  if (regime === "critical") {
    const k = 1 - 1e-10;
    return 4 * Math.sqrt(l / g) * completeEllipticK(k);
  }
  if (regime === "oscillation") {
    const cosMax = Math.max(-1, Math.min(1, 1 - E / (m * g * l)));
    const thetaMax = Math.acos(cosMax);
    const k = Math.sin(thetaMax / 2);
    return 4 * Math.sqrt(l / g) * completeEllipticK(k);
  }
  const k = Math.sqrt((2 * m * g * l) / E);
  return 2 * Math.sqrt(l / g) * k * completeEllipticK(k);
}

function oscillationModulusK(E: number, rodLengthM: number, gravity: number): number {
  const m = PENDULUM_MASS_KG;
  const cosMax = Math.max(-1, Math.min(1, 1 - E / (m * gravity * rodLengthM)));
  const thetaMax = Math.acos(cosMax);
  let k = Math.sin(thetaMax / 2);
  if (!Number.isFinite(k) || k >= 1) k = 1 - 1e-10;
  return k;
}

function thetaOmegaOscillation(
  tSec: number,
  psi: number,
  k: number,
  alpha: number,
): { theta: number; omega: number } {
  const u = alpha * tSec + psi;
  const sn = jacobiSn(u, k);
  const cn = jacobiCn(u, k);
  const dn = jacobiDn(u, k);
  const ks = k * sn;
  const clamped = Math.max(-1, Math.min(1, ks));
  const theta = 2 * Math.asin(clamped);
  const denSq = 1 - ks * ks;
  const den = Math.sqrt(Math.max(denSq, 1e-20));
  const omega = (2 * k * alpha * cn * dn) / den;
  return { theta, omega };
}

function oscillationIcError(
  psi: number,
  theta0: number,
  omega0: number,
  k: number,
  alpha: number,
): number {
  const { theta, omega } = thetaOmegaOscillation(0, psi, k, alpha);
  const dTh = wrapAngleRad(theta - theta0);
  return dTh * dTh + (omega - omega0) ** 2;
}

/** 黄金分割，在 [a,b] 上最小化单峰目标 */
function goldenSectionMin(
  f: (x: number) => number,
  a: number,
  b: number,
  tol = 1e-13,
): number {
  const gr = (Math.sqrt(5) - 1) / 2;
  let lo = a;
  let hi = b;
  let c = hi - gr * (hi - lo);
  let d = lo + gr * (hi - lo);
  let fc = f(c);
  let fd = f(d);
  while (hi - lo > tol) {
    if (fc < fd) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - gr * (hi - lo);
      fc = f(c);
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + gr * (hi - lo);
      fd = f(d);
    }
  }
  return 0.5 * (lo + hi);
}

/** 在 [0, 4K) 上求 ψ，使 t=0 时 (θ,ω) 与初值一致（粗扫 + 局部黄金分割） */
export function findOscillationPhase(
  theta0: number,
  omega0: number,
  k: number,
  alpha: number,
): number {
  const K = completeEllipticK(k);
  if (!Number.isFinite(K) || K <= 0) return 0;
  const period = 4 * K;
  const errAt = (psi: number) => oscillationIcError(psi, theta0, omega0, k, alpha);

  const steps = 800;
  let bestPsi = 0;
  let bestErr = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= steps; i++) {
    const psi = (i / steps) * period;
    const err = errAt(psi);
    if (err < bestErr) {
      bestErr = err;
      bestPsi = psi;
    }
  }

  const halfWin = Math.max((period / steps) * 2, 1e-9);
  let lo = Math.max(0, bestPsi - halfWin);
  let hi = Math.min(period, bestPsi + halfWin);
  if (hi <= lo) return bestPsi;

  bestPsi = goldenSectionMin(errAt, lo, hi);
  if (bestPsi >= period) bestPsi -= period;
  if (bestPsi < 0) bestPsi += period;
  return bestPsi;
}

function wrapAngleRad(d: number): number {
  let x = d;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

export interface PendulumAnalysis {
  E: number;
  T: number;
  regime: PendulumRegime;
  /** 小振动角频率 √(g/l) */
  alpha: number;
  /** 往复支：椭圆模数 */
  kOsc?: number;
  psiOsc?: number;
}

export function analyzePendulum(p: PendulumParams): PendulumAnalysis {
  const E = pendulumEnergy(p);
  const T = pendulumPeriod(E, p.rodLengthM, p.gravity);
  const regime = pendulumRegime(E, p.rodLengthM, p.gravity);
  const alpha = Math.sqrt(p.gravity / p.rodLengthM);
  if (regime === "oscillation" || regime === "critical") {
    const kOsc = oscillationModulusK(E, p.rodLengthM, p.gravity);
    const psiOsc = findOscillationPhase(p.theta0Rad, p.omega0RadPerSec, kOsc, alpha);
    return { E, T, regime, alpha, kOsc, psiOsc };
  }
  return { E, T, regime, alpha };
}

/** 往复：解析式 θ(t)=2·asin(k·sn(√(g/l)t+ψ)) */
export function pendulumThetaOscillationAt(
  tSec: number,
  p: PendulumParams,
  analysis: PendulumAnalysis,
): number {
  const k = analysis.kOsc ?? oscillationModulusK(analysis.E, p.rodLengthM, p.gravity);
  const psi = analysis.psiOsc ?? 0;
  return thetaOmegaOscillation(tSec, psi, k, analysis.alpha).theta;
}

/** 辛 Verlet（速度形式），绕圈动力学 */
export class PendulumRotationIntegrator {
  readonly l: number;
  readonly g: number;
  theta: number;
  omega: number;
  tAccum = 0;

  constructor(p: PendulumParams) {
    this.l = p.rodLengthM;
    this.g = p.gravity;
    this.theta = p.theta0Rad;
    this.omega = p.omega0RadPerSec;
  }

  private acc(theta: number): number {
    return -(this.g / this.l) * Math.sin(theta);
  }

  /** 推进物理时间 dt（秒），固定子步长 */
  step(dt: number, maxSubStep = 1 / 4000): void {
    if (dt <= 0) return;
    let rem = dt;
    while (rem > 1e-12) {
      const h = Math.min(rem, maxSubStep);
      const a0 = this.acc(this.theta);
      const omegaHalf = this.omega + 0.5 * h * a0;
      this.theta += h * omegaHalf;
      const a1 = this.acc(this.theta);
      this.omega = omegaHalf + 0.5 * h * a1;
      rem -= h;
      this.tAccum += h;
    }
  }
}
