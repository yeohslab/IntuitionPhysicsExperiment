import {
  generateExperiment4V2RuntimeStimulusSet,
} from "../../src/experiments/experiment-4-v2/generateRuntimeSet.ts";
import {
  experiment4V2AnglePracticeText,
  experiment4V2SpeedPracticeText,
} from "../../src/experiments/experiment-4-v2/instructions.ts";
import {
  EXPERIMENT_4_V2_CUE_MS,
  EXPERIMENT_4_V2_BLANK_DURATION_SEC,
  EXPERIMENT_4_V2_FIXATION_MS,
  EXPERIMENT_4_V2_FIXATION_TEXT,
  EXPERIMENT_4_V2_FORMAL_TRIALS,
  EXPERIMENT_4_V2_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG,
  EXPERIMENT_4_V2_PRACTICE_ANGLE_TRIALS,
  EXPERIMENT_4_V2_PRACTICE_SPEED_TRIALS,
  EXPERIMENT_4_V2_ROD_LENGTH_M,
  EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC,
} from "../../src/experiments/experiment-4-v2/protocol.ts";
import {
  PROTOCOL_2_GRATING_CONDITIONS,
  PROTOCOL_2_GRATING_ORDER,
  planProtocol2Motion,
  protocol2SceneAlpha,
  protocol2UniformEllipseSites,
  protocol2VisibleSegmentCount,
} from "../../src/experiments/protocol-2/common.ts";
import type { TrackingPendulumV2StimulusUnit, Trial } from "../../src/shared/experimentTypes.ts";
import { parseExperiment4V2StimulusSet } from "../../src/shared/storage.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

assert(protocol2SceneAlpha(1, 2) === 1, "淡出前画面应不透明");
assert(Math.abs(protocol2SceneAlpha(1.85, 2) - 0.5) < 1e-12, "淡出中点透明度应为0.5");
assert(protocol2SceneAlpha(2, 2) === 0, "空白开始时淡出应结束");
assert(protocol2SceneAlpha(0.1, 0.2) === 0.5, "空白前不足0.3秒时从播放起点淡出");

const sites = protocol2UniformEllipseSites(60, EXPERIMENT_4_V2_FORMAL_TRIALS_PER_BLOCK);
assert(sites.length === 32, "60°能量椭圆应为32个终点");
function ellipseGaps(points: Array<{ thetaRad: number; omegaRadPerSec: number }>): number[] {
  const gaps: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    gaps.push(Math.hypot(b.thetaRad - a.thetaRad, b.omegaRadPerSec - a.omegaRadPerSec));
  }
  return gaps;
}
const gaps = ellipseGaps(sites);
const meanGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
assert(gaps.every((gap) => Math.abs(gap - meanGap) / meanGap < 0.02),
  "32个终点的相邻弧长应接近相等");
const angleSites = sites.filter((site) => site.magnitudeIndex % 2 === 0);
const speedSites = sites.filter((site) => site.magnitudeIndex % 2 === 1);
for (const subset of [angleSites, speedSites]) {
  const subsetGaps = ellipseGaps(subset);
  const subsetMean = subsetGaps.reduce((sum, gap) => sum + gap, 0) / subsetGaps.length;
  assert(subsetGaps.every((gap) => Math.abs(gap - subsetMean) / subsetMean < 0.04),
    "角度与速度子集各自的相邻弧长应接近相等");
}

const participant = { subject_id: "E4-0001", gender_code: 0 as const, age_years: 20 };
const set = generateExperiment4V2RuntimeStimulusSet(participant, { rng: seeded(4) });
const blocks = set.sequence.filter((item) => item.kind === "block");
assert(blocks.length === 3, "正式阶段应有3个区组");
function trackingUnit(trial: Trial): TrackingPendulumV2StimulusUnit {
  const unit = trial.units.find((item) => item.type === "trackingPendulumV2Stimulus");
  assert(unit?.type === "trackingPendulumV2Stimulus", "试次缺少追踪刺激");
  return unit;
}

function assertTrialOpening(trial: Trial): void {
  const cue = trial.units[0];
  const fixation = trial.units[1];
  const stimulus = trackingUnit(trial);
  assert(
    cue?.type === "textDisplay" && cue.durationMs === EXPERIMENT_4_V2_CUE_MS,
    "试次应以1秒方向提示开始",
  );
  assert(
    fixation?.type === "textDisplay" &&
      fixation.text === EXPERIMENT_4_V2_FIXATION_TEXT &&
      fixation.durationMs === EXPERIMENT_4_V2_FIXATION_MS,
    "方向提示后应有0.5秒注视点",
  );
  assert(trial.units[2] === stimulus, "注视点后应立刻是摆球演示");
  if (cue?.type === "textDisplay") {
    const side = stimulus.initialSide === "left" ? "左侧" : "右侧";
    const direction = stimulus.initialDirection === "leftward" ? "向左" : "向右";
    assert(cue.text.includes(side) && cue.text.includes(direction), "提示应包含初始位置和运动方向");
  }
}

const formalTrials = blocks.flatMap((block) => block.children);
formalTrials.forEach(assertTrialOpening);
const formal = formalTrials.map(trackingUnit);
assert(formal.length === EXPERIMENT_4_V2_FORMAL_TRIALS, "正式试次应为96条");
assert(new Set(formal.map((unit) => unit.gratingCondition)).size === 3, "应覆盖G1/G2/G3");
for (const grating of PROTOCOL_2_GRATING_ORDER) {
  const units = formal.filter((unit) => unit.gratingCondition === grating);
  assert(units.length === 32, `${grating}应有32条`);
  assert(units.filter((unit) => unit.reportTarget === "angle").length === 16,
    `${grating}应有16条角度汇报`);
  assert(units.filter((unit) => unit.reportTarget === "speed").length === 16,
    `${grating}应有16条速度汇报`);
  assert(new Set(units.map((unit) => unit.stateSiteId)).size === 32, `${grating}应覆盖32个终点`);
  for (const site of sites) {
    const unit = units.find((item) => item.stateSiteId === site.id);
    assert(unit, `${grating}缺少${site.id}`);
    assert(unit.reportTarget === (site.magnitudeIndex % 2 === 0 ? "angle" : "speed"),
      `${grating} ${site.id} 汇报类型应相间`);
    assert(Math.abs((unit.queryThetaDeg * Math.PI) / 180 - site.thetaRad) < 1e-6 &&
      Math.abs(unit.queryOmegaRadPerSec - site.omegaRadPerSec) < 1e-6,
      `${grating} 查询状态不得偏离椭圆终点`);
  }
}
for (const unit of formal) {
  assert(
    unit.visibleSegments.length === protocol2VisibleSegmentCount(unit.gratingCondition),
    "可见片段数应为光栅编号加3",
  );
  assert(unit.visibleSegments.every((segment) => segment.tEndSec - segment.tStartSec >= 2 / 60 - 1e-9),
    "可见片段不得短于两个60Hz帧");
  assert(Math.abs(unit.blankDurationSec - EXPERIMENT_4_V2_BLANK_DURATION_SEC) < 1e-12,
    "空白应为0.70秒");
  assert(unit.cueDurationMs === EXPERIMENT_4_V2_CUE_MS, "提示应为1秒");
}
assert(
  Math.abs(EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC - Math.sqrt(39.2)) < 1e-12,
  "速度色带右端应为sqrt(gl)",
);
const practiceSegments = set.sequence.filter((item) => item.kind === "practice");
assert(practiceSegments.length === 2, "练习应分为两段");
const angleSegment = practiceSegments[0]!;
const speedSegment = practiceSegments[1]!;
assert(angleSegment.kind === "practice" && speedSegment.kind === "practice", "练习段类型错误");
angleSegment.children.forEach(assertTrialOpening);
speedSegment.children.forEach(assertTrialOpening);
const anglePractice = angleSegment.children.map(trackingUnit);
const speedPractice = speedSegment.children.map(trackingUnit);
assert(anglePractice.length === EXPERIMENT_4_V2_PRACTICE_ANGLE_TRIALS, "位置练习应为3条");
assert(speedPractice.length === EXPERIMENT_4_V2_PRACTICE_SPEED_TRIALS, "速度练习应为9条");
assert(anglePractice.every((unit) => unit.reportTarget === "angle"), "位置练习只能汇报角度");
assert(speedPractice.every((unit) => unit.reportTarget === "speed"), "速度练习只能汇报速度");
function restTextBefore(index: number): string {
  const previous = set.sequence[index - 1];
  assert(previous?.kind === "rest", "练习段前应有说明页");
  const unit = previous.units[0];
  assert(unit?.type === "textControl", "练习说明应为按键页");
  return unit.text;
}
assert(
  restTextBefore(set.sequence.indexOf(angleSegment)) === experiment4V2AnglePracticeText(),
  "位置练习前应出现位置说明",
);
assert(
  restTextBefore(set.sequence.indexOf(speedSegment)) === experiment4V2SpeedPracticeText(),
  "速度练习前应出现速度说明",
);
assert(
  set.sequence.indexOf(angleSegment) < set.sequence.indexOf(speedSegment),
  "位置练习应排在速度练习之前",
);
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}
for (const grating of PROTOCOL_2_GRATING_ORDER) {
  const angleUnits = anglePractice.filter((unit) => unit.gratingCondition === grating);
  const speedUnits = speedPractice.filter((unit) => unit.gratingCondition === grating);
  assert(angleUnits.length === 1, `${grating}位置练习应为1条`);
  assert(speedUnits.length === 3, `${grating}速度练习应为3条`);
  const speedIds = speedUnits.map((unit) => unit.stateSiteId);
  assert(new Set(speedIds).size === 3, `${grating}速度练习终点应不同`);
  assert(!speedIds.includes(angleUnits[0]!.stateSiteId), `${grating}角度终点不得与速度终点重复`);
  const feasible = protocol2UniformEllipseSites(EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG, 32)
    .flatMap((site) => {
      try {
        return [planProtocol2Motion(
          EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG,
          site,
          PROTOCOL_2_GRATING_CONDITIONS[grating],
        )];
      } catch {
        return [];
      }
    });
  const speedOf = (omega: number) => EXPERIMENT_4_V2_ROD_LENGTH_M * Math.abs(omega);
  const speeds = feasible.map((plan) => speedOf(plan.queryOmegaRadPerSec));
  const chosen = [...speedUnits].sort((a, b) => {
    const delta = speedOf(a.queryOmegaRadPerSec) - speedOf(b.queryOmegaRadPerSec);
    if (Math.abs(delta) > 1e-9) return delta;
    return a.stateSiteId < b.stateSiteId ? -1 : 1;
  });
  assert(Math.abs(speedOf(chosen[0]!.queryOmegaRadPerSec) - Math.min(...speeds)) < 1e-6,
    `${grating}速度练习应包含最慢终点`);
  assert(Math.abs(speedOf(chosen[2]!.queryOmegaRadPerSec) - Math.max(...speeds)) < 1e-6,
    `${grating}速度练习应包含最快终点`);
  const target = median(speeds);
  const mediumPool = feasible.filter((plan) =>
    plan.stateSiteId !== chosen[0]!.stateSiteId && plan.stateSiteId !== chosen[2]!.stateSiteId);
  const bestMedium = Math.min(...mediumPool.map((plan) =>
    Math.abs(speedOf(plan.queryOmegaRadPerSec) - target)));
  assert(
    Math.abs(Math.abs(speedOf(chosen[1]!.queryOmegaRadPerSec) - target) - bestMedium) < 1e-6,
    `${grating}速度练习的中间终点应最接近速度中位数`,
  );
  const anglePool = feasible.filter((plan) => !speedIds.includes(plan.stateSiteId));
  const bestAngle = Math.min(...anglePool.map((plan) =>
    Math.abs(Math.abs(plan.queryThetaDeg) - EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG / 2)));
  assert(
    Math.abs(
      Math.abs(Math.abs(angleUnits[0]!.queryThetaDeg) - EXPERIMENT_4_V2_PRACTICE_AMPLITUDE_DEG / 2)
      - bestAngle,
    ) < 1e-6,
    `${grating}角度练习终点应最接近25°`,
  );
}
assert(
  set.sequence.every((item) =>
    item.kind !== "rest" || item.units.every((unit) => unit.type !== "protocol2PendulumDemo"),
  ),
  "实验四V2不得包含无遮挡演示",
);
assert(parseExperiment4V2StimulusSet(JSON.parse(JSON.stringify(set))) !== null,
  "实验四V2刺激集应可序列化解析");
assert(parseExperiment4V2StimulusSet({ ...set, schemaVersion: 3 }) === null,
  "实验四V2应拒绝旧schema");

console.log("verify-experiment-4-v2: OK");
