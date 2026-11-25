import { analyzePendulum } from "../../experiment/physics/pendulum";
import { cryptoRandom, shuffleInPlace } from "../../experiment/stimulus/cryptoRandom";
import { newId } from "../../shared/ids";
import type {
  BlockSegment,
  Experiment4V2StimulusSet,
  PracticeSegment,
  RestSegment,
  TextDisplayUnit,
  TopLevelSequenceItem,
  TrackingPendulumV2StimulusUnit,
  Trial,
} from "../../shared/experimentTypes";
import { EXPERIMENT_4_V2_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import type { Experiment4ParticipantInfo } from "../../shared/participant";
import {
  PROTOCOL_2_GRATING_CONDITIONS,
  PROTOCOL_2_GRATING_ORDER,
  PROTOCOL_2_MODEL_DT_SEC,
  THREE_CONDITION_PERMUTATIONS,
  planProtocol2Motion,
  protocol2EnergyJ,
  protocol2ReleaseParams,
  protocol2UniformEllipseSites,
  protocol2VisibleSegmentCount,
  subjectNumber,
  type Protocol2MotionPlan,
  type Protocol2StateSite,
} from "../protocol-2/common";
import {
  EXPERIMENT_4_V2_AMPLITUDE_DEG,
  EXPERIMENT_4_V2_BLANK_DURATION_SEC,
  EXPERIMENT_4_V2_BOB_RADIUS_M,
  EXPERIMENT_4_V2_CUE_MS,
  EXPERIMENT_4_V2_FIXATION_MS,
  EXPERIMENT_4_V2_FIXATION_TEXT,
  EXPERIMENT_4_V2_FORMAL_BLOCKS,
  EXPERIMENT_4_V2_FORMAL_TRIALS,
  EXPERIMENT_4_V2_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_4_V2_GRAVITY,
  EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG,
  EXPERIMENT_4_V2_PRACTICE_ANGLE_TRIALS,
  EXPERIMENT_4_V2_PRACTICE_SPEED_TRIALS,
  EXPERIMENT_4_V2_PRACTICE_TRIALS,
  type Experiment4V2ReportTarget,
  EXPERIMENT_4_V2_ROD_LENGTH_M,
  EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC,
  EXPERIMENT_4_V2_TOTAL_RUNTIME_TRIALS,
} from "./protocol";
import {
  experiment4V2AnglePracticeText,
  experiment4V2BlockText,
  experiment4V2InitialCueText,
  experiment4V2SpeedPracticeText,
  experiment4V2StructureText,
  experiment4V2WelcomeText,
} from "./instructions";

export type GenerateExperiment4V2Options = {
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

function trackingUnit(
  plan: Protocol2MotionPlan,
  reportTarget: Experiment4V2ReportTarget,
): TrackingPendulumV2StimulusUnit {
  return {
    id: newId(),
    type: "trackingPendulumV2Stimulus",
    theta0Deg: plan.theta0Deg,
    omega0DegPerSec: plan.omega0DegPerSec,
    rodLengthM: EXPERIMENT_4_V2_ROD_LENGTH_M,
    gravity: EXPERIMENT_4_V2_GRAVITY,
    bobRadiusM: EXPERIMENT_4_V2_BOB_RADIUS_M,
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
    initialSide: plan.theta0Deg < 0 ? "left" : "right",
    initialDirection: plan.omega0DegPerSec < 0 ? "leftward" : "rightward",
    cueDurationMs: EXPERIMENT_4_V2_CUE_MS,
    reversalTimeSec: plan.reversalTimeSec,
    speedScaleLinearMPerSec: EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC,
    reportTarget,
  };
}

function cueUnit(unit: TrackingPendulumV2StimulusUnit): TextDisplayUnit {
  return {
    id: newId(),
    type: "textDisplay",
    text: experiment4V2InitialCueText(unit.initialSide, unit.initialDirection),
    durationMs: EXPERIMENT_4_V2_CUE_MS,
  };
}

function fixationUnit(): TextDisplayUnit {
  return {
    id: newId(),
    type: "textDisplay",
    text: EXPERIMENT_4_V2_FIXATION_TEXT,
    durationMs: EXPERIMENT_4_V2_FIXATION_MS,
  };
}

function asTrial(unit: TrackingPendulumV2StimulusUnit): Trial {
  return { id: newId(), units: [cueUnit(unit), fixationUnit(), unit] };
}

function formalBlock(
  gratingId: (typeof PROTOCOL_2_GRATING_ORDER)[number],
  rng: () => number,
  onTrial: () => void,
): BlockSegment {
  const sites = protocol2UniformEllipseSites(
    EXPERIMENT_4_V2_AMPLITUDE_DEG,
    EXPERIMENT_4_V2_FORMAL_TRIALS_PER_BLOCK,
  );
  const units = sites.map((site, index) => trackingUnit(
    planProtocol2Motion(
      EXPERIMENT_4_V2_AMPLITUDE_DEG,
      site,
      PROTOCOL_2_GRATING_CONDITIONS[gratingId],
    ),
    index % 2 === 0 ? "angle" : "speed",
  ));
  const trials = units.map(asTrial);
  shuffleInPlace(trials, rng);
  trials.forEach(onTrial);
  return { kind: "block", id: newId(), children: trials };
}

const PRACTICE_ANGLE_TARGET_DEG = EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG / 2;

function linearSpeed(plan: Protocol2MotionPlan): number {
  return EXPERIMENT_4_V2_ROD_LENGTH_M * Math.abs(plan.queryOmegaRadPerSec);
}

function unitLinearSpeed(unit: TrackingPendulumV2StimulusUnit): number {
  return unit.rodLengthM * Math.abs(unit.queryOmegaRadPerSec);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function feasiblePracticePlans(
  gratingId: (typeof PROTOCOL_2_GRATING_ORDER)[number],
): Protocol2MotionPlan[] {
  const sites = protocol2UniformEllipseSites(EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG, 32);
  const geometry = PROTOCOL_2_GRATING_CONDITIONS[gratingId];
  return sites.flatMap((site) => {
    try {
      return [planProtocol2Motion(EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG, site, geometry)];
    } catch {
      return [];
    }
  });
}

function closestBy(
  plans: Protocol2MotionPlan[],
  distance: (plan: Protocol2MotionPlan) => number,
): Protocol2MotionPlan {
  return plans.reduce((best, plan) => {
    const bestDistance = distance(best);
    const nextDistance = distance(plan);
    if (nextDistance < bestDistance - 1e-12) return plan;
    if (nextDistance > bestDistance + 1e-12) return best;
    return plan.stateSiteId < best.stateSiteId ? plan : best;
  });
}

function maximumSpeedPracticePlan(
  gratingId: (typeof PROTOCOL_2_GRATING_ORDER)[number],
): Protocol2MotionPlan {
  const amplitude = EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG;
  const release = protocol2ReleaseParams(amplitude);
  const period = analyzePendulum(release).T;
  const geometry = PROTOCOL_2_GRATING_CONDITIONS[gratingId];
  const failures: string[] = [];
  for (const [index, phaseSec] of [period / 4, (3 * period) / 4].entries()) {
    const site: Protocol2StateSite = {
      id: `a${amplitude}-vmax-${index}`,
      magnitudeIndex: 0,
      arcFractionNumerator: 1,
      thetaRad: 0,
      omegaRadPerSec: 0,
      phaseSec,
    };
    try {
      const plan = planProtocol2Motion(amplitude, site, geometry);
      if (Math.abs(plan.queryThetaDeg) > 1e-4 ||
        Math.abs(linearSpeed(plan) - EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC) > 1e-4) {
        failures.push(`${site.id} 未落在最低点`);
        continue;
      }
      return plan;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`${gratingId} 练习无法在最低点查询最高速：${failures.join("；")}`);
}

function practiceChoice(gratingId: (typeof PROTOCOL_2_GRATING_ORDER)[number]) {
  const feasible = feasiblePracticePlans(gratingId);
  if (feasible.length < 4) throw new Error(`${gratingId} 练习缺少四个可播放终点`);
  const bySpeed = [...feasible].sort((a, b) => {
    const delta = linearSpeed(a) - linearSpeed(b);
    if (Math.abs(delta) > 1e-12) return delta;
    return a.stateSiteId < b.stateSiteId ? -1 : 1;
  });
  const slow = bySpeed[0]!;
  const fast = maximumSpeedPracticePlan(gratingId);
  if (slow.stateSiteId === fast.stateSiteId) {
    throw new Error(`${gratingId} 练习速度终点无法分开`);
  }
  const speedTarget = median(feasible.map(linearSpeed));
  const medium = closestBy(
    feasible.filter((plan) =>
      plan.stateSiteId !== slow.stateSiteId && plan.stateSiteId !== fast.stateSiteId),
    (plan) => Math.abs(linearSpeed(plan) - speedTarget),
  );
  const used = new Set([slow.stateSiteId, medium.stateSiteId, fast.stateSiteId]);
  const anglePool = feasible.filter((plan) => !used.has(plan.stateSiteId));
  if (anglePool.length === 0) throw new Error(`${gratingId} 练习缺少角度终点`);
  const angle = closestBy(
    anglePool,
    (plan) => Math.abs(Math.abs(plan.queryThetaDeg) - PRACTICE_ANGLE_TARGET_DEG),
  );
  return { angle, slow, medium, fast };
}

function practiceSegment(
  plans: Protocol2MotionPlan[],
  reportTarget: Experiment4V2ReportTarget,
  rng: () => number,
  onTrial: () => void,
): PracticeSegment {
  const children = plans.map((plan) => {
    onTrial();
    return asTrial(trackingUnit(plan, reportTarget));
  });
  shuffleInPlace(children, rng);
  return { kind: "practice", id: newId(), children };
}

function practiceBlocks(rng: () => number, onTrial: () => void) {
  const choices = PROTOCOL_2_GRATING_ORDER.map((gratingId) => practiceChoice(gratingId));
  return {
    angle: practiceSegment(
      choices.map((choice) => choice.angle),
      "angle",
      rng,
      onTrial,
    ),
    speed: practiceSegment(
      choices.flatMap((choice) => [choice.slow, choice.medium, choice.fast]),
      "speed",
      rng,
      onTrial,
    ),
  };
}

export function generateExperiment4V2RuntimeStimulusSet(
  participant: Experiment4ParticipantInfo,
  options: GenerateExperiment4V2Options = {},
): Experiment4V2StimulusSet {
  const rng = options.rng ?? cryptoRandom();
  let completed = 0;
  const report = () => {
    completed += 1;
    options.onProgress?.(completed, EXPERIMENT_4_V2_TOTAL_RUNTIME_TRIALS);
  };
  const blocksByGrating = PROTOCOL_2_GRATING_ORDER.map((gratingId) =>
    formalBlock(gratingId, rng, report),
  );
  const permutation = THREE_CONDITION_PERMUTATIONS[
    (subjectNumber(participant.subject_id) - 1) % THREE_CONDITION_PERMUTATIONS.length
  ]!;
  const formalBlocks = permutation.map((index) => blocksByGrating[index]!);
  const practice = practiceBlocks(rng, report);
  const sequence: TopLevelSequenceItem[] = [
    rest(experiment4V2WelcomeText()),
    rest(experiment4V2StructureText()),
    rest(experiment4V2AnglePracticeText()),
    practice.angle,
    rest(experiment4V2SpeedPracticeText()),
    practice.speed,
  ];
  formalBlocks.forEach((block, index) => {
    sequence.push(
      rest(experiment4V2BlockText(index + 1, EXPERIMENT_4_V2_FORMAL_BLOCKS)),
      block,
    );
  });
  const set: Experiment4V2StimulusSet = {
    schemaVersion: EXPERIMENT_4_V2_STIMULUS_SET_SCHEMA_VERSION,
    sequence,
  };
  assertExperiment4V2RuntimeStimulusSet(set);
  return set;
}

export async function generateExperiment4V2RuntimeStimulusSetAsync(
  participant: Experiment4ParticipantInfo,
  options: GenerateExperiment4V2Options = {},
): Promise<Experiment4V2StimulusSet> {
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
      | { type: "success"; set: Experiment4V2StimulusSet }
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

function trackingUnits(set: Experiment4V2StimulusSet, kind: "block" | "practice") {
  return set.sequence
    .filter((item): item is BlockSegment | PracticeSegment => item.kind === kind)
    .flatMap((item) => item.children)
    .map((trial) => trial.units.find(
      (unit): unit is TrackingPendulumV2StimulusUnit =>
        unit.type === "trackingPendulumV2Stimulus",
    ))
    .filter((unit): unit is TrackingPendulumV2StimulusUnit => Boolean(unit));
}

export function assertExperiment4V2RuntimeStimulusSet(
  set: Experiment4V2StimulusSet,
): void {
  const practices = trackingUnits(set, "practice");
  const formal = trackingUnits(set, "block");
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
      cue.durationMs !== EXPERIMENT_4_V2_CUE_MS ||
      fixation?.type !== "textDisplay" ||
      fixation.text !== EXPERIMENT_4_V2_FIXATION_TEXT ||
      fixation.durationMs !== EXPERIMENT_4_V2_FIXATION_MS ||
      stimulus?.type !== "trackingPendulumV2Stimulus" ||
      (stimulus.type === "trackingPendulumV2Stimulus" &&
        cue.text !== experiment4V2InitialCueText(stimulus.initialSide, stimulus.initialDirection));
  })) {
    throw new Error("实验四V2试次顺序必须是方向提示、注视点、摆球演示");
  }
  const practiceSegments = set.sequence.filter(
    (item): item is PracticeSegment => item.kind === "practice",
  );
  if (practiceSegments.length !== 2) throw new Error("实验四V2练习应分为两段");
  const [angleSegment, speedSegment] = practiceSegments as [PracticeSegment, PracticeSegment];
  const segmentUnits = (segment: PracticeSegment) => trackingUnits(
    { ...set, sequence: [segment] },
    "practice",
  );
  const anglePractice = segmentUnits(angleSegment);
  const speedPractice = segmentUnits(speedSegment);
  const leadingText = (segment: PracticeSegment) => {
    const previous = set.sequence[set.sequence.indexOf(segment) - 1];
    const unit = previous?.kind === "rest" ? previous.units[0] : undefined;
    if (unit?.type !== "textControl") throw new Error("练习段前应有说明页");
    return unit.text;
  };
  if (leadingText(angleSegment) !== experiment4V2AnglePracticeText()) {
    throw new Error("位置练习说明不正确");
  }
  if (leadingText(speedSegment) !== experiment4V2SpeedPracticeText()) {
    throw new Error("速度练习说明不正确");
  }
  if (
    practices.length !== EXPERIMENT_4_V2_PRACTICE_TRIALS ||
    anglePractice.length !== EXPERIMENT_4_V2_PRACTICE_ANGLE_TRIALS ||
    speedPractice.length !== EXPERIMENT_4_V2_PRACTICE_SPEED_TRIALS ||
    anglePractice.some((unit) => unit.reportTarget !== "angle") ||
    speedPractice.some((unit) => unit.reportTarget !== "speed")
  ) throw new Error("实验四V2练习试次数或汇报类型错误");
  if (
    blocks.length !== EXPERIMENT_4_V2_FORMAL_BLOCKS ||
    blocks.some((block) => block.children.length !== EXPERIMENT_4_V2_FORMAL_TRIALS_PER_BLOCK) ||
    formal.length !== EXPERIMENT_4_V2_FORMAL_TRIALS
  ) throw new Error("实验四V2正式结构错误");
  if (protocol2UniformEllipseSites(EXPERIMENT_4_V2_AMPLITUDE_DEG, EXPERIMENT_4_V2_FORMAL_TRIALS_PER_BLOCK).length !==
    EXPERIMENT_4_V2_FORMAL_TRIALS_PER_BLOCK) {
    throw new Error("实验四V2能量椭圆终点数量错误");
  }
  for (const unit of [...practices, ...formal]) {
    if (unit.visibleSegments.length !== protocol2VisibleSegmentCount(unit.gratingCondition)) {
      throw new Error("可见片段数必须等于光栅编号加 3");
    }
    if (Math.abs(unit.blankDurationSec - EXPERIMENT_4_V2_BLANK_DURATION_SEC) > 1e-12) {
      throw new Error("空白时长错误");
    }
  }
  for (const grating of PROTOCOL_2_GRATING_ORDER) {
    const angleUnits = anglePractice.filter((unit) => unit.gratingCondition === grating);
    const speedUnits = speedPractice.filter((unit) => unit.gratingCondition === grating);
    if (angleUnits.length !== 1) throw new Error(`${grating} 位置练习应为1条`);
    if (speedUnits.length !== 3) throw new Error(`${grating} 速度练习应为3条`);
    const angle = angleUnits[0]!;
    const speedIds = speedUnits.map((unit) => unit.stateSiteId);
    if (new Set(speedIds).size !== 3 || speedIds.includes(angle.stateSiteId)) {
      throw new Error(`${grating} 练习终点必须各不相同`);
    }
    const feasible = feasiblePracticePlans(grating);
    const speeds = feasible.map(linearSpeed);
    const minSpeed = Math.min(...speeds);
    const byChosenSpeed = [...speedUnits].sort((a, b) => {
      const delta = unitLinearSpeed(a) - unitLinearSpeed(b);
      if (Math.abs(delta) > 1e-9) return delta;
      return a.stateSiteId < b.stateSiteId ? -1 : 1;
    });
    const slow = byChosenSpeed[0]!;
    const medium = byChosenSpeed[1]!;
    const fast = byChosenSpeed[2]!;
    if (Math.abs(unitLinearSpeed(slow) - minSpeed) > 1e-6) {
      throw new Error(`${grating} 速度练习未包含最慢终点`);
    }
    if (Math.abs(fast.queryThetaDeg) > 1e-4 ||
      Math.abs(unitLinearSpeed(fast) - EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC) > 1e-4) {
      throw new Error(`${grating} 速度练习的最快终点不在最低点`);
    }
    const speedTarget = median(speeds);
    const mediumPool = feasible.filter((plan) =>
      plan.stateSiteId !== slow.stateSiteId && plan.stateSiteId !== fast.stateSiteId);
    const bestMedium = Math.min(
      ...mediumPool.map((plan) => Math.abs(linearSpeed(plan) - speedTarget)),
    );
    if (Math.abs(Math.abs(unitLinearSpeed(medium) - speedTarget) - bestMedium) > 1e-6) {
      throw new Error(`${grating} 速度练习的中间终点不是最接近中位数的终点`);
    }
    const anglePool = feasible.filter((plan) => !speedIds.includes(plan.stateSiteId));
    const bestAngle = Math.min(...anglePool.map((plan) =>
      Math.abs(Math.abs(plan.queryThetaDeg) - PRACTICE_ANGLE_TARGET_DEG)));
    const angleDistance = Math.abs(Math.abs(angle.queryThetaDeg) - PRACTICE_ANGLE_TARGET_DEG);
    if (Math.abs(angleDistance - bestAngle) > 1e-6) {
      throw new Error(`${grating} 角度练习终点不是最接近${PRACTICE_ANGLE_TARGET_DEG}°的剩余终点`);
    }
  }
  const formalSites = protocol2UniformEllipseSites(
    EXPERIMENT_4_V2_AMPLITUDE_DEG,
    EXPERIMENT_4_V2_FORMAL_TRIALS_PER_BLOCK,
  );
  for (const grating of PROTOCOL_2_GRATING_ORDER) {
    const units = formal.filter((unit) => unit.gratingCondition === grating);
    const angleCount = units.filter((unit) => unit.reportTarget === "angle").length;
    if (angleCount !== units.length / 2) {
      throw new Error(`${grating} 角度与速度汇报未平分`);
    }
    if (new Set(units.map((unit) => unit.stateSiteId)).size !== formalSites.length) {
      throw new Error(`${grating} 未覆盖全部能量椭圆终点`);
    }
    for (const site of formalSites) {
      const unit = units.find((item) => item.stateSiteId === site.id);
      if (!unit) throw new Error(`${grating} 缺少终点 ${site.id}`);
      const expected = site.magnitudeIndex % 2 === 0 ? "angle" : "speed";
      if (unit.reportTarget !== expected) {
        throw new Error(`${grating} ${site.id} 的汇报类型不是相间分配`);
      }
      if (Math.abs((unit.queryThetaDeg * Math.PI) / 180 - site.thetaRad) > 1e-6 ||
        Math.abs(unit.queryOmegaRadPerSec - site.omegaRadPerSec) > 1e-6) {
        throw new Error(`${grating} ${site.id} 的查询状态偏离能量椭圆终点`);
      }
    }
  }
  const demo = set.sequence.flatMap((item) => item.kind === "rest" ? item.units : [])
    .filter((unit) => unit.type === "protocol2PendulumDemo");
  if (demo.length !== 0) {
    throw new Error("实验四V2不得包含无遮挡演示");
  }
  if (Math.abs(protocol2EnergyJ(60) - 19.6) > 1e-12) {
    throw new Error("实验四V2 60°能量错误");
  }
}
