import { cryptoRandom, shuffleInPlace } from "../../experiment/stimulus/cryptoRandom";
import { analyzePendulum, pendulumThetaOmegaAt } from "../../experiment/physics/pendulum";
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
} from "../protocol-2/common";
import {
  experiment5V2BellThetaRad,
  experiment5V2EndpointReachesBell,
  planExperiment5V2Approach,
  type Experiment5V2ApproachPlan,
  type Experiment5V2ApproachSide,
} from "./approachPlan";
import {
  EXPERIMENT_5_V2_AMPLITUDES_DEG,
  EXPERIMENT_5_V2_APPROACH_SIDES,
  EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG,
  EXPERIMENT_5_V2_BELL_ANGLE_STEP_DEG,
  EXPERIMENT_5_V2_BLANK_BEFORE_LOWEST_BELL_SEC,
  EXPERIMENT_5_V2_BOB_RADIUS_M,
  EXPERIMENT_5_V2_CUE_MS,
  EXPERIMENT_5_V2_FIXATION_MS,
  EXPERIMENT_5_V2_FIXATION_TEXT,
  EXPERIMENT_5_V2_FORMAL_BLOCKS,
  EXPERIMENT_5_V2_FORMAL_TRIALS,
  EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_5_V2_FORMAL_TRIALS_PER_SIDE,
  EXPERIMENT_5_V2_GRAVITY,
  EXPERIMENT_5_V2_NO_KEY,
  EXPERIMENT_5_V2_PRACTICE_AMPLITUDE_DEG,
  EXPERIMENT_5_V2_PRACTICE_TRIALS,
  EXPERIMENT_5_V2_ROD_LENGTH_M,
  EXPERIMENT_5_V2_TOTAL_RUNTIME_TRIALS,
  EXPERIMENT_5_V2_YES_KEY,
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

function bellUnit(
  plan: Experiment5V2ApproachPlan,
  angleOffsetDeg: number,
  side: Experiment5V2ApproachSide,
): BellReachabilityV2StimulusUnit {
  const bell = experiment5V2BellThetaRad(plan.amplitudeDeg, angleOffsetDeg, side);
  const contactTime = visibleContactTime(plan, bell.theta);
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
    bellAngleOffsetDeg: angleOffsetDeg,
    bellContactHeightM: bell.height,
    bellThetaDeg: (bell.theta * 180) / Math.PI,
    bellSide: side,
    correctResponse: experiment5V2EndpointReachesBell(plan.amplitudeDeg, bell.theta)
      ? "reachable" : "unreachable",
    yesKey: EXPERIMENT_5_V2_YES_KEY,
    noKey: EXPERIMENT_5_V2_NO_KEY,
    plannedVisibleTurn: false,
    plannedVisibleTurnTimeSec: null,
    plannedVisibleContact: contactTime !== null,
    plannedVisibleContactTimeSec: contactTime,
  };
}

function visibleContactTime(plan: Experiment5V2ApproachPlan, bellThetaRad: number): number | null {
  const toleranceRad = EXPERIMENT_5_V2_BOB_RADIUS_M / EXPERIMENT_5_V2_ROD_LENGTH_M;
  const params = {
    theta0Rad: (plan.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (plan.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: EXPERIMENT_5_V2_ROD_LENGTH_M,
    gravity: EXPERIMENT_5_V2_GRAVITY,
  };
  const analysis = analyzePendulum(params);
  for (const segment of plan.visibleSegments) {
    for (let time = segment.tStartSec; time <= segment.tEndSec + 1e-9; time += 1 / 240) {
      const theta = pendulumThetaOmegaAt(
        Math.min(time, segment.tEndSec),
        params,
        analysis,
      ).theta;
      if (Math.abs(theta - bellThetaRad) <= toleranceRad) return time;
    }
  }
  return null;
}

function cueUnit(unit: BellReachabilityV2StimulusUnit): TextDisplayUnit {
  return {
    id: newId(),
    type: "textDisplay",
    text: experiment5V2InitialCueText(
      unit.bellSide === "left" ? "right" : "left",
      unit.bellSide === "left" ? "leftward" : "rightward",
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

function motionFingerprint(unit: BellReachabilityV2StimulusUnit): string {
  return JSON.stringify({
    theta0Deg: unit.theta0Deg,
    omega0DegPerSec: unit.omega0DegPerSec,
    queryThetaDeg: unit.queryThetaDeg,
    queryTimeSec: unit.queryTimeSec,
    segments: unit.visibleSegments,
  });
}

function sideFromStateSite(stateSiteId: string): Experiment5V2ApproachSide {
  return stateSiteId.endsWith("-left") ? "left" : "right";
}

function sidesBalanced(
  units: readonly BellReachabilityV2StimulusUnit[],
  perSide: number,
): boolean {
  return EXPERIMENT_5_V2_APPROACH_SIDES.every((side) =>
    units.filter((unit) => unit.bellSide === side).length === perSide);
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
  let gratingRun = 0;
  let lastAnswer = "";
  let lastGrating = "";
  for (const trial of trials) {
    const unit = bellUnitOf(trial);
    answerRun = unit.correctResponse === lastAnswer ? answerRun + 1 : 1;
    gratingRun = unit.gratingCondition === lastGrating ? gratingRun + 1 : 1;
    if (gratingRun > 3 || (limitAnswer && answerRun > 3)) return false;
    lastAnswer = unit.correctResponse;
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
  const fallback = trials.slice();
  shuffleInPlace(fallback, rng);
  return interleaveByGratingAndSide(fallback);
}

function buildFormalTrials(onTrial: () => void): Trial[] {
  const trials: Trial[] = [];
  for (const amplitudeDeg of EXPERIMENT_5_V2_AMPLITUDES_DEG) {
    for (const apexSide of EXPERIMENT_5_V2_APPROACH_SIDES) {
      for (const gratingId of PROTOCOL_2_GRATING_ORDER) {
        const plan = planExperiment5V2Approach(
          amplitudeDeg,
          apexSide,
          PROTOCOL_2_GRATING_CONDITIONS[gratingId],
        );
        for (const angleOffsetDeg of EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG) {
          trials.push(asTrial(bellUnit(plan, angleOffsetDeg, apexSide)));
          onTrial();
        }
      }
    }
  }
  return trials;
}

function splitIntoRestBlocks(trials: Trial[], rng: () => number): BlockSegment[] {
  const buckets: Trial[][] = Array.from(
    { length: EXPERIMENT_5_V2_FORMAL_BLOCKS },
    () => [],
  );
  for (const amplitudeDeg of EXPERIMENT_5_V2_AMPLITUDES_DEG) {
    for (const apexSide of EXPERIMENT_5_V2_APPROACH_SIDES) {
      for (const gratingId of PROTOCOL_2_GRATING_ORDER) {
        const group = trials.filter((trial) => {
          const unit = bellUnitOf(trial);
          return unit.amplitudeDeg === amplitudeDeg &&
            unit.bellSide === apexSide &&
            unit.gratingCondition === gratingId;
        });
        shuffleInPlace(group, rng);
        const perBlock = group.length / buckets.length;
        if (!Number.isInteger(perBlock)) throw new Error("实验五V2无法把条件均分到休息区组");
        buckets.forEach((bucket, index) => {
          bucket.push(...group.slice(index * perBlock, (index + 1) * perBlock));
        });
      }
    }
  }
  return buckets.map((children) => ({
    kind: "block",
    id: newId(),
    children: constrainedShuffle(children, rng),
  }));
}

const PRACTICE_OFFSETS: Array<{ reachable: number; unreachable: number }> = [3, 2, 1].map(
  (level) => ({
    reachable: -level * EXPERIMENT_5_V2_BELL_ANGLE_STEP_DEG,
    unreachable: level * EXPERIMENT_5_V2_BELL_ANGLE_STEP_DEG,
  }),
);

function practiceBlock(
  rng: () => number,
  onTrial: () => void,
): PracticeSegment {
  const children = EXPERIMENT_5_V2_APPROACH_SIDES.flatMap((apexSide) =>
    PROTOCOL_2_GRATING_ORDER.flatMap((grating, index) => {
      const pair = PRACTICE_OFFSETS[index]!;
      const plan = planExperiment5V2Approach(
        EXPERIMENT_5_V2_PRACTICE_AMPLITUDE_DEG,
        apexSide,
        PROTOCOL_2_GRATING_CONDITIONS[grating],
      );
      onTrial();
      onTrial();
      return [
        asTrial(bellUnit(plan, pair.reachable, apexSide)),
        asTrial(bellUnit(plan, pair.unreachable, apexSide)),
      ];
    }),
  );
  shuffleInPlace(children, rng);
  return { kind: "practice", id: newId(), children };
}

export function generateExperiment5V2RuntimeStimulusSet(
  _participant: Experiment5ParticipantInfo,
  options: GenerateExperiment5V2Options = {},
): Experiment5V2StimulusSet {
  const rng = options.rng ?? cryptoRandom();
  let completed = 0;
  const report = () => {
    completed += 1;
    options.onProgress?.(completed, EXPERIMENT_5_V2_TOTAL_RUNTIME_TRIALS);
  };
  const formalBlocks = splitIntoRestBlocks(buildFormalTrials(report), rng);
  const sequence: TopLevelSequenceItem[] = [
    rest(experiment5V2WelcomeText()),
    rest(experiment5V2StructureText()),
    rest(experiment5V2PracticeText()),
    practiceBlock(rng, report),
  ];
  formalBlocks.forEach((block, displayIndex) => {
    sequence.push(
      rest(experiment5V2BlockText(displayIndex + 1, EXPERIMENT_5_V2_FORMAL_BLOCKS)),
      block,
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
  for (const amplitude of EXPERIMENT_5_V2_AMPLITUDES_DEG) {
    const amplitudeUnits = formal.filter((unit) => unit.amplitudeDeg === amplitude);
    if (amplitudeUnits.length !==
      EXPERIMENT_5_V2_APPROACH_SIDES.length * EXPERIMENT_5_V2_FORMAL_TRIALS_PER_SIDE) {
      throw new Error("实验五V2每种振幅的试次数错误");
    }
    if (!sidesBalanced(amplitudeUnits, EXPERIMENT_5_V2_FORMAL_TRIALS_PER_SIDE)) {
      throw new Error("实验五V2每种振幅的左右试次数必须相同");
    }
    for (const grating of PROTOCOL_2_GRATING_ORDER) {
      const group = amplitudeUnits.filter((unit) => unit.gratingCondition === grating);
      if (group.length !== EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG.length * EXPERIMENT_5_V2_APPROACH_SIDES.length) {
        throw new Error("每个振幅×光栅的铃铛条件数量错误");
      }
      for (const side of EXPERIMENT_5_V2_APPROACH_SIDES) {
        const sideGroup = group.filter((unit) => unit.bellSide === side);
        if (sideGroup.length !== EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG.length) {
          throw new Error("每个振幅×光栅×方向的铃铛数量错误");
        }
        if (new Set(sideGroup.map(motionFingerprint)).size !== 1) {
          throw new Error("同一振幅×光栅×方向未共享运动片段");
        }
      }
    }
    for (const side of EXPERIMENT_5_V2_APPROACH_SIDES) {
      const sideUnits = amplitudeUnits.filter((unit) => unit.bellSide === side);
      if (new Set(sideUnits.map((unit) => unit.stateSiteId)).size !== 1) {
        throw new Error("同一振幅×方向的查询状态未跨光栅共享");
      }
    }
    for (const offset of EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG) {
      const matched = amplitudeUnits.filter((unit) => unit.bellAngleOffsetDeg === offset);
      if (matched.length !== PROTOCOL_2_GRATING_ORDER.length * EXPERIMENT_5_V2_APPROACH_SIDES.length) {
        throw new Error("每个角度偏移应在每个振幅的每个方向的每档光栅出现一次");
      }
    }
  }
  if (formal.some((unit) => unit.bellSide !== sideFromStateSite(unit.stateSiteId))) {
    throw new Error("实验五V2铃铛必须放在消失时摆球朝向的一侧");
  }
  if (new Set(formal.map((unit) => unit.correctResponse === "reachable"
    ? unit.bellAngleOffsetDeg < 0
    : unit.bellAngleOffsetDeg > 0)).size !== 1) {
    throw new Error("实验五V2可达性必须与角度偏移的符号一致");
  }
  const trialsPerAmplitude =
    EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK / EXPERIMENT_5_V2_AMPLITUDES_DEG.length;
  for (const block of blocks) {
    const blockUnits = block.children.map(bellUnitOf);
    if (new Set(blockUnits.map((unit) => unit.energyJ)).size !==
      EXPERIMENT_5_V2_AMPLITUDES_DEG.length) {
      throw new Error("实验五V2每个区组都应混合全部能量");
    }
    for (const amplitude of EXPERIMENT_5_V2_AMPLITUDES_DEG) {
      if (blockUnits.filter((unit) => unit.amplitudeDeg === amplitude).length !== trialsPerAmplitude) {
        throw new Error("实验五V2区组内各振幅数量应相同");
      }
    }
    if (!sidesBalanced(blockUnits, EXPERIMENT_5_V2_FORMAL_TRIALS_PER_SIDE)) {
      throw new Error("实验五V2每个区组左右试次数必须相同");
    }
    for (const grating of PROTOCOL_2_GRATING_ORDER) {
      const group = blockUnits.filter((unit) => unit.gratingCondition === grating);
      if (group.length !== EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK / PROTOCOL_2_GRATING_ORDER.length) {
        throw new Error("实验五V2每个区组的光栅数量应相同");
      }
      for (const side of EXPERIMENT_5_V2_APPROACH_SIDES) {
        if (group.filter((unit) => unit.bellSide === side).length !== group.length / EXPERIMENT_5_V2_APPROACH_SIDES.length) {
          throw new Error("实验五V2每个区组的光栅左右数量应相同");
        }
      }
    }
    if (
      !blockUnits.some((unit) => unit.correctResponse === "reachable") ||
      !blockUnits.some((unit) => unit.correctResponse === "unreachable")
    ) {
      throw new Error("实验五V2区组应同时包含可达和不可达铃铛");
    }
  }
  if (!sidesBalanced(practice, EXPERIMENT_5_V2_PRACTICE_TRIALS / 2)) {
    throw new Error("实验五V2练习左右试次数必须相同");
  }
  for (const grating of PROTOCOL_2_GRATING_ORDER) {
    const group = practice.filter((unit) => unit.gratingCondition === grating);
    if (group.length !== EXPERIMENT_5_V2_APPROACH_SIDES.length * 2) {
      throw new Error("实验五V2练习每档光栅的试次数错误");
    }
    for (const side of EXPERIMENT_5_V2_APPROACH_SIDES) {
      const sideGroup = group.filter((unit) => unit.bellSide === side);
      if (
        sideGroup.length !== 2 ||
        new Set(sideGroup.map((unit) => unit.correctResponse)).size !== 2
      ) {
        throw new Error("实验五V2练习每档光栅的每个方向应各有一条可达和一条不可达");
      }
    }
  }
  for (const unit of [...practice, ...formal]) {
    if (unit.yesKey !== EXPERIMENT_5_V2_YES_KEY || unit.noKey !== EXPERIMENT_5_V2_NO_KEY) {
      throw new Error("实验五V2按键必须固定为 F 会到达、J 不会到达");
    }
    if (!(unit.blankStartSec > 0) || !(unit.blankDurationSec > 0) ||
      unit.queryTimeSec <= unit.blankStartSec) {
      throw new Error("实验五V2空白窗口错误");
    }
    const reachable = experiment5V2EndpointReachesBell(
      unit.amplitudeDeg,
      (unit.bellThetaDeg * Math.PI) / 180,
    );
    if (reachable !== (unit.correctResponse === "reachable") ||
      reachable !== (unit.bellAngleOffsetDeg < 0)) {
      throw new Error("实验五V2可达性评分错误");
    }
    if (unit.plannedVisibleTurn) {
      throw new Error("实验五V2可见窗口不得包含端点转向");
    }
    if (unit.blankDurationSec <= EXPERIMENT_5_V2_BLANK_BEFORE_LOWEST_BELL_SEC) {
      throw new Error("实验五V2全空白应在最低铃铛之后延续到最高点");
    }
    if (unit.visibleSegments.length === 0) {
      throw new Error("实验五V2可见窗口不得把摆球整段挡住");
    }
  }
  const demo = set.sequence.flatMap((item) => item.kind === "rest" ? item.units : [])
    .filter((unit) => unit.type === "protocol2PendulumDemo");
  if (demo.length !== 0) {
    throw new Error("实验五V2不得包含无遮挡演示");
  }
}
