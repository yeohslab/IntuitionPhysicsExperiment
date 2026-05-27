/**
 * 校验 5AFC 选项生成：正确槽位等于真实态、选项间最小间隔。
 * 运行：npx tsx scripts/verify-position-options5.ts
 */
import { generatePendulumPositionOptions5 } from "../src/physics/pendulumPositionOptions.ts";
import type { PendulumParams } from "../src/physics/pendulum.ts";
import { pendulumEnergy } from "../src/physics/pendulum.ts";
import { generateSpringPositionOptions5 } from "../src/physics/springPositionOptions.ts";
import type { SpringParams } from "../src/physics/spring.ts";

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function testPendulumLowEnergy(): void {
  const rng = mulberry32(42);
  const p: PendulumParams = {
    theta0Rad: 0.5,
    omega0RadPerSec: 0.2,
    rodLengthM: 4,
    gravity: 9.8,
  };
  const actual = 0.35;
  const { choiceThetaDeg, correctOption } = generatePendulumPositionOptions5(actual, p, rng);
  const choicesRad = choiceThetaDeg.map((d) => (d * Math.PI) / 180);
  const correctRad = choicesRad[correctOption - 1]!;
  assert(Math.abs(correctRad - actual) < 1e-6, "摆球低能：正确槽角度应等于 actual");
  const minSep = (8 * Math.PI) / 180;
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      assert(
        Math.abs(choicesRad[i]! - choicesRad[j]!) >= minSep - 1e-9,
        `摆球低能：选项 ${i + 1} 与 ${j + 1} 间隔应 ≥8°`,
      );
    }
  }
  console.log("pendulum low-E OK", { correctOption, E: pendulumEnergy(p) });
}

function testPendulumHighEnergy(): void {
  const rng = mulberry32(99);
  const p: PendulumParams = {
    theta0Rad: 0,
    omega0RadPerSec: 4,
    rodLengthM: 4,
    gravity: 9.8,
  };
  const actual = -1.2;
  const { choiceThetaDeg, correctOption } = generatePendulumPositionOptions5(actual, p, rng);
  const correctRad = (choiceThetaDeg[correctOption - 1]! * Math.PI) / 180;
  let delta = Math.abs(correctRad - actual);
  delta = Math.min(delta, 2 * Math.PI - delta);
  assert(delta < 1e-6, "摆球高能：正确槽角度应等于 actual（圆周）");
  console.log("pendulum high-E OK", { correctOption });
}

function testSpring(): void {
  const rng = mulberry32(7);
  const sp: SpringParams = { massKg: 1, stiffness: 4, x0M: 0.3, v0Mps: 0.1 };
  const actual = 0.12;
  const { choiceXM, correctOption } = generateSpringPositionOptions5(actual, sp, rng);
  assert(Math.abs(choiceXM[correctOption - 1]! - actual) < 1e-9, "弹簧：正确槽位移应等于 actual");
  console.log("spring OK", { correctOption, choices: choiceXM });
}

testPendulumLowEnergy();
testPendulumHighEnergy();
testSpring();
console.log("verify-position-options5: all passed");
