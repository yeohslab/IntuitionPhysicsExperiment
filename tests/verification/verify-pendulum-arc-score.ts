import {
  analyzePendulum,
  type PendulumParams,
} from "../../src/experiment/physics/pendulum.ts";
import {
  pendulumAngleDegFromRad,
  pendulumAngularErrorDeg,
  pendulumWMaxDeg,
  wrapDeltaThetaDeg,
  wrapAngleDeg,
} from "../../src/experiment/physics/pendulumArcScore.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(Math.abs(wrapAngleDeg(450) - 90) < 1e-9, "wrapAngleDeg(450) => 90");
assert(Math.abs(wrapAngleDeg(-270) - 90) < 1e-9, "wrapAngleDeg(-270) => 90");
assert(Math.abs(wrapAngleDeg(180) - 180) < 1e-9, "wrapAngleDeg(180) => 180");
assert(Math.abs(wrapAngleDeg(-180) - 180) < 1e-9, "wrapAngleDeg(-180) => 180");

const manyTurnsRad = (4 * Math.PI) / 3;
const wrappedDeg = pendulumAngleDegFromRad(manyTurnsRad);
assert(wrappedDeg > -180 && wrappedDeg <= 180, "pendulumAngleDegFromRad in (-180,180]");

const lowE: PendulumParams = {
  theta0Rad: (30 * Math.PI) / 180,
  omega0RadPerSec: 0,
  rodLengthM: 4,
  gravity: 9.8,
};
const low = analyzePendulum(lowE);
const wMaxLow = pendulumWMaxDeg(low.E, low.regime, lowE.rodLengthM, lowE.gravity);
assert(low.regime === "oscillation", "low E should oscillate");
assert(wMaxLow > 0 && wMaxLow < 180, "oscillation w_max in (0,180)");

const actualRad = 0.2;
const estRad = 0.2;
const e0 = pendulumAngularErrorDeg(estRad, actualRad, low.regime, wMaxLow);
assert(e0 < 1e-6, "same angle => e=0");

const eMiss = pendulumAngularErrorDeg(actualRad + 0.5, actualRad, low.regime, wMaxLow);
assert(eMiss > 0.1, "angular error should be positive");
assert(
  Math.abs(wrapDeltaThetaDeg(190, 170, "rotation", 180) - 20) < 1e-9,
  "rotation delta should wrap",
);

const rot: PendulumParams = {
  theta0Rad: 0,
  omega0RadPerSec: 8,
  rodLengthM: 4,
  gravity: 9.8,
};
const rotA = analyzePendulum(rot);
assert(rotA.regime === "rotation", "high E rotation");
assert(pendulumWMaxDeg(rotA.E, rotA.regime, rot.rodLengthM, rot.gravity) === 180, "rotation w_max=180");

const rotActualDeg = pendulumAngleDegFromRad(7 * Math.PI);
const rotEstDeg = pendulumAngleDegFromRad(Math.PI / 4);
assert(rotActualDeg > -180 && rotActualDeg <= 180, "rotation actual deg wrapped");
assert(rotEstDeg > -180 && rotEstDeg <= 180, "rotation est deg wrapped");

console.log("verify-pendulum-arc-score: OK");
