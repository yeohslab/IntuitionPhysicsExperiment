import {
  generateExperiment5V2RuntimeStimulusSet,
  selectExperiment5V2QuerySite,
} from "../../src/experiments/experiment-5-v2/generateRuntimeSet.ts";
import {
  EXPERIMENT_5_V2_AMPLITUDES_DEG,
  EXPERIMENT_5_V2_CUE_MS,
  EXPERIMENT_5_V2_DELTA_H_M,
  EXPERIMENT_5_V2_FIXATION_MS,
  EXPERIMENT_5_V2_FIXATION_TEXT,
  EXPERIMENT_5_V2_FORMAL_TRIALS,
  EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK,
} from "../../src/experiments/experiment-5-v2/protocol.ts";
import {
  PROTOCOL_2_GRATING_CONDITIONS,
  planProtocol2Motion,
  protocol2BlankSweepsBell,
  protocol2StateSites,
  protocol2VisibleSegmentCount,
} from "../../src/experiments/protocol-2/common.ts";
import { EXPERIMENT_5_V2_BLANK_DURATION_SEC } from "../../src/experiments/experiment-5-v2/protocol.ts";
import type { BellReachabilityV2StimulusUnit, Trial } from "../../src/shared/experimentTypes.ts";
import { parseExperiment5V2StimulusSet } from "../../src/shared/storage.ts";

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

const participant = { subject_id: "E5-0001", gender_code: 1 as const, age_years: 21 };
const set = generateExperiment5V2RuntimeStimulusSet(participant, { rng: seeded(5) });
const blocks = set.sequence.filter((item) => item.kind === "block");
assert(blocks.length === 3, "实验五V2应有3个振幅区组");
function bellUnit(trial: Trial): BellReachabilityV2StimulusUnit {
  const unit = trial.units.find((item) => item.type === "bellReachabilityV2Stimulus");
  assert(unit?.type === "bellReachabilityV2Stimulus", "试次缺少铃铛刺激");
  return unit;
}

function assertTrialOpening(trial: Trial): void {
  const cue = trial.units[0];
  const fixation = trial.units[1];
  assert(cue?.type === "textDisplay" && cue.durationMs === EXPERIMENT_5_V2_CUE_MS,
    "试次应以1秒方向提示开始");
  assert(
    fixation?.type === "textDisplay" &&
      fixation.text === EXPERIMENT_5_V2_FIXATION_TEXT &&
      fixation.durationMs === EXPERIMENT_5_V2_FIXATION_MS,
    "方向提示后应有0.5秒注视点",
  );
  assert(trial.units[2] === bellUnit(trial), "注视点后应立刻是摆球演示");
}

const formalTrials = blocks.flatMap((block) => block.children);
formalTrials.forEach(assertTrialOpening);
const formal = formalTrials.map(bellUnit);
assert(formal.length === EXPERIMENT_5_V2_FORMAL_TRIALS, "正式试次数错误");
assert(new Set(formal.map((unit) => unit.amplitudeDeg)).size === 3, "应覆盖3个振幅");
for (const amplitude of EXPERIMENT_5_V2_AMPLITUDES_DEG) {
  const amplitudeUnits = formal.filter((unit) => unit.amplitudeDeg === amplitude);
  assert(amplitudeUnits.length === EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK, `${amplitude}°试次数错误`);
  assert(new Set(amplitudeUnits.map((unit) => unit.stateSiteId)).size === 1,
    "查询状态应跨光栅共享");
  for (const grating of ["G1", "G2", "G3"] as const) {
    const group = amplitudeUnits.filter((unit) => unit.gratingCondition === grating);
    assert(group.length === EXPERIMENT_5_V2_DELTA_H_M.length * 2, "每个振幅×光栅的铃铛数量错误");
    const fingerprint = (unit: BellReachabilityV2StimulusUnit) => JSON.stringify([
      unit.theta0Deg, unit.omega0DegPerSec, unit.queryThetaDeg,
      unit.queryOmegaRadPerSec, unit.queryTimeSec, unit.visibleSegments,
    ]);
    assert(new Set(group.map(fingerprint)).size === 1, "同一光栅的铃铛条件必须共享运动片段");
    assert(new Set(group.map((unit) => `${unit.deltaHM}:${unit.bellSide}`)).size === group.length,
      "应覆盖全部高度和侧别");
  }
  for (const delta of EXPERIMENT_5_V2_DELTA_H_M) {
    const deltaUnits = amplitudeUnits.filter((unit) => unit.deltaHM === delta);
    assert(deltaUnits.length === 6, "每个高度偏移应在区组内左右和三档光栅各出现一次");
  }
}
function blankSweeps(unit: BellReachabilityV2StimulusUnit): boolean {
  const site = protocol2StateSites(unit.amplitudeDeg).find((item) => item.id === unit.stateSiteId);
  assert(site, "查询状态应存在");
  const plan = planProtocol2Motion(
    unit.amplitudeDeg,
    site,
    PROTOCOL_2_GRATING_CONDITIONS[unit.gratingCondition],
  );
  return protocol2BlankSweepsBell(plan, (unit.bellThetaDeg * Math.PI) / 180);
}

for (const unit of formal) {
  assert(blankSweeps(unit) === (unit.correctResponse === "reachable"),
    "评分必须使用空白是否扫过铃铛");
  const expectedHeight = 4 * (1 - Math.cos(unit.amplitudeDeg * Math.PI / 180)) + unit.deltaHM;
  assert(Math.abs(unit.bellContactHeightM - expectedHeight) < 1e-12,
    "铃铛接触高度错误");
  assert(
    unit.visibleSegments.length === protocol2VisibleSegmentCount(unit.gratingCondition) &&
      Math.abs(unit.blankDurationSec - EXPERIMENT_5_V2_BLANK_DURATION_SEC) < 1e-12,
    "片段数或空白时长错误",
  );
}
assert(formal.every((unit) => unit.deltaHM <= 0), "铃铛高度不得超出可达弧线");
assert(
  formal.every((unit) =>
    Math.abs(unit.bellThetaDeg) <= unit.amplitudeDeg + 1e-6,
  ),
  "铃铛角度不得超出可达弧线",
);
assert(
  formal.some((unit) => unit.deltaHM <= 0 && unit.correctResponse === "unreachable"),
  "可达弧线内的铃铛在空白没扫到时应为不可达",
);
const practiceTrials = set.sequence.filter((item) => item.kind === "practice")
  .flatMap((item) => item.children);
practiceTrials.forEach(assertTrialOpening);
const practice = practiceTrials.map(bellUnit);
assert(
  set.sequence.every((item) =>
    item.kind !== "rest" || item.units.every((unit) => unit.type !== "protocol2PendulumDemo"),
  ),
  "实验五V2不得包含无遮挡演示",
);
assert(practice.length === 6, "练习应为6条");
assert(practice.some((unit) => unit.correctResponse === "reachable"), "练习应包含可达");
assert(practice.some((unit) => unit.correctResponse === "unreachable"), "练习应包含不可达");
for (const grating of ["G1", "G2", "G3"] as const) {
  const group = practice.filter((unit) => unit.gratingCondition === grating);
  assert(group.length === 2, "练习每档光栅应为两条");
  assert(new Set(group.map((unit) => unit.correctResponse)).size === 2,
    "练习每档光栅应同时有可达和不可达");
}
assert(practice.every((unit) => blankSweeps(unit) === (unit.correctResponse === "reachable")),
  "练习评分必须使用空白是否扫过铃铛");
assert(selectExperiment5V2QuerySite(60, 1, participant).id !==
  selectExperiment5V2QuerySite(60, 1, { ...participant, subject_id: "E5-0002" }).id,
  "相邻被试应轮换查询状态");
assert(parseExperiment5V2StimulusSet(JSON.parse(JSON.stringify(set))) !== null,
  "实验五V2刺激集应可序列化解析");
assert(parseExperiment5V2StimulusSet({ ...set, schemaVersion: 4 }) === null,
  "实验五V2应拒绝旧schema");

console.log("verify-experiment-5-v2: OK");
