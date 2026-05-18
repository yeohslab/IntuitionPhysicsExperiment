/* eslint-disable no-console */
global.window = global;
require('../js/pendulum.js');

var P = global.PendulumLab;
var G = 9.80665;
var L = 1;
var DT = 1 / 8192;

function rk4Integrate(theta0, omega0, tSec) {
  var state = { theta: theta0, omega: omega0 };
  var t = 0;
  function rk(th, om, h) {
    function f(th, om) {
      return { dth: om, dom: (-G / L) * Math.sin(th) };
    }
    var k1 = f(th, om);
    var k2 = f(th + 0.5 * h * k1.dth, om + 0.5 * h * k1.dom);
    var k3 = f(th + 0.5 * h * k2.dth, om + 0.5 * h * k2.dom);
    var k4 = f(th + h * k3.dth, om + h * k3.dom);
    return {
      theta: th + (h / 6) * (k1.dth + 2 * k2.dth + 2 * k3.dth + k4.dth),
      omega: om + (h / 6) * (k1.dom + 2 * k2.dom + 2 * k3.dom + k4.dom),
    };
  }
  while (t < tSec - 1e-14) {
    var step = Math.min(DT, tSec - t);
    var s = rk(state.theta, state.omega, step);
    state = s;
    t += step;
  }
  return state;
}

function wrapPhaseDist(th, om, th0, om0) {
  var dth = ((th - th0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return Math.sqrt(dth * dth + (om - om0) * (om - om0));
}

function phaseReturnTimeRk4(theta0, omega0, maxSec) {
  var th0 = theta0;
  var om0 = omega0;
  var crossed = false;
  var bestT = null;
  var bestD = Infinity;
  var t = 0;
  var state = { theta: th0, omega: om0 };
  function rk(th, om, h) {
    function f(th, om) {
      return { dth: om, dom: (-G / L) * Math.sin(th) };
    }
    var k1 = f(th, om);
    var k2 = f(th + 0.5 * h * k1.dth, om + 0.5 * h * k1.dom);
    var k3 = f(th + 0.5 * h * k2.dth, om + 0.5 * h * k2.dom);
    var k4 = f(th + h * k3.dth, om + h * k3.dom);
    return {
      theta: th + (h / 6) * (k1.dth + 2 * k2.dth + 2 * k3.dth + k4.dth),
      omega: om + (h / 6) * (k1.dom + 2 * k2.dom + 2 * k3.dom + k4.dom),
    };
  }
  while (t < maxSec) {
    var s = rk(state.theta, state.omega, DT);
    state = s;
    t += DT;
    var d = wrapPhaseDist(state.theta, state.omega, th0, om0);
    if (t > 0.02 && d > 0.08) crossed = true;
    if (crossed && d < bestD) {
      bestD = d;
      bestT = t;
    }
    if (crossed && bestT != null && t > bestT + 0.15 && d > bestD * 1.8 && bestD < 0.02) break;
  }
  return { t: bestT, d: bestD };
}

function energyAtState(th, om) {
  return P.computeEnergyBar(th, om, L);
}

function auditCase(name, thDeg, wDeg) {
  var th = P.deg2rad(thDeg);
  var w = P.deg2rad(wDeg);
  var Eb0 = P.computeEnergyBar(th, w, L);
  var Tms = P.estimatePeriodMs(th, w, L);
  var T = Tms / 1000;

  var rkRef = phaseReturnTimeRk4(th, w, 15);
  var eState = P.stateAtTimeRk4(th, w, L, T);
  var rkState = rk4Integrate(th, w, T);

  var eEnd = energyAtState(eState.theta, eState.omega);
  var rkEnd = energyAtState(rkState.theta, rkState.omega);
  var phaseE = wrapPhaseDist(eState.theta, eState.omega, th, w);
  var phaseRk = wrapPhaseDist(rkState.theta, rkState.omega, th, w);

  var thetaErr = Math.abs(eState.theta - rkState.theta);
  var mode = Eb0 >= 2 ? '转圈' : '摆动';

  console.log('\n' + name + ' [' + mode + '] θ0=' + thDeg + '° ω0=' + wDeg + '°/s Ē=' + Eb0.toFixed(4));
  console.log('  T_energy     = ' + Tms.toFixed(2) + ' ms');
  console.log(
    '  T_rk4_phase  = ' + (rkRef.t ? (rkRef.t * 1000).toFixed(2) : '—') + ' ms, min|Δφ|=' + (rkRef.d != null ? rkRef.d.toExponential(2) : '—')
  );
  console.log(
    '  @T: |Δφ|_energy=' + phaseE.toExponential(3) + ' |Δφ|_rk4=' + phaseRk.toExponential(3)
  );
  console.log('  @T: |Δθ| energy vs rk4 = ' + thetaErr.toExponential(3) + ' rad');
  console.log('  @T: ΔĒ rk4 traj = ' + (eEnd - Eb0).toExponential(3) + ', rk4 ref ΔĒ = ' + (rkEnd - Eb0).toExponential(3));

  if (rkRef.t) {
    var relErr = (Math.abs(T - rkRef.t) / rkRef.t) * 100;
    console.log('  |T_energy - T_rk4|/T_rk4 = ' + relErr.toFixed(3) + '%');
  }

  var okPhase = phaseE < 0.05;
  var okRk = rkRef.t ? Math.abs(T - rkRef.t) / rkRef.t < 0.02 : true;
  console.log('  => ' + (okPhase && okRk ? 'PASS' : 'CHECK'));
}

console.log('=== 能量法审计：周期 T、T 时刻相位回归、与 RK4 对照 ===');

auditCase('截图转圈', 45, 360);
auditCase('摆动', 45, 0);
auditCase('转圈 0°', 0, 360);
auditCase('摆动 120°/s', 0, 120);
auditCase('中能摆动', 30, 50);
auditCase('近 separatrix', 0, 280);

// 椭圆 vs 半周期数值积分（摆动）
var th = P.deg2rad(45);
var w = 0;
var Eb = P.computeEnergyBar(th, w, L);
var tEll = P.periodLibrationFromEnergy(L, Eb);
var thetaMax = Math.acos(1 - Eb);
var tHalf = P.integrateTimeOverTheta(-thetaMax, thetaMax, L, Eb);
console.log('\n--- 摆动椭圆积分自洽 ---');
console.log('  T_elliptic = ' + (tEll * 1000).toFixed(2) + ' ms');
console.log('  2×∫_{-θmax}^{θmax} dθ/ω = ' + (2 * tHalf * 1000).toFixed(2) + ' ms');
