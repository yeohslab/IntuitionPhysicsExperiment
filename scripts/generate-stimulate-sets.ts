/**
 * 生成 5 份固定种子的摆球刺激集（schema 5，连续估计）到 stimulate/。
 * 运行：npm run generate-stimulate
 *
 * 规则：全局能量 [1.96, Ec] J（Ec=2mgl）等分为 26 段，剔除距 Ec 最近的 1 段；
 * 剩余 25 段各对应 1 个 Block，每 Block 1×pendulumPractice + 5×pendulumStimulus，目标能量为段中点；
 * Practice 段：1×pendulumPractice + 5×pendulumStimulus，能量 (1.96+Ec)/2；
 * 每单元：固定 E、目标终态角 ∈ [-0.7θ_max,0.7θ_max]，随机 show1T 与初态拟合至终态角；
 * hide1T 固定 0.5 s。叠加欢迎 Rest（两屏指导语）、练习说明、Block 前休息、注视点。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleFullSequence,
  loadInstructionTemplate,
  type PhysicsOnlySet,
} from "./lib/stimulateSequenceOverlay.ts";
import {
  STIMULUS_SET_SCHEMA_VERSION,
  type BlockSegment,
  type ExperimentStimulusSet,
  type PendulumPracticeUnit,
  type PendulumStimulusUnit,
  type PracticeSegment,
  type Trial,
} from "../src/types/experiment.ts";
import {
  pendulumCriticalEnergy,
  pendulumEnergy,
  pendulumRegime,
  type PendulumParams,
} from "../src/physics/pendulum.ts";
import {
  assertUnitSimEndTheta,
  fitPendulumTimedUnit,
  sampleTargetSimEndThetaRad,
  TARGET_THETA_END_FRAC,
  pendulumThetaMaxRad,
} from "../src/physics/pendulumUnitFit.ts";
import { PENDULUM_HIDE_SEC } from "../src/physics/timePhases.ts";
import { parseExperimentStimulusSet, validateRunnableSet } from "../src/shared/storage.ts";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "stimulate");

const GLOBAL_E_MIN = 1.96;
const ROD_LENGTH_M = 4;
const GRAVITY = 9.8;
const GLOBAL_E_MAX = pendulumCriticalEnergy(ROD_LENGTH_M, GRAVITY);
const NUM_BLOCK_SEGMENTS = 26;
const STIMULUS_TRIALS_PER_SEGMENT = 5;
const TRIALS_PER_BLOCK = 1 + STIMULUS_TRIALS_PER_SEGMENT;
const NUM_BLOCKS = 25;
const PRACTICE_TRIALS = TRIALS_PER_BLOCK;
const PRACTICE_ENERGY_J = (GLOBAL_E_MIN + GLOBAL_E_MAX) / 2;
const HIDE_TOL = 1e-6;

export interface KeptEnergySegment {
  index: number;
  Emin: number;
  Emax: number;
  Emid: number;
}

/** Mulberry32 PRNG */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createIdFactory(fileIdx: number, seed: number): () => string {
  let n = 0;
  return () => `stim-f${fileIdx}-s${seed}-n${(++n).toString(36)}`;
}

type PendulumTimedUnit = PendulumStimulusUnit | PendulumPracticeUnit;

function energyFromUnit(u: PendulumTimedUnit): number {
  const p: PendulumParams = {
    theta0Rad: (u.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (u.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: u.rodLengthM,
    gravity: u.gravity,
  };
  return pendulumEnergy(p);
}

function buildEnergyEdges(numSegments: number): number[] {
  return Array.from(
    { length: numSegments + 1 },
    (_, i) => GLOBAL_E_MIN + (i / numSegments) * (GLOBAL_E_MAX - GLOBAL_E_MIN),
  );
}

function distanceToEnergySegment(Ec: number, Emin: number, Emax: number): number {
  if (Emin <= Ec && Ec <= Emax) return 0;
  return Math.min(Math.abs(Ec - Emin), Math.abs(Ec - Emax));
}

/** 等分后剔除距 Ec 最近的一段，返回保留段及其中点能量 */
export function buildKeptEnergySegments(
  numSegments: number,
  expectedCount: number,
): KeptEnergySegment[] {
  const edges = buildEnergyEdges(numSegments);
  const Ec = pendulumCriticalEnergy(ROD_LENGTH_M, GRAVITY);
  const all: KeptEnergySegment[] = [];
  for (let i = 0; i < numSegments; i++) {
    const Emin = edges[i]!;
    const Emax = edges[i + 1]!;
    all.push({ index: i, Emin, Emax, Emid: 0.5 * (Emin + Emax) });
  }
  let dropIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < all.length; i++) {
    const seg = all[i]!;
    const dist = distanceToEnergySegment(Ec, seg.Emin, seg.Emax);
    if (dist < bestDist || (dist === bestDist && i > dropIdx)) {
      bestDist = dist;
      dropIdx = i;
    }
  }
  const kept = all.filter((_, i) => i !== dropIdx);
  if (kept.length !== expectedCount) {
    throw new Error(
      `保留能量段应为 ${expectedCount}（${numSegments} 等分），实际 ${kept.length}（Ec=${Ec} J，全局 [${GLOBAL_E_MIN}, ${GLOBAL_E_MAX}]）`,
    );
  }
  for (const seg of kept) {
    if (pendulumRegime(seg.Emid, ROD_LENGTH_M, GRAVITY) === "critical") {
      throw new Error(`段 ${seg.index} 中点 ${seg.Emid} J 仍为临界能量`);
    }
  }
  return kept;
}

export function buildBlockKeptEnergySegments(): KeptEnergySegment[] {
  return buildKeptEnergySegments(NUM_BLOCK_SEGMENTS, NUM_BLOCKS);
}

function makePendulumStimulus(
  id: string,
  E: number,
  targetThetaEndRad: number,
  rng: () => number,
): { unit: PendulumStimulusUnit; targetThetaEndRad: number } {
  const fitted = fitPendulumTimedUnit({
    targetEnergyJ: E,
    targetThetaEndRad,
    rodLengthM: ROD_LENGTH_M,
    gravity: GRAVITY,
    rng,
  });
  const { targetThetaEndRad: _t, ...fields } = fitted;
  return { unit: { id, type: "pendulumStimulus", ...fields }, targetThetaEndRad };
}

function makePendulumPractice(
  id: string,
  E: number,
  targetThetaEndRad: number,
  rng: () => number,
): { unit: PendulumPracticeUnit; targetThetaEndRad: number } {
  const fitted = fitPendulumTimedUnit({
    targetEnergyJ: E,
    targetThetaEndRad,
    rodLengthM: ROD_LENGTH_M,
    gravity: GRAVITY,
    rng,
  });
  const { targetThetaEndRad: _t, ...fields } = fitted;
  return { unit: { id, type: "pendulumPractice", ...fields }, targetThetaEndRad };
}

/** 成对翻转 (θ,ω) 以平衡符号且保持能量 */
function balancePendulumSigns(units: PendulumTimedUnit[]): void {
  const TOL = 1e-9;
  const balanceAxis = (
    get: (u: PendulumTimedUnit) => number,
    flip: (u: PendulumTimedUnit) => void,
  ): void => {
    const count = (): { pos: number; neg: number } => {
      let pos = 0;
      let neg = 0;
      for (const u of units) {
        const v = get(u);
        if (v > TOL) pos += 1;
        else if (v < -TOL) neg += 1;
      }
      return { pos, neg };
    };
    let { pos, neg } = count();
    while (pos > neg + 1) {
      const u = units.find((x) => get(x) > TOL);
      if (!u) break;
      flip(u);
      ({ pos, neg } = count());
    }
    while (neg > pos + 1) {
      const u = units.find((x) => get(x) < -TOL);
      if (!u) break;
      flip(u);
      ({ pos, neg } = count());
    }
  };
  balanceAxis(
    (u) => u.theta0Deg,
    (u) => {
      u.theta0Deg *= -1;
      u.omega0DegPerSec *= -1;
    },
  );
  balanceAxis(
    (u) => u.omega0DegPerSec,
    (u) => {
      u.theta0Deg *= -1;
      u.omega0DegPerSec *= -1;
    },
  );
}

function collectPendulumTimedUnits(set: ExperimentStimulusSet): PendulumTimedUnit[] {
  const out: PendulumTimedUnit[] = [];
  for (const seg of set.sequence) {
    if (seg.kind === "practice" || seg.kind === "block") {
      for (const t of seg.children) {
        for (const u of t.units) {
          if (u.type === "pendulumStimulus" || u.type === "pendulumPractice") out.push(u);
        }
      }
    }
  }
  return out;
}

type ExpectedRow = {
  unit: PendulumTimedUnit;
  expectedE: number;
  targetThetaEndRad: number;
};

function pendulumStimulusInTrial(trial: Trial): PendulumStimulusUnit | null {
  const u = trial.units.find((x) => x.type === "pendulumStimulus");
  return u?.type === "pendulumStimulus" ? u : null;
}

function pendulumPracticeInTrial(trial: Trial): PendulumPracticeUnit | null {
  const u = trial.units.find((x) => x.type === "pendulumPractice");
  return u?.type === "pendulumPractice" ? u : null;
}

function assertTimedUnitFits(
  u: PendulumTimedUnit,
  expectedE: number,
  targetThetaEndRad: number,
): void {
  assertUnitSimEndTheta(u, expectedE, targetThetaEndRad);
  const thetaMax = pendulumThetaMaxRad(expectedE, u.rodLengthM, u.gravity);
  const half = TARGET_THETA_END_FRAC * thetaMax;
  if (
    targetThetaEndRad < -half - 1e-9 ||
    targetThetaEndRad > half + 1e-9
  ) {
    throw new Error(`目标终态角 ${targetThetaEndRad} 超出采样区间`);
  }
}

function assertPhysicsTargets(
  physics: PhysicsOnlySet,
  blockKept: KeptEnergySegment[],
  expected: ExpectedRow[],
): void {
  if (physics.practice.children.length !== PRACTICE_TRIALS) {
    throw new Error(`Practice 应含 ${PRACTICE_TRIALS} 个 Trial`);
  }
  const p0 = pendulumPracticeInTrial(physics.practice.children[0]!);
  if (!p0) throw new Error("Practice Trial 1 应为 pendulumPractice");
  if (Math.abs(energyFromUnit(p0) - PRACTICE_ENERGY_J) > 2e-3) {
    throw new Error(`Practice Trial 1 能量应对准 ${PRACTICE_ENERGY_J} J`);
  }
  for (let j = 1; j < PRACTICE_TRIALS; j++) {
    const u = pendulumStimulusInTrial(physics.practice.children[j]!);
    if (!u) throw new Error(`Practice Trial ${j + 1} 应为 pendulumStimulus`);
    if (Math.abs(energyFromUnit(u) - PRACTICE_ENERGY_J) > 2e-3) {
      throw new Error(`Practice Trial ${j + 1} 能量应对准 ${PRACTICE_ENERGY_J} J`);
    }
  }
  if (physics.blocks.length !== NUM_BLOCKS) {
    throw new Error(`应有 ${NUM_BLOCKS} 个 Block，实际 ${physics.blocks.length}`);
  }
  for (let b = 0; b < NUM_BLOCKS; b++) {
    const seg = physics.blocks[b]!;
    const segMeta = blockKept[b]!;
    if (seg.children.length !== TRIALS_PER_BLOCK) {
      throw new Error(`Block ${b + 1} 应含 ${TRIALS_PER_BLOCK} 个 Trial`);
    }
    const want = segMeta.Emid;
    const bp = pendulumPracticeInTrial(seg.children[0]!);
    if (!bp) throw new Error(`Block ${b + 1} Trial 1 应为 pendulumPractice`);
    if (Math.abs(energyFromUnit(bp) - want) > 2e-3) {
      throw new Error(`Block ${b + 1} 练习 Trial 能量应对准 ${want} J（段 ${segMeta.index}）`);
    }
    for (let k = 1; k < TRIALS_PER_BLOCK; k++) {
      const u = pendulumStimulusInTrial(seg.children[k]!);
      if (!u) throw new Error(`Block ${b + 1} Trial ${k + 1} 应为 pendulumStimulus`);
      if (Math.abs(energyFromUnit(u) - want) > 2e-3) {
        throw new Error(`Block ${b + 1} Trial ${k + 1} 能量应对准 ${want} J（段 ${segMeta.index}）`);
      }
    }
  }

  for (const row of expected) {
    assertTimedUnitFits(row.unit, row.expectedE, row.targetThetaEndRad);
  }
}

function assertPendulumHideTimes(set: ExperimentStimulusSet): void {
  for (const seg of set.sequence) {
    if (seg.kind !== "practice" && seg.kind !== "block") continue;
    for (const trial of seg.children) {
      for (const u of trial.units) {
        if (u.type !== "pendulumStimulus" && u.type !== "pendulumPractice") continue;
        if (Math.abs(u.hide1T - PENDULUM_HIDE_SEC) > HIDE_TOL) {
          throw new Error(`hide1T 应为 ${PENDULUM_HIDE_SEC} s，实际 ${u.hide1T}`);
        }
      }
    }
  }
}

function assertFullSequenceShape(set: ExperimentStimulusSet): void {
  const expectedLen = 2 + NUM_BLOCKS * 2;
  if (set.sequence.length !== expectedLen) {
    throw new Error(
      `sequence 长度应为 ${expectedLen}（欢迎 Rest + Practice + ${NUM_BLOCKS}×(BlockRest+Block)），实际 ${set.sequence.length}`,
    );
  }
  const welcome = set.sequence[0];
  if (welcome?.kind !== "rest") throw new Error("sequence[0] 应为欢迎 Rest");
  if (welcome.units.length !== 2 || welcome.units.some((u) => u.type !== "textControl")) {
    throw new Error("欢迎 Rest 应含 2 个 textControl 指导语");
  }
  const practice = set.sequence[1];
  if (!practice || practice.kind !== "practice") throw new Error("sequence[1] 应为 Practice");
  if (practice.children.length !== PRACTICE_TRIALS) {
    throw new Error(`Practice 应含 ${PRACTICE_TRIALS} 个 Trial`);
  }

  if (!pendulumPracticeInTrial(practice.children[0]!)) {
    throw new Error("Practice Trial 1 应为 pendulumPractice");
  }
  for (let j = 1; j < PRACTICE_TRIALS; j++) {
    if (!pendulumStimulusInTrial(practice.children[j]!)) {
      throw new Error(`Practice Trial ${j + 1} 应为 pendulumStimulus`);
    }
  }
  for (let j = 0; j < PRACTICE_TRIALS; j++) {
    const units = practice.children[j]!.units;
    const timedIdx = units.findIndex(
      (u) => u.type === "pendulumPractice" || u.type === "pendulumStimulus",
    );
    if (timedIdx < 1 || units[timedIdx - 1]?.text !== "+") {
      throw new Error(`Practice Trial ${j + 1} 缺少注视点 "+"`);
    }
  }

  for (let b = 0; b < NUM_BLOCKS; b++) {
    const restIdx = 2 + b * 2;
    const blockIdx = restIdx + 1;
    if (set.sequence[restIdx]?.kind !== "rest") {
      throw new Error(`Block ${b + 1} 前应为 Rest（进度提示）`);
    }
    const block = set.sequence[blockIdx];
    if (!block || block.kind !== "block" || block.children.length !== TRIALS_PER_BLOCK) {
      throw new Error(
        `Block ${b + 1} 应含 ${TRIALS_PER_BLOCK} 个 Trial（1 练习 + ${STIMULUS_TRIALS_PER_SEGMENT} 刺激）`,
      );
    }
    if (!pendulumPracticeInTrial(block.children[0]!)) {
      throw new Error(`Block ${b + 1} Trial 1 应为 pendulumPractice`);
    }
    for (let k = 1; k < TRIALS_PER_BLOCK; k++) {
      if (!pendulumStimulusInTrial(block.children[k]!)) {
        throw new Error(`Block ${b + 1} Trial ${k + 1} 应为 pendulumStimulus`);
      }
    }
    for (let k = 0; k < TRIALS_PER_BLOCK; k++) {
      const units = block.children[k]!.units;
      const timedIdx = units.findIndex(
        (u) => u.type === "pendulumPractice" || u.type === "pendulumStimulus",
      );
      if (timedIdx < 1 || units[timedIdx - 1]?.text !== "+") {
        throw new Error(`Block ${b + 1} Trial ${k + 1} 缺少注视点 "+"`);
      }
      if (units.some((u) => u.type === "pendulumDisplay")) {
        throw new Error(`Block ${b + 1} Trial ${k + 1} 不应含 pendulumDisplay`);
      }
    }
  }
  assertPendulumHideTimes(set);
}

function buildPhysicsSet(fileIdx: number, seed: number): {
  physics: PhysicsOnlySet;
  expected: ExpectedRow[];
  blockKept: KeptEnergySegment[];
} {
  const rng = mulberry32(seed >>> 0);
  const id = createIdFactory(fileIdx, seed);
  const expected: ExpectedRow[] = [];
  const blockKept = buildBlockKeptEnergySegments();

  const pushStimulusTrial = (E: number): Trial => {
    const targetThetaEndRad = sampleTargetSimEndThetaRad(E, ROD_LENGTH_M, GRAVITY, rng);
    const uid = id();
    const { unit, targetThetaEndRad: target } = makePendulumStimulus(uid, E, targetThetaEndRad, rng);
    expected.push({ unit, expectedE: E, targetThetaEndRad: target });
    return { id: id(), units: [unit] };
  };

  const pushPracticeTrial = (E: number): Trial => {
    const targetThetaEndRad = sampleTargetSimEndThetaRad(E, ROD_LENGTH_M, GRAVITY, rng);
    const uid = id();
    const { unit, targetThetaEndRad: target } = makePendulumPractice(uid, E, targetThetaEndRad, rng);
    expected.push({ unit, expectedE: E, targetThetaEndRad: target });
    return { id: id(), units: [unit] };
  };

  const practiceId = id();
  const practiceChildren: Trial[] = [
    pushPracticeTrial(PRACTICE_ENERGY_J),
    ...Array.from({ length: STIMULUS_TRIALS_PER_SEGMENT }, () =>
      pushStimulusTrial(PRACTICE_ENERGY_J),
    ),
  ];
  const practice: PracticeSegment = { kind: "practice", id: practiceId, children: practiceChildren };

  const blocks: BlockSegment[] = blockKept.map((seg) => {
    const trials: Trial[] = [
      pushPracticeTrial(seg.Emid),
      ...Array.from({ length: STIMULUS_TRIALS_PER_SEGMENT }, () => pushStimulusTrial(seg.Emid)),
    ];
    return { kind: "block", id: id(), children: trials };
  });

  const physics: PhysicsOnlySet = { practice, blocks };

  const tempSet: ExperimentStimulusSet = {
    schemaVersion: STIMULUS_SET_SCHEMA_VERSION,
    sequence: [practice, ...blocks],
  };
  assertPhysicsTargets(physics, blockKept, expected);
  balancePendulumSigns(collectPendulumTimedUnits(tempSet));

  const TOL = 1e-3;
  for (const { unit, expectedE } of expected) {
    const actual = energyFromUnit(unit);
    if (Math.abs(actual - expectedE) > TOL) {
      throw new Error(
        `能量偏差过大: 期望 ${expectedE} J, 实际 ${actual.toFixed(4)} J（平衡后）`,
      );
    }
  }

  return { physics, expected, blockKept };
}

function buildSet(fileIdx: number, seed: number): ExperimentStimulusSet {
  const tpl = loadInstructionTemplate();
  const { physics } = buildPhysicsSet(fileIdx, seed);
  const sequence = assembleFullSequence(physics, tpl);
  const set: ExperimentStimulusSet = {
    schemaVersion: STIMULUS_SET_SCHEMA_VERSION,
    sequence,
  };
  assertFullSequenceShape(set);
  return set;
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const seeds = [91001, 91002, 91003, 91004, 91005] as const;

  for (let i = 0; i < seeds.length; i++) {
    const fileIdx = i + 1;
    const seed = seeds[i]!;
    const set = buildSet(fileIdx, seed);
    const path = join(OUT_DIR, `stimulus-${String(fileIdx).padStart(2, "0")}.json`);
    writeFileSync(path, `${JSON.stringify(set, null, 2)}\n`, "utf8");

    const parsed = parseExperimentStimulusSet(JSON.parse(JSON.stringify(set)) as unknown);
    if (!parsed) throw new Error(`解析失败: ${path}`);
    const err = validateRunnableSet(parsed);
    if (err) throw new Error(`${path}: ${err}`);
  }

  console.log(`Wrote ${seeds.length} files to ${OUT_DIR}`);
}

main();
