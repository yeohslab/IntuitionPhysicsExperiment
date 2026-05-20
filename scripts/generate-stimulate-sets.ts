/**
 * 生成 5 份固定种子的摆球刺激集（schema 3）到 stimulate/。
 * 运行：npm run generate-stimulate
 *
 * 规则：全局能量 [1.96, 156.8] J；Practice 段（在全部 Block 之前）3 个 Trial，能量 1.96 / 79.38 / 156.8 J；
 * 10 个 Block 平分全局能量为 10 段；每 Block 15 个 Trial，能量在该段内 k/14 等距；每 Trial 一个 pendulumStimulus；
 * rodLengthM=4, g=9.8；生成后做 θ、ω 符号平衡；能量校验容差 1e-3 J。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STIMULUS_SET_SCHEMA_VERSION,
  type BlockSegment,
  type ExperimentStimulusSet,
  type PendulumStimulusUnit,
  type PracticeSegment,
  type Trial,
} from "../src/types/experiment.ts";
import { pendulumEnergy, type PendulumParams } from "../src/physics/pendulum.ts";
import { withSyncedTotalTimeT } from "../src/physics/timePhases.ts";
import { parseExperimentStimulusSet, validateRunnableSet } from "../src/shared/storage.ts";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "stimulate");

const GLOBAL_E_MIN = 1.96;
const GLOBAL_E_MAX = 156.8;
const ROD_LENGTH_M = 4;
const GRAVITY = 9.8;
const M = 1;

const PRACTICE_ENERGIES = [1.96, 79.38, 156.8] as const;

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
): PendulumStimulusUnit {
  return withSyncedTotalTimeT({
    id,
    type: "pendulumStimulus",
    theta0Deg: Math.round(((thetaRad * 180) / Math.PI) * 1e10) / 1e10,
    omega0DegPerSec: Math.round(((omegaRad * 180) / Math.PI) * 1e10) / 1e10,
    rodLengthM: l,
    gravity: g,
    totalTimeT: 0,
    show1T: 1.9,
    hide1T: 1.7,
    show2T: 1.3,
    hide2T: 1.1,
  });
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

function assertSetShapeAndTargets(set: ExperimentStimulusSet, edges: number[]): void {
  if (set.sequence.length !== 11) {
    throw new Error(`sequence 长度应为 11（1 Practice + 10 Block），实际 ${set.sequence.length}`);
  }
  const p = set.sequence[0];
  if (!p || p.kind !== "practice" || p.children.length !== 3) {
    throw new Error("首段应为 Practice 且含 3 个 Trial");
  }
  for (let j = 0; j < 3; j++) {
    const t = p.children[j]!;
    if (t.units.length !== 1 || t.units[0]!.type !== "pendulumStimulus") {
      throw new Error(`Practice Trial ${j + 1} 应仅含一个 pendulumStimulus`);
    }
    const u = t.units[0] as PendulumStimulusUnit;
    const want = PRACTICE_ENERGIES[j]!;
    if (Math.abs(energyFromUnit(u) - want) > 2e-3) {
      throw new Error(`Practice Trial ${j + 1} 能量应对准 ${want} J`);
    }
  }
  for (let b = 0; b < 10; b++) {
    const seg = set.sequence[b + 1];
    if (!seg || seg.kind !== "block" || seg.children.length !== 15) {
      throw new Error(`Block ${b + 1} 应含 15 个 Trial`);
    }
    const Emin = edges[b]!;
    const Emax = edges[b + 1]!;
    for (let k = 0; k < 15; k++) {
      const want = Emin + (k / 14) * (Emax - Emin);
      const t = seg.children[k]!;
      const u = t.units[0] as PendulumStimulusUnit;
      if (t.units.length !== 1 || t.units[0]!.type !== "pendulumStimulus") {
        throw new Error(`Block ${b + 1} Trial ${k + 1} 应仅含一个 pendulumStimulus`);
      }
      if (Math.abs(energyFromUnit(u) - want) > 2e-3) {
        throw new Error(`Block ${b + 1} Trial ${k + 1} 能量应对准 ${want} J`);
      }
    }
  }
}

function buildSet(fileIdx: number, seed: number): ExperimentStimulusSet {
  const rng = mulberry32(seed >>> 0);
  const id = createIdFactory(fileIdx, seed);
  const expected: ExpectedRow[] = [];

  const pushTrial = (E: number): Trial => {
    const { thetaRad, omegaRad } = sampleStateForEnergy(E, ROD_LENGTH_M, GRAVITY, rng);
    const uid = id();
    const unit = makePendulumStimulus(uid, thetaRad, omegaRad, ROD_LENGTH_M, GRAVITY);
    expected.push({ unit, expectedE: E });
    return { id: id(), units: [unit] };
  };

  const practiceId = id();
  const practiceChildren: Trial[] = PRACTICE_ENERGIES.map((E) => pushTrial(E));
  const practice: PracticeSegment = { kind: "practice", id: practiceId, children: practiceChildren };

  const edges: number[] = [];
  for (let i = 0; i <= 10; i++) {
    edges.push(GLOBAL_E_MIN + (i / 10) * (GLOBAL_E_MAX - GLOBAL_E_MIN));
  }

  const blocks: BlockSegment[] = [];
  for (let b = 0; b < 10; b++) {
    const Emin = edges[b]!;
    const Emax = edges[b + 1]!;
    const trials: Trial[] = [];
    for (let k = 0; k < 15; k++) {
      const Etarget = Emin + (k / 14) * (Emax - Emin);
      trials.push(pushTrial(Etarget));
    }
    blocks.push({ kind: "block", id: id(), children: trials });
  }

  const set: ExperimentStimulusSet = {
    schemaVersion: STIMULUS_SET_SCHEMA_VERSION,
    sequence: [practice, ...blocks],
  };

  balancePendulumSigns(collectPendulumStimuli(set));

  assertSetShapeAndTargets(set, edges);

  const TOL = 1e-3;
  for (const { unit, expectedE } of expected) {
    const actual = energyFromUnit(unit);
    if (Math.abs(actual - expectedE) > TOL) {
      throw new Error(
        `能量偏差过大: 期望 ${expectedE} J, 实际 ${actual.toFixed(4)} J（平衡后）`,
      );
    }
  }

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
