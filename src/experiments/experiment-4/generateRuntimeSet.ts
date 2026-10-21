import { cryptoRandom, shuffleInPlace } from "../../experiment/stimulus/cryptoRandom";
import { EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import type {
  BlockSegment,
  Experiment4StimulusSet,
  GratingPendulumStimulusUnit,
  PracticeSegment,
  RestSegment,
  TextControlUnit,
  TextDisplayUnit,
  TopLevelSequenceItem,
  Trial,
} from "../../shared/experimentTypes";
import { newId } from "../../shared/ids";
import { radToDeg } from "../../experiment/physics/pendulumArcScore";
import {
  bobVisibilityAtTime,
  planTrialQuery,
} from "./grating";
import {
  experiment4BlockRestText,
  experiment4PracticeText,
  experiment4ReleaseCueText,
  experiment4StructureText,
  experiment4WelcomeText,
  EXPERIMENT_4_FIXATION_TEXT,
} from "./instructions";
import {
  EXPERIMENT_4_BAR_WIDTH_M,
  EXPERIMENT_4_BOB_RADIUS_M,
  EXPERIMENT_4_DURATION_SEC,
  EXPERIMENT_4_FIXATION_MS,
  EXPERIMENT_4_RELEASE_CUE_MS,
  EXPERIMENT_4_FORMAL_BLOCKS,
  EXPERIMENT_4_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_4_GAP_LEVEL_ORDER,
  EXPERIMENT_4_PRACTICE_TRIALS,
  EXPERIMENT_4_RELEASE_SIDE_SEQUENCE,
  EXPERIMENT_4_TOTAL_RUNTIME_TRIALS,
  type Experiment4GapLevel,
} from "./protocol";

export type GenerateExperiment4RuntimeSetOptions = {
  onProgress?: (completedTrials: number, totalTrials: number) => void;
  rng?: () => number;
};

function makeTextControl(text: string): TextControlUnit {
  return { id: newId(), type: "textControl", text, key: " " };
}

function makeFixation(): TextDisplayUnit {
  return {
    id: newId(),
    type: "textDisplay",
    text: EXPERIMENT_4_FIXATION_TEXT,
    durationMs: EXPERIMENT_4_FIXATION_MS,
  };
}

function makeReleaseCue(side: "left" | "right"): TextDisplayUnit {
  return {
    id: newId(),
    type: "textDisplay",
    text: experiment4ReleaseCueText(side),
    durationMs: EXPERIMENT_4_RELEASE_CUE_MS,
  };
}

function makeRest(text: string): RestSegment {
  return { kind: "rest", id: newId(), units: [makeTextControl(text)] };
}

function buildGratingUnit(
  side: "left" | "right",
  gapLevel: Experiment4GapLevel,
  rng: () => number,
): GratingPendulumStimulusUnit {
  const planned = planTrialQuery(side, gapLevel, rng);
  const { params, gapM, tQuerySec, occlusionSegmentIndex, timeline, firstVisibleSec } =
    planned;
  return {
    id: newId(),
    type: "gratingPendulumStimulus",
    theta0Deg: radToDeg(params.theta0Rad),
    omega0DegPerSec: radToDeg(params.omega0RadPerSec),
    rodLengthM: params.rodLengthM,
    gravity: params.gravity,
    durationSec: EXPERIMENT_4_DURATION_SEC,
    queryTimeSec: tQuerySec,
    gapLevel,
    gapM,
    barWidthM: EXPERIMENT_4_BAR_WIDTH_M,
    bobRadiusM: EXPERIMENT_4_BOB_RADIUS_M,
    releaseSide: side,
    occlusionSegmentIndex,
    occlusionTimeline: timeline.map((s) => ({
      kind: s.kind,
      tStartSec: s.tStartSec,
      tEndSec: s.tEndSec,
    })),
    firstVisibleSec,
  };
}

function makeTrial(
  side: "left" | "right",
  gapLevel: Experiment4GapLevel,
  rng: () => number,
): Trial {
  return {
    id: newId(),
    units: [makeReleaseCue(side), makeFixation(), buildGratingUnit(side, gapLevel, rng)],
  };
}

function makeFormalBlock(
  gapLevel: Experiment4GapLevel,
  rng: () => number,
  onTrial?: () => void,
): BlockSegment {
  const children = EXPERIMENT_4_RELEASE_SIDE_SEQUENCE.map((side) => {
    const trial = makeTrial(side, gapLevel, rng);
    onTrial?.();
    return trial;
  });
  shuffleInPlace(children, rng);
  return { kind: "block", id: newId(), children };
}

function makePracticeBlock(rng: () => number, onTrial?: () => void): PracticeSegment {
  const levels = [...EXPERIMENT_4_GAP_LEVEL_ORDER];
  shuffleInPlace(levels, rng);
  const children = levels.map((gapLevel) => {
    const side: "left" | "right" = rng() < 0.5 ? "left" : "right";
    const trial = makeTrial(side, gapLevel, rng);
    onTrial?.();
    return trial;
  });
  return { kind: "practice", id: newId(), children };
}

function stimulusFromTrial(trial: Trial): GratingPendulumStimulusUnit {
  const unit = trial.units.find(
    (u): u is GratingPendulumStimulusUnit => u.type === "gratingPendulumStimulus",
  );
  if (!unit) throw new Error(`Trial ${trial.id} 缺少 gratingPendulumStimulus`);
  return unit;
}

export function assertExperiment4RuntimeStimulusSet(set: Experiment4StimulusSet): void {
  if (set.schemaVersion !== EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION) {
    throw new Error(
      `实验四刺激集 schema 应为 ${EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION}`,
    );
  }
  const practices = set.sequence.filter((s) => s.kind === "practice");
  const blocks = set.sequence.filter((s) => s.kind === "block");
  if (practices.length !== 1) {
    throw new Error(`练习 Block 应为 1，实际 ${practices.length}`);
  }
  if (practices[0]!.children.length !== EXPERIMENT_4_PRACTICE_TRIALS) {
    throw new Error(`练习试次应为 ${EXPERIMENT_4_PRACTICE_TRIALS}`);
  }
  if (blocks.length !== EXPERIMENT_4_FORMAL_BLOCKS) {
    throw new Error(`正式 Block 应为 ${EXPERIMENT_4_FORMAL_BLOCKS}`);
  }
  const gapLevelsSeen = new Set<Experiment4GapLevel>();
  for (const block of blocks) {
    if (block.children.length !== EXPERIMENT_4_FORMAL_TRIALS_PER_BLOCK) {
      throw new Error("正式 Block 试次数错误");
    }
    const sides = { left: 0, right: 0 };
    let gapLevel: Experiment4GapLevel | null = null;
    for (const trial of block.children) {
      const unit = stimulusFromTrial(trial);
      gapLevel = gapLevel ?? unit.gapLevel;
      if (unit.gapLevel !== gapLevel) {
        throw new Error("同一 Block 内间隙档应一致");
      }
      sides[unit.releaseSide] += 1;
      const params = {
        theta0Rad: (unit.theta0Deg * Math.PI) / 180,
        omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
        rodLengthM: unit.rodLengthM,
        gravity: unit.gravity,
      };
      const vis = bobVisibilityAtTime(unit.queryTimeSec, params, unit.gapM);
      if (vis !== "fully_occluded") {
        throw new Error(`t_q=${unit.queryTimeSec} 非完全遮挡`);
      }
    }
    if (sides.left !== 10 || sides.right !== 10) {
      throw new Error(`左右释放应为 10/10，实际 ${sides.left}/${sides.right}`);
    }
    gapLevelsSeen.add(gapLevel!);
  }
  if (gapLevelsSeen.size !== EXPERIMENT_4_GAP_LEVEL_ORDER.length) {
    throw new Error("应覆盖三档间隙");
  }
}

export function generateExperiment4RuntimeStimulusSet(
  options: GenerateExperiment4RuntimeSetOptions = {},
): Experiment4StimulusSet {
  const rng = options.rng ?? cryptoRandom();
  let completed = 0;
  const report = () => {
    completed += 1;
    options.onProgress?.(completed, EXPERIMENT_4_TOTAL_RUNTIME_TRIALS);
  };
  const formalBlocks = EXPERIMENT_4_GAP_LEVEL_ORDER.map((level) =>
    makeFormalBlock(level, rng, report),
  );
  shuffleInPlace(formalBlocks, rng);
  const sequence: TopLevelSequenceItem[] = [
    makeRest(experiment4WelcomeText()),
    makeRest(experiment4StructureText()),
    makeRest(experiment4PracticeText()),
    makePracticeBlock(rng, report),
  ];
  formalBlocks.forEach((block, index) => {
    sequence.push(
      makeRest(experiment4BlockRestText(index + 1, EXPERIMENT_4_FORMAL_BLOCKS)),
      block,
    );
  });
  const set: Experiment4StimulusSet = {
    schemaVersion: EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION,
    sequence,
  };
  assertExperiment4RuntimeStimulusSet(set);
  return set;
}

export async function generateExperiment4RuntimeStimulusSetAsync(
  options: GenerateExperiment4RuntimeSetOptions = {},
): Promise<Experiment4StimulusSet> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  return generateExperiment4RuntimeStimulusSet(options);
}
