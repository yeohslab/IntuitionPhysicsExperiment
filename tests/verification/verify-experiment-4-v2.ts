import {
  generateExperiment4V2RuntimeStimulusSet,
} from "../../src/experiments/experiment-4-v2/generateRuntimeSet.ts";
import {
  EXPERIMENT_4_V2_CUE_MS,
  EXPERIMENT_4_V2_BLANK_DURATION_SEC,
  EXPERIMENT_4_V2_FIXATION_MS,
  EXPERIMENT_4_V2_FIXATION_TEXT,
  EXPERIMENT_4_V2_FORMAL_TRIALS,
  EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC,
} from "../../src/experiments/experiment-4-v2/protocol.ts";
import {
  PROTOCOL_2_GRATING_ORDER,
  protocol2SceneAlpha,
  protocol2StateSites,
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

const sites = protocol2StateSites(60);
assert(sites.length === 24, "60°状态点库应为24个");
const positiveIncoming = sites.filter((site) => site.thetaRad > 0 && site.omegaRadPerSec > 0);
const expectedAngles = [9.75, 27.06, 40.40, 50.07, 56.43, 59.60];
assert(positiveIncoming.length === 6, "正角正速度分支应有6点");
positiveIncoming.forEach((site, index) => {
  assert(
    Math.abs(site.thetaRad * 180 / Math.PI - expectedAngles[index]!) < 0.03,
    `状态点${index + 1}角度不符合文档`,
  );
});

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
assert(formal.length === EXPERIMENT_4_V2_FORMAL_TRIALS, "正式试次应为78条");
assert(new Set(formal.map((unit) => unit.gratingCondition)).size === 3, "应覆盖G1/G2/G3");
for (const grating of PROTOCOL_2_GRATING_ORDER) {
  const units = formal.filter((unit) => unit.gratingCondition === grating);
  assert(units.length === 26, `${grating}应有26条`);
  assert(units.filter((unit) => unit.trackingCondition === "hidden_reversal").length === 2,
    `${grating}应有2条隐藏反向`);
  assert(units.filter((unit) => unit.trackingCondition === "no_hidden_reversal").length === 24,
    `${grating}应有24条无反向槽位`);
  assert(units.filter((unit) => unit.reportTarget === "angle").length === 13,
    `${grating}应有13条角度汇报`);
  assert(units.filter((unit) => unit.reportTarget === "speed").length === 13,
    `${grating}应有13条速度汇报`);
  const hiddenReports = units
    .filter((unit) => unit.trackingCondition === "hidden_reversal")
    .map((unit) => unit.reportTarget);
  assert(new Set(hiddenReports).size === 2, `${grating}隐藏反向应覆盖两种汇报`);
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
  assert((unit.trackingCondition === "hidden_reversal") === (unit.reversalTimeSec !== null),
    "反向标签必须与物理验证一致");
}
assert(
  Math.abs(EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC - Math.sqrt(39.2)) < 1e-12,
  "速度色带右端应为sqrt(gl)",
);
const practiceTrials = set.sequence.filter((item) => item.kind === "practice")
  .flatMap((item) => item.children);
practiceTrials.forEach(assertTrialOpening);
const practice = practiceTrials.map(trackingUnit);
assert(practice.length === 6, "练习应为6条");
assert(practice.filter((unit) => unit.reportTarget === "angle").length === 3,
  "练习角度汇报应为3条");
assert(practice.filter((unit) => unit.reportTarget === "speed").length === 3,
  "练习速度汇报应为3条");
for (const grating of PROTOCOL_2_GRATING_ORDER) {
  const group = practice.filter((unit) => unit.gratingCondition === grating);
  assert(group.length === 2, `${grating}练习应为2条`);
  assert(new Set(group.map((unit) => unit.reportTarget)).size === 2,
    `${grating}练习应覆盖两种汇报`);
  assert(new Set(group.map((unit) => unit.trackingCondition)).size === 2,
    `${grating}练习应覆盖两种反向`);
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
