/**
 * 粗略校验：小角度单摆周期 T ≈ 2π√(l/g)，与椭圆积分大 k 极限一致。
 * 运行：npm run verify-physics
 */
import { pendulumPeriod } from "../../src/experiment/physics/pendulum";

const l = 1;
const g = 9.8;
const theta0 = 0.01;
const omega0 = 0;
const m = 1;
const E = 0.5 * m * (l * omega0) ** 2 + m * g * l * (1 - Math.cos(theta0));
const T = pendulumPeriod(E, l, g);
const Tsmall = 2 * Math.PI * Math.sqrt(l / g);
const err = Math.abs(T - Tsmall) / Tsmall;
console.log("E=", E, "T_elliptic=", T, "T_small_angle=", Tsmall, "rel_err=", err);
if (err > 0.02) {
  console.error("校验未通过");
  process.exit(1);
}
console.log("校验通过");
