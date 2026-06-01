/**
 * 校验预生成刺激集：Practice/Block 内 6 Trial 能量一致；hide1T=0.5 s；终态角在 [-0.7θ_max,0.7θ_max]。
 * 运行：npm run verify-pendulum-display-energy
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  energyFromPendulumPractice,
  energyFromPendulumStimulus,
} from "./lib/stimulateSequenceOverlay.ts";
import {
  pendulumCriticalEnergy,
  pendulumEnergy,
  pendulumOmegaDegPerSecForEnergyAtBottom,
  pendulumRegime,
  type PendulumParams,
} from "../src/physics/pendulum.ts";
import { pendulumThetaAtSimEnd } from "../src/physics/simEndState.ts";
import { pendulumThetaMaxRad, TARGET_THETA_END_FRAC } from "../src/physics/pendulumUnitFit.ts";
import { PENDULUM_HIDE_SEC } from "../src/physics/timePhases.ts";
import { parseExperimentStimulusSet } from "../src/shared/storage.ts";
import type {
  BlockSegment,
  PendulumPracticeUnit,
  PendulumStimulusUnit,
  PracticeSegment,
} from "../src/types/experiment.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "stimulate");
const ROD_LENGTH_M = 4;
const GRAVITY = 9.8;
const GLOBAL_E_MIN = 1.96;
const GLOBAL_E_MAX = pendulumCriticalEnergy(ROD_LENGTH_M, GRAVITY);
const PRACTICE_ENERGY_J = (GLOBAL_E_MIN + GLOBAL_E_MAX) / 2;
const ENERGY_TOL = 2e-3;
const HIDE_TOL = 1e-6;
const TRIALS_PER_SEGMENT = 6;
const END_ANGLE_MARGIN_RAD = 1e-4;

function assertFormulaTests(): void {
  const samples = [1.96, 20, 40, 70, 76];
  for (const E of samples) {
    const omegaDeg = pendulumOmegaDegPerSecForEnergyAtBottom(E, ROD_LENGTH_M);
    const p: PendulumParams = {
      theta0Rad: 0,
      omega0RadPerSec: (omegaDeg * Math.PI) / 180,
      rodLengthM: ROD_LENGTH_M,
      gravity: GRAVITY,
    };
    const actual = pendulumEnergy(p);
    if (Math.abs(actual - E) > 1e-6) {
      throw new Error(`公式校验失败: E=${E} J, 反推能量=${actual} J`);
    }
  }
  console.log(`OK: ${samples.length} 个能量样本的 ω(θ=0) 反推公式`);
}

function timedUnitInTrial(
  trial: { units: { type: string }[] },
): PendulumPracticeUnit | PendulumStimulusUnit | null {
  const u = trial.units.find(
    (x) => x.type === "pendulumPractice" || x.type === "pendulumStimulus",
  );
  if (u?.type === "pendulumPractice" || u?.type === "pendulumStimulus") return u;
  return null;
}

function energyOfTimedUnit(u: PendulumPracticeUnit | PendulumStimulusUnit): number {
  return u.type === "pendulumPractice"
    ? energyFromPendulumPractice(u)
    : energyFromPendulumStimulus(u);
}

function assertTimedUnitPhysics(
  name: string,
  label: string,
  trialIndex: number,
  u: PendulumPracticeUnit | PendulumStimulusUnit,
  wantE: number,
): number {
  const e = energyOfTimedUnit(u);
  if (Math.abs(e - wantE) > ENERGY_TOL) {
    throw new Error(
      `${name} ${label} Trial ${trialIndex + 1}: 能量 ${e.toFixed(4)} J 应对准 ${wantE.toFixed(4)} J`,
    );
  }
  if (Math.abs(u.hide1T - PENDULUM_HIDE_SEC) > HIDE_TOL) {
    throw new Error(
      `${name} ${label} Trial ${trialIndex + 1}: hide1T 应为 ${PENDULUM_HIDE_SEC} s`,
    );
  }
  const p: PendulumParams = {
    theta0Rad: (u.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (u.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: u.rodLengthM,
    gravity: u.gravity,
  };
  const regime = pendulumRegime(wantE, u.rodLengthM, u.gravity);
  const thetaMax = pendulumThetaMaxRad(wantE, u.rodLengthM, u.gravity);
  const half = TARGET_THETA_END_FRAC * thetaMax;
  const actualEnd = pendulumThetaAtSimEnd(p, u);
  if (actualEnd < -half - END_ANGLE_MARGIN_RAD || actualEnd > half + END_ANGLE_MARGIN_RAD) {
    throw new Error(
      `${name} ${label} Trial ${trialIndex + 1}: 终态角 ${((actualEnd * 180) / Math.PI).toFixed(2)}° 超出 [-0.7θ_max,0.7θ_max]`,
    );
  }
  return actualEnd;
}

function assertSegmentTrials(
  name: string,
  label: string,
  children: { units: { type: string }[] }[],
  wantE: number,
): void {
  if (children.length !== TRIALS_PER_SEGMENT) {
    throw new Error(`${name} ${label}: 应有 ${TRIALS_PER_SEGMENT} 个 Trial，实际 ${children.length}`);
  }
  const t0 = children[0]!.units.find((u) => u.type === "pendulumPractice");
  if (!t0) throw new Error(`${name} ${label} Trial 1: 应为 pendulumPractice`);
  for (let j = 1; j < TRIALS_PER_SEGMENT; j++) {
    const stim = children[j]!.units.find((u) => u.type === "pendulumStimulus");
    if (!stim) throw new Error(`${name} ${label} Trial ${j + 1}: 应为 pendulumStimulus`);
  }
  const ends: number[] = [];
  for (let j = 0; j < TRIALS_PER_SEGMENT; j++) {
    const u = timedUnitInTrial(children[j]!);
    if (!u) throw new Error(`${name} ${label} Trial ${j + 1}: 缺少摆球单元`);
    ends.push(assertTimedUnitPhysics(name, label, j, u, wantE));
    if (children[j]!.units.some((x) => x.type === "pendulumDisplay")) {
      throw new Error(`${name} ${label} Trial ${j + 1}: 不应含 pendulumDisplay`);
    }
  }
  const spread = Math.max(...ends) - Math.min(...ends);
  if (spread < 1e-6) {
    console.warn(`${name} ${label}: 6 个 Trial 终态角几乎相同（spread=${spread}）`);
  }
}

function scanStimulusFile(name: string): void {
  const path = join(ROOT, name);
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const set = parseExperimentStimulusSet(raw);
  if (!set) throw new Error(`${name}: 解析失败`);

  const practice = set.sequence.find((s) => s.kind === "practice") as PracticeSegment | undefined;
  if (!practice) throw new Error(`${name}: 缺少 Practice 段`);
  assertSegmentTrials(name, "Practice", practice.children, PRACTICE_ENERGY_J);

  const blocks = set.sequence.filter((s) => s.kind === "block") as BlockSegment[];
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b]!;
    const stim = block.children
      .flatMap((t) => t.units)
      .find((u): u is PendulumStimulusUnit => u.type === "pendulumStimulus");
    if (!stim) throw new Error(`${name} Block ${b + 1}: 缺少 pendulumStimulus`);
    const wantE = energyFromPendulumStimulus(stim);
    assertSegmentTrials(name, `Block ${b + 1}`, block.children, wantE);
  }
  console.log(`OK: ${name} — Practice + ${blocks.length} 个 Block（各 6 Trial、hide=0.5 s、终态角区间）`);
}

function main(): void {
  assertFormulaTests();
  for (let i = 1; i <= 5; i++) {
    scanStimulusFile(`stimulus-${String(i).padStart(2, "0")}.json`);
  }
  console.log("全部校验通过。");
}

main();
