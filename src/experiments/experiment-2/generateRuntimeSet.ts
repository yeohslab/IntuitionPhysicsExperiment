import { EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import type { Experiment2StimulusSet } from "../../shared/experimentTypes";
import {
  GRAVITY,
  ROD_LENGTH_M,
} from "../../experiment/physics/energySegments";
import {
  analyzePendulum,
  pendulumEnergy,
  pendulumRegime,
  type PendulumParams,
} from "../../experiment/physics/pendulum";
import { pendulumStateAtSimEnd } from "../../experiment/physics/simEndState";
import {
  assertUnitSimEndTheta,
  fitPendulumDiscreteTrial,
  invertPendulumTimedEndState,
  pendulumAngularErrorRad,
  pendulumThetaMaxRad,
  THETA_END_TOL_RAD,
} from "../../experiment/physics/pendulumUnitFit";
import { wrapAngleRad } from "../../experiment/physics/pendulumArcScore";
import { fadeTForRegime } from "../../experiment/physics/timePhases";
import { cryptoRandom, shuffleInPlace } from "../../experiment/stimulus/cryptoRandom";
import {
  type BlockSegment,
  type PendulumStimulusUnit,
  type PracticeSegment,
  type RestSegment,
  type TextControlUnit,
  type TextDisplayUnit,
  type TopLevelSequenceItem,
  type Trial,
} from "../../shared/experimentTypes";
import { newId } from "../../shared/ids";
import {
  WITHIN_SUBJECT_FIXATION_MS,
  WITHIN_SUBJECT_FIXATION_TEXT,
} from "../within-subject/protocol";
import {
  endpointBaselinesRadForEnergy,
  endpointSampleHalfWidthRadForEnergy,
  sampleTargetThetaEndRadNearBaseline,
} from "./endpointTargets";
import {
  experiment2BlockRestText,
  experiment2PracticeText,
  experiment2StructureText,
  experiment2WelcomeText,
} from "./instructions";
import {
  EXPERIMENT_2_ENDPOINTS_PER_ENERGY,
  EXPERIMENT_2_FORMAL_BLOCKS,
  EXPERIMENT_2_FORMAL_ENERGY_LEVELS_J,
  EXPERIMENT_2_HIDE_LEVELS_SEC,
  EXPERIMENT_2_PRACTICE_OSCILLATION_ENERGY_J,
  EXPERIMENT_2_PRACTICE_ROTATION_ENERGY_J,
  EXPERIMENT_2_PRACTICE_TRIALS,
  EXPERIMENT_2_SHOW_T,
  EXPERIMENT_2_TOTAL_RUNTIME_TRIALS,
  EXPERIMENT_2_TRIALS_PER_BLOCK,
} from "./protocol";

export {
  EXPERIMENT_2_FORMAL_BLOCKS,
  EXPERIMENT_2_FORMAL_ENERGY_LEVELS_J,
  EXPERIMENT_2_FORMAL_TRIALS,
  EXPERIMENT_2_HIDE_LEVELS_SEC,
  EXPERIMENT_2_PRACTICE_OSCILLATION_ENERGY_J,
  EXPERIMENT_2_PRACTICE_ROTATION_ENERGY_J,
  EXPERIMENT_2_PRACTICE_TRIALS,
  EXPERIMENT_2_SHOW_T,
  EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
  EXPERIMENT_2_TOTAL_RUNTIME_TRIALS,
  EXPERIMENT_2_TRIALS_PER_BLOCK,
} from "./protocol";

export type GenerateExperiment2RuntimeSetOptions = {
  subjectId: string;
  rng?: () => number;
  onProgress?: (completedTrials: number, totalTrials: number) => void;
};

type TimingCombo = { show1T: number; hide1T: number };

const PRACTICE_TIMING_COMBOS: TimingCombo[] = EXPERIMENT_2_HIDE_LEVELS_SEC.flatMap(
  (hide1T) =>
    Array.from({ length: 3 }, () => ({
      show1T: EXPERIMENT_2_SHOW_T,
      hide1T,
    })),
);

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

function makeRest(text: string): RestSegment {
  return { kind: "rest", id: newId(), units: [makeTextControl(text)] };
}

function countSpread(values: Iterable<number>): number {
  const numbers = [...values];
  return Math.max(...numbers) - Math.min(...numbers);
}

function chooseBalancedTimingSubset(
  combos: readonly TimingCombo[],
  count: 4 | 5,
  rng: () => number,
): TimingCombo[] {
  const results: TimingCombo[][] = [];
  const visit = (start: number, chosen: TimingCombo[]) => {
    if (chosen.length === count) {
      const hideCounts = new Map<number, number>(
        [...new Set(combos.map((combo) => combo.hide1T))].map(
          (value) => [value, 0] as [number, number],
        ),
      );
      for (const combo of chosen) {
        hideCounts.set(combo.hide1T, (hideCounts.get(combo.hide1T) ?? 0) + 1);
      }
      if (countSpread(hideCounts.values()) <= 1) {
        results.push(chosen.map((combo) => ({ ...combo })));
      }
      return;
    }
    for (let index = start; index < combos.length; index++) {
      visit(index + 1, [...chosen, combos[index]!]);
    }
  };
  visit(0, []);
  if (results.length === 0) {
    throw new Error(`实验二 V2 练习无法构造 ${count} 条平衡遮挡时序`);
  }
  const index = Math.min(results.length - 1, Math.floor(rng() * results.length));
  return results[index]!;
}

function fitPendulumForTarget(
  energyJ: number,
  combo: TimingCombo,
  targetThetaEndRad: number,
  rng: () => number,
): PendulumStimulusUnit {
  const fitted = invertPendulumTimedEndState({
    targetEnergyJ: energyJ,
    targetThetaEndRad,
    show1T: combo.show1T,
    hide1T: combo.hide1T,
    rodLengthM: ROD_LENGTH_M,
    gravity: GRAVITY,
    rng,
  });
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

function fitPendulumNearBaseline(
  energyJ: number,
  combo: TimingCombo,
  baselineRad: number,
  halfWidthRad: number,
  rng: () => number,
): PendulumStimulusUnit {
  for (let attempt = 0; attempt < 256; attempt++) {
    const targetThetaEndRad = sampleTargetThetaEndRadNearBaseline(
      baselineRad,
      halfWidthRad,
      rng,
    );
    try {
      return fitPendulumForTarget(energyJ, combo, targetThetaEndRad, rng);
    } catch {
      continue;
    }
  }
  throw new Error(
    `无法在基准 ${baselineRad} rad 邻域内拟合能量 ${energyJ} J 的试次`,
  );
}

function makePracticeBlock(
  rng: () => number,
  onTrialGenerated?: () => void,
): PracticeSegment {
  const oscillationCount: 4 | 5 = rng() < 0.5 ? 4 : 5;
  const rotationCount: 4 | 5 = oscillationCount === 4 ? 5 : 4;
  const planned = [
    ...chooseBalancedTimingSubset(PRACTICE_TIMING_COMBOS, oscillationCount, rng).map(
      (combo) => ({
        combo,
        energyJ: EXPERIMENT_2_PRACTICE_OSCILLATION_ENERGY_J,
      }),
    ),
    ...chooseBalancedTimingSubset(PRACTICE_TIMING_COMBOS, rotationCount, rng).map(
      (combo) => ({
        combo,
        energyJ: EXPERIMENT_2_PRACTICE_ROTATION_ENERGY_J,
      }),
    ),
  ];
  shuffleInPlace(planned, rng);
  return {
    kind: "practice",
    id: newId(),
    children: planned.map(({ combo, energyJ }) => {
      const fitted = fitPendulumDiscreteTrial({
        targetEnergyJ: energyJ,
        show1T: combo.show1T,
        hide1T: combo.hide1T,
        rodLengthM: ROD_LENGTH_M,
        gravity: GRAVITY,
        rng,
      });
      assertUnitSimEndTheta(fitted, energyJ, fitted.targetThetaEndRad);
      const stimulus: PendulumStimulusUnit = {
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
      onTrialGenerated?.();
      return {
        id: newId(),
        units: [makeFixation(), stimulus],
      };
    }),
  };
}

function makeHideBlock(
  hide1T: number,
  rng: () => number,
  onTrialGenerated?: () => void,
): BlockSegment {
  const combo: TimingCombo = { show1T: EXPERIMENT_2_SHOW_T, hide1T };
  const trials: Trial[] = [];
  for (const energyJ of EXPERIMENT_2_FORMAL_ENERGY_LEVELS_J) {
    const baselines = endpointBaselinesRadForEnergy(energyJ);
    const halfWidth = endpointSampleHalfWidthRadForEnergy(energyJ);
    for (const baselineRad of baselines) {
      const stimulus = fitPendulumNearBaseline(
        energyJ,
        combo,
        baselineRad,
        halfWidth,
        rng,
      );
      trials.push({
        id: newId(),
        units: [makeFixation(), stimulus],
      });
      onTrialGenerated?.();
    }
  }
  shuffleInPlace(trials, rng);
  return { kind: "block", id: newId(), children: trials };
}

function stimulusFromTrial(trial: Trial): PendulumStimulusUnit {
  const stimulus = trial.units.find(
    (unit): unit is PendulumStimulusUnit => unit.type === "pendulumStimulus",
  );
  if (!stimulus) throw new Error(`Trial ${trial.id} 缺少 pendulumStimulus`);
  return stimulus;
}

function nominalEnergyKey(energyJ: number): string {
  const match = EXPERIMENT_2_FORMAL_ENERGY_LEVELS_J.find(
    (nominal) => Math.abs(nominal - energyJ) < 2e-3,
  );
  if (!match) {
    throw new Error(`正式 Trial 能量 ${energyJ} J 不在协议 10 水平内`);
  }
  return match.toFixed(8);
}

function paramsFromStimulus(stimulus: PendulumStimulusUnit): PendulumParams {
  return {
    theta0Rad: (stimulus.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (stimulus.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: stimulus.rodLengthM,
    gravity: stimulus.gravity,
  };
}

function assertPracticeBlock(practice: PracticeSegment): void {
  if (practice.children.length !== EXPERIMENT_2_PRACTICE_TRIALS) {
    throw new Error(
      `实验二练习应有 ${EXPERIMENT_2_PRACTICE_TRIALS} 个 Trial，实际 ${practice.children.length}`,
    );
  }
  const oscillation: PendulumStimulusUnit[] = [];
  const rotation: PendulumStimulusUnit[] = [];
  for (const trial of practice.children) {
    const stimulus = stimulusFromTrial(trial);
    const regime = pendulumRegime(
      pendulumEnergy(paramsFromStimulus(stimulus)),
      stimulus.rodLengthM,
      stimulus.gravity,
    );
    if (regime === "rotation") rotation.push(stimulus);
    else oscillation.push(stimulus);
    if (stimulus.show1T !== EXPERIMENT_2_SHOW_T) {
      throw new Error("练习 Trial 的 show_T 应为 1.2");
    }
    if (!EXPERIMENT_2_HIDE_LEVELS_SEC.includes(stimulus.hide1T as 0.7 | 1 | 1.3)) {
      throw new Error(`练习 Trial 遮挡时长 ${stimulus.hide1T} 不在协议水平内`);
    }
  }
  const counts = [oscillation.length, rotation.length].sort();
  if (counts[0] !== 4 || counts[1] !== 5) {
    throw new Error(`练习运动类型应为4/5，实际 ${counts.join("/")}`);
  }
}

function assertFormalBlock(block: BlockSegment): void {
  if (block.children.length !== EXPERIMENT_2_TRIALS_PER_BLOCK) {
    throw new Error(
      `正式 Block 应有 ${EXPERIMENT_2_TRIALS_PER_BLOCK} 个 Trial，实际 ${block.children.length}`,
    );
  }
  const hideValues = new Set<number>();
  const energyCounts = new Map<string, number>();
  for (const trial of block.children) {
    const stimulus = stimulusFromTrial(trial);
    hideValues.add(stimulus.hide1T);
    if (stimulus.show1T !== EXPERIMENT_2_SHOW_T) {
      throw new Error("正式 Trial 的 show_T 应为 1.2");
    }
    const params = paramsFromStimulus(stimulus);
    const analysis = analyzePendulum(params);
    const energyKey = nominalEnergyKey(analysis.E);
    energyCounts.set(energyKey, (energyCounts.get(energyKey) ?? 0) + 1);
    const regime = analysis.regime === "rotation" ? "rotation" : "oscillation";
    const fadeT =
      stimulus.fadeMs /
      1000 /
      analysis.T;
    const expectedFadeT = fadeTForRegime(
      analysis.regime === "rotation" ? "rotation" : "oscillation",
    );
    if (Math.abs(fadeT - expectedFadeT) > 1e-6) {
      throw new Error(`Trial ${trial.id} fade_T 与运动类型不匹配`);
    }
    const nominalEnergyJ =
      EXPERIMENT_2_FORMAL_ENERGY_LEVELS_J.find(
        (nominal) => Math.abs(nominal - analysis.E) < 2e-3,
      ) ?? analysis.E;
    const endState = pendulumStateAtSimEnd(params, stimulus);
    const thetaMax = pendulumThetaMaxRad(
      nominalEnergyJ,
      stimulus.rodLengthM,
      stimulus.gravity,
    );
    const baselines = endpointBaselinesRadForEnergy(nominalEnergyJ);
    const halfWidth = endpointSampleHalfWidthRadForEnergy(nominalEnergyJ);
    const actualTheta =
      regime === "rotation" ? wrapAngleRad(endState.theta) : endState.theta;
    const matchesBaseline = baselines.some((baselineRad) => {
      const targetBaseline =
        regime === "rotation" ? wrapAngleRad(baselineRad) : baselineRad;
      const err = pendulumAngularErrorRad(
        actualTheta,
        targetBaseline,
        regime,
        thetaMax,
      );
      return err <= halfWidth + THETA_END_TOL_RAD;
    });
    if (!matchesBaseline) {
      throw new Error(`Trial ${trial.id} 终态角未落在任一基准邻域内`);
    }
  }
  if (hideValues.size !== 1) {
    throw new Error("每个正式 Block 应只有一种遮挡时长");
  }
  const hide1T = [...hideValues][0]!;
  if (!EXPERIMENT_2_HIDE_LEVELS_SEC.includes(hide1T as 0.7 | 1 | 1.3)) {
    throw new Error(`正式 Block 遮挡时长 ${hide1T} 不在协议水平内`);
  }
  for (const energyJ of EXPERIMENT_2_FORMAL_ENERGY_LEVELS_J) {
    const key = energyJ.toFixed(8);
    if (energyCounts.get(key) !== EXPERIMENT_2_ENDPOINTS_PER_ENERGY) {
      throw new Error(`能量 ${energyJ} J 在 Block 内应出现 5 次，实际 ${energyCounts.get(key) ?? 0}`);
    }
  }
}

export function assertExperiment2RuntimeStimulusSet(set: Experiment2StimulusSet): void {
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
    throw new Error(
      `实验二正式 Block 应为 ${EXPERIMENT_2_FORMAL_BLOCKS}，实际 ${formalBlocks.length}`,
    );
  }
  if (practices.length !== 1) {
    throw new Error(`实验二练习 Block 应为1，实际 ${practices.length}`);
  }
  assertPracticeBlock(practices[0]!);
  const hideLevelsSeen = new Set<number>();
  for (const block of formalBlocks) {
    assertFormalBlock(block);
    hideLevelsSeen.add(stimulusFromTrial(block.children[0]!).hide1T);
  }
  if (hideLevelsSeen.size !== EXPERIMENT_2_HIDE_LEVELS_SEC.length) {
    throw new Error("三个遮挡 Block 应各对应一种遮挡时长");
  }
  for (const hide1T of EXPERIMENT_2_HIDE_LEVELS_SEC) {
    if (!hideLevelsSeen.has(hide1T)) {
      throw new Error(`缺少遮挡时长 ${hide1T} s 的正式 Block`);
    }
  }
}

export function generateExperiment2RuntimeStimulusSet(
  options: GenerateExperiment2RuntimeSetOptions,
): Experiment2StimulusSet {
  const rng = options.rng ?? cryptoRandom();
  let completedTrials = 0;
  const report = () => {
    completedTrials += 1;
    options.onProgress?.(completedTrials, EXPERIMENT_2_TOTAL_RUNTIME_TRIALS);
  };
  const formalBlocks = EXPERIMENT_2_HIDE_LEVELS_SEC.map((hide1T) =>
    makeHideBlock(hide1T, rng, report),
  );
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
