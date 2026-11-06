import { analyzePendulum, pendulumThetaOmegaAt } from "../../src/experiment/physics/pendulum.ts";
import {
  experiment5V2ApproachSide,
  experiment5V2EndpointReachesBell,
  experiment5V2VisibleHeightM,
} from "../../src/experiments/experiment-5-v2/approachPlan.ts";
import { generateExperiment5V2RuntimeStimulusSet } from "../../src/experiments/experiment-5-v2/generateRuntimeSet.ts";
import {
  EXPERIMENT_5_V2_AMPLITUDES_DEG,
  EXPERIMENT_5_V2_BOB_RADIUS_M,
  EXPERIMENT_5_V2_CUE_MS,
  EXPERIMENT_5_V2_DELTA_H_M,
  EXPERIMENT_5_V2_FIXATION_MS,
  EXPERIMENT_5_V2_FIXATION_TEXT,
  EXPERIMENT_5_V2_FORMAL_TRIALS,
  EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_5_V2_POST_TURN_SEC,
  EXPERIMENT_5_V2_ROD_LENGTH_M,
} from "../../src/experiments/experiment-5-v2/protocol.ts";
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

function maxAbsThetaDeg(unit: BellReachabilityV2StimulusUnit, t0: number, t1: number): number {
  const params = {
    theta0Rad: (unit.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: EXPERIMENT_5_V2_ROD_LENGTH_M,
    gravity: unit.gravity,
  };
  const analysis = analyzePendulum(params);
  let maxAbs = 0;
  for (let time = t0; time <= t1 + 1e-9; time += 0.01) {
    maxAbs = Math.max(maxAbs, Math.abs(pendulumThetaOmegaAt(Math.min(time, t1), params, analysis).theta));
  }
  return (maxAbs * 180) / Math.PI;
}

const formalTrials = blocks.flatMap((block) => block.children);
formalTrials.forEach(assertTrialOpening);
const formal = formalTrials.map(bellUnit);
assert(formal.length === EXPERIMENT_5_V2_FORMAL_TRIALS, "正式试次数错误");
assert(formal.length === 54, "正式试次应为54条");
assert(new Set(formal.map((unit) => unit.amplitudeDeg)).size === 3, "应覆盖3个振幅");
assert(EXPERIMENT_5_V2_DELTA_H_M.length === 6, "应为六档高度");
for (const amplitude of EXPERIMENT_5_V2_AMPLITUDES_DEG) {
  const amplitudeUnits = formal.filter((unit) => unit.amplitudeDeg === amplitude);
  assert(amplitudeUnits.length === EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK, `${amplitude}°试次数错误`);
  assert(new Set(amplitudeUnits.map((unit) => unit.stateSiteId)).size === 1,
    "上摆方向应跨光栅共享");
  const thetaVisDeg = Math.acos(
    1 - experiment5V2VisibleHeightM(amplitude) / EXPERIMENT_5_V2_ROD_LENGTH_M,
  ) * 180 / Math.PI;
  for (const grating of ["G1", "G2", "G3"] as const) {
    const group = amplitudeUnits.filter((unit) => unit.gratingCondition === grating);
    assert(group.length === EXPERIMENT_5_V2_DELTA_H_M.length, "每个振幅×光栅的铃铛数量错误");
    const fingerprint = (unit: BellReachabilityV2StimulusUnit) => JSON.stringify([
      unit.theta0Deg, unit.omega0DegPerSec, unit.queryThetaDeg,
      unit.queryOmegaRadPerSec, unit.queryTimeSec, unit.visibleSegments,
    ]);
    assert(new Set(group.map(fingerprint)).size === 1, "同一光栅的铃铛条件必须共享运动片段");
    assert(new Set(group.map((unit) => `${unit.deltaHM}:${unit.bellSide}`)).size === group.length,
      "应覆盖全部高度和侧别");
  }
  const sample = amplitudeUnits[0]!;
  const visibleMax = maxAbsThetaDeg(sample, 0, sample.blankStartSec);
  assert(visibleMax < amplitude - 5, "可见运动不得包含端点");
  assert(visibleMax < thetaVisDeg + 1, "可见运动不得超过可见高度");
  const hiddenMax = maxAbsThetaDeg(sample, sample.blankStartSec, sample.queryTimeSec);
  assert(hiddenMax > amplitude - 1, "空白必须盖住端点");
  assert(
    Math.abs(sample.blankDurationSec - (sample.queryTimeSec - sample.blankStartSec)) < 1e-9,
    "空白时长应等于提问时刻减空白开始",
  );
  assert(sample.blankDurationSec > EXPERIMENT_5_V2_POST_TURN_SEC, "空白应长于端点后的停留");
  for (const delta of EXPERIMENT_5_V2_DELTA_H_M) {
    const deltaUnits = amplitudeUnits.filter((unit) => unit.deltaHM === delta);
    assert(deltaUnits.length === 3, "每个高度偏移应在区组内每档光栅出现一次");
    assert(new Set(deltaUnits.map((unit) => unit.bellSide)).size === 1, "同一区组的铃铛应在同一侧");
    assert(deltaUnits.every((unit) =>
      (unit.correctResponse === "reachable") === (delta <= 0) &&
      unit.correctResponse === "reachable" === experiment5V2EndpointReachesBell(
        unit.amplitudeDeg,
        (unit.bellThetaDeg * Math.PI) / 180,
      ),
    ), "端点容差应与高度偏移符号一致");
  }
}
const toleranceRad = EXPERIMENT_5_V2_BOB_RADIUS_M / EXPERIMENT_5_V2_ROD_LENGTH_M;
assert(!experiment5V2EndpointReachesBell(80, (80 * Math.PI) / 180 + toleranceRad + 0.02),
  "+0.10 m 附近超出容差的角度仍应不可达");
assert(formal.some((unit) => unit.deltaHM > 0 && unit.correctResponse === "unreachable"),
  "高出端点的铃铛应为不可达");
assert(formal.some((unit) => unit.deltaHM < 0 && unit.correctResponse === "reachable"),
  "低于端点的铃铛应为可达");
assert(formal.every((unit) => unit.bellSide === (unit.stateSiteId.endsWith("-left") ? "left" : "right")),
  "铃铛应放在消失时摆球朝向的一侧");
assert(formal.every((unit) => !unit.plannedVisibleTurn && !unit.plannedVisibleContact),
  "计划可见窗口不得包含转向或接触");

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
for (const grating of ["G1", "G2", "G3"] as const) {
  const group = practice.filter((unit) => unit.gratingCondition === grating);
  assert(group.length === 2, "练习每档光栅应为两条");
  assert(new Set(group.map((unit) => unit.correctResponse)).size === 2,
    "练习每档光栅应同时有可达和不可达");
}
assert(practice.every((unit) =>
  (unit.correctResponse === "reachable") === (unit.deltaHM <= 0),
), "练习评分必须使用端点是否够到铃铛");
assert(practice.every((unit) => unit.bellSide === (unit.stateSiteId.endsWith("-left") ? "left" : "right")),
  "练习铃铛应放在消失时摆球朝向的一侧");
assert(experiment5V2ApproachSide("E5-0001", 1) !== experiment5V2ApproachSide("E5-0002", 1),
  "相邻被试应轮换上摆方向");
assert(parseExperiment5V2StimulusSet(JSON.parse(JSON.stringify(set))) !== null,
  "实验五V2刺激集应可序列化解析");
assert(parseExperiment5V2StimulusSet({ ...set, schemaVersion: 6 }) === null,
  "实验五V2应拒绝旧schema");

console.log("verify-experiment-5-v2: OK");
