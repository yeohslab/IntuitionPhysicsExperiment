import { cryptoRandom, shuffleInPlace } from "../../experiment/stimulus/cryptoRandom";
import { newId } from "../../shared/ids";
import type {
  BellReachabilityV2StimulusUnit,
  BlockSegment,
  Experiment5V2StimulusSet,
  PracticeSegment,
  RestSegment,
  TextDisplayUnit,
  TopLevelSequenceItem,
  Trial,
} from "../../shared/experimentTypes";
import { EXPERIMENT_5_V2_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import type { Experiment5ParticipantInfo } from "../../shared/participant";
import {
  PROTOCOL_2_GRATING_CONDITIONS,
  PROTOCOL_2_GRATING_ORDER,
  PROTOCOL_2_MODEL_DT_SEC,
  THREE_CONDITION_PERMUTATIONS,
  planProtocol2Motion,
  protocol2BlankSweepsBell,
  protocol2FirstVisibleContactTime,
  protocol2FirstVisibleTurnTime,
  protocol2StateSites,
  protocol2VisibleSegmentCount,
  subjectNumber,
  type Protocol2MotionPlan,
  type Protocol2StateSite,
} from "../protocol-2/common";
import {
  EXPERIMENT_5_V2_AMPLITUDES_DEG,
  EXPERIMENT_5_V2_BLANK_DURATION_SEC,
  EXPERIMENT_5_V2_BOB_RADIUS_M,
  EXPERIMENT_5_V2_CUE_MS,
  EXPERIMENT_5_V2_FIXATION_MS,
  EXPERIMENT_5_V2_FIXATION_TEXT,
  EXPERIMENT_5_V2_DELTA_H_M,
  EXPERIMENT_5_V2_FORMAL_BLOCKS,
  EXPERIMENT_5_V2_FORMAL_TRIALS,
  EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_5_V2_GRAVITY,
  EXPERIMENT_5_V2_PRACTICE_AMPLITUDE_DEG,
  EXPERIMENT_5_V2_PRACTICE_TRIALS,
  EXPERIMENT_5_V2_ROD_LENGTH_M,
  EXPERIMENT_5_V2_TOTAL_RUNTIME_TRIALS,
  experiment5V2KeyMapping,
} from "./protocol";
import {
  experiment5V2BlockText,
  experiment5V2InitialCueText,
  experiment5V2PracticeText,
  experiment5V2StructureText,
  experiment5V2WelcomeText,
} from "./instructions";

export type GenerateExperiment5V2Options = {
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

function listedBellSwept(plan: Protocol2MotionPlan, deltaHM: number, side: "left" | "right"): boolean {
  return protocol2BlankSweepsBell(plan, bellThetaRad(plan.amplitudeDeg, deltaHM, side).theta);
}

function blankSweepCounts(plan: Protocol2MotionPlan): { swept: number; missed: number } {
  let swept = 0;
  let missed = 0;
  for (const deltaHM of EXPERIMENT_5_V2_DELTA_H_M) {
    for (const side of ["left", "right"] as const) {
      if (listedBellSwept(plan, deltaHM, side)) swept += 1;
      else missed += 1;
    }
  }
  return { swept, missed };
}

function commonFeasibleSites(amplitudeDeg: number): Protocol2StateSite[] {
  return protocol2StateSites(amplitudeDeg).filter((site) => {
    try {
      const plans = PROTOCOL_2_GRATING_ORDER.map((gratingId) =>
        planProtocol2Motion(
          amplitudeDeg,
          site,
          PROTOCOL_2_GRATING_CONDITIONS[gratingId],
        ),
      );
      const counts = blankSweepCounts(plans[0]!);
      return counts.swept > 0 && counts.missed > 0;
    } catch {
      return false;
    }
  });
}

export function selectExperiment5V2QuerySite(
  amplitudeDeg: number,
  amplitudeIndex: number,
  participant: Experiment5ParticipantInfo,
): Protocol2StateSite {
  const candidates = commonFeasibleSites(amplitudeDeg);
  if (candidates.length === 0) {
    throw new Error(`${amplitudeDeg}°没有既扫到又扫不到铃铛的跨光栅查询状态`);
  }
  return candidates[
    (subjectNumber(participant.subject_id) - 1 + amplitudeIndex) % candidates.length
  ]!;
}

function bellThetaRad(amplitudeDeg: number, deltaHM: number, side: "left" | "right") {
  const baseHeight = EXPERIMENT_5_V2_ROD_LENGTH_M *
    (1 - Math.cos((amplitudeDeg * Math.PI) / 180));
  const height = baseHeight + deltaHM;
  const magnitude = Math.acos(1 - height / EXPERIMENT_5_V2_ROD_LENGTH_M);
  return { height, theta: side === "right" ? magnitude : -magnitude };
}

function bellUnit(
  plan: Protocol2MotionPlan,
  deltaHM: number,
  side: "left" | "right",
  participant: Experiment5ParticipantInfo,
): BellReachabilityV2StimulusUnit {
  const bell = bellThetaRad(plan.amplitudeDeg, deltaHM, side);
  const contactTime = protocol2FirstVisibleContactTime(plan, bell.theta);
  const turnTime = protocol2FirstVisibleTurnTime(plan);
  return {
    id: newId(),
    type: "bellReachabilityV2Stimulus",
    theta0Deg: plan.theta0Deg,
    omega0DegPerSec: plan.omega0DegPerSec,
    rodLengthM: EXPERIMENT_5_V2_ROD_LENGTH_M,
    gravity: EXPERIMENT_5_V2_GRAVITY,
    bobRadiusM: EXPERIMENT_5_V2_BOB_RADIUS_M,
    energyJ: plan.energyJ,
    amplitudeDeg: plan.amplitudeDeg,
    queryThetaDeg: plan.queryThetaDeg,
    queryOmegaRadPerSec: plan.queryOmegaRadPerSec,
    queryTimeSec: plan.queryTimeSec,
    blankStartSec: plan.blankStartSec,
    blankDurationSec: plan.blankDurationSec,
    visibleSegments: plan.visibleSegments,
    gratingCondition: plan.geometry.id,
    gapM: plan.geometry.gapM,
    barWidthM: plan.geometry.barWidthM,
    gratingPeriodM: plan.geometry.periodM,
    gratingOffsetM: plan.geometry.offsetM,
    stateSiteId: plan.stateSiteId,
    modelDtSec: PROTOCOL_2_MODEL_DT_SEC,
    deltaHM,
    bellContactHeightM: bell.height,
    bellThetaDeg: (bell.theta * 180) / Math.PI,
    bellSide: side,
    correctResponse: protocol2BlankSweepsBell(plan, bell.theta) ? "reachable" : "unreachable",
    ...experiment5V2KeyMapping(participant.subject_id),
    plannedVisibleTurn: turnTime !== null,
    plannedVisibleTurnTimeSec: turnTime,
    plannedVisibleContact: contactTime !== null,
    plannedVisibleContactTimeSec: contactTime,
  };
}

function cueUnit(unit: BellReachabilityV2StimulusUnit): TextDisplayUnit {
  return {
    id: newId(),
    type: "textDisplay",
    text: experiment5V2InitialCueText(
      unit.theta0Deg < 0 ? "left" : "right",
      unit.omega0DegPerSec < 0 ? "leftward" : "rightward",
    ),
    durationMs: EXPERIMENT_5_V2_CUE_MS,
  };
}

function fixationUnit(): TextDisplayUnit {
  return {
    id: newId(),
    type: "textDisplay",
    text: EXPERIMENT_5_V2_FIXATION_TEXT,
    durationMs: EXPERIMENT_5_V2_FIXATION_MS,
  };
}

function asTrial(unit: BellReachabilityV2StimulusUnit): Trial {
  return { id: newId(), units: [cueUnit(unit), fixationUnit(), unit] };
}

function bellUnitOf(trial: Trial): BellReachabilityV2StimulusUnit {
  const unit = trial.units.find(
    (item): item is BellReachabilityV2StimulusUnit =>
      item.type === "bellReachabilityV2Stimulus",
  );
  if (!unit) throw new Error("试次缺少铃铛刺激");
  return unit;
}

function orderingValid(trials: readonly Trial[], limitAnswer: boolean): boolean {
  let answerRun = 0;
  let sideRun = 0;
  let gratingRun = 0;
  let lastAnswer = "";
  let lastSide = "";
  let lastGrating = "";
  for (const trial of trials) {
    const unit = bellUnitOf(trial);
    answerRun = unit.correctResponse === lastAnswer ? answerRun + 1 : 1;
    sideRun = unit.bellSide === lastSide ? sideRun + 1 : 1;
    gratingRun = unit.gratingCondition === lastGrating ? gratingRun + 1 : 1;
    if (sideRun > 3 || gratingRun > 3 || (limitAnswer && answerRun > 3)) return false;
    lastAnswer = unit.correctResponse;
    lastSide = unit.bellSide;
    lastGrating = unit.gratingCondition;
  }
  return true;
}

function interleaveByGratingAndSide(trials: Trial[]): Trial[] {
  const byGrating = PROTOCOL_2_GRATING_ORDER.map((grating) => {
    const group = trials.filter((trial) => bellUnitOf(trial).gratingCondition === grating);
    const left = group.filter((trial) => bellUnitOf(trial).bellSide === "left");
    const right = group.filter((trial) => bellUnitOf(trial).bellSide === "right");
    const ordered: Trial[] = [];
    const count = Math.max(left.length, right.length);
    for (let index = 0; index < count; index += 1) {
      if (index < left.length) ordered.push(left[index]!);
      if (index < right.length) ordered.push(right[index]!);
    }
    return ordered;
  });
  const rows = byGrating[0]?.length ?? 0;
  if (byGrating.some((group) => group.length !== rows)) {
    throw new Error("无法生成满足连续条件限制的实验五V2区组");
  }
  const result: Trial[] = [];
  for (let index = 0; index < rows; index += 1) {
    for (const group of byGrating) result.push(group[index]!);
  }
  if (!orderingValid(result, false)) {
    throw new Error("无法生成满足连续条件限制的实验五V2区组");
  }
  return result;
}

function constrainedShuffle(trials: Trial[], rng: () => number): Trial[] {
  for (const limitAnswer of [true, false]) {
    for (let attempt = 0; attempt < 4000; attempt += 1) {
      const candidate = trials.slice();
      shuffleInPlace(candidate, rng);
      if (orderingValid(candidate, limitAnswer)) return candidate;
    }
  }
  return interleaveByGratingAndSide(trials);
}

function formalBlock(
  amplitudeDeg: number,
  amplitudeIndex: number,
  participant: Experiment5ParticipantInfo,
  rng: () => number,
  onTrial: () => void,
): BlockSegment {
  const site = selectExperiment5V2QuerySite(amplitudeDeg, amplitudeIndex, participant);
  const trials: Trial[] = [];
  for (const gratingId of PROTOCOL_2_GRATING_ORDER) {
    const plan = planProtocol2Motion(
      amplitudeDeg,
      site,
      PROTOCOL_2_GRATING_CONDITIONS[gratingId],
    );
    for (const deltaHM of EXPERIMENT_5_V2_DELTA_H_M) {
      for (const side of ["left", "right"] as const) {
        trials.push(asTrial(bellUnit(plan, deltaHM, side, participant)));
      }
    }
  }
  const ordered = constrainedShuffle(trials, rng);
  ordered.forEach(onTrial);
  return { kind: "block", id: newId(), children: ordered };
}

type PracticeBell = { delta: number; side: "left" | "right" };

function classifyBells(plan: Protocol2MotionPlan): { swept: PracticeBell[]; missed: PracticeBell[] } {
  const swept: PracticeBell[] = [];
  const missed: PracticeBell[] = [];
  for (const delta of EXPERIMENT_5_V2_DELTA_H_M) {
    for (const side of ["left", "right"] as const) {
      const choice = { delta, side };
      if (listedBellSwept(plan, delta, side)) swept.push(choice);
      else missed.push(choice);
    }
  }
  return { swept, missed };
}

function alternateSides(bells: readonly PracticeBell[]): PracticeBell[] {
  const left = bells.filter((bell) => bell.side === "left");
  const right = bells.filter((bell) => bell.side === "right");
  const ordered: PracticeBell[] = [];
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    if (index < left.length) ordered.push(left[index]!);
    if (index < right.length) ordered.push(right[index]!);
  }
  return ordered;
}

function cycleBells(bells: readonly PracticeBell[], count: number): PracticeBell[] {
  if (bells.length === 0) throw new Error("实验五V2练习缺少可用铃铛");
  const ordered = alternateSides(bells);
  return Array.from({ length: count }, (_, index) => ordered[index % ordered.length]!);
}

function practiceBlock(
  participant: Experiment5ParticipantInfo,
  rng: () => number,
  onTrial: () => void,
): PracticeSegment {
  const site = selectExperiment5V2QuerySite(
    EXPERIMENT_5_V2_PRACTICE_AMPLITUDE_DEG,
    0,
    participant,
  );
  const plans = new Map(PROTOCOL_2_GRATING_ORDER.map((gratingId) => [
    gratingId,
    planProtocol2Motion(
      EXPERIMENT_5_V2_PRACTICE_AMPLITUDE_DEG,
      site,
      PROTOCOL_2_GRATING_CONDITIONS[gratingId],
    ),
  ]));
  const { swept, missed } = classifyBells(plans.get("G1")!);
  const reachable = cycleBells(swept, PROTOCOL_2_GRATING_ORDER.length);
  const unreachable = cycleBells(missed, PROTOCOL_2_GRATING_ORDER.length);
  const children = PROTOCOL_2_GRATING_ORDER.flatMap((grating, index) => {
    onTrial();
    onTrial();
    return [
      asTrial(bellUnit(
        plans.get(grating)!,
        reachable[index]!.delta,
        reachable[index]!.side,
        participant,
      )),
      asTrial(bellUnit(
        plans.get(grating)!,
        unreachable[index]!.delta,
        unreachable[index]!.side,
        participant,
      )),
    ];
  });
  shuffleInPlace(children, rng);
  return { kind: "practice", id: newId(), children };
}

export function generateExperiment5V2RuntimeStimulusSet(
  participant: Experiment5ParticipantInfo,
  options: GenerateExperiment5V2Options = {},
): Experiment5V2StimulusSet {
  const rng = options.rng ?? cryptoRandom();
  let completed = 0;
  const report = () => {
    completed += 1;
    options.onProgress?.(completed, EXPERIMENT_5_V2_TOTAL_RUNTIME_TRIALS);
  };
  const blocksByAmplitude = EXPERIMENT_5_V2_AMPLITUDES_DEG.map((amplitude, index) =>
    formalBlock(amplitude, index, participant, rng, report),
  );
  const permutation = THREE_CONDITION_PERMUTATIONS[
    (subjectNumber(participant.subject_id) - 1) % THREE_CONDITION_PERMUTATIONS.length
  ]!;
  const sequence: TopLevelSequenceItem[] = [
    rest(experiment5V2WelcomeText(
      experiment5V2KeyMapping(participant.subject_id).yesKey,
      experiment5V2KeyMapping(participant.subject_id).noKey,
    )),
    rest(experiment5V2StructureText()),
    rest(experiment5V2PracticeText()),
    practiceBlock(participant, rng, report),
  ];
  permutation.forEach((amplitudePosition, displayIndex) => {
    const amplitude = EXPERIMENT_5_V2_AMPLITUDES_DEG[amplitudePosition]!;
    sequence.push(
      rest(experiment5V2BlockText(displayIndex + 1, EXPERIMENT_5_V2_FORMAL_BLOCKS, amplitude)),
      blocksByAmplitude[amplitudePosition]!,
    );
  });
  const set: Experiment5V2StimulusSet = {
    schemaVersion: EXPERIMENT_5_V2_STIMULUS_SET_SCHEMA_VERSION,
    sequence,
  };
  assertExperiment5V2RuntimeStimulusSet(set);
  return set;
}

export async function generateExperiment5V2RuntimeStimulusSetAsync(
  participant: Experiment5ParticipantInfo,
  options: GenerateExperiment5V2Options = {},
): Promise<Experiment5V2StimulusSet> {
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
      | { type: "success"; set: Experiment5V2StimulusSet }
      | { type: "error"; message: string }
    >) => {
      const message = event.data;
      if (message.type === "progress") {
        options.onProgress?.(message.completed, message.total);
      } else if (message.type === "success") {
        finish(() => resolve(message.set));
      } else {
        finish(() => reject(new Error(message.message)));
      }
    });
    worker.addEventListener("error", (event) => finish(() => reject(new Error(event.message))));
    if (options.signal?.aborted) { onAbort(); return; }
    options.signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({ participant });
  });
}

function units(set: Experiment5V2StimulusSet, kind: "practice" | "block") {
  return set.sequence.filter((item): item is BlockSegment | PracticeSegment => item.kind === kind)
    .flatMap((item) => item.children)
    .map((trial) => trial.units.find(
      (unit): unit is BellReachabilityV2StimulusUnit =>
        unit.type === "bellReachabilityV2Stimulus",
    ))
    .filter((unit): unit is BellReachabilityV2StimulusUnit => Boolean(unit));
}

export function assertExperiment5V2RuntimeStimulusSet(
  set: Experiment5V2StimulusSet,
): void {
  const practice = units(set, "practice");
  const formal = units(set, "block");
  const blocks = set.sequence.filter((item) => item.kind === "block");
  const taskTrials = set.sequence
    .filter((item): item is BlockSegment | PracticeSegment =>
      item.kind === "block" || item.kind === "practice")
    .flatMap((item) => item.children);
  if (taskTrials.some((trial) => {
    const cue = trial.units[0];
    const fixation = trial.units[1];
    const stimulus = trial.units[2];
    return cue?.type !== "textDisplay" ||
      cue.durationMs !== EXPERIMENT_5_V2_CUE_MS ||
      fixation?.type !== "textDisplay" ||
      fixation.text !== EXPERIMENT_5_V2_FIXATION_TEXT ||
      fixation.durationMs !== EXPERIMENT_5_V2_FIXATION_MS ||
      stimulus?.type !== "bellReachabilityV2Stimulus";
  })) {
    throw new Error("实验五V2试次顺序必须是方向提示、注视点、摆球演示");
  }
  if (practice.length !== EXPERIMENT_5_V2_PRACTICE_TRIALS) {
    throw new Error("实验五V2练习试次数错误");
  }
  if (
    formal.length !== EXPERIMENT_5_V2_FORMAL_TRIALS ||
    blocks.length !== EXPERIMENT_5_V2_FORMAL_BLOCKS ||
    blocks.some((block) => block.children.length !== EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK)
  ) throw new Error("实验五V2正式结构错误");
  for (const block of blocks) {
    const blockUnits = block.children.map(bellUnitOf);
    const amplitudes = new Set(blockUnits.map((unit) => unit.amplitudeDeg));
    if (amplitudes.size !== 1) throw new Error("实验五V2区组内振幅不一致");
    for (const grating of PROTOCOL_2_GRATING_ORDER) {
      const group = blockUnits.filter((unit) => unit.gratingCondition === grating);
      if (group.length !== EXPERIMENT_5_V2_DELTA_H_M.length * 2) {
        throw new Error("每个振幅×光栅的铃铛条件数量错误");
      }
      const motionFingerprints = new Set(group.map((unit) => JSON.stringify({
        theta0Deg: unit.theta0Deg,
        omega0DegPerSec: unit.omega0DegPerSec,
        queryThetaDeg: unit.queryThetaDeg,
        queryTimeSec: unit.queryTimeSec,
        segments: unit.visibleSegments,
      })));
      if (motionFingerprints.size !== 1) throw new Error("同一振幅×光栅未共享运动片段");
    }
    if (new Set(blockUnits.map((unit) => unit.stateSiteId)).size !== 1) {
      throw new Error("同一振幅的查询状态未跨光栅共享");
    }
    for (const delta of EXPERIMENT_5_V2_DELTA_H_M) {
      if (blockUnits.filter((unit) => unit.deltaHM === delta).length !== PROTOCOL_2_GRATING_ORDER.length * 2) {
        throw new Error("每个高度偏移在振幅区组内应在每档光栅的左右各出现一次");
      }
    }
    if (
      !blockUnits.some((unit) => unit.correctResponse === "reachable") ||
      !blockUnits.some((unit) => unit.correctResponse === "unreachable")
    ) {
      throw new Error("实验五V2查询状态的空白应同时扫到和扫不到铃铛");
    }
  }
  for (const grating of PROTOCOL_2_GRATING_ORDER) {
    const group = practice.filter((unit) => unit.gratingCondition === grating);
    if (
      group.length !== 2 ||
      new Set(group.map((unit) => unit.correctResponse)).size !== 2
    ) {
      throw new Error("实验五V2练习每档光栅应各有一条可达和一条不可达");
    }
  }
  for (const unit of [...practice, ...formal]) {
    if (
      unit.visibleSegments.length !== protocol2VisibleSegmentCount(unit.gratingCondition) ||
      Math.abs(unit.blankDurationSec - EXPERIMENT_5_V2_BLANK_DURATION_SEC) > 1e-12
    ) {
      throw new Error("实验五V2片段或空白时长错误");
    }
    const site = protocol2StateSites(unit.amplitudeDeg).find((item) => item.id === unit.stateSiteId);
    if (!site) throw new Error("实验五V2查询状态不存在");
    const plan = planProtocol2Motion(
      unit.amplitudeDeg,
      site,
      PROTOCOL_2_GRATING_CONDITIONS[unit.gratingCondition],
    );
    const amplitudeRad = (unit.amplitudeDeg * Math.PI) / 180;
    if (unit.deltaHM > 0 || Math.abs((unit.bellThetaDeg * Math.PI) / 180) > amplitudeRad + 1e-9) {
      throw new Error("实验五V2铃铛不得超出可达弧线");
    }
    const swept = protocol2BlankSweepsBell(plan, (unit.bellThetaDeg * Math.PI) / 180);
    if (swept !== (unit.correctResponse === "reachable")) {
      throw new Error("实验五V2可达性评分错误");
    }
  }
  const demo = set.sequence.flatMap((item) => item.kind === "rest" ? item.units : [])
    .filter((unit) => unit.type === "protocol2PendulumDemo");
  if (demo.length !== 0) {
    throw new Error("实验五V2不得包含无遮挡演示");
  }
}
