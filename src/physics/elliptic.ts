import ellipk from "@stdlib/math-base-special-ellipk";
import ellipj from "@stdlib/math-base-special-ellipj";

/** 第一类完全椭圆积分 K(k)，k 为模数（0≤k<1） */
export function completeEllipticK(k: number): number {
  if (!Number.isFinite(k) || k < 0 || k >= 1) return Number.NaN;
  const m = k * k;
  return ellipk(m);
}

/** Jacobi sn(u, k)，k 为模数；stdlib 使用参数 m = k² */
export function jacobiSn(u: number, k: number): number {
  if (!Number.isFinite(u) || !Number.isFinite(k)) return Number.NaN;
  const m = k * k;
  const out = ellipj(u, m);
  return out[0]!;
}

export function jacobiCn(u: number, k: number): number {
  if (!Number.isFinite(u) || !Number.isFinite(k)) return Number.NaN;
  const m = k * k;
  const out = ellipj(u, m);
  return out[1]!;
}

export function jacobiDn(u: number, k: number): number {
  if (!Number.isFinite(u) || !Number.isFinite(k)) return Number.NaN;
  const m = k * k;
  const out = ellipj(u, m);
  return out[2]!;
}
