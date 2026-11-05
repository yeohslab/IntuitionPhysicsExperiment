import { cryptoRandom, shuffleInPlace } from "../../experiment/stimulus/cryptoRandom";
import { newId } from "../../shared/ids";
import type {
  BlockSegment,
  Experiment4V2StimulusSet,
  PracticeSegment,
  Protocol2PendulumDemoUnit,
  RestSegment,
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
  protocol2StateSites,
  subjectNumber,
  type Protocol2MotionPlan,
  type Protocol2StateSite,
} from "../protocol-2/common";
import {
  EXPERIMENT_4_V2_AMPLITUDE_DEG,
  EXPERIMENT_4_V2_BOB_RADIUS_M,
  EXPERIMENT_4_V2_CUE_MS,
  EXPERIMENT_4_V2_FORMAL_BLOCKS,
  EXPERIMENT_4_V2_FORMAL_TRIALS,
  EXPERIMENT_4_V2_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_4_V2_GRAVITY,
  EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG,
  EXPERIMENT_4_V2_PRACTICE_TRIALS,
  EXPERIMENT_4_V2_ROD_LENGTH_M,
  EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC,
  EXPERIMENT_4_V2_TOTAL_RUNTIME_TRIALS,
} from "./protocol";
import {
  experiment4V2BlockText,
  experiment4V2PracticeText,
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

function demoRest(): RestSegment {
  const demo: Protocol2PendulumDemoUnit = {
    id: newId(),
    type: "protocol2PendulumDemo",
    amplitudeDeg: EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG,
    rodLengthM: EXPERIMENT_4_V2_ROD_LENGTH_M,
    gravity: EXPERIMENT_4_V2_GRAVITY,
    bobRadiusM: EXPERIMENT_4_V2_BOB_RADIUS_M,
  };
  return { kind: "rest", id: newId(), units: [demo] };
}

function trackingUnit(
  plan: Protocol2MotionPlan,
  condition: "no_hidden_reversal" | "hidden_reversal",
): TrackingPendulumV2StimulusUnit {
  if (condition === "no_hidden_reversal" && plan.reversalTimeSec !== null) {
    throw new Error(`${plan.stateSiteId}/${plan.geometry.id} 不满足无隐藏反向`);
  }
  if (condition === "hidden_reversal" && plan.reversalTimeSec === null) {
    throw new Error(`${plan.stateSiteId}/${plan.geometry.id} 不满足隐藏反向`);
  }
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
    trackingCondition: condition,
    initialSide: plan.theta0Deg < 0 ? "left" : "right",
    initialDirection: plan.omega0DegPerSec < 0 ? "leftward" : "rightward",
    cueDurationMs: EXPERIMENT_4_V2_CUE_MS,
    reversalTimeSec: plan.reversalTimeSec,
    speedScaleLinearMPerSec: EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC,
  };
}

function asTrial(unit: TrackingPendulumV2StimulusUnit): Trial {
  return { id: newId(), units: [unit] };
}

function feasiblePlans(
  amplitudeDeg: number,
  gratingId: (typeof PROTOCOL_2_GRATING_ORDER)[number],
): Array<{ site: Protocol2StateSite; plan: Protocol2MotionPlan }> {
  const result: Array<{ site: Protocol2StateSite; plan: Protocol2MotionPlan }> = [];
  for (const site of protocol2StateSites(amplitudeDeg)) {
    try {
      result.push({
        site,
        plan: planProtocol2Motion(
          amplitudeDeg,
          site,
          PROTOCOL_2_GRATING_CONDITIONS[gratingId],
        ),
      });
    } catch {
      // The protocol explicitly rejects settings with a sub-two-frame segment.
    }
  }
  return result;
}

function formalBlock(
  gratingId: (typeof PROTOCOL_2_GRATING_ORDER)[number],
  rng: () => number,
  onTrial: () => void,
): BlockSegment {
  const plans = feasiblePlans(EXPERIMENT_4_V2_AMPLITUDE_DEG, gratingId);
  const noHidden = plans.filter(({ plan }) => plan.reversalTimeSec === null);
  if (noHidden.length === 0) throw new Error(`${gratingId} 没有无反向可行状态`);
  const hiddenSites = plans.filter(
    ({ site, plan }) =>
      site.arcFractionNumerator === 11 &&
      Math.sign(site.thetaRad) !== Math.sign(site.omegaRadPerSec) &&
      plan.reversalTimeSec !== null,
  );
  if (hiddenSites.length !== 2) {
    throw new Error(`${gratingId} 应有两个11/12隐藏反向返回状态，实际${hiddenSites.length}`);
  }
  // Fixed phase/blank geometry makes some return states intrinsically hidden-reversal.
  // Fill the 24 truthfully-labelled no-reversal slots by cycling the feasible bank.
  const noHiddenUnits = Array.from({ length: 24 }, (_, index) =>
    trackingUnit(noHidden[index % noHidden.length]!.plan, "no_hidden_reversal"),
  );
  const hiddenUnits = hiddenSites.map(({ plan }) =>
    trackingUnit(plan, "hidden_reversal"),
  );
  const trials = [...noHiddenUnits, ...hiddenUnits].map(asTrial);
  shuffleInPlace(trials, rng);
  trials.forEach(onTrial);
  return { kind: "block", id: newId(), children: trials };
}

function practiceBlock(
  participant: Experiment4ParticipantInfo,
  rng: () => number,
  onTrial: () => void,
): PracticeSegment {
  const hiddenGratingIndex = (subjectNumber(participant.subject_id) - 1) % 3;
  const children = PROTOCOL_2_GRATING_ORDER.map((gratingId, index) => {
    const plans = feasiblePlans(EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG, gratingId);
    const wantsHidden = index === hiddenGratingIndex;
    const candidate = wantsHidden
      ? plans.find(({ site, plan }) =>
          site.arcFractionNumerator === 11 &&
          Math.sign(site.thetaRad) !== Math.sign(site.omegaRadPerSec) &&
          plan.reversalTimeSec !== null)
      : plans.find(({ plan }) => plan.reversalTimeSec === null);
    if (!candidate) throw new Error(`${gratingId} 缺少练习所需状态`);
    onTrial();
    return asTrial(trackingUnit(
      candidate.plan,
      wantsHidden ? "hidden_reversal" : "no_hidden_reversal",
    ));
  });
  shuffleInPlace(children, rng);
  return { kind: "practice", id: newId(), children };
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
  const sequence: TopLevelSequenceItem[] = [
    rest(experiment4V2WelcomeText()),
    rest(experiment4V2StructureText()),
    rest(experiment4V2PracticeText()),
    demoRest(),
    practiceBlock(participant, rng, report),
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
  if (practices.length !== EXPERIMENT_4_V2_PRACTICE_TRIALS) {
    throw new Error("实验四V2练习试次数错误");
  }
  if (
    blocks.length !== EXPERIMENT_4_V2_FORMAL_BLOCKS ||
    blocks.some((block) => block.children.length !== EXPERIMENT_4_V2_FORMAL_TRIALS_PER_BLOCK) ||
    formal.length !== EXPERIMENT_4_V2_FORMAL_TRIALS
  ) throw new Error("实验四V2正式结构错误");
  if (protocol2StateSites(EXPERIMENT_4_V2_AMPLITUDE_DEG).length !== 24) {
    throw new Error("实验四V2状态点库不是24个");
  }
  for (const unit of [...practices, ...formal]) {
    if (unit.visibleSegments.length !== 3) throw new Error("每条试次必须有三个可见片段");
    if (Math.abs(unit.blankDurationSec - 0.3) > 1e-12) throw new Error("空白时长错误");
    if (unit.trackingCondition === "hidden_reversal" && unit.reversalTimeSec === null) {
      throw new Error("隐藏反向试次缺少反向时刻");
    }
    if (unit.trackingCondition === "no_hidden_reversal" && unit.reversalTimeSec !== null) {
      throw new Error("无反向试次包含反向");
    }
  }
  const demo = set.sequence.flatMap((item) => item.kind === "rest" ? item.units : [])
    .filter((unit) => unit.type === "protocol2PendulumDemo");
  if (demo.length !== 1 || demo[0]!.amplitudeDeg !== 50) {
    throw new Error("实验四V2必须包含一个50°无遮挡演示");
  }
  if (Math.abs(protocol2EnergyJ(60) - 19.6) > 1e-12) {
    throw new Error("实验四V2 60°能量错误");
  }
}
