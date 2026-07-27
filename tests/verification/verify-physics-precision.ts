/**
 * 高精度物理校验：摆球往复（椭圆函数）、摆球绕圈（Verlet）。
 * 运行：npm run verify-physics
 */
import {
  analyzePendulum,
  pendulumEnergy,
  pendulumPeriod,
  pendulumThetaOscillationAt,
  PendulumRotationIntegrator,
  type PendulumParams,
} from "../../src/experiment/physics/pendulum";
import {
  completeEllipticK,
  jacobiSn,
} from "../../src/experiment/physics/elliptic";

const FAIL = (msg: string) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};

const ok = (label: string) => console.log("OK:", label);

function maxAbs(xs: number[]): number {
  return xs.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
}

function pendulumKE(theta: number, omega: number, l: number, g: number): number {
  const m = 1;
  return 0.5 * m * (l * omega) ** 2 + m * g * l * (1 - Math.cos(theta));
}

function verifyPendulumOscillation() {
  const cases: PendulumParams[] = [
    { theta0Rad: 0.01, omega0RadPerSec: 0, rodLengthM: 1, gravity: 9.8 },
    { theta0Rad: (45 * Math.PI) / 180, omega0RadPerSec: 0, rodLengthM: 4, gravity: 9.8 },
    { theta0Rad: (120 * Math.PI) / 180, omega0RadPerSec: 0, rodLengthM: 4, gravity: 9.8 },
    { theta0Rad: 0.5, omega0RadPerSec: 0.8, rodLengthM: 4, gravity: 9.8 },
    { theta0Rad: -1.2, omega0RadPerSec: -0.3, rodLengthM: 2, gravity: 9.8 },
  ];
  for (const p of cases) {
    const analysis = analyzePendulum(p);
    if (analysis.regime !== "oscillation") {
      FAIL(`期望往复，得到 ${analysis.regime}`);
      return;
    }
    const th0 = pendulumThetaOscillationAt(0, p, analysis);
    const th0err = Math.abs(th0 - p.theta0Rad);
    if (th0err > 1e-3) {
      FAIL(`摆球往复初值 θ(0): 目标=${p.theta0Rad}, 实际=${th0}, |Δ|=${th0err}`);
      return;
    }
    const E0 = pendulumEnergy(p);
    const T = analysis.T;
    const n = 400;
    const eErrs: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * 3 * T;
      const th = pendulumThetaOscillationAt(t, p, analysis);
      const dt = 1e-6;
      const thP = pendulumThetaOscillationAt(t + dt, p, analysis);
      const thM = pendulumThetaOscillationAt(t - dt, p, analysis);
      const om = (thP - thM) / (2 * dt);
      eErrs.push(pendulumKE(th, om, p.rodLengthM, p.gravity) - E0);
    }
    const eDrift = maxAbs(eErrs);
    if (eDrift > 1e-4) {
      FAIL(`摆球往复能量漂移 max|E-E0|=${eDrift} (θ₀=${p.theta0Rad})`);
      return;
    }
    const thT = pendulumThetaOscillationAt(T, p, analysis);
    const periodErr = Math.abs(thT - th0);
    if (periodErr > 1e-3) {
      FAIL(`摆球往复周期 θ 闭合误差=${periodErr}`);
      return;
    }
    const Tsmall = 2 * Math.PI * Math.sqrt(p.rodLengthM / p.gravity);
    if (p.theta0Rad === 0.01 && p.omega0RadPerSec === 0) {
      const rel = Math.abs(T - Tsmall) / Tsmall;
      if (rel > 1e-4) FAIL(`小角度周期与 2π√(l/g) 偏差=${rel}`);
    }
    const dt = 1e-7;
    const thP = pendulumThetaOscillationAt(dt, p, analysis);
    const thM = pendulumThetaOscillationAt(-dt, p, analysis);
    const om0est = (thP - thM) / (2 * dt);
    const om0err = Math.abs(om0est - p.omega0RadPerSec);
    if (th0err > 1e-9 || om0err > 1e-7) {
      FAIL(`摆球往复初值: |Δθ|=${th0err}, |Δω|=${om0err}`);
      return;
    }
  }
  ok("摆球往复：初值 |Δθ|≤1e-9、|Δω|≤1e-7，能量漂移 ≤1e-4 J，周期 θ 闭合");
}

function verifyPhaseFinderResolution() {
  const p: PendulumParams = {
    theta0Rad: 1.1,
    omega0RadPerSec: 0.5,
    rodLengthM: 4,
    gravity: 9.8,
  };
  const a = analyzePendulum(p);
  const th0 = pendulumThetaOscillationAt(0, p, a);
  const err = Math.abs(th0 - p.theta0Rad);
  if (err > 1e-8) {
    FAIL(`相位求解初值误差过大: ${err} rad`);
    return;
  }
  ok(`摆球相位求解 |Δθ|=${err.toExponential(2)} rad`);
}

function verifyPendulumRotation() {
  const p: PendulumParams = {
    theta0Rad: Math.PI,
    omega0RadPerSec: 3,
    rodLengthM: 4,
    gravity: 9.8,
  };
  const analysis = analyzePendulum(p);
  if (analysis.regime !== "rotation") {
    FAIL(`期望绕圈，得到 ${analysis.regime}`);
    return;
  }
  const E0 = pendulumEnergy(p);
  const T = pendulumPeriod(analysis.E, p.rodLengthM, p.gravity);
  const rot = new PendulumRotationIntegrator(p);
  const stepsPerT = 4000;
  const h = T / stepsPerT;
  let maxEerr = 0;
  for (let i = 0; i <= stepsPerT * 5; i++) {
    rot.step(h);
    const E = pendulumKE(rot.theta, rot.omega, p.rodLengthM, p.gravity);
    maxEerr = Math.max(maxEerr, Math.abs(E - E0));
  }
  const relDrift = maxEerr / E0;
  if (relDrift > 1e-6) {
    FAIL(`绕圈 Verlet 5T 相对能量漂移=${relDrift.toExponential(2)}`);
    return;
  }
  const duration = 5 * T;
  const runtime = new PendulumRotationIntegrator(p);
  runtime.step(duration, 1 / 4000);
  const reference = new PendulumRotationIntegrator(p);
  reference.step(duration, 1 / 40000);
  const thetaError = Math.abs(
    Math.atan2(
      Math.sin(runtime.theta - reference.theta),
      Math.cos(runtime.theta - reference.theta),
    ),
  );
  const omegaError = Math.abs(runtime.omega - reference.omega);
  if (thetaError > 1e-4 || omegaError > 1e-4) {
    FAIL(
      `绕圈终态偏离高精度参考：|Δθ|=${thetaError.toExponential(2)}, ` +
        `|Δω|=${omegaError.toExponential(2)}`,
    );
    return;
  }
  const rot2 = new PendulumRotationIntegrator(p);
  rot2.step(T);
  const dTheta = Math.abs(((rot2.theta - p.theta0Rad + Math.PI) % (2 * Math.PI)) - Math.PI);
  if (dTheta > 0.05) {
    FAIL(`绕圈周期积分 Δθ≈2π 检验失败: |Δθ-2π|≈${dTheta}`);
    return;
  }
  ok(
    `摆球绕圈 Verlet：5T 相对能量漂移 ${relDrift.toExponential(2)}，` +
      `参考误差 |Δθ|=${thetaError.toExponential(2)} |Δω|=${omegaError.toExponential(2)}`,
  );
}

function verifyNonzeroInitialVelocity() {
  const deg = (d: number) => (d * Math.PI) / 180;

  const pendulumOscCases: PendulumParams[] = [
    { theta0Rad: 0, omega0RadPerSec: deg(45), rodLengthM: 4, gravity: 9.8 },
    { theta0Rad: 0, omega0RadPerSec: deg(-60), rodLengthM: 4, gravity: 9.8 },
    { theta0Rad: deg(30), omega0RadPerSec: deg(90), rodLengthM: 4, gravity: 9.8 },
    { theta0Rad: deg(-45), omega0RadPerSec: deg(120), rodLengthM: 4, gravity: 9.8 },
    { theta0Rad: 0.5, omega0RadPerSec: 0.8, rodLengthM: 4, gravity: 9.8 },
    { theta0Rad: deg(100), omega0RadPerSec: deg(15), rodLengthM: 4, gravity: 9.8 },
    { theta0Rad: -1.2, omega0RadPerSec: -0.3, rodLengthM: 2, gravity: 9.8 },
  ];
  let maxPendTh = 0;
  let maxPendOm = 0;
  let maxPendE = 0;
  const dtIc = 1e-8;
  const dtE = 1e-6;
  for (const p of pendulumOscCases) {
    if (Math.abs(p.omega0RadPerSec) < 1e-12) continue;
    const analysis = analyzePendulum(p);
    if (analysis.regime !== "oscillation") {
      FAIL(`摆球往复(v₀≠0) 误入 ${analysis.regime}: θ₀=${p.theta0Rad} ω₀=${p.omega0RadPerSec}`);
      return;
    }
    const th0 = pendulumThetaOscillationAt(0, p, analysis);
    const thP = pendulumThetaOscillationAt(dtIc, p, analysis);
    const thM = pendulumThetaOscillationAt(-dtIc, p, analysis);
    const om0est = (thP - thM) / (2 * dtIc);
    const th0err = Math.abs(th0 - p.theta0Rad);
    const om0err = Math.abs(om0est - p.omega0RadPerSec);
    maxPendTh = Math.max(maxPendTh, th0err);
    maxPendOm = Math.max(maxPendOm, om0err);
    if (th0err > 1e-9 || om0err > 1e-7) {
      FAIL(`摆球往复初值 θ₀=${p.theta0Rad} ω₀=${p.omega0RadPerSec}: |Δθ|=${th0err} |Δω|=${om0err}`);
      return;
    }
    const E0 = pendulumEnergy(p);
    const T = analysis.T;
    for (let i = 0; i <= 500; i++) {
      const t = (i / 500) * 4 * T;
      const th = pendulumThetaOscillationAt(t, p, analysis);
      const thP2 = pendulumThetaOscillationAt(t + dtE, p, analysis);
      const thM2 = pendulumThetaOscillationAt(t - dtE, p, analysis);
      const om = (thP2 - thM2) / (2 * dtE);
      maxPendE = Math.max(maxPendE, Math.abs(pendulumKE(th, om, p.rodLengthM, p.gravity) - E0));
    }
    if (maxPendE > 1e-4) {
      FAIL(`摆球往复(v₀≠0) 能量漂移=${maxPendE}`);
      return;
    }
  }
  ok(
    `摆球往复非零 ω₀：|Δθ|≤${maxPendTh.toExponential(2)} |Δω|≤${maxPendOm.toExponential(2)}，4T 能量漂移≤${maxPendE.toExponential(2)} J`,
  );

  const rotationCases: PendulumParams[] = [
    { theta0Rad: 0, omega0RadPerSec: deg(200), rodLengthM: 4, gravity: 9.8 },
    { theta0Rad: deg(10), omega0RadPerSec: deg(250), rodLengthM: 4, gravity: 9.8 },
    { theta0Rad: Math.PI, omega0RadPerSec: 3, rodLengthM: 4, gravity: 9.8 },
  ];
  let maxRotTh = 0;
  let maxRotOm = 0;
  let maxRotRelE = 0;
  for (const p of rotationCases) {
    if (Math.abs(p.omega0RadPerSec) < 1e-12) continue;
    const analysis = analyzePendulum(p);
    if (analysis.regime !== "rotation") {
      FAIL(`摆球绕圈(v₀≠0) 误入 ${analysis.regime}: θ₀=${p.theta0Rad} ω₀=${p.omega0RadPerSec}`);
      return;
    }
    const rot = new PendulumRotationIntegrator(p);
    maxRotTh = Math.max(maxRotTh, Math.abs(rot.theta - p.theta0Rad));
    maxRotOm = Math.max(maxRotOm, Math.abs(rot.omega - p.omega0RadPerSec));
    const E0 = pendulumEnergy(p);
    const T = pendulumPeriod(analysis.E, p.rodLengthM, p.gravity);
    const h = T / 4000;
    for (let i = 0; i <= 4000 * 4; i++) {
      rot.step(h);
      const E = pendulumKE(rot.theta, rot.omega, p.rodLengthM, p.gravity);
      maxRotRelE = Math.max(maxRotRelE, Math.abs(E - E0) / E0);
    }
  }
  if (maxRotTh > 1e-15 || maxRotOm > 1e-15) {
    FAIL(`绕圈 t=0 初值 |Δθ|=${maxRotTh} |Δω|=${maxRotOm}`);
    return;
  }
  if (maxRotRelE > 1e-6) {
    FAIL(`绕圈(v₀≠0) 4T 相对能量漂移=${maxRotRelE}`);
    return;
  }
  ok(`摆球绕圈非零 ω₀：t=0 精确，4T 相对能量漂移≤${maxRotRelE.toExponential(2)}`);
}

function verifyElliptic() {
  const k = 0.7;
  const K = completeEllipticK(k);
  const sn0 = jacobiSn(0, k);
  const sn4K = jacobiSn(4 * K, k);
  if (Math.abs(sn0) > 1e-14 || Math.abs(sn4K - sn0) > 1e-8) {
    FAIL(`Jacobi sn 周期性: sn(0)=${sn0}, sn(4K)=${sn4K}`);
    return;
  }
  ok("椭圆函数 sn(u,k) 周期 4K");
}

function main() {
  verifyElliptic();
  verifyPendulumOscillation();
  verifyNonzeroInitialVelocity();
  verifyPhaseFinderResolution();
  verifyPendulumRotation();
  if (process.exitCode === 1) {
    console.error("\n校验未通过");
    process.exit(1);
  }
  console.log("\n全部校验通过");
}

main();
