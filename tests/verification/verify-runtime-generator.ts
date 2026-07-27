/**
 * 运行时刺激集生成器自检。
 * 运行：npm run verify-runtime-generator
 */
import {
  assertRuntimeStimulusSet,
  generateRuntimeStimulusSet,
  TOTAL_RUNTIME_TRIALS,
} from "../../src/experiment/stimulus/generateRuntimeSet.ts";
import { fitPendulumDiscreteTrial } from "../../src/experiment/physics/pendulumUnitFit.ts";
import {
  NUM_FORMAL_BLOCKS,
  TRIALS_PER_FORMAL_BLOCK,
  buildKeptEnergySegmentsForGroup,
} from "../../src/experiment/physics/energySegments.ts";
import { HIDE_LEVELS_SEC } from "../../src/experiment/physics/timePhases.ts";
import type {
  ExperimentStimulusSet,
  PendulumStimulusUnit,
} from "../../src/shared/experimentTypes.ts";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertEnergySegments(): void {
  for (const group of [1, 2] as const) {
    const segs = buildKeptEnergySegmentsForGroup(group);
    if (segs.length !== NUM_FORMAL_BLOCKS) {
      throw new Error(`组 ${group} 能量段数应为 ${NUM_FORMAL_BLOCKS}`);
    }
    console.log(
      `组 ${group}：${segs.length} 能量段，Emid 范围 [${segs[0]!.Emid.toFixed(2)}, ${segs.at(-1)!.Emid.toFixed(2)}] J`,
    );
  }
}

function assertNoSpringUnits(set: ExperimentStimulusSet): void {
  for (const item of set.sequence) {
    if (item.kind === "block" || item.kind === "practice") {
      for (const trial of item.children) {
        for (const unit of trial.units) {
          if (unit.type.includes("spring")) {
            throw new Error(`刺激集含已废弃单元类型：${unit.type}`);
          }
        }
      }
    } else {
      for (const unit of item.units) {
        if (unit.type.includes("spring")) {
          throw new Error(`刺激集含已废弃单元类型：${unit.type}`);
        }
      }
    }
  }
}

function assertOmegaSignBalance(): void {
  let pos = 0;
  let neg = 0;
  const n = 80;
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(90_000 + i);
    const fitted = fitPendulumDiscreteTrial({
      targetEnergyJ: 50,
      show1T: 1.5,
      hide1T: 1,
      rodLengthM: 4,
      gravity: 9.8,
      rng,
    });
    if (fitted.omega0DegPerSec > 0) pos++;
    else if (fitted.omega0DegPerSec < 0) neg++;
  }
  const ratio = Math.min(pos, neg) / Math.max(pos, neg, 1);
  if (ratio < 0.35) {
    throw new Error(`ω₀ 符号分布失衡：正=${pos} 负=${neg}（ratio=${ratio.toFixed(2)}）`);
  }
  console.log(`ω₀ 符号抽检：正=${pos} 负=${neg}（${n} 次拟合）`);
}

function collectStimuli(set: ExperimentStimulusSet): PendulumStimulusUnit[] {
  const out: PendulumStimulusUnit[] = [];
  for (const item of set.sequence) {
    if (item.kind !== "block") continue;
    for (const trial of item.children) {
      for (const unit of trial.units) {
        if (unit.type === "pendulumStimulus") out.push(unit);
      }
    }
  }
  return out;
}

function collectPracticeStimuli(set: ExperimentStimulusSet): PendulumStimulusUnit[] {
  const out: PendulumStimulusUnit[] = [];
  for (const item of set.sequence) {
    if (item.kind !== "practice") continue;
    for (const trial of item.children) {
      for (const unit of trial.units) {
        if (unit.type === "pendulumStimulus") out.push(unit);
      }
    }
  }
  return out;
}

function assertGeneratedSet(group: 1 | 2, seed: number): void {
  const rng = mulberry32(seed);
  const progress: number[] = [];
  const set = generateRuntimeStimulusSet({
    group,
    subjectId: "0001",
    rng,
    onProgress: (completed, total) => {
      if (total !== TOTAL_RUNTIME_TRIALS) {
        throw new Error(`生成进度总数异常：${total}`);
      }
      progress.push(completed);
    },
  });
  if (
    progress.length !== TOTAL_RUNTIME_TRIALS ||
    progress.at(-1) !== TOTAL_RUNTIME_TRIALS ||
    progress.some((value, index) => value !== index + 1)
  ) {
    throw new Error(`组 ${group} 生成进度回调不完整或非单调`);
  }
  assertRuntimeStimulusSet(set, group);
  assertNoSpringUnits(set);
  const blocks = set.sequence.filter((x) => x.kind === "block");
  const practice = set.sequence.filter((x) => x.kind === "practice");
  if (practice.length !== 1) {
    throw new Error(`组 ${group} 练习 Block 应为 1，实际 ${practice.length}`);
  }
  const practiceTrials =
    practice[0]!.kind === "practice" ? practice[0]!.children.length : 0;
  if (practiceTrials !== TRIALS_PER_FORMAL_BLOCK) {
    throw new Error(`组 ${group} 练习试次数应为 ${TRIALS_PER_FORMAL_BLOCK}，实际 ${practiceTrials}`);
  }
  const practiceStimuli = collectPracticeStimuli(set);
  if (practiceStimuli.length !== TRIALS_PER_FORMAL_BLOCK) {
    throw new Error(`组 ${group} 练习 pendulumStimulus 数量异常：${practiceStimuli.length}`);
  }
  const trialCount = blocks.reduce((n, b) => n + (b.kind === "block" ? b.children.length : 0), 0);
  if (trialCount !== NUM_FORMAL_BLOCKS * TRIALS_PER_FORMAL_BLOCK) {
    throw new Error(`组 ${group} 正式试次数应为 ${NUM_FORMAL_BLOCKS * TRIALS_PER_FORMAL_BLOCK}，实际 ${trialCount}`);
  }
  const stimuli = collectStimuli(set);
  if (stimuli.length !== NUM_FORMAL_BLOCKS * TRIALS_PER_FORMAL_BLOCK) {
    throw new Error(`组 ${group} pendulumStimulus 数量异常：${stimuli.length}`);
  }
  const expectedShow = new Set(group === 1 ? [1.25, 1.5, 1.75] : [2.5, 3, 3.5]);
  const expectedHide = new Set<number>(HIDE_LEVELS_SEC);
  for (const s of stimuli) {
    if (!expectedShow.has(s.show1T)) {
      throw new Error(`组 ${group} 非法 show1T=${s.show1T}`);
    }
    if (!expectedHide.has(s.hide1T)) {
      throw new Error(`组 ${group} 非法 hide1T=${s.hide1T}`);
    }
  }
  console.log(
    `组 ${group}（seed=${seed}）：练习 ${practiceTrials} + 正式 ${blocks.length}×${TRIALS_PER_FORMAL_BLOCK} OK`,
  );
}

assertEnergySegments();
assertOmegaSignBalance();
assertGeneratedSet(1, 42_001);
assertGeneratedSet(2, 42_002);
console.log("verify-runtime-generator: 全部通过");
