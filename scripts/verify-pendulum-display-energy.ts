/**
 * 校验摆球显示单元：θ₀=0 时 ω 由能量反推；刺激集中观察 Trial 与 Block 正式能量对齐。
 * 运行：npm run verify-pendulum-display-energy
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  energyFromPendulumDisplay,
  energyFromPendulumStimulus,
} from "./lib/stimulateSequenceOverlay.ts";
import {
  pendulumEnergy,
  pendulumOmegaDegPerSecForEnergyAtBottom,
  type PendulumParams,
} from "../src/physics/pendulum.ts";
import { parseExperimentStimulusSet } from "../src/shared/storage.ts";
import type { BlockSegment, PendulumDisplayUnit, PendulumStimulusUnit } from "../src/types/experiment.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "stimulate");
const ROD_LENGTH_M = 4;
const ENERGY_TOL = 2e-3;
const FORMULA_TOL = 1e-6;

function assertFormulaTests(): void {
  const samples = [1.96, 40, 78, 120, 156.8];
  for (const E of samples) {
    const omegaDeg = pendulumOmegaDegPerSecForEnergyAtBottom(E, ROD_LENGTH_M);
    const p: PendulumParams = {
      theta0Rad: 0,
      omega0RadPerSec: (omegaDeg * Math.PI) / 180,
      rodLengthM: ROD_LENGTH_M,
      gravity: 9.8,
    };
    const actual = pendulumEnergy(p);
    if (Math.abs(actual - E) > FORMULA_TOL) {
      throw new Error(`公式校验失败: E=${E} J, 反推能量=${actual} J`);
    }
  }
  console.log(`OK: ${samples.length} 个能量样本的 ω(θ=0) 反推公式`);
}

function formalStimInBlock(block: BlockSegment): PendulumStimulusUnit | null {
  for (const trial of block.children) {
    const u = trial.units.find((x): x is PendulumStimulusUnit => x.type === "pendulumStimulus");
    if (u) return u;
  }
  return null;
}

function displayInBlock(block: BlockSegment): PendulumDisplayUnit | null {
  for (const trial of block.children) {
    const u = trial.units.find((x): x is PendulumDisplayUnit => x.type === "pendulumDisplay");
    if (u) return u;
  }
  return null;
}

function scanStimulusFile(name: string): void {
  const path = join(ROOT, name);
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const set = parseExperimentStimulusSet(raw);
  if (!set) throw new Error(`${name}: 解析失败`);

  const blocks = set.sequence.filter((s) => s.kind === "block") as BlockSegment[];
  let n = 0;
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b]!;
    const disp = displayInBlock(block);
    const stim = formalStimInBlock(block);
    if (!disp) throw new Error(`${name} Block ${b + 1}: 缺少 pendulumDisplay`);
    if (!stim) throw new Error(`${name} Block ${b + 1}: 缺少 pendulumStimulus`);

    if (disp.theta0Deg !== 0) {
      throw new Error(`${name} Block ${b + 1}: 观察单元 theta0Deg 应为 0，实际 ${disp.theta0Deg}`);
    }
    if (disp.displayTimeT !== 2) {
      throw new Error(`${name} Block ${b + 1}: 观察单元 displayTimeT 应为 2，实际 ${disp.displayTimeT}`);
    }
    if (disp.omega0DegPerSec <= 0) {
      throw new Error(`${name} Block ${b + 1}: 观察单元 omega0DegPerSec 应为正`);
    }

    const eDisp = energyFromPendulumDisplay(disp);
    const eFormal = energyFromPendulumStimulus(stim);
    if (Math.abs(eDisp - eFormal) > ENERGY_TOL) {
      throw new Error(
        `${name} Block ${b + 1}: 观察能量 ${eDisp.toFixed(4)} J 与正式试次 ${eFormal.toFixed(4)} J 偏差过大`,
      );
    }
    n++;
  }
  console.log(`OK: ${name} — ${n} 个 Block 观察单元能量与 θ₀=0 校验通过`);
}

function main(): void {
  assertFormulaTests();
  for (let i = 1; i <= 5; i++) {
    scanStimulusFile(`stimulus-${String(i).padStart(2, "0")}.json`);
  }
  console.log("全部校验通过。");
}

main();
