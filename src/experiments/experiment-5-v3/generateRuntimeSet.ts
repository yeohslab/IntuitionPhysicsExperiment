import { cryptoRandom, shuffleInPlace } from "../../experiment/stimulus/cryptoRandom";
import { newId } from "../../shared/ids";
import type {
  BellReachabilityV3StimulusUnit,
  BlockSegment,
  Experiment5V3StimulusSet,
  PracticeSegment,
  RestSegment,
  TextDisplayUnit,
  TopLevelSequenceItem,
  Trial,
} from "../../shared/experimentTypes";
import { EXPERIMENT_5_V3_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import type { Experiment5ParticipantInfo } from "../../shared/participant";
import { PROTOCOL_2_MODEL_DT_SEC } from "../protocol-2/common";
import {
  experiment5V3BellThetaRad,
  experiment5V3EndpointReachesBell,
  planExperiment5V3Approach,
  type Experiment5V3ApproachPlan,
  type Experiment5V3ApproachSide,
} from "./approachPlan";
import {
  experiment5V3BlockText,
  experiment5V3InitialCueText,
  experiment5V3PracticeText,
  experiment5V3StructureText,
  experiment5V3WelcomeText,
} from "./instructions";
import {
  EXPERIMENT_5_V3_AMPLITUDES_DEG,
  EXPERIMENT_5_V3_APPROACH_SIDES,
  EXPERIMENT_5_V3_BELL_ANGLE_OFFSETS_DEG,
  EXPERIMENT_5_V3_BLANK_BEFORE_LOWEST_BELL_SEC,
  EXPERIMENT_5_V3_BOB_RADIUS_M,
  EXPERIMENT_5_V3_CUE_MS,
  EXPERIMENT_5_V3_FIXATION_MS,
  EXPERIMENT_5_V3_FIXATION_TEXT,
  EXPERIMENT_5_V3_FORMAL_BLOCKS,
  EXPERIMENT_5_V3_FORMAL_TRIALS,
  EXPERIMENT_5_V3_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_5_V3_FORMAL_TRIALS_PER_SIDE,
  EXPERIMENT_5_V3_GRAVITY,
  EXPERIMENT_5_V3_LOWEST_BELL_OFFSET_DEG,
  EXPERIMENT_5_V3_NO_KEY,
  EXPERIMENT_5_V3_PRACTICE_AMPLITUDE_DEG,
  EXPERIMENT_5_V3_PRACTICE_TRIALS,
  EXPERIMENT_5_V3_ROD_LENGTH_M,
  EXPERIMENT_5_V3_SLIT_WIDTH_M,
  EXPERIMENT_5_V3_TOTAL_RUNTIME_TRIALS,
  EXPERIMENT_5_V3_YES_KEY,
} from "./protocol";
import {
  experiment5V3SlitFitsDepartureSide,
  experiment5V3SlitGrid,
  type Experiment5V3Slit,
} from "./slitGrid";

export type GenerateExperiment5V3Options = {
  rng?: () => number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
};

function control(text: string) {
  return { id: newId(), type: "textControl" as const, text, key: " " };
}

function rest(text: string): RestSegment {
  return { kind: "rest", id: newId(), units: [control(text)] };
}

function bellUnit(
  plan: Experiment5V3ApproachPlan,
  angleOffsetDeg: number,
  side: Experiment5V3ApproachSide,
  slit: Experiment5V3Slit,
): BellReachabilityV3StimulusUnit {
  const bell = experiment5V3BellThetaRad(plan.amplitudeDeg, angleOffsetDeg, side);
  return {
    id: newId(),
    type: "bellReachabilityV3Stimulus",
    theta0Deg: plan.theta0Deg,
    omega0DegPerSec: plan.omega0DegPerSec,
    rodLengthM: EXPERIMENT_5_V3_ROD_LENGTH_M,
    gravity: EXPERIMENT_5_V3_GRAVITY,
    bobRadiusM: EXPERIMENT_5_V3_BOB_RADIUS_M,
    energyJ: plan.energyJ,
    amplitudeDeg: plan.amplitudeDeg,
    queryThetaDeg: plan.queryThetaDeg,
    queryOmegaRadPerSec: plan.queryOmegaRadPerSec,
    queryTimeSec: plan.queryTimeSec,
    blankStartSec: plan.blankStartSec,
    blankDurationSec: plan.blankDurationSec,
    stateSiteId: plan.stateSiteId,
    modelDtSec: PROTOCOL_2_MODEL_DT_SEC,
    bellAngleOffsetDeg: angleOffsetDeg,
    bellContactHeightM: bell.height,
    bellThetaDeg: (bell.theta * 180) / Math.PI,
    bellSide: side,
    correctResponse: experiment5V3EndpointReachesBell(plan.amplitudeDeg, bell.theta)
      ? "reachable" : "unreachable",
    yesKey: EXPERIMENT_5_V3_YES_KEY,
    noKey: EXPERIMENT_5_V3_NO_KEY,
    ...slit,
  };
}

function cueUnit(unit: BellReachabilityV3StimulusUnit): TextDisplayUnit {
  return {
    id: newId(),
    type: "textDisplay",
    text: experiment5V3InitialCueText(
      unit.bellSide === "left" ? "right" : "left",
      unit.bellSide === "left" ? "leftward" : "rightward",
    ),
    durationMs: EXPERIMENT_5_V3_CUE_MS,
  };
}

function fixationUnit(): TextDisplayUnit {
  return {
    id: newId(),
    type: "textDisplay",
    text: EXPERIMENT_5_V3_FIXATION_TEXT,
    durationMs: EXPERIMENT_5_V3_FIXATION_MS,
  };
}

function asTrial(unit: BellReachabilityV3StimulusUnit): Trial {
  return { id: newId(), units: [cueUnit(unit), fixationUnit(), unit] };
}

function bellOf(trial: Trial): BellReachabilityV3StimulusUnit {
  const unit = trial.units.find(
    (item): item is BellReachabilityV3StimulusUnit =>
      item.type === "bellReachabilityV3Stimulus",
  );
  if (!unit) throw new Error("试次缺少铃铛刺激");
  return unit;
}

function formalTrials(rng: () => number, onTrial: () => void): Trial[] {
  const trials: Trial[] = [];
  for (const amplitudeDeg of EXPERIMENT_5_V3_AMPLITUDES_DEG) {
    for (const side of EXPERIMENT_5_V3_APPROACH_SIDES) {
      const plan = planExperiment5V3Approach(amplitudeDeg, side);
      const slits = experiment5V3SlitGrid(
        amplitudeDeg,
        side,
        EXPERIMENT_5_V3_BELL_ANGLE_OFFSETS_DEG.length,
      );
      shuffleInPlace(slits, rng);
      EXPERIMENT_5_V3_BELL_ANGLE_OFFSETS_DEG.forEach((offset, index) => {
        trials.push(asTrial(bellUnit(plan, offset, side, slits[index]!)));
        onTrial();
      });
    }
  }
  return trials;
}

function splitIntoRestBlocks(trials: Trial[], rng: () => number): BlockSegment[] {
  const buckets: Trial[][] = Array.from(
    { length: EXPERIMENT_5_V3_FORMAL_BLOCKS },
    () => [],
  );
  for (const amplitudeDeg of EXPERIMENT_5_V3_AMPLITUDES_DEG) {
    for (const side of EXPERIMENT_5_V3_APPROACH_SIDES) {
      const group = trials.filter((trial) => {
        const unit = bellOf(trial);
        return unit.amplitudeDeg === amplitudeDeg && unit.bellSide === side;
      });
      shuffleInPlace(group, rng);
      const perBlock = group.length / buckets.length;
      if (!Number.isInteger(perBlock)) throw new Error("实验五V3无法把条件均分到休息区组");
      buckets.forEach((bucket, index) => {
        bucket.push(...group.slice(index * perBlock, (index + 1) * perBlock));
      });
    }
  }
  return buckets.map((children) => {
    shuffleInPlace(children, rng);
    return { kind: "block", id: newId(), children };
  });
}

function practiceBlock(rng: () => number, onTrial: () => void): PracticeSegment {
  const children = EXPERIMENT_5_V3_APPROACH_SIDES.flatMap((side) => {
    const plan = planExperiment5V3Approach(EXPERIMENT_5_V3_PRACTICE_AMPLITUDE_DEG, side);
    const slits = experiment5V3SlitGrid(EXPERIMENT_5_V3_PRACTICE_AMPLITUDE_DEG, side, 2);
    shuffleInPlace(slits, rng);
    const offsets = [
      EXPERIMENT_5_V3_LOWEST_BELL_OFFSET_DEG,
      -EXPERIMENT_5_V3_LOWEST_BELL_OFFSET_DEG,
    ];
    onTrial();
    onTrial();
    return offsets.map((offset, index) => asTrial(bellUnit(plan, offset, side, slits[index]!)));
  });
  shuffleInPlace(children, rng);
  return { kind: "practice", id: newId(), children };
}

export function generateExperiment5V3RuntimeStimulusSet(
  _participant: Experiment5ParticipantInfo,
  options: GenerateExperiment5V3Options = {},
): Experiment5V3StimulusSet {
  const rng = options.rng ?? cryptoRandom();
  let completed = 0;
  const report = () => {
    completed += 1;
    options.onProgress?.(completed, EXPERIMENT_5_V3_TOTAL_RUNTIME_TRIALS);
  };
  const blocks = splitIntoRestBlocks(formalTrials(rng, report), rng);
  const sequence: TopLevelSequenceItem[] = [
    rest(experiment5V3WelcomeText()),
    rest(experiment5V3StructureText()),
    rest(experiment5V3PracticeText()),
    practiceBlock(rng, report),
  ];
  blocks.forEach((block, index) => {
    sequence.push(
      rest(experiment5V3BlockText(index + 1, EXPERIMENT_5_V3_FORMAL_BLOCKS)),
      block,
    );
  });
  const set: Experiment5V3StimulusSet = {
    schemaVersion: EXPERIMENT_5_V3_STIMULUS_SET_SCHEMA_VERSION,
    sequence,
  };
  assertExperiment5V3RuntimeStimulusSet(set);
  return set;
}

export async function generateExperiment5V3RuntimeStimulusSetAsync(
  participant: Experiment5ParticipantInfo,
  options: GenerateExperiment5V3Options = {},
): Promise<Experiment5V3StimulusSet> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./generateWorker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      callback();
    };
    const onAbort = () => finish(() => reject(new DOMException("刺激集生成已取消", "AbortError")));
    worker.addEventListener("message", (event: MessageEvent<
      | { type: "progress"; completed: number; total: number }
      | { type: "success"; set: Experiment5V3StimulusSet }
      | { type: "error"; message: string }
    >) => {
      const message = event.data;
      if (message.type === "progress") options.onProgress?.(message.completed, message.total);
      else if (message.type === "success") finish(() => resolve(message.set));
      else finish(() => reject(new Error(message.message)));
    });
    worker.addEventListener("error", (event) => finish(() => reject(new Error(event.message))));
    if (options.signal?.aborted) { onAbort(); return; }
    options.signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({ participant });
  });
}

function unitsOf(set: Experiment5V3StimulusSet, kind: "block" | "practice") {
  return set.sequence
    .filter((item): item is BlockSegment | PracticeSegment => item.kind === kind)
    .flatMap((item) => item.children)
    .map((trial) => trial.units.find(
      (unit): unit is BellReachabilityV3StimulusUnit =>
        unit.type === "bellReachabilityV3Stimulus",
    ))
    .filter((unit): unit is BellReachabilityV3StimulusUnit => Boolean(unit));
}

export function assertExperiment5V3RuntimeStimulusSet(set: Experiment5V3StimulusSet): void {
  const practice = unitsOf(set, "practice");
  const formal = unitsOf(set, "block");
  const blocks = set.sequence.filter((item) => item.kind === "block");
  if (practice.length !== EXPERIMENT_5_V3_PRACTICE_TRIALS) throw new Error("实验五V3练习试次数错误");
  if (formal.length !== EXPERIMENT_5_V3_FORMAL_TRIALS ||
    blocks.length !== EXPERIMENT_5_V3_FORMAL_BLOCKS ||
    blocks.some((block) => block.children.length !== EXPERIMENT_5_V3_FORMAL_TRIALS_PER_BLOCK)) {
    throw new Error("实验五V3正式结构错误");
  }
  for (const unit of [...practice, ...formal]) {
    const startSign = unit.bellSide === "left" ? 1 : -1;
    const expectedStart = startSign * (unit.amplitudeDeg + EXPERIMENT_5_V3_LOWEST_BELL_OFFSET_DEG);
    if (Math.abs(unit.theta0Deg - expectedStart) > 1e-6) {
      throw new Error("实验五V3起点必须是对侧最低询问角");
    }
    if (Math.sign(unit.omega0DegPerSec) !== (unit.bellSide === "left" ? -1 : 1)) {
      throw new Error("实验五V3初速度必须朝向铃铛");
    }
    if (unit.blankDurationSec <= EXPERIMENT_5_V3_BLANK_BEFORE_LOWEST_BELL_SEC) {
      throw new Error("实验五V3空白应延续到最高点");
    }
    const reachable = experiment5V3EndpointReachesBell(
      unit.amplitudeDeg,
      (unit.bellThetaDeg * Math.PI) / 180,
    );
    if (reachable !== (unit.correctResponse === "reachable") ||
      reachable !== (unit.bellAngleOffsetDeg < 0)) {
      throw new Error("实验五V3可达性评分错误");
    }
    if (Math.abs(unit.slitWidthM - EXPERIMENT_5_V3_SLIT_WIDTH_M) > 1e-9 ||
      !experiment5V3SlitFitsDepartureSide(
        unit.amplitudeDeg,
        unit.bellSide,
        unit,
        unit.rodLengthM,
      )) {
      throw new Error("实验五V3单缝越出出发侧");
    }
  }
  const slitCentersMatch = (
    amplitudeDeg: number,
    side: (typeof EXPERIMENT_5_V3_APPROACH_SIDES)[number],
    group: BellReachabilityV3StimulusUnit[],
  ) => {
    const expected = experiment5V3SlitGrid(amplitudeDeg, side, group.length, group[0]!.rodLengthM)
      .map((slit) => slit.slitCenterM.toFixed(8))
      .sort();
    const actual = group.map((unit) => unit.slitCenterM.toFixed(8)).sort();
    return expected.join("|") === actual.join("|");
  };
  for (const amplitude of EXPERIMENT_5_V3_AMPLITUDES_DEG) {
    for (const side of EXPERIMENT_5_V3_APPROACH_SIDES) {
      const group = formal.filter((unit) => unit.amplitudeDeg === amplitude && unit.bellSide === side);
      if (group.length !== EXPERIMENT_5_V3_BELL_ANGLE_OFFSETS_DEG.length ||
        !slitCentersMatch(amplitude, side, group)) {
        throw new Error("实验五V3正式单缝位置不是出发侧均匀网格");
      }
    }
  }
  for (const side of EXPERIMENT_5_V3_APPROACH_SIDES) {
    const group = practice.filter((unit) => unit.bellSide === side);
    if (group.length !== 2 ||
      !slitCentersMatch(EXPERIMENT_5_V3_PRACTICE_AMPLITUDE_DEG, side, group)) {
      throw new Error("实验五V3练习单缝位置不是出发侧的均匀内点");
    }
  }
  for (const amplitude of EXPERIMENT_5_V3_AMPLITUDES_DEG) {
    for (const side of EXPERIMENT_5_V3_APPROACH_SIDES) {
      for (const offset of EXPERIMENT_5_V3_BELL_ANGLE_OFFSETS_DEG) {
        const matched = formal.filter((unit) =>
          unit.amplitudeDeg === amplitude &&
          unit.bellSide === side &&
          unit.bellAngleOffsetDeg === offset);
        if (matched.length !== 1) throw new Error("实验五V3正式条件未完整覆盖");
      }
    }
  }
  const trialsPerAmplitude =
    EXPERIMENT_5_V3_FORMAL_TRIALS_PER_BLOCK / EXPERIMENT_5_V3_AMPLITUDES_DEG.length;
  for (const block of blocks) {
    const blockUnits = block.children.map(bellOf);
    if (new Set(blockUnits.map((unit) => unit.energyJ)).size !==
      EXPERIMENT_5_V3_AMPLITUDES_DEG.length) {
      throw new Error("实验五V3每个区组都应混合全部能量");
    }
    for (const amplitude of EXPERIMENT_5_V3_AMPLITUDES_DEG) {
      if (blockUnits.filter((unit) => unit.amplitudeDeg === amplitude).length !==
        trialsPerAmplitude) {
        throw new Error("实验五V3区组内各振幅数量应相同");
      }
    }
    for (const side of EXPERIMENT_5_V3_APPROACH_SIDES) {
      if (blockUnits.filter((unit) => unit.bellSide === side).length !==
        EXPERIMENT_5_V3_FORMAL_TRIALS_PER_SIDE) {
        throw new Error("实验五V3每个区组左右试次数必须相同");
      }
    }
  }
}
