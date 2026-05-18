/* eslint-disable no-console */
global.window = global;
require('../js/pendulum.js');

var P = global.PendulumLab;
var L = 1;

function ebar(th, w) {
  return P.computeEnergyBar(th, w, L);
}

function report(label, thDeg, wDeg) {
  var th = P.deg2rad(thDeg);
  var w = P.deg2rad(wDeg);
  var Eb = ebar(th, w);
  var mode = Eb >= 2 ? '转圈 ∫dθ/ω(θ)' : '摆动 椭圆积分';
  var T = P.estimatePeriodMs(th, w, L);
  console.log('\n--- ' + label + ' ---');
  console.log('  θ0=' + thDeg + '°, ω0=' + wDeg + '°/s, Ē=' + Eb.toFixed(4));
  console.log('  方法: ' + mode);
  console.log('  T = ' + T.toFixed(2) + ' ms');
  if (Eb >= 2) {
    var tInt = P.periodRotationFromEnergy(th, w, L, Eb) * 1000;
    console.log('  核对 ∫dθ/ω = ' + tInt.toFixed(2) + ' ms');
  } else {
    var tEl = P.periodLibrationFromEnergy(L, Eb) * 1000;
    console.log('  核对 椭圆积分 = ' + tEl.toFixed(2) + ' ms');
  }
}

report('截图转圈', 45, 360);
report('摆动', 45, 0);
report('转圈 0°', 0, 360);
report('摆动 120°/s', 0, 120);
