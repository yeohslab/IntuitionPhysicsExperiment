/**
 * 生成 5 份固定种子的摆球刺激集（schema 5，连续估计）到 stimulate/。
 * 运行：npm run generate-stimulate
 *
 * 规则：全局能量 [1.96, 156.8] J 等分为 26 段，剔除含临界能量 Ec=2mgl 的 1 段；
 * 剩余 25 段各对应 1 个 Block，每 Block 1 个观察 Trial + 5 个正式 Trial，目标能量为段中点；
 * Practice 段：同区间等分 11 段、剔除含 Ec 的 1 段，10 个 Trial 各取保留段中点；
 * 每 Trial 一个 pendulumStimulus（rodLengthM=4, g=9.8）；时序随机；θ、ω 符号平衡；能量容差 1e-3 J。
 * 叠加欢迎/任务 Rest、练习说明、Block 前休息、注视点（见 stimulate/instruction-template.json）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleFullSequence,
  energyFromPendulumDisplay,
  loadInstructionTemplate,
  type PhysicsOnlySet,
} from "./lib/stimulateSequenceOverlay.ts";
import {
  STIMULUS_SET_SCHEMA_VERSION,
  type BlockSegment,
  type ExperimentStimulusSet,
  type PendulumDisplayUnit,
  type PendulumStimulusUnit,
  type PracticeSegment,
  type Trial,
} from "../src/types/experiment.ts";
import {
  analyzePendulum,
  pendulumCriticalEnergy,
  pendulumEnergy,
  pendulumRegime,
  type PendulumParams,
} from "../src/physics/pendulum.ts";
import { randomStimulusTiming, withSyncedTotalTimeT } from "../src/physics/timePhases.ts";
import { parseExperimentStimulusSet, validateRunnableSet } from "../src/shared/storage.ts";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "stimulate");

const GLOBAL_E_MIN = 1.96;
const GLOBAL_E_MAX = 156.8;
const ROD_LENGTH_M = 4;
const GRAVITY = 9.8;
const M = 1;
const NUM_BLOCK_SEGMENTS = 26;
const FORMAL_TRIALS_PER_BLOCK = 5;
const TRIALS_PER_BLOCK = FORMAL_TRIALS_PER_BLOCK + 1;
const NUM_BLOCKS = 25;
const NUM_PRACTICE_SEGMENTS = 11;
const NUM_PRACTICE_TRIALS = 10;

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

function energyFromUnit(u: PendulumStimulusUnit): number {
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

/** 等分后剔除含 Ec 的段，返回保留段及其中点能量 */
export function buildKeptEnergySegments(
  numSegments: number,
  expectedCount: number,
): KeptEnergySegment[] {
  const edges = buildEnergyEdges(numSegments);
  const Ec = pendulumCriticalEnergy(ROD_LENGTH_M, GRAVITY);
  const kept: KeptEnergySegment[] = [];
  for (let i = 0; i < numSegments; i++) {
    const Emin = edges[i]!;
    const Emax = edges[i + 1]!;
    const spansCritical = Emin <= Ec && Ec <= Emax;
    if (!spansCritical) {
      kept.push({ index: i, Emin, Emax, Emid: 0.5 * (Emin + Emax) });
    }
  }
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

export function buildPracticeKeptEnergySegments(): KeptEnergySegment[] {
  return buildKeptEnergySegments(NUM_PRACTICE_SEGMENTS, NUM_PRACTICE_TRIALS);
}

/**
 * 随机 (θ, ω) 使 E = ½m(lω)² + mgl(1−cosθ)，m=1。
 */
function sampleStateForEnergy(E: number, l: number, g: number, rng: () => number): { thetaRad: number; omegaRad: number } {
  const mgl = M * g * l;
  for (let attempt = 0; attempt < 40000; attempt++) {
    const thetaRad = (rng() * 2 - 1) * Math.PI;
    const U = mgl * (1 - Math.cos(thetaRad));
    const K = E - U;
    if (K < -1e-8) continue;
    const Kclamped = Math.max(0, K);
    const omegaAbs = Math.sqrt(2 * Kclamped) / l;
    const omegaRad = omegaAbs * (rng() < 0.5 ? -1 : 1);
    const Echeck = 0.5 * M * (l * omegaRad) ** 2 + mgl * (1 - Math.cos(thetaRad));
    const eTol = 1e-9 * Math.max(1, Math.abs(E));
    if (Math.abs(Echeck - E) > eTol) continue;
    return { thetaRad, omegaRad };
  }
  throw new Error(`无法在足够尝试内采样能量 E=${E} J（l=${l}, g=${g}）`);
}

function makePendulumStimulus(
  id: string,
  thetaRad: number,
  omegaRad: number,
  l: number,
  g: number,
  rng: () => number,
): PendulumStimulusUnit {
  const theta0Deg = Math.round(((thetaRad * 180) / Math.PI) * 1e10) / 1e10;
  const omega0DegPerSec = Math.round(((omegaRad * 180) / Math.PI) * 1e10) / 1e10;
  const p: PendulumParams = {
    theta0Rad: (theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (omega0DegPerSec * Math.PI) / 180,
    rodLengthM: l,
    gravity: g,
  };
  const periodSec = analyzePendulum(p).T;
  const draft = {
    id,
    type: "pendulumStimulus" as const,
    theta0Deg,
    omega0DegPerSec,
    rodLengthM: l,
    gravity: g,
    totalTimeT: 0,
    ...randomStimulusTiming(rng),
  };
  return withSyncedTotalTimeT(draft, periodSec);
}

function balancePendulumSigns(units: PendulumStimulusUnit[]): void {
  const TOL = 1e-9;
  const balanceAxis = (
    get: (u: PendulumStimulusUnit) => number,
    flip: (u: PendulumStimulusUnit) => void,
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
    },
  );
  balanceAxis(
    (u) => u.omega0DegPerSec,
    (u) => {
      u.omega0DegPerSec *= -1;
    },
  );
}

function collectPendulumStimuli(set: ExperimentStimulusSet): PendulumStimulusUnit[] {
  const out: PendulumStimulusUnit[] = [];
  for (const seg of set.sequence) {
    if (seg.kind === "practice" || seg.kind === "block") {
      for (const t of seg.children) {
        for (const u of t.units) {
          if (u.type === "pendulumStimulus") out.push(u);
        }
      }
    }
  }
  return out;
}

type ExpectedRow = { unit: PendulumStimulusUnit; expectedE: number };

function pendulumInTrial(trial: Trial): PendulumStimulusUnit | null {
  const u = trial.units.find((x) => x.type === "pendulumStimulus");
  return u?.type === "pendulumStimulus" ? u : null;
}

function assertPhysicsTargets(
  physics: PhysicsOnlySet,
  blockKept: KeptEnergySegment[],
  practiceKept: KeptEnergySegment[],
): void {
  if (physics.practice.children.length !== NUM_PRACTICE_TRIALS) {
    throw new Error(`Practice 应含 ${NUM_PRACTICE_TRIALS} 个 Trial`);
  }
  for (let j = 0; j < NUM_PRACTICE_TRIALS; j++) {
    const u = pendulumInTrial(physics.practice.children[j]!);
    if (!u) throw new Error(`Practice Trial ${j + 1} 缺少 pendulumStimulus`);
    const want = practiceKept[j]!.Emid;
    if (Math.abs(energyFromUnit(u) - want) > 2e-3) {
      throw new Error(`Practice Trial ${j + 1} 能量应对准 ${want} J（段 ${practiceKept[j]!.index}）`);
    }
  }
  if (physics.blocks.length !== NUM_BLOCKS) {
    throw new Error(`应有 ${NUM_BLOCKS} 个 Block，实际 ${physics.blocks.length}`);
  }
  for (let b = 0; b < NUM_BLOCKS; b++) {
    const seg = physics.blocks[b]!;
    const segMeta = blockKept[b]!;
    if (seg.children.length !== FORMAL_TRIALS_PER_BLOCK) {
      throw new Error(`Block ${b + 1} 应含 ${FORMAL_TRIALS_PER_BLOCK} 个正式 Trial`);
    }
    const want = segMeta.Emid;
    for (let k = 0; k < FORMAL_TRIALS_PER_BLOCK; k++) {
      const u = pendulumInTrial(seg.children[k]!);
      if (!u) throw new Error(`Block ${b + 1} Trial ${k + 1} 缺少 pendulumStimulus`);
      if (Math.abs(energyFromUnit(u) - want) > 2e-3) {
        throw new Error(`Block ${b + 1} Trial ${k + 1} 能量应对准 ${want} J（段 ${segMeta.index}）`);
      }
    }
  }
}

function assertFullSequenceShape(set: ExperimentStimulusSet): void {
  const expectedLen = 3 + NUM_BLOCKS * 2;
  if (set.sequence.length !== expectedLen) {
    throw new Error(
      `sequence 长度应为 ${expectedLen}（欢迎 Rest + Practice + 任务 Rest + ${NUM_BLOCKS}×(BlockRest+Block)），实际 ${set.sequence.length}`,
    );
  }
  if (set.sequence[0]?.kind !== "rest") throw new Error("sequence[0] 应为欢迎 Rest");
  const practice = set.sequence[1];
  if (!practice || practice.kind !== "practice") throw new Error("sequence[1] 应为 Practice");
  if (practice.children.length !== NUM_PRACTICE_TRIALS) {
    throw new Error(`Practice 应含 ${NUM_PRACTICE_TRIALS} 个 Trial`);
  }
  if (set.sequence[2]?.kind !== "rest") throw new Error("sequence[2] 应为任务 Rest");

  for (let j = 0; j < NUM_PRACTICE_TRIALS; j++) {
    const units = practice.children[j]!.units;
    const pIdx = units.findIndex((u) => u.type === "pendulumStimulus");
    if (pIdx < 1) throw new Error(`Practice Trial ${j + 1} 缺少注视点或摆球刺激`);
    if (units[pIdx - 1]?.type !== "textDisplay" || units[pIdx - 1]?.text !== "+") {
      throw new Error(`Practice Trial ${j + 1} 注视点应为 textDisplay "+"`);
    }
  }

  for (let b = 0; b < NUM_BLOCKS; b++) {
    const restIdx = 3 + b * 2;
    const blockIdx = restIdx + 1;
    if (set.sequence[restIdx]?.kind !== "rest") {
      throw new Error(`Block ${b + 1} 前应为 Rest（进度提示）`);
    }
    const block = set.sequence[blockIdx];
    if (!block || block.kind !== "block" || block.children.length !== TRIALS_PER_BLOCK) {
      throw new Error(`Block ${b + 1} 应含 ${TRIALS_PER_BLOCK} 个 Trial（1 观察 + ${FORMAL_TRIALS_PER_BLOCK} 正式）`);
    }

    const obs = block.children[0]!;
    const disp = obs.units.find((u): u is PendulumDisplayUnit => u.type === "pendulumDisplay");
    if (!disp) throw new Error(`Block ${b + 1} 观察 Trial 缺少 pendulumDisplay`);
    if (obs.units[0]?.type !== "textControl" || obs.units[2]?.type !== "textControl") {
      throw new Error(`Block ${b + 1} 观察 Trial 应为 textControl → pendulumDisplay → textControl`);
    }
    const formalStim = pendulumInTrial(block.children[1]!);
    if (!formalStim) throw new Error(`Block ${b + 1} 缺少首个正式 pendulumStimulus`);
    const wantE = energyFromUnit(formalStim);
    if (Math.abs(energyFromPendulumDisplay(disp) - wantE) > 2e-3) {
      throw new Error(`Block ${b + 1} 观察摆球能量应对准 ${wantE} J`);
    }
    if (disp.theta0Deg !== 0 || disp.displayTimeT !== 2) {
      throw new Error(`Block ${b + 1} 观察摆球应为 θ₀=0、displayTimeT=2`);
    }

    for (let k = 1; k <= FORMAL_TRIALS_PER_BLOCK; k++) {
      const units = block.children[k]!.units;
      const pIdx = units.findIndex((u) => u.type === "pendulumStimulus");
      if (pIdx < 1 || units[pIdx - 1]?.text !== "+") {
        throw new Error(`Block ${b + 1} 正式 Trial ${k} 缺少注视点 "+"`);
      }
    }
  }
}

function buildPhysicsSet(fileIdx: number, seed: number): {
  physics: PhysicsOnlySet;
  expected: ExpectedRow[];
  blockKept: KeptEnergySegment[];
  practiceKept: KeptEnergySegment[];
} {
  const rng = mulberry32(seed >>> 0);
  const id = createIdFactory(fileIdx, seed);
  const expected: ExpectedRow[] = [];
  const blockKept = buildBlockKeptEnergySegments();
  const practiceKept = buildPracticeKeptEnergySegments();

  const pushTrial = (E: number): Trial => {
    const { thetaRad, omegaRad } = sampleStateForEnergy(E, ROD_LENGTH_M, GRAVITY, rng);
    const uid = id();
    const unit = makePendulumStimulus(uid, thetaRad, omegaRad, ROD_LENGTH_M, GRAVITY, rng);
    expected.push({ unit, expectedE: E });
    return { id: id(), units: [unit] };
  };

  const practiceId = id();
  const practiceChildren: Trial[] = practiceKept.map((seg) => pushTrial(seg.Emid));
  const practice: PracticeSegment = { kind: "practice", id: practiceId, children: practiceChildren };

  const blocks: BlockSegment[] = blockKept.map((seg) => {
    const trials: Trial[] = [];
    for (let k = 0; k < FORMAL_TRIALS_PER_BLOCK; k++) {
      trials.push(pushTrial(seg.Emid));
    }
    return { kind: "block", id: id(), children: trials };
  });

  const physics: PhysicsOnlySet = { practice, blocks };

  const tempSet: ExperimentStimulusSet = {
    schemaVersion: STIMULUS_SET_SCHEMA_VERSION,
    sequence: [practice, ...blocks],
  };
  balancePendulumSigns(collectPendulumStimuli(tempSet));
  assertPhysicsTargets(physics, blockKept, practiceKept);

  const TOL = 1e-3;
  for (const { unit, expectedE } of expected) {
    const actual = energyFromUnit(unit);
    if (Math.abs(actual - expectedE) > TOL) {
      throw new Error(
        `能量偏差过大: 期望 ${expectedE} J, 实际 ${actual.toFixed(4)} J（平衡后）`,
      );
    }
  }

  return { physics, expected, blockKept, practiceKept };
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
