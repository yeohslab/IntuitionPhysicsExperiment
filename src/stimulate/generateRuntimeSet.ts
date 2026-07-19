/**
 * 正式实验运行时刺激集：1 练习 Block + 15 正式 Block × 9 Trial，crypto 真随机。
 * 入口见 StartView；自检见 assertRuntimeStimulusSet 与 verify-runtime-generator。
 */
import {
  GRAVITY,
  NUM_FORMAL_BLOCKS,
  ROD_LENGTH_M,
  TRIALS_PER_FORMAL_BLOCK,
  buildKeptEnergySegmentsForGroup,
  practiceEnergyForGroup,
  type KeptEnergySegment,
  type MotionGroup,
} from "../physics/energySegments";
import { pendulumEnergy, pendulumPeriod, pendulumRegime, type PendulumParams } from "../physics/pendulum";
import {
  assertUnitSimEndTheta,
  fitPendulumDiscreteTrial,
  pendulumThetaMaxRad,
} from "../physics/pendulumUnitFit";
import { hideIntervalHasNoTurning } from "../physics/pendulumHideConstraint";
import { HIDE_LEVELS_SEC, fadeTForGroup, showLevelsForGroup } from "../physics/timePhases";
import {
  STIMULUS_SET_SCHEMA_VERSION,
  type BlockSegment,
  type ExperimentStimulusSet,
  type PendulumStimulusUnit,
  type PracticeSegment,
  type RestSegment,
  type TextControlUnit,
  type TextDisplayUnit,
  type TopLevelSequenceItem,
  type Trial,
} from "../types/experiment";
import { newId } from "../shared/ids";
import { cryptoRandom, shuffleInPlace } from "./cryptoRandom";
import {
  FIXATION_MS,
  FIXATION_TEXT,
  blockRestText,
  practiceRestText,
  structureRestText,
  welcomeRestText,
} from "./instructions";

export type TimingCombo = { show1T: number; hide1T: number };

/** 组内 3×3 timing 全交叉：hide ∈ {0.5,0.6,0.7}s × 组专属 show 水平 */
export function allTimingCombos(group: MotionGroup): TimingCombo[] {
  const combos: TimingCombo[] = [];
  const showLevels = showLevelsForGroup(group);
  for (const hide1T of HIDE_LEVELS_SEC) {
    for (const show1T of showLevels) {
      combos.push({ show1T, hide1T });
    }
  }
  return combos;
}

function makeTextControl(text: string): TextControlUnit {
  return { id: newId(), type: "textControl", text, key: " " };
}

function makeFixation(): TextDisplayUnit {
  return { id: newId(), type: "textDisplay", text: FIXATION_TEXT, durationMs: FIXATION_MS };
}

function makePendulumStimulus(
  E: number,
  combo: TimingCombo,
  rng: () => number,
): PendulumStimulusUnit {
  const fitted = fitPendulumDiscreteTrial({
    targetEnergyJ: E,
    show1T: combo.show1T,
    hide1T: combo.hide1T,
    rodLengthM: ROD_LENGTH_M,
    gravity: GRAVITY,
    rng,
  });
  assertUnitSimEndTheta(fitted, E, fitted.targetThetaEndRad);
  return {
    id: newId(),
    type: "pendulumStimulus",
    theta0Deg: fitted.theta0Deg,
    omega0DegPerSec: fitted.omega0DegPerSec,
    rodLengthM: fitted.rodLengthM,
    gravity: fitted.gravity,
    totalTimeT: fitted.totalTimeT,
    show1T: fitted.show1T,
    hide1T: fitted.hide1T,
    show2T: fitted.show2T,
    hide2T: fitted.hide2T,
    fadeMs: fitted.fadeMs,
  };
}

function makeBlockForEnergy(seg: KeptEnergySegment, group: MotionGroup, rng: () => number): BlockSegment {
  const combos = allTimingCombos(group);
  shuffleInPlace(combos, rng);
  const children: Trial[] = combos.map((combo) => ({
    id: newId(),
    units: [makeFixation(), makePendulumStimulus(seg.Emid, combo, rng)],
  }));
  return { kind: "block", id: newId(), children };
}

/** 练习 Block：固定练习能量 × 组内 3×3 timing；与正式试次同构（pendulumStimulus） */
function makePracticeBlock(group: MotionGroup, rng: () => number): PracticeSegment {
  const E = practiceEnergyForGroup(group);
  const combos = allTimingCombos(group);
  shuffleInPlace(combos, rng);
  const children: Trial[] = combos.map((combo) => ({
    id: newId(),
    units: [makeFixation(), makePendulumStimulus(E, combo, rng)],
  }));
  return { kind: "practice", id: newId(), children };
}

function makeWelcomeRest(group: MotionGroup): RestSegment {
  return { kind: "rest", id: newId(), units: [makeTextControl(welcomeRestText(group))] };
}

function makeStructureRest(group: MotionGroup): RestSegment {
  return { kind: "rest", id: newId(), units: [makeTextControl(structureRestText(group))] };
}

function makePracticeRest(group: MotionGroup): RestSegment {
  return { kind: "rest", id: newId(), units: [makeTextControl(practiceRestText(group))] };
}

function makeBlockRest(current: number, total: number): RestSegment {
  return { kind: "rest", id: newId(), units: [makeTextControl(blockRestText(current, total))] };
}

export type GenerateRuntimeSetOptions = {
  group: MotionGroup;
  subjectId: string;
  rng?: () => number;
};

export function generateRuntimeStimulusSet(opts: GenerateRuntimeSetOptions): ExperimentStimulusSet {
  const rng = opts.rng ?? cryptoRandom();
  const segments = buildKeptEnergySegmentsForGroup(opts.group);
  const blocks = segments.map((seg) => makeBlockForEnergy(seg, opts.group, rng));
  shuffleInPlace(blocks, rng);

  const sequence: TopLevelSequenceItem[] = [
    makeWelcomeRest(opts.group),
    makeStructureRest(opts.group),
    makePracticeRest(opts.group),
    makePracticeBlock(opts.group, rng),
  ];
  for (let i = 0; i < blocks.length; i++) {
    sequence.push(makeBlockRest(i + 1, NUM_FORMAL_BLOCKS));
    sequence.push(blocks[i]!);
  }

  const set: ExperimentStimulusSet = {
    schemaVersion: STIMULUS_SET_SCHEMA_VERSION,
    sequence,
  };
  assertRuntimeStimulusSet(set, opts.group);
  return set;
}

function pendulumParamsFromUnit(u: PendulumStimulusUnit): PendulumParams {
  return {
    theta0Rad: (u.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (u.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: u.rodLengthM,
    gravity: u.gravity,
  };
}

function comboKey(show1T: number, hide1T: number): string {
  return `${show1T}|${hide1T}`;
}

function assertTimedPendulumBlock(
  blockId: string,
  trials: Trial[],
  group: MotionGroup,
  expectedEnergyJ: number | null,
): void {
  const expectedRegime = group === 1 ? "oscillation" : "rotation";
  const expectedFadeT = fadeTForGroup(group);
  const allCombos = new Set(allTimingCombos(group).map((c) => comboKey(c.show1T, c.hide1T)));
  if (trials.length !== TRIALS_PER_FORMAL_BLOCK) {
    throw new Error(`Block ${blockId} 试次数应为 ${TRIALS_PER_FORMAL_BLOCK}，实际 ${trials.length}`);
  }
  const seen = new Set<string>();
  for (const trial of trials) {
    const stim = trial.units.find((u) => u.type === "pendulumStimulus");
    if (!stim || stim.type !== "pendulumStimulus") {
      throw new Error(`Trial ${trial.id} 缺少 pendulumStimulus`);
    }
    const key = comboKey(stim.show1T, stim.hide1T);
    if (!allCombos.has(key)) {
      throw new Error(`Block ${blockId} 含非法 timing 组合 ${key}`);
    }
    if (seen.has(key)) throw new Error(`Block ${blockId} 重复 timing 组合 ${key}`);
    seen.add(key);
    const E = pendulumEnergy(pendulumParamsFromUnit(stim));
    if (expectedEnergyJ !== null && Math.abs(E - expectedEnergyJ) > 2e-3) {
      throw new Error(
        `Block ${blockId} 试次能量 ${E.toFixed(4)} J 偏离期望 ${expectedEnergyJ.toFixed(4)} J`,
      );
    }
    const regime = pendulumRegime(E, stim.rodLengthM, stim.gravity);
    if (regime !== expectedRegime && regime !== "critical") {
      throw new Error(`Block ${blockId} 试次能量 ${E} J 的 regime=${regime}，期望 ${expectedRegime}`);
    }
    const thetaMax = pendulumThetaMaxRad(E, stim.rodLengthM, stim.gravity);
    const timing = {
      show1T: stim.show1T,
      hide1T: stim.hide1T,
      fadeMs: stim.fadeMs,
    };
    if (!hideIntervalHasNoTurning(pendulumParamsFromUnit(stim), timing, thetaMax, regime)) {
      throw new Error(`Block ${blockId} 试次 ${stim.id} 违反 hide 无转向约束`);
    }
    const T = pendulumPeriod(E, stim.rodLengthM, stim.gravity);
    const fadeT = (stim.fadeMs ?? 0) / 1000 / T;
    if (Math.abs(fadeT - expectedFadeT) > 1e-6) {
      throw new Error(
        `Block ${blockId} 试次 ${stim.id} fadeT=${fadeT.toFixed(4)}，期望 ${expectedFadeT}`,
      );
    }
  }
  if (seen.size !== allCombos.size) {
    throw new Error(`Block ${blockId} timing 组合不完整：${seen.size}/${allCombos.size}`);
  }
}

/** 生成后自检：正式 Block、练习 Block、timing、regime、hide 约束 */
export function assertRuntimeStimulusSet(set: ExperimentStimulusSet, group: MotionGroup): void {
  const formalBlocks = set.sequence.filter((x) => x.kind === "block");
  if (formalBlocks.length !== NUM_FORMAL_BLOCKS) {
    throw new Error(`正式 Block 应为 ${NUM_FORMAL_BLOCKS}，实际 ${formalBlocks.length}`);
  }
  const practiceBlocks = set.sequence.filter((x) => x.kind === "practice");
  if (practiceBlocks.length !== 1) {
    throw new Error(`练习 Block 应为 1，实际 ${practiceBlocks.length}`);
  }
  const practice = practiceBlocks[0]!;
  if (practice.kind === "practice") {
    assertTimedPendulumBlock(
      practice.id,
      practice.children,
      group,
      practiceEnergyForGroup(group),
    );
  }
  for (const block of formalBlocks) {
    if (block.kind !== "block") continue;
    assertTimedPendulumBlock(block.id, block.children, group, null);
  }
}
