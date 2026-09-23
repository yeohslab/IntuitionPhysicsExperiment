import {
  GRAVITY,
  ROD_LENGTH_M,
  buildKeptEnergySegmentsForGroup,
  practiceEnergyForGroup,
  type KeptEnergySegment,
  type MotionGroup,
} from "../../experiment/physics/energySegments";
import {
  analyzePendulum,
  pendulumEnergy,
  pendulumOmegaRadForEnergyAtBottom,
  pendulumPeriod,
  pendulumRegime,
  type PendulumParams,
} from "../../experiment/physics/pendulum";
import { analyzePendulumHideTurning } from "../../experiment/physics/pendulumHideTurning";
import {
  assertUnitSimEndTheta,
  fitPendulumDiscreteTrial,
} from "../../experiment/physics/pendulumUnitFit";
import {
  HIDE_LEVELS_SEC,
  fadeTForGroup,
  showLevelsForGroup,
} from "../../experiment/physics/timePhases";
import {
  EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  type BlockSegment,
  type Experiment2StimulusSet,
  type PendulumStimulusUnit,
  type PracticeSegment,
  type RestSegment,
  type TextControlUnit,
  type TextDisplayUnit,
  type TopLevelSequenceItem,
  type Trial,
} from "../../shared/experimentTypes";
import { newId } from "../../shared/ids";
import { cryptoRandom, shuffleInPlace } from "../../experiment/stimulus/cryptoRandom";
import {
  EXPERIMENT_2_FIXATION_MS,
  EXPERIMENT_2_FIXATION_TEXT,
  experiment2BlockRestText,
  experiment2PracticeText,
  experiment2StructureText,
  experiment2WelcomeText,
} from "./instructions";
import {
  EXPERIMENT_2_FORMAL_BLOCKS,
  EXPERIMENT_2_PRACTICE_TRIALS,
  EXPERIMENT_2_ROTATION_PRACTICE_ENERGY_J,
  EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
  EXPERIMENT_2_TOTAL_RUNTIME_TRIALS,
  EXPERIMENT_2_TRIALS_PER_BLOCK,
} from "./protocol";

export {
  EXPERIMENT_2_FORMAL_BLOCKS,
  EXPERIMENT_2_FORMAL_TRIALS,
  EXPERIMENT_2_PRACTICE_TRIALS,
  EXPERIMENT_2_ROTATION_PRACTICE_ENERGY_J,
  EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
  EXPERIMENT_2_TOTAL_RUNTIME_TRIALS,
  EXPERIMENT_2_TRIALS_PER_BLOCK,
} from "./protocol";

export type Experiment2TimingCombo = { show1T: number; hide1T: number };

export const EXPERIMENT_2_OSCILLATION_SEGMENTS =
  buildKeptEnergySegmentsForGroup(1);
export const EXPERIMENT_2_ROTATION_SEGMENTS =
  buildKeptEnergySegmentsForGroup(2).slice(0, 5);
export const EXPERIMENT_2_MAX_FORMAL_ENERGY_J = Math.max(
  ...EXPERIMENT_2_OSCILLATION_SEGMENTS.map((segment) => segment.Emid),
  ...EXPERIMENT_2_ROTATION_SEGMENTS.map((segment) => segment.Emid),
);
const derivedExperiment2SpeedColorVMaxMPerSec =
  ROD_LENGTH_M *
  pendulumOmegaRadForEnergyAtBottom(
    EXPERIMENT_2_MAX_FORMAL_ENERGY_J,
    ROD_LENGTH_M,
  );

if (
  Math.abs(
    derivedExperiment2SpeedColorVMaxMPerSec -
      EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
  ) > 1e-12
) {
  throw new Error("实验二统一颜色速度上限与所选正式能量不一致");
}

export function experiment2TimingCombos(group: MotionGroup): Experiment2TimingCombo[] {
  const combos: Experiment2TimingCombo[] = [];
  for (const hide1T of HIDE_LEVELS_SEC) {
    for (const show1T of showLevelsForGroup(group)) {
      combos.push({ show1T, hide1T });
    }
  }
  return combos;
}

function makeTextControl(text: string): TextControlUnit {
  return { id: newId(), type: "textControl", text, key: " " };
}

function makeFixation(): TextDisplayUnit {
  return {
    id: newId(),
    type: "textDisplay",
    text: EXPERIMENT_2_FIXATION_TEXT,
    durationMs: EXPERIMENT_2_FIXATION_MS,
  };
}

function makePendulumStimulus(
  energyJ: number,
  combo: Experiment2TimingCombo,
  rng: () => number,
  requiredHideTurning?: boolean,
): PendulumStimulusUnit {
  const fitted = fitPendulumDiscreteTrial({
    targetEnergyJ: energyJ,
    show1T: combo.show1T,
    hide1T: combo.hide1T,
    rodLengthM: ROD_LENGTH_M,
    gravity: GRAVITY,
    rng,
    requiredHideTurning,
  });
  assertUnitSimEndTheta(fitted, energyJ, fitted.targetThetaEndRad);
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
    fadeMs: fitted.fadeMs,
  };
}

function buildFormalHideTurningPlan(
  energyCount: number,
  comboCount: number,
  rng: () => number,
): boolean[][] {
  const energyOrder = Array.from({ length: energyCount }, (_, index) => index);
  const comboOrder = Array.from({ length: comboCount }, (_, index) => index);
  shuffleInPlace(energyOrder, rng);
  shuffleInPlace(comboOrder, rng);
  const energyRank = Array<number>(energyCount);
  const comboRank = Array<number>(comboCount);
  energyOrder.forEach((energyIndex, rank) => {
    energyRank[energyIndex] = rank;
  });
  comboOrder.forEach((comboIndex, rank) => {
    comboRank[comboIndex] = rank;
  });
  const offset = rng() < 0.5 ? 0 : 1;
  return Array.from({ length: energyCount }, (_, energyIndex) =>
    Array.from(
      { length: comboCount },
      (_, comboIndex) =>
        (energyRank[energyIndex]! + comboRank[comboIndex]! + offset) % 2 === 0,
    ),
  );
}

function makeFormalBlock(
  segment: KeptEnergySegment,
  group: MotionGroup,
  rng: () => number,
  turningPlan: readonly boolean[] | undefined,
  onTrialGenerated?: () => void,
): BlockSegment {
  const planned = experiment2TimingCombos(group).map((combo, index) => ({
    combo,
    requiredHideTurning: turningPlan?.[index],
  }));
  shuffleInPlace(planned, rng);
  return {
    kind: "block",
    id: newId(),
    children: planned.map(({ combo, requiredHideTurning }) => {
      const trial: Trial = {
        id: newId(),
        units: [
          makeFixation(),
          makePendulumStimulus(segment.Emid, combo, rng, requiredHideTurning),
        ],
      };
      onTrialGenerated?.();
      return trial;
    }),
  };
}

function comboKey(combo: Experiment2TimingCombo): string {
  return `${combo.show1T}|${combo.hide1T}`;
}

function countSpread(values: Iterable<number>): number {
  const numbers = [...values];
  return Math.max(...numbers) - Math.min(...numbers);
}

function balancedTimingSubsets(
  group: MotionGroup,
  count: 4 | 5,
): Experiment2TimingCombo[][] {
  const combos = experiment2TimingCombos(group);
  const results: Experiment2TimingCombo[][] = [];
  const visit = (start: number, chosen: Experiment2TimingCombo[]) => {
    if (chosen.length === count) {
      const showCounts = new Map<number, number>(
        showLevelsForGroup(group).map((value) => [value, 0] as [number, number]),
      );
      const hideCounts = new Map<number, number>(
        HIDE_LEVELS_SEC.map((value) => [value, 0] as [number, number]),
      );
      for (const combo of chosen) {
        showCounts.set(combo.show1T, (showCounts.get(combo.show1T) ?? 0) + 1);
        hideCounts.set(combo.hide1T, (hideCounts.get(combo.hide1T) ?? 0) + 1);
      }
      if (countSpread(showCounts.values()) <= 1 && countSpread(hideCounts.values()) <= 1) {
        results.push(chosen.map((combo) => ({ ...combo })));
      }
      return;
    }
    for (let index = start; index < combos.length; index++) {
      visit(index + 1, [...chosen, combos[index]!]);
    }
  };
  visit(0, []);
  return results;
}

function chooseBalancedTimingSubset(
  group: MotionGroup,
  count: 4 | 5,
  rng: () => number,
): Experiment2TimingCombo[] {
  const candidates = balancedTimingSubsets(group, count);
  if (candidates.length === 0) {
    throw new Error(`实验二练习无法构造组 ${group} 的 ${count} 条平衡时序`);
  }
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[index]!.map((combo) => ({ ...combo }));
}

function makePracticeBlock(
  rng: () => number,
  onTrialGenerated?: () => void,
): PracticeSegment {
  const oscillationCount: 4 | 5 = rng() < 0.5 ? 4 : 5;
  const rotationCount: 4 | 5 = oscillationCount === 4 ? 5 : 4;
  const planned = [
    ...chooseBalancedTimingSubset(1, oscillationCount, rng).map((combo) => ({
      combo,
      group: 1 as const,
      energyJ: practiceEnergyForGroup(1),
    })),
    ...chooseBalancedTimingSubset(2, rotationCount, rng).map((combo) => ({
      combo,
      group: 2 as const,
      energyJ: EXPERIMENT_2_ROTATION_PRACTICE_ENERGY_J,
    })),
  ];
  shuffleInPlace(planned, rng);
  return {
    kind: "practice",
    id: newId(),
    children: planned.map(({ combo, energyJ }) => {
      const trial: Trial = {
        id: newId(),
        units: [makeFixation(), makePendulumStimulus(energyJ, combo, rng)],
      };
      onTrialGenerated?.();
      return trial;
    }),
  };
}

function makeRest(text: string): RestSegment {
  return { kind: "rest", id: newId(), units: [makeTextControl(text)] };
}

export type GenerateExperiment2RuntimeSetOptions = {
  subjectId: string;
  rng?: () => number;
  onProgress?: (completedTrials: number, totalTrials: number) => void;
};

export function generateExperiment2RuntimeStimulusSet(
  options: GenerateExperiment2RuntimeSetOptions,
): Experiment2StimulusSet {
  const rng = options.rng ?? cryptoRandom();
  let completedTrials = 0;
  const report = () => {
    completedTrials += 1;
    options.onProgress?.(completedTrials, EXPERIMENT_2_TOTAL_RUNTIME_TRIALS);
  };
  const turningPlan = buildFormalHideTurningPlan(
    EXPERIMENT_2_OSCILLATION_SEGMENTS.length,
    experiment2TimingCombos(1).length,
    rng,
  );
  const formalBlocks = [
    ...EXPERIMENT_2_OSCILLATION_SEGMENTS.map((segment, energyIndex) =>
      makeFormalBlock(segment, 1, rng, turningPlan[energyIndex], report),
    ),
    ...EXPERIMENT_2_ROTATION_SEGMENTS.map((segment) =>
      makeFormalBlock(segment, 2, rng, undefined, report),
    ),
  ];
  shuffleInPlace(formalBlocks, rng);

  const sequence: TopLevelSequenceItem[] = [
    makeRest(experiment2WelcomeText()),
    makeRest(experiment2StructureText()),
    makeRest(experiment2PracticeText()),
    makePracticeBlock(rng, report),
  ];
  formalBlocks.forEach((block, index) => {
    sequence.push(
      makeRest(experiment2BlockRestText(index + 1, EXPERIMENT_2_FORMAL_BLOCKS)),
      block,
    );
  });
  const set: Experiment2StimulusSet = {
    schemaVersion: EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
    sequence,
  };
  assertExperiment2RuntimeStimulusSet(set);
  return set;
}

function stimulusFromTrial(trial: Trial): PendulumStimulusUnit {
  const stimulus = trial.units.find(
    (unit): unit is PendulumStimulusUnit => unit.type === "pendulumStimulus",
  );
  if (!stimulus) throw new Error(`Trial ${trial.id} 缺少 pendulumStimulus`);
  return stimulus;
}

function paramsFromStimulus(stimulus: PendulumStimulusUnit): PendulumParams {
  return {
    theta0Rad: (stimulus.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (stimulus.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: stimulus.rodLengthM,
    gravity: stimulus.gravity,
  };
}

function sourceGroup(stimulus: PendulumStimulusUnit): MotionGroup {
  return pendulumRegime(
    pendulumEnergy(paramsFromStimulus(stimulus)),
    stimulus.rodLengthM,
    stimulus.gravity,
  ) === "rotation"
    ? 2
    : 1;
}

function assertTimingSet(
  trials: readonly Trial[],
  group: MotionGroup,
  label: string,
): void {
  if (trials.length !== EXPERIMENT_2_TRIALS_PER_BLOCK) {
    throw new Error(`${label} 应有 9 个 Trial，实际 ${trials.length}`);
  }
  const expected = new Set(experiment2TimingCombos(group).map(comboKey));
  const actual = new Set(
    trials.map((trial) => {
      const stimulus = stimulusFromTrial(trial);
      return comboKey({ show1T: stimulus.show1T, hide1T: stimulus.hide1T });
    }),
  );
  if (actual.size !== expected.size || [...actual].some((key) => !expected.has(key))) {
    throw new Error(`${label} 未完整覆盖组 ${group} 的 3×3 时序`);
  }
}

function assertPractice(practice: PracticeSegment): void {
  if (practice.children.length !== EXPERIMENT_2_PRACTICE_TRIALS) {
    throw new Error(`实验二练习应有 9 个 Trial，实际 ${practice.children.length}`);
  }
  const byGroup = new Map<MotionGroup, PendulumStimulusUnit[]>([
    [1, []],
    [2, []],
  ]);
  for (const trial of practice.children) {
    const stimulus = stimulusFromTrial(trial);
    byGroup.get(sourceGroup(stimulus))!.push(stimulus);
  }
  const counts = [byGroup.get(1)!.length, byGroup.get(2)!.length].sort();
  if (counts[0] !== 4 || counts[1] !== 5) {
    throw new Error(`实验二练习运动类型应为4/5，实际 ${counts.join("/")}`);
  }
  for (const group of [1, 2] as const) {
    const stimuli = byGroup.get(group)!;
    const keys = new Set(
      stimuli.map((stimulus) => comboKey({ show1T: stimulus.show1T, hide1T: stimulus.hide1T })),
    );
    if (keys.size !== stimuli.length) {
      throw new Error(`实验二练习组 ${group} 存在重复时序组合`);
    }
    const showCounts = new Map<number, number>(
      showLevelsForGroup(group).map((value) => [value, 0] as [number, number]),
    );
    const hideCounts = new Map<number, number>(
      HIDE_LEVELS_SEC.map((value) => [value, 0] as [number, number]),
    );
    for (const stimulus of stimuli) {
      showCounts.set(stimulus.show1T, (showCounts.get(stimulus.show1T) ?? 0) + 1);
      hideCounts.set(stimulus.hide1T, (hideCounts.get(stimulus.hide1T) ?? 0) + 1);
    }
    if (countSpread(showCounts.values()) > 1 || countSpread(hideCounts.values()) > 1) {
      throw new Error(`实验二练习组 ${group} 时序边缘不平衡`);
    }
  }
}

export function assertExperiment2RuntimeStimulusSet(
  set: Experiment2StimulusSet,
): void {
  if (set.schemaVersion !== EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION) {
    throw new Error(`实验二刺激集 schema 应为 ${EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION}`);
  }
  const formalBlocks = set.sequence.filter(
    (item): item is BlockSegment => item.kind === "block",
  );
  const practices = set.sequence.filter(
    (item): item is PracticeSegment => item.kind === "practice",
  );
  if (formalBlocks.length !== EXPERIMENT_2_FORMAL_BLOCKS) {
    throw new Error(`实验二正式 Block 应为20，实际 ${formalBlocks.length}`);
  }
  if (practices.length !== 1) {
    throw new Error(`实验二练习 Block 应为1，实际 ${practices.length}`);
  }
  assertPractice(practices[0]!);

  const expectedOscEnergies = new Set(
    EXPERIMENT_2_OSCILLATION_SEGMENTS.map((segment) => segment.Emid.toFixed(8)),
  );
  const expectedRotEnergies = new Set(
    EXPERIMENT_2_ROTATION_SEGMENTS.map((segment) => segment.Emid.toFixed(8)),
  );
  const seenOscEnergies = new Set<string>();
  const seenRotEnergies = new Set<string>();
  const comboTurningCounts = new Map<string, number>();
  let totalOscillationTurning = 0;

  for (const block of formalBlocks) {
    const first = stimulusFromTrial(block.children[0]!);
    const group = sourceGroup(first);
    assertTimingSet(block.children, group, `正式 Block ${block.id}`);
    let blockTurning = 0;
    for (const trial of block.children) {
      const stimulus = stimulusFromTrial(trial);
      if (sourceGroup(stimulus) !== group) {
        throw new Error(`正式 Block ${block.id} 混入不同运动类型`);
      }
      const params = paramsFromStimulus(stimulus);
      const analysis = analyzePendulum(params);
      const energyKey = analysis.E.toFixed(8);
      const expectedFadeT = fadeTForGroup(group);
      const fadeT = stimulus.fadeMs / 1000 / pendulumPeriod(analysis.E, stimulus.rodLengthM, stimulus.gravity);
      if (Math.abs(fadeT - expectedFadeT) > 1e-6) {
        throw new Error(`正式 Trial ${trial.id} fade_T 不匹配运动类型`);
      }
      if (group === 1) seenOscEnergies.add(energyKey);
      else seenRotEnergies.add(energyKey);
      const turning = analyzePendulumHideTurning(params, stimulus, analysis);
      if (turning.hide_turn_count > 1) {
        throw new Error(`正式 Trial ${trial.id} 隐藏阶段转向超过一次`);
      }
      if (group === 1) {
        const key = comboKey({ show1T: stimulus.show1T, hide1T: stimulus.hide1T });
        if (!comboTurningCounts.has(key)) comboTurningCounts.set(key, 0);
        if (turning.hide_has_turning) {
          blockTurning += 1;
          totalOscillationTurning += 1;
          comboTurningCounts.set(key, comboTurningCounts.get(key)! + 1);
        }
      } else if (turning.hide_has_turning) {
        throw new Error(`实验二旋转 Trial ${trial.id} 不应发生转向`);
      }
    }
    if (group === 1 && blockTurning !== 4 && blockTurning !== 5) {
      throw new Error(`实验二摆动 Block 转向数应为4/5，实际 ${blockTurning}`);
    }
  }

  if (
    seenOscEnergies.size !== expectedOscEnergies.size ||
    [...seenOscEnergies].some((energy) => !expectedOscEnergies.has(energy))
  ) {
    throw new Error("实验二摆动能量 Block 与实验一15个水平不一致");
  }
  if (
    seenRotEnergies.size !== expectedRotEnergies.size ||
    [...seenRotEnergies].some((energy) => !expectedRotEnergies.has(energy))
  ) {
    throw new Error("实验二旋转能量 Block 不是最低五个保留水平");
  }
  for (const combo of experiment2TimingCombos(1)) {
    const count = comboTurningCounts.get(comboKey(combo)) ?? 0;
    if (count !== 7 && count !== 8) {
      throw new Error(`实验二摆动时序格 ${comboKey(combo)} 转向数应为7/8，实际 ${count}`);
    }
  }
  if (totalOscillationTurning !== 67 && totalOscillationTurning !== 68) {
    throw new Error(`实验二摆动正式转向总数应为67/68，实际 ${totalOscillationTurning}`);
  }
}
