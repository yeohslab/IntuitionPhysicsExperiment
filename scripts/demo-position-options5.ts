/**
 * 演示 5AFC 选项生成结果（摆球 + 弹簧）
 * 运行：npx tsx scripts/demo-position-options5.ts
 */
import { generatePendulumPositionOptions5 } from "../src/physics/pendulumPositionOptions.ts";
import type { PendulumParams } from "../src/physics/pendulum.ts";
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

function minDegSep(deg: number[]): number {
  let min = Infinity;
  for (let i = 0; i < deg.length; i++) {
    for (let j = i + 1; j < deg.length; j++) {
      let d = Math.abs(deg[i]! - deg[j]!);
      d = Math.min(d, 360 - d);
      min = Math.min(min, d);
    }
  }
  return min;
}

function demoPendulum(label: string, actualDeg: number, p: PendulumParams, seed: number): void {
  const rng = mulberry32(seed);
  const actualRad = (actualDeg * Math.PI) / 180;
  const { choiceThetaDeg, correctOption } = generatePendulumPositionOptions5(actualRad, p, rng);
  console.log(`\n=== 摆球 ${label}（真实角 ${actualDeg}°，正确槽位 ${correctOption}）===`);
  choiceThetaDeg.forEach((d, i) => {
    const mark = i + 1 === correctOption ? " ← 正确" : "";
    console.log(`  槽位 ${i + 1}: ${d.toFixed(2)}°${mark}`);
  });
  console.log(`  最小两两角距: ${minDegSep(choiceThetaDeg).toFixed(2)}°`);
}

function demoSpring(label: string, actualM: number, sp: SpringParams, seed: number): void {
  const rng = mulberry32(seed);
  const { choiceXM, correctOption } = generateSpringPositionOptions5(actualM, sp, rng);
  console.log(`\n=== 弹簧 ${label}（真实 x ${actualM} m，正确槽位 ${correctOption}）===`);
  choiceXM.forEach((x, i) => {
    const mark = i + 1 === correctOption ? " ← 正确" : "";
    console.log(`  槽位 ${i + 1}: ${x.toFixed(4)} m${mark}`);
  });
}

const pendulumBase: PendulumParams = {
  theta0Rad: 0,
  omega0RadPerSec: 0,
  rodLengthM: 4,
  gravity: 9.8,
};

demoPendulum(
  "往复·低能",
  12,
  { ...pendulumBase, theta0Rad: (12 * Math.PI) / 180, omega0RadPerSec: 0 },
  42,
);
demoPendulum("往复·真实角近 0°", 0.3, pendulumBase, 99);
demoPendulum("整圈·高速", 0, { ...pendulumBase, omega0RadPerSec: 3.5 }, 7);

demoSpring("小振幅", 0.12, { massKg: 1, stiffness: 4, x0M: 0.3, v0Mps: 0.1 }, 7);

console.log("\n（正式刺激集请运行 npm run generate-stimulate 写入 JSON）\n");
