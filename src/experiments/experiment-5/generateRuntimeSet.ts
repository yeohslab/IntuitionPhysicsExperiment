import { cryptoRandom, shuffleInPlace } from "../../experiment/stimulus/cryptoRandom";
import {
  analyzePendulum,
  pendulumEnergy,
  pendulumThetaOmegaAt,
  type PendulumParams,
} from "../../experiment/physics/pendulum";
import { EXPERIMENT_5_STIMULUS_SET_SCHEMA_VERSION, type BlockSegment, type Experiment5StimulusSet, type ReachabilityPendulumStimulusUnit, type ReachabilityRelation, type TopLevelSequenceItem, type Trial } from "../../shared/experimentTypes";
import type { Experiment5ParticipantInfo } from "../../shared/participant";
import { newId } from "../../shared/ids";
import { experiment5BlockText, experiment5PracticeText, experiment5StructureText, experiment5WelcomeText } from "./instructions";
import {
  EXPERIMENT_5_BOB_RADIUS_M,
  EXPERIMENT_5_BOUNDARY_GAPS_DEG,
  EXPERIMENT_5_ENERGY_MAX_J,
  EXPERIMENT_5_ENERGY_MIN_J,
  EXPERIMENT_5_FIXATION_MS,
  EXPERIMENT_5_FIXATION_TEXT,
  EXPERIMENT_5_FORMAL_BLOCKS,
  EXPERIMENT_5_FORMAL_TRIALS,
  EXPERIMENT_5_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_5_GRATING_CONDITIONS,
  EXPERIMENT_5_GRAVITY,
  EXPERIMENT_5_JUDGMENT_DISTANCES_M,
  EXPERIMENT_5_PRACTICE_TRIALS,
  EXPERIMENT_5_RESPONSE_DEADLINE_SEC,
  EXPERIMENT_5_ROD_LENGTH_M,
  EXPERIMENT_5_TOTAL_RUNTIME_TRIALS,
  EXPERIMENT_5_VISIBLE_DURATION_SEC,
  EXPERIMENT_5_VISIBLE_WINDOW_COUNT_ORDER,
  experiment5KeyMapping,
  type Experiment5BoundaryGapDeg,
  type Experiment5JudgmentDistanceM,
  type Experiment5VisibleWindowCount,
} from "./protocol";

type BaseCondition = {
  relation: ReachabilityRelation;
  gap: Experiment5BoundaryGapDeg;
  distance: Experiment5JudgmentDistanceM;
  side: "left" | "right";
};

type Condition = BaseCondition & {
  visibleWindowCount: Experiment5VisibleWindowCount;
};

export type GenerateExperiment5RuntimeSetOptions = {
  rng?: () => number;
  onProgress?: (completed: number, total: number) => void;
};

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const toRad = (deg: number) => (deg * Math.PI) / 180;

function amplitudeRadForEnergy(energyJ: number): number {
  return Math.acos(1 - energyJ / (EXPERIMENT_5_GRAVITY * EXPERIMENT_5_ROD_LENGTH_M));
}

function outwardStateAtAbsTheta(energyJ: number, absThetaRad: number): PendulumParams {
  const omega = Math.sqrt(
    Math.max(0, 2 * (energyJ - EXPERIMENT_5_GRAVITY * EXPERIMENT_5_ROD_LENGTH_M * (1 - Math.cos(absThetaRad)))) /
      (EXPERIMENT_5_ROD_LENGTH_M ** 2),
  );
  return {
    theta0Rad: absThetaRad,
    omega0RadPerSec: omega,
    rodLengthM: EXPERIMENT_5_ROD_LENGTH_M,
    gravity: EXPERIMENT_5_GRAVITY,
  };
}

function timeToBoundary(params: PendulumParams, boundaryAbsRad: number): number {
  const analysis = analyzePendulum(params);
  let lo = 0;
  let hi = analysis.T / 2;
  for (let i = 0; i < 90; i += 1) {
    const mid = (lo + hi) / 2;
    const state = pendulumThetaOmegaAt(mid, params, analysis);
    if (state.omega <= 0 || Math.abs(state.theta) >= boundaryAbsRad) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function buildExperiment5Unit(
  condition: Condition,
  participant: Experiment5ParticipantInfo,
  rng: () => number,
): ReachabilityPendulumStimulusUnit {
  const energyJ = EXPERIMENT_5_ENERGY_MIN_J + rng() * (EXPERIMENT_5_ENERGY_MAX_J - EXPERIMENT_5_ENERGY_MIN_J);
  const amplitudeRad = amplitudeRadForEnergy(energyJ);
  const gapRad = toRad(condition.gap);
  const targetAbsRad = condition.relation === "reachable" ? amplitudeRad - gapRad : amplitudeRad + gapRad;
  const boundaryAbsRad = Math.min(amplitudeRad, targetAbsRad);
  const disappearanceAbsRad = boundaryAbsRad - condition.distance / EXPERIMENT_5_ROD_LENGTH_M;
  if (disappearanceAbsRad <= 0) throw new Error("实验五消失位置必须位于最低点外侧");
  const canonicalDisappearance = outwardStateAtAbsTheta(energyJ, disappearanceAbsRad);
  const canonicalAnalysis = analyzePendulum(canonicalDisappearance);
  const canonicalStart = pendulumThetaOmegaAt(-EXPERIMENT_5_VISIBLE_DURATION_SEC, canonicalDisappearance, canonicalAnalysis);
  if (canonicalStart.theta <= 0 || canonicalStart.omega <= 0) {
    throw new Error("实验五可见轨迹越过最低点或方向错误");
  }
  const sign = condition.side === "right" ? 1 : -1;
  const start: PendulumParams = {
    ...canonicalDisappearance,
    theta0Rad: sign * canonicalStart.theta,
    omega0RadPerSec: sign * canonicalStart.omega,
  };
  const disappearanceTheta = sign * disappearanceAbsRad;
  const disappearanceOmega = sign * canonicalDisappearance.omega0RadPerSec;
  const judgmentTimeSec = timeToBoundary(canonicalDisappearance, boundaryAbsRad);
  const mapping = experiment5KeyMapping(participant.subject_id);
  const geometry = EXPERIMENT_5_GRATING_CONDITIONS[condition.visibleWindowCount];
  const unit: ReachabilityPendulumStimulusUnit = {
    id: newId(),
    type: "reachabilityPendulumStimulus",
    theta0Deg: toDeg(start.theta0Rad),
    omega0DegPerSec: toDeg(start.omega0RadPerSec),
    disappearanceThetaDeg: toDeg(disappearanceTheta),
    disappearanceOmegaDegPerSec: toDeg(disappearanceOmega),
    rodLengthM: EXPERIMENT_5_ROD_LENGTH_M,
    gravity: EXPERIMENT_5_GRAVITY,
    bobRadiusM: EXPERIMENT_5_BOB_RADIUS_M,
    energyJ,
    amplitudeDeg: toDeg(amplitudeRad),
    targetAngleDeg: sign * toDeg(targetAbsRad),
    boundaryGapDeg: condition.gap,
    judgmentDistanceM: condition.distance,
    judgmentTimeSec,
    visibleDurationSec: EXPERIMENT_5_VISIBLE_DURATION_SEC,
    responseDeadlineSec: EXPERIMENT_5_RESPONSE_DEADLINE_SEC,
    visibleWindowCount: condition.visibleWindowCount,
    gapM: geometry.gapM,
    barWidthM: geometry.barWidthM,
    gratingPeriodM: geometry.periodM,
    gratingOffsetM: geometry.offsetM,
    side: condition.side,
    relation: condition.relation,
    correctResponse: condition.relation,
    ...mapping,
  };
  assertExperiment5Unit(unit);
  return unit;
}

export function assertExperiment5Unit(unit: ReachabilityPendulumStimulusUnit): void {
  if (unit.energyJ < EXPERIMENT_5_ENERGY_MIN_J || unit.energyJ > EXPERIMENT_5_ENERGY_MAX_J) throw new Error("实验五能量越界");
  const params = { theta0Rad: toRad(unit.theta0Deg), omega0RadPerSec: toRad(unit.omega0DegPerSec), rodLengthM: unit.rodLengthM, gravity: unit.gravity };
  const analysis = analyzePendulum(params);
  if (analysis.regime !== "oscillation") throw new Error("实验五只允许往复摆动");
  if (Math.abs(pendulumEnergy(params) - unit.energyJ) > 1e-8) throw new Error("实验五初态机械能不一致");
  if (params.theta0Rad * params.omega0RadPerSec <= 0) throw new Error("实验五初态必须同侧外摆且速度非零");
  const end = pendulumThetaOmegaAt(unit.visibleDurationSec, params, analysis);
  if (Math.abs(toDeg(end.theta) - unit.disappearanceThetaDeg) > 1e-7 || Math.abs(toDeg(end.omega) - unit.disappearanceOmegaDegPerSec) > 1e-7) throw new Error("实验五消失状态重算不一致");
  if (end.theta * end.omega <= 0) throw new Error("实验五可见阶段发生转折");
  const boundaryAbs = Math.min(toRad(unit.amplitudeDeg), Math.abs(toRad(unit.targetAngleDeg)));
  const recomputedD = (boundaryAbs - Math.abs(end.theta)) * unit.rodLengthM;
  if (Math.abs(recomputedD - unit.judgmentDistanceM) > 1e-8) throw new Error("实验五判定路程重算不一致");
  if (!(unit.judgmentTimeSec > 0)) throw new Error("实验五判定时间必须为正");
  const geometry = EXPERIMENT_5_GRATING_CONDITIONS[unit.visibleWindowCount];
  if (!geometry ||
      Math.abs(unit.gapM - geometry.gapM) > 1e-9 ||
      Math.abs(unit.barWidthM - geometry.barWidthM) > 1e-9 ||
      Math.abs(unit.gratingPeriodM - geometry.periodM) > 1e-9 ||
      Math.abs(unit.gratingOffsetM - geometry.offsetM) > 1e-9 ||
      Math.abs(unit.gratingPeriodM - unit.gapM - unit.barWidthM) > 1e-9) {
    throw new Error("实验五光栅几何必须与实验四一致");
  }
}

function fixation() { return { id: newId(), type: "textDisplay" as const, text: EXPERIMENT_5_FIXATION_TEXT, durationMs: EXPERIMENT_5_FIXATION_MS }; }
function control(text: string) { return { id: newId(), type: "textControl" as const, text, key: " " }; }
function makeTrial(condition: Condition, participant: Experiment5ParticipantInfo, rng: () => number): Trial {
  return { id: newId(), units: [fixation(), buildExperiment5Unit(condition, participant, rng)] };
}

function conditionOrderValid(items: readonly Condition[]): boolean {
  for (let i = 3; i < items.length; i += 1) {
    const four = items.slice(i - 3, i + 1);
    if (four.every((x) => x.relation === four[0]!.relation)) return false;
    if (four.every((x) => x.side === four[0]!.side)) return false;
    if (four.every((x) => x.visibleWindowCount === four[0]!.visibleWindowCount)) return false;
  }
  return true;
}

function shuffledConstrained(items: BaseCondition[], rng: () => number): Condition[] {
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const copy = [...items];
    shuffleInPlace(copy, rng);
    const gratingConditions = EXPERIMENT_5_VISIBLE_WINDOW_COUNT_ORDER.flatMap(
      (visibleWindowCount) => Array.from(
        { length: items.length / EXPERIMENT_5_VISIBLE_WINDOW_COUNT_ORDER.length },
        () => visibleWindowCount,
      ),
    );
    shuffleInPlace(gratingConditions, rng);
    const combined = copy.map((condition, index) => ({
      ...condition,
      visibleWindowCount: gratingConditions[index]!,
    }));
    if (conditionOrderValid(combined)) return combined;
  }
  throw new Error("无法生成满足连续条件限制的实验五 Block");
}

function formalConditions(): BaseCondition[][] {
  const blocks = Array.from({ length: 4 }, () => [] as BaseCondition[]);
  for (const [rIndex, relation] of (["reachable", "unreachable"] as const).entries()) {
    for (const gap of EXPERIMENT_5_BOUNDARY_GAPS_DEG) {
      for (const [dIndex, distance] of EXPERIMENT_5_JUDGMENT_DISTANCES_M.entries()) {
        for (const [sIndex, side] of (["left", "right"] as const).entries()) {
          blocks[(rIndex + dIndex + 2 * sIndex) % 4]!.push({ relation, gap, distance, side });
        }
      }
    }
  }
  return blocks;
}

export function generateExperiment5RuntimeStimulusSet(participant: Experiment5ParticipantInfo, options: GenerateExperiment5RuntimeSetOptions = {}): Experiment5StimulusSet {
  const rng = options.rng ?? cryptoRandom();
  let completed = 0;
  const report = () => options.onProgress?.(++completed, EXPERIMENT_5_TOTAL_RUNTIME_TRIALS);
  const mapping = experiment5KeyMapping(participant.subject_id);
  const practiceConditions: BaseCondition[] = [];
  let p = 0;
  for (const relation of ["reachable", "unreachable"] as const) for (const gap of EXPERIMENT_5_BOUNDARY_GAPS_DEG) {
    practiceConditions.push({ relation, gap, distance: EXPERIMENT_5_JUDGMENT_DISTANCES_M[p % 4]!, side: p++ % 2 === 0 ? "left" : "right" });
  }
  shuffleInPlace(practiceConditions, rng);
  const practiceGratings = EXPERIMENT_5_VISIBLE_WINDOW_COUNT_ORDER.flatMap(
    (visibleWindowCount) => [visibleWindowCount, visibleWindowCount],
  );
  shuffleInPlace(practiceGratings, rng);
  const practice = { kind: "practice" as const, id: newId(), children: practiceConditions.map((c, index) => { const t = makeTrial({ ...c, visibleWindowCount: practiceGratings[index]! }, participant, rng); report(); return t; }) };
  const blockConditions = formalConditions();
  const blockLabels = [0, 1, 2, 3];
  shuffleInPlace(blockLabels, rng);
  const blocks: BlockSegment[] = blockLabels.map((label) => ({ kind: "block", id: newId(), children: shuffledConstrained(blockConditions[label]!, rng).map((c) => { const t = makeTrial(c, participant, rng); report(); return t; }) }));
  const sequence: TopLevelSequenceItem[] = [
    { kind: "rest", id: newId(), units: [control(experiment5WelcomeText(mapping.yesKey, mapping.noKey))] },
    { kind: "rest", id: newId(), units: [control(experiment5StructureText())] },
    { kind: "rest", id: newId(), units: [control(experiment5PracticeText())] },
    practice,
  ];
  blocks.forEach((block, index) => sequence.push({ kind: "rest", id: newId(), units: [control(experiment5BlockText(index + 1, EXPERIMENT_5_FORMAL_BLOCKS))] }, block));
  const set: Experiment5StimulusSet = { schemaVersion: EXPERIMENT_5_STIMULUS_SET_SCHEMA_VERSION, sequence };
  assertExperiment5RuntimeStimulusSet(set);
  return set;
}

export function assertExperiment5RuntimeStimulusSet(set: Experiment5StimulusSet): void {
  const practices = set.sequence.filter((x) => x.kind === "practice");
  const blocks = set.sequence.filter((x) => x.kind === "block");
  if (practices.length !== 1 || practices[0]!.children.length !== EXPERIMENT_5_PRACTICE_TRIALS) throw new Error("实验五练习试次数错误");
  if (blocks.length !== EXPERIMENT_5_FORMAL_BLOCKS) throw new Error("实验五 Block 数错误");
  const all = blocks.flatMap((b) => b.children.map((t) => t.units.find((u): u is ReachabilityPendulumStimulusUnit => u.type === "reachabilityPendulumStimulus")!));
  if (all.length !== EXPERIMENT_5_FORMAL_TRIALS) throw new Error("实验五正式试次数错误");
  const practiceUnits = practices[0]!.children.map((t) => t.units.find((u): u is ReachabilityPendulumStimulusUnit => u.type === "reachabilityPendulumStimulus")!);
  for (const count of EXPERIMENT_5_VISIBLE_WINDOW_COUNT_ORDER) {
    if (practiceUnits.filter((u) => u.visibleWindowCount === count).length !== 2) throw new Error("实验五练习光栅条件平衡错误");
  }
  for (const block of blocks) {
    if (block.children.length !== EXPERIMENT_5_FORMAL_TRIALS_PER_BLOCK) throw new Error("实验五每 Block 试次数错误");
    const units = block.children.map((t) => t.units.find((u): u is ReachabilityPendulumStimulusUnit => u.type === "reachabilityPendulumStimulus")!);
    for (const relation of ["reachable", "unreachable"]) if (units.filter((u) => u.relation === relation).length !== 6) throw new Error("实验五答案 Block 平衡错误");
    for (const side of ["left", "right"]) if (units.filter((u) => u.side === side).length !== 6) throw new Error("实验五左右 Block 平衡错误");
    for (const gap of EXPERIMENT_5_BOUNDARY_GAPS_DEG) if (units.filter((u) => u.boundaryGapDeg === gap).length !== 4) throw new Error("实验五边界差 Block 平衡错误");
    for (const distance of EXPERIMENT_5_JUDGMENT_DISTANCES_M) if (units.filter((u) => u.judgmentDistanceM === distance).length !== 3) throw new Error("实验五路程 Block 平衡错误");
    for (const count of EXPERIMENT_5_VISIBLE_WINDOW_COUNT_ORDER) if (units.filter((u) => u.visibleWindowCount === count).length !== 4) throw new Error("实验五光栅条件 Block 平衡错误");
    if (!conditionOrderValid(units.map((u) => ({ relation: u.relation, gap: u.boundaryGapDeg as Experiment5BoundaryGapDeg, distance: u.judgmentDistanceM as Experiment5JudgmentDistanceM, side: u.side, visibleWindowCount: u.visibleWindowCount })))) throw new Error("实验五连续条件限制错误");
  }
  all.forEach(assertExperiment5Unit);
  const combos = new Set(all.map((u) => `${u.relation}|${u.boundaryGapDeg}|${u.judgmentDistanceM}|${u.side}`));
  if (combos.size !== 48) throw new Error("实验五正式条件未完整覆盖");
}

export async function generateExperiment5RuntimeStimulusSetAsync(participant: Experiment5ParticipantInfo, options: GenerateExperiment5RuntimeSetOptions = {}): Promise<Experiment5StimulusSet> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return generateExperiment5RuntimeStimulusSet(participant, options);
}
