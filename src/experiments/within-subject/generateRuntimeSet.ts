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
  type BlockSegment,
  type PendulumStimulusUnit,
  type PracticeSegment,
  type RestSegment,
  type RuntimeStimulusSet,
  type TextControlUnit,
  type TextDisplayUnit,
  type TopLevelSequenceItem,
  type Trial,
} from "../../shared/experimentTypes";
import { newId } from "../../shared/ids";
import { cryptoRandom, shuffleInPlace } from "../../experiment/stimulus/cryptoRandom";
import {
  WITHIN_SUBJECT_FIXATION_MS,
  WITHIN_SUBJECT_FIXATION_TEXT,
  WITHIN_SUBJECT_PRACTICE_TRIALS,
  WITHIN_SUBJECT_ROTATION_PRACTICE_ENERGY_J,
  WITHIN_SUBJECT_SPEED_V_MAX_M_PER_SEC,
  WITHIN_SUBJECT_TRIALS_PER_BLOCK,
} from "./protocol";

export * from "./protocol";

export type WithinSubjectInstructions = {
  welcomeText(): string;
  structureText(): string;
  practiceText(): string;
  blockRestText(current: number, total: number): string;
};

export type WithinSubjectProtocolConfig = {
  label: string;
  schemaVersion: number;
  oscillationSegments: readonly KeptEnergySegment[];
  rotationSegments: readonly KeptEnergySegment[];
  timingCombos?: (
    group: MotionGroup,
  ) => readonly WithinSubjectTimingCombo[];
  instructions: WithinSubjectInstructions;
};

export type WithinSubjectTimingCombo = { show1T: number; hide1T: number };

export const WITHIN_SUBJECT_OSCILLATION_SEGMENTS =
  buildKeptEnergySegmentsForGroup(1);
export const WITHIN_SUBJECT_ROTATION_SEGMENTS =
  buildKeptEnergySegmentsForGroup(2).slice(0, 5);
export const WITHIN_SUBJECT_MAX_FORMAL_ENERGY_J = Math.max(
  ...WITHIN_SUBJECT_OSCILLATION_SEGMENTS.map((segment) => segment.Emid),
  ...WITHIN_SUBJECT_ROTATION_SEGMENTS.map((segment) => segment.Emid),
);
const derivedWithinSubjectSpeedVMaxMPerSec =
  ROD_LENGTH_M *
  pendulumOmegaRadForEnergyAtBottom(
    WITHIN_SUBJECT_MAX_FORMAL_ENERGY_J,
    ROD_LENGTH_M,
  );

if (
  Math.abs(
    derivedWithinSubjectSpeedVMaxMPerSec - WITHIN_SUBJECT_SPEED_V_MAX_M_PER_SEC,
  ) > 1e-12
) {
  throw new Error("被试内协议统一速度上限与所选正式能量不一致");
}

export function withinSubjectTimingCombos(group: MotionGroup): WithinSubjectTimingCombo[] {
  const combos: WithinSubjectTimingCombo[] = [];
  for (const hide1T of HIDE_LEVELS_SEC) {
    for (const show1T of showLevelsForGroup(group)) {
      combos.push({ show1T, hide1T });
    }
  }
  return combos;
}

function timingCombosForConfig(
  config: WithinSubjectProtocolConfig,
  group: MotionGroup,
): WithinSubjectTimingCombo[] {
  const combos = (config.timingCombos?.(group) ?? withinSubjectTimingCombos(group)).map(
    (combo) => ({ ...combo }),
  );
  if (combos.length !== WITHIN_SUBJECT_TRIALS_PER_BLOCK) {
    throw new Error(
      `${config.label}组 ${group} 时序计划应有 ${WITHIN_SUBJECT_TRIALS_PER_BLOCK} 条，实际 ${combos.length}`,
    );
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
    text: WITHIN_SUBJECT_FIXATION_TEXT,
    durationMs: WITHIN_SUBJECT_FIXATION_MS,
  };
}

function makePendulumStimulus(
  energyJ: number,
  combo: WithinSubjectTimingCombo,
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
  timingCombos: readonly WithinSubjectTimingCombo[],
  rng: () => number,
  turningPlan: readonly boolean[] | undefined,
  onTrialGenerated?: () => void,
): BlockSegment {
  const planned = timingCombos.map((combo, index) => ({
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

function comboKey(combo: WithinSubjectTimingCombo): string {
  return `${combo.show1T}|${combo.hide1T}`;
}

function comboCounts(
  combos: readonly WithinSubjectTimingCombo[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const combo of combos) {
    const key = comboKey(combo);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function countSpread(values: Iterable<number>): number {
  const numbers = [...values];
  return Math.max(...numbers) - Math.min(...numbers);
}

function balancedTimingSubsets(
  combos: readonly WithinSubjectTimingCombo[],
  count: 4 | 5,
): WithinSubjectTimingCombo[][] {
  const results: WithinSubjectTimingCombo[][] = [];
  const visit = (start: number, chosen: WithinSubjectTimingCombo[]) => {
    if (chosen.length === count) {
      const showCounts = new Map<number, number>(
        [...new Set(combos.map((combo) => combo.show1T))].map(
          (value) => [value, 0] as [number, number],
        ),
      );
      const hideCounts = new Map<number, number>(
        [...new Set(combos.map((combo) => combo.hide1T))].map(
          (value) => [value, 0] as [number, number],
        ),
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
  combos: readonly WithinSubjectTimingCombo[],
  group: MotionGroup,
  count: 4 | 5,
  rng: () => number,
): WithinSubjectTimingCombo[] {
  const candidates = balancedTimingSubsets(combos, count);
  if (candidates.length === 0) {
    throw new Error(`被试内协议练习无法构造组 ${group} 的 ${count} 条平衡时序`);
  }
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[index]!.map((combo) => ({ ...combo }));
}

function makePracticeBlock(
  config: WithinSubjectProtocolConfig,
  rng: () => number,
  onTrialGenerated?: () => void,
): PracticeSegment {
  const oscillationCount: 4 | 5 = rng() < 0.5 ? 4 : 5;
  const rotationCount: 4 | 5 = oscillationCount === 4 ? 5 : 4;
  const oscillationTimingCombos = timingCombosForConfig(config, 1);
  const rotationTimingCombos = timingCombosForConfig(config, 2);
  const planned = [
    ...chooseBalancedTimingSubset(
      oscillationTimingCombos,
      1,
      oscillationCount,
      rng,
    ).map((combo) => ({
      combo,
      group: 1 as const,
      energyJ: practiceEnergyForGroup(1),
    })),
    ...chooseBalancedTimingSubset(
      rotationTimingCombos,
      2,
      rotationCount,
      rng,
    ).map((combo) => ({
      combo,
      group: 2 as const,
      energyJ: WITHIN_SUBJECT_ROTATION_PRACTICE_ENERGY_J,
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

export type GenerateWithinSubjectRuntimeSetOptions = {
  subjectId: string;
  rng?: () => number;
  onProgress?: (completedTrials: number, totalTrials: number) => void;
};

export function generateWithinSubjectRuntimeStimulusSet(
  options: GenerateWithinSubjectRuntimeSetOptions,
  config: WithinSubjectProtocolConfig,
): RuntimeStimulusSet {
  const rng = options.rng ?? cryptoRandom();
  const oscillationTimingCombos = timingCombosForConfig(config, 1);
  const rotationTimingCombos = timingCombosForConfig(config, 2);
  const formalBlockCount =
    config.oscillationSegments.length + config.rotationSegments.length;
  const totalRuntimeTrials =
    WITHIN_SUBJECT_PRACTICE_TRIALS +
    formalBlockCount * WITHIN_SUBJECT_TRIALS_PER_BLOCK;
  let completedTrials = 0;
  const report = () => {
    completedTrials += 1;
    options.onProgress?.(completedTrials, totalRuntimeTrials);
  };
  const turningPlan = buildFormalHideTurningPlan(
    config.oscillationSegments.length,
    oscillationTimingCombos.length,
    rng,
  );
  const formalBlocks = [
    ...config.oscillationSegments.map((segment, energyIndex) =>
      makeFormalBlock(
        segment,
        oscillationTimingCombos,
        rng,
        turningPlan[energyIndex],
        report,
      ),
    ),
    ...config.rotationSegments.map((segment) =>
      makeFormalBlock(
        segment,
        rotationTimingCombos,
        rng,
        undefined,
        report,
      ),
    ),
  ];
  shuffleInPlace(formalBlocks, rng);

  const sequence: TopLevelSequenceItem[] = [
    makeRest(config.instructions.welcomeText()),
    makeRest(config.instructions.structureText()),
    makeRest(config.instructions.practiceText()),
    makePracticeBlock(config, rng, report),
  ];
  formalBlocks.forEach((block, index) => {
    sequence.push(
      makeRest(config.instructions.blockRestText(index + 1, formalBlockCount)),
      block,
    );
  });
  const set: RuntimeStimulusSet = {
    schemaVersion: config.schemaVersion,
    sequence,
  };
  assertWithinSubjectRuntimeStimulusSet(set, config);
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
  config: WithinSubjectProtocolConfig,
): void {
  if (trials.length !== WITHIN_SUBJECT_TRIALS_PER_BLOCK) {
    throw new Error(`${label} 应有 9 个 Trial，实际 ${trials.length}`);
  }
  const expectedCombos = timingCombosForConfig(config, group);
  const expected = comboCounts(expectedCombos);
  const actual = comboCounts(
    trials.map((trial) => {
      const stimulus = stimulusFromTrial(trial);
      return { show1T: stimulus.show1T, hide1T: stimulus.hide1T };
    }),
  );
  if (
    actual.size !== expected.size ||
    [...expected].some(([key, count]) => actual.get(key) !== count)
  ) {
    throw new Error(`${label} 未完整覆盖组 ${group} 的预定时序计划`);
  }
}

function assertPractice(
  practice: PracticeSegment,
  config: WithinSubjectProtocolConfig,
): void {
  if (practice.children.length !== WITHIN_SUBJECT_PRACTICE_TRIALS) {
    throw new Error(`被试内协议练习应有 9 个 Trial，实际 ${practice.children.length}`);
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
    throw new Error(`被试内协议练习运动类型应为4/5，实际 ${counts.join("/")}`);
  }
  for (const group of [1, 2] as const) {
    const stimuli = byGroup.get(group)!;
    const expectedCombos = timingCombosForConfig(config, group);
    const allowedCounts = comboCounts(expectedCombos);
    const actualCounts = comboCounts(
      stimuli.map((stimulus) => ({
        show1T: stimulus.show1T,
        hide1T: stimulus.hide1T,
      })),
    );
    if (
      [...actualCounts].some(
        ([key, count]) => count > (allowedCounts.get(key) ?? 0),
      )
    ) {
      throw new Error(`被试内协议练习组 ${group} 使用了计划外时序`);
    }
    const showCounts = new Map<number, number>(
      [...new Set(expectedCombos.map((combo) => combo.show1T))].map(
        (value) => [value, 0] as [number, number],
      ),
    );
    const hideCounts = new Map<number, number>(
      [...new Set(expectedCombos.map((combo) => combo.hide1T))].map(
        (value) => [value, 0] as [number, number],
      ),
    );
    for (const stimulus of stimuli) {
      showCounts.set(stimulus.show1T, (showCounts.get(stimulus.show1T) ?? 0) + 1);
      hideCounts.set(stimulus.hide1T, (hideCounts.get(stimulus.hide1T) ?? 0) + 1);
    }
    if (countSpread(showCounts.values()) > 1 || countSpread(hideCounts.values()) > 1) {
      throw new Error(`被试内协议练习组 ${group} 时序边缘不平衡`);
    }
  }
}

export function assertWithinSubjectRuntimeStimulusSet(
  set: RuntimeStimulusSet,
  config: WithinSubjectProtocolConfig,
): void {
  if (set.schemaVersion !== config.schemaVersion) {
    throw new Error(`${config.label}刺激集 schema 应为 ${config.schemaVersion}`);
  }
  const formalBlocks = set.sequence.filter(
    (item): item is BlockSegment => item.kind === "block",
  );
  const practices = set.sequence.filter(
    (item): item is PracticeSegment => item.kind === "practice",
  );
  const expectedFormalBlocks =
    config.oscillationSegments.length + config.rotationSegments.length;
  if (formalBlocks.length !== expectedFormalBlocks) {
    throw new Error(
      `${config.label}正式 Block 应为${expectedFormalBlocks}，实际 ${formalBlocks.length}`,
    );
  }
  if (practices.length !== 1) {
    throw new Error(`${config.label}练习 Block 应为1，实际 ${practices.length}`);
  }
  assertPractice(practices[0]!, config);

  const expectedOscEnergies = new Set(
    config.oscillationSegments.map((segment) => segment.Emid.toFixed(8)),
  );
  const expectedRotEnergies = new Set(
    config.rotationSegments.map((segment) => segment.Emid.toFixed(8)),
  );
  const seenOscEnergies = new Set<string>();
  const seenRotEnergies = new Set<string>();
  const comboTurningCounts = new Map<string, number>();
  const oscillationTimingCombos = timingCombosForConfig(config, 1);
  let totalOscillationTurning = 0;

  for (const block of formalBlocks) {
    const first = stimulusFromTrial(block.children[0]!);
    const group = sourceGroup(first);
    assertTimingSet(block.children, group, `正式 Block ${block.id}`, config);
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
        throw new Error(`被试内协议旋转 Trial ${trial.id} 不应发生转向`);
      }
    }
    if (group === 1 && blockTurning !== 4 && blockTurning !== 5) {
      throw new Error(`被试内协议摆动 Block 转向数应为4/5，实际 ${blockTurning}`);
    }
  }

  if (
    seenOscEnergies.size !== expectedOscEnergies.size ||
    [...seenOscEnergies].some((energy) => !expectedOscEnergies.has(energy))
  ) {
    throw new Error(`${config.label}摆动能量 Block 与协议配置不一致`);
  }
  if (
    seenRotEnergies.size !== expectedRotEnergies.size ||
    [...seenRotEnergies].some((energy) => !expectedRotEnergies.has(energy))
  ) {
    throw new Error(`${config.label}旋转能量 Block 与协议配置不一致`);
  }
  const oscillationComboMultiplicities = comboCounts(oscillationTimingCombos);
  for (const [key, multiplicity] of oscillationComboMultiplicities) {
    const minTurningForKey = Math.floor(
      (config.oscillationSegments.length * multiplicity) / 2,
    );
    const maxTurningForKey = Math.ceil(
      (config.oscillationSegments.length * multiplicity) / 2,
    );
    const count = comboTurningCounts.get(key) ?? 0;
    if (count < minTurningForKey || count > maxTurningForKey) {
      throw new Error(
        `${config.label}摆动时序格 ${key} 转向数应为${minTurningForKey}/${maxTurningForKey}，实际 ${count}`,
      );
    }
  }
  const turningCellCount =
    config.oscillationSegments.length * oscillationTimingCombos.length;
  const minTotalTurning = Math.floor(turningCellCount / 2);
  const maxTotalTurning = Math.ceil(turningCellCount / 2);
  if (
    totalOscillationTurning < minTotalTurning ||
    totalOscillationTurning > maxTotalTurning
  ) {
    throw new Error(
      `${config.label}摆动正式转向总数应为${minTotalTurning}/${maxTotalTurning}，实际 ${totalOscillationTurning}`,
    );
  }
}
