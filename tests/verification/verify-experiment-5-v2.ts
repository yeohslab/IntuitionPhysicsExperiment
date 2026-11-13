import { analyzePendulum, pendulumThetaOmegaAt } from "../../src/experiment/physics/pendulum.ts";
import { PROTOCOL_2_FADE_SEC, PROTOCOL_2_GRATING_CONDITIONS } from "../../src/experiments/protocol-2/common.ts";
import {
  experiment5V2DepartureState,
  experiment5V2EndpointReachesBell,
  experiment5V2ResponseOpenSec,
} from "../../src/experiments/experiment-5-v2/approachPlan.ts";
import { generateExperiment5V2RuntimeStimulusSet } from "../../src/experiments/experiment-5-v2/generateRuntimeSet.ts";
import {
  EXPERIMENT_5_V2_AMPLITUDES_DEG,
  EXPERIMENT_5_V2_BOB_RADIUS_M,
  EXPERIMENT_5_V2_CUE_MS,
  EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG,
  EXPERIMENT_5_V2_BELL_ANGLE_STEP_DEG,
  EXPERIMENT_5_V2_FIXATION_MS,
  EXPERIMENT_5_V2_FIXATION_TEXT,
  EXPERIMENT_5_V2_FORMAL_TRIALS,
  EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_5_V2_FORMAL_TRIALS_PER_SIDE,
  EXPERIMENT_5_V2_NO_KEY,
  EXPERIMENT_5_V2_BLANK_BEFORE_LOWEST_BELL_SEC,
  EXPERIMENT_5_V2_PRACTICE_AMPLITUDE_DEG,
  EXPERIMENT_5_V2_PRACTICE_TRIALS,
  EXPERIMENT_5_V2_ROD_LENGTH_M,
  EXPERIMENT_5_V2_YES_KEY,
} from "../../src/experiments/experiment-5-v2/protocol.ts";
import type { BellReachabilityV2StimulusUnit, Trial } from "../../src/shared/experimentTypes.ts";
import {
  experiment5V2BlockText,
  experiment5V2StructureText,
  experiment5V2WelcomeText,
} from "../../src/experiments/experiment-5-v2/instructions.ts";
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
assert(blocks.length === 3, "实验五V2应有3个休息区组");
for (const block of blocks) {
  const units = block.children.map(bellUnit);
  assert(new Set(units.map((unit) => unit.energyJ)).size === 3, "每个区组都应混合三种能量");
  for (const amplitude of EXPERIMENT_5_V2_AMPLITUDES_DEG) {
    assert(
      units.filter((unit) => unit.amplitudeDeg === amplitude).length ===
        EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK / EXPERIMENT_5_V2_AMPLITUDES_DEG.length,
      "每个区组每种振幅应为12条",
    );
  }
}
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

function maxSignedThetaDeg(
  unit: BellReachabilityV2StimulusUnit,
  t0: number,
  t1: number,
  sign: number,
): number {
  const params = {
    theta0Rad: (unit.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: EXPERIMENT_5_V2_ROD_LENGTH_M,
    gravity: unit.gravity,
  };
  const analysis = analyzePendulum(params);
  let maxSigned = Number.NEGATIVE_INFINITY;
  for (let time = t0; time <= t1 + 1e-9; time += 0.01) {
    const theta = pendulumThetaOmegaAt(Math.min(time, t1), params, analysis).theta;
    maxSigned = Math.max(maxSigned, sign * theta);
  }
  return (maxSigned * 180) / Math.PI;
}

const formalTrials = blocks.flatMap((block) => block.children);
formalTrials.forEach(assertTrialOpening);
const formal = formalTrials.map(bellUnit);
assert(formal.length === EXPERIMENT_5_V2_FORMAL_TRIALS, "正式试次数错误");
assert(formal.length === 108, "正式试次应为108条");
assert(new Set(formal.map((unit) => unit.amplitudeDeg)).size === 3, "应覆盖3个振幅");
assert(
  EXPERIMENT_5_V2_AMPLITUDES_DEG[0] === 75 &&
    EXPERIMENT_5_V2_AMPLITUDES_DEG[1] === 65 &&
    EXPERIMENT_5_V2_AMPLITUDES_DEG[2] === 55,
  "正式振幅应为75°、65°、55°",
);
const participantInstructions = [
  experiment5V2WelcomeText(),
  experiment5V2StructureText(),
  experiment5V2BlockText(1, 3),
  ...set.sequence.flatMap((item) => item.kind === "rest" ? item.units : [])
    .map((unit) => unit.type === "textControl" ? unit.text : ""),
].join("\n");
assert(!participantInstructions.includes("°"), "指导语不应写出角度");
assert(!participantInstructions.includes("振幅"), "指导语不应说明振幅设计");
assert(!participantInstructions.includes("最高点") && !participantInstructions.includes("最低"),
  "指导语不应说明空白对应的摆球位置");
assert(EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG.length === 6, "应为六档角度");
assert(
  EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG.every((offset, index) =>
    offset === [3, 2, 1, -1, -2, -3][index]! * EXPERIMENT_5_V2_BELL_ANGLE_STEP_DEG,
  ),
  "六档应为 ±3°、±6°、±9°",
);
for (const amplitude of EXPERIMENT_5_V2_AMPLITUDES_DEG) {
  const amplitudeUnits = formal.filter((unit) => unit.amplitudeDeg === amplitude);
  assert(amplitudeUnits.length === EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK, `${amplitude}°试次数错误`);
  assert(amplitudeUnits.filter((unit) => unit.bellSide === "left").length === EXPERIMENT_5_V2_FORMAL_TRIALS_PER_SIDE,
    `${amplitude}°向左试次数错误`);
  assert(amplitudeUnits.filter((unit) => unit.bellSide === "right").length === EXPERIMENT_5_V2_FORMAL_TRIALS_PER_SIDE,
    `${amplitude}°向右试次数错误`);
  assert(new Set(amplitudeUnits.map((unit) => unit.stateSiteId)).size === 2,
    "每个振幅应包含两个上摆方向");
  for (const grating of ["G1", "G2", "G3"] as const) {
    const group = amplitudeUnits.filter((unit) => unit.gratingCondition === grating);
    assert(group.length === EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG.length * 2, "每个振幅×光栅的铃铛数量错误");
    const fingerprint = (unit: BellReachabilityV2StimulusUnit) => JSON.stringify([
      unit.theta0Deg, unit.omega0DegPerSec, unit.queryThetaDeg,
      unit.queryOmegaRadPerSec, unit.queryTimeSec, unit.visibleSegments,
    ]);
    for (const side of ["left", "right"] as const) {
      const sideGroup = group.filter((unit) => unit.bellSide === side);
      assert(sideGroup.length === EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG.length, "每个方向应覆盖全部角度");
      assert(new Set(sideGroup.map(fingerprint)).size === 1, "同一光栅×方向必须共享运动片段");
    }
    assert(new Set(group.map((unit) => `${unit.bellAngleOffsetDeg}:${unit.bellSide}`)).size === group.length,
      "应覆盖全部角度和侧别");
  }
  const sample = amplitudeUnits[0]!;
  const sampleApexSign = sample.bellSide === "left" ? -1 : 1;
  const fadeStart = sample.blankStartSec - PROTOCOL_2_FADE_SEC;
  const opaqueApexDeg = maxSignedThetaDeg(sample, 0, fadeStart, sampleApexSign);
  assert(opaqueApexDeg < amplitude - 5, "完全可见阶段不得接近对侧端点");
  const hiddenApexDeg = maxSignedThetaDeg(
    sample, sample.blankStartSec, sample.queryTimeSec, sampleApexSign,
  );
  assert(hiddenApexDeg > amplitude - 1, "空白必须盖住端点");
  const lowestBellDeg = amplitude + Math.min(...EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG);
  const atLowestBell = maxSignedThetaDeg(
    sample,
    sample.blankStartSec + EXPERIMENT_5_V2_BLANK_BEFORE_LOWEST_BELL_SEC,
    sample.blankStartSec + EXPERIMENT_5_V2_BLANK_BEFORE_LOWEST_BELL_SEC,
    sampleApexSign,
  );
  assert(Math.abs(atLowestBell - lowestBellDeg) < 0.05, "0.1 秒空白结束时应到达最低铃铛");
  assert(sample.blankDurationSec > EXPERIMENT_5_V2_BLANK_BEFORE_LOWEST_BELL_SEC + 0.05,
    "空白应在最低铃铛之后延续到最高点");
  assert(
    Math.abs(sample.queryTimeSec - (sample.blankStartSec + sample.blankDurationSec)) < 1e-9,
    "提问时刻应是空白结束，也就是该侧最高点",
  );
  const apexSign = sample.bellSide === "left" ? -1 : 1;
  assert(Math.abs(sample.queryThetaDeg - apexSign * amplitude) < 0.05, "查询角度应为对侧最高点");
  assert(Math.abs(sample.queryOmegaRadPerSec) < 0.02, "对侧最高点角速度应接近 0");
  for (const grating of ["G1", "G2", "G3"] as const) {
    for (const side of ["left", "right"] as const) {
      const unit = amplitudeUnits.find((item) =>
        item.gratingCondition === grating && item.bellSide === side);
      assert(unit, "缺少振幅×光栅×方向");
      const expected = experiment5V2DepartureState(
        amplitude, side, PROTOCOL_2_GRATING_CONDITIONS[grating],
      );
      assert(Math.abs(unit.theta0Deg - (expected.thetaRad * 180) / Math.PI) < 1e-9,
        "起点角度应为最外条外沿或该侧最高点");
      assert(Math.abs(unit.omega0DegPerSec - (expected.omegaRadPerSec * 180) / Math.PI) < 1e-6,
        "起点角速度应朝向铃铛");
      const params = {
        theta0Rad: (unit.theta0Deg * Math.PI) / 180,
        omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
        rodLengthM: unit.rodLengthM,
        gravity: unit.gravity,
      };
      const openSec = experiment5V2ResponseOpenSec(
        amplitude, params, analyzePendulum(params),
        PROTOCOL_2_GRATING_CONDITIONS[grating], side, unit.queryTimeSec,
      );
      assert(openSec < unit.blankStartSec - PROTOCOL_2_FADE_SEC, "作答应在淡出开始前打开");
    }
  }
  for (const offset of EXPERIMENT_5_V2_BELL_ANGLE_OFFSETS_DEG) {
    const offsetUnits = amplitudeUnits.filter((unit) => unit.bellAngleOffsetDeg === offset);
    assert(offsetUnits.length === 6, "每个角度偏移应在左右两个方向的每档光栅出现一次");
    assert(new Set(offsetUnits.map((unit) => unit.bellSide)).size === 2, "同一角度应在左右两侧都出现");
    assert(offsetUnits.every((unit) =>
      Math.abs(Math.abs(unit.bellThetaDeg) - (amplitude + offset)) < 1e-9 &&
      (unit.correctResponse === "reachable") === (offset < 0) &&
      unit.correctResponse === "reachable" === experiment5V2EndpointReachesBell(
        unit.amplitudeDeg,
        (unit.bellThetaDeg * Math.PI) / 180,
      ),
    ), "铃铛应锁在振幅加减步长的圆弧上，且可达性与偏移符号一致");
  }
}
const toleranceRad = EXPERIMENT_5_V2_BOB_RADIUS_M / EXPERIMENT_5_V2_ROD_LENGTH_M;
const maxAmplitude = Math.max(...EXPERIMENT_5_V2_AMPLITUDES_DEG);
const stepRad = (EXPERIMENT_5_V2_BELL_ANGLE_STEP_DEG * Math.PI) / 180;
assert(stepRad > toleranceRad, "3°步长应大于摆球角半径");
assert(!experiment5V2EndpointReachesBell(
  maxAmplitude,
  (maxAmplitude * Math.PI) / 180 + stepRad,
), "高出端点 3° 的铃铛应不可达");
assert(experiment5V2EndpointReachesBell(
  maxAmplitude,
  (maxAmplitude * Math.PI) / 180 - stepRad,
), "低于端点 3° 的铃铛应可达");
assert(formal.some((unit) => unit.bellAngleOffsetDeg > 0 && unit.correctResponse === "unreachable"),
  "高出端点的铃铛应为不可达");
assert(formal.some((unit) => unit.bellAngleOffsetDeg < 0 && unit.correctResponse === "reachable"),
  "低于端点的铃铛应为可达");
assert(formal.every((unit) => unit.bellSide === (unit.stateSiteId.endsWith("-left") ? "left" : "right")),
  "铃铛应放在消失时摆球朝向的一侧");
assert(formal.every((unit) => unit.yesKey === EXPERIMENT_5_V2_YES_KEY && unit.noKey === EXPERIMENT_5_V2_NO_KEY),
  "正式试次按键应固定为 F 会到达、J 不会到达");
assert(formal.every((unit) => !unit.plannedVisibleTurn),
  "计划可见窗口不得包含转向");

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
assert(practice.length === EXPERIMENT_5_V2_PRACTICE_TRIALS, "练习应为12条");
assert(EXPERIMENT_5_V2_PRACTICE_AMPLITUDE_DEG === 60, "练习应为55°与65°的中点");
assert(practice.every((unit) => unit.amplitudeDeg === EXPERIMENT_5_V2_PRACTICE_AMPLITUDE_DEG),
  "练习振幅应为60°");
assert([...formal, ...practice].every((unit) => unit.visibleSegments.length > 0),
  "任何光栅都不得把整段摆球挡住");
assert(practice.filter((unit) => unit.bellSide === "left").length === practice.length / 2,
  "练习向左试次数应占一半");
assert(practice.filter((unit) => unit.bellSide === "right").length === practice.length / 2,
  "练习向右试次数应占一半");
for (const grating of ["G1", "G2", "G3"] as const) {
  const group = practice.filter((unit) => unit.gratingCondition === grating);
  assert(group.length === 4, "练习每档光栅应为四条");
  for (const side of ["left", "right"] as const) {
    const sideGroup = group.filter((unit) => unit.bellSide === side);
    assert(sideGroup.length === 2, "练习每档光栅的每个方向应为两条");
    assert(new Set(sideGroup.map((unit) => unit.correctResponse)).size === 2,
      "练习每档光栅的每个方向应同时有可达和不可达");
  }
}
assert(practice.every((unit) =>
  (unit.correctResponse === "reachable") === (unit.bellAngleOffsetDeg < 0),
), "练习评分必须使用端点是否够到铃铛");
assert(practice.every((unit) => unit.bellSide === (unit.stateSiteId.endsWith("-left") ? "left" : "right")),
  "练习铃铛应放在消失时摆球朝向的一侧");
assert(practice.every((unit) => unit.yesKey === EXPERIMENT_5_V2_YES_KEY && unit.noKey === EXPERIMENT_5_V2_NO_KEY),
  "练习按键应固定为 F 会到达、J 不会到达");
const even = generateExperiment5V2RuntimeStimulusSet(
  { subject_id: "E5-0002", gender_code: 1, age_years: 21 },
  { rng: seeded(8) },
);
const evenUnits = even.sequence
  .filter((item) => item.kind === "practice" || item.kind === "block")
  .flatMap((item) => item.children)
  .map(bellUnit);
assert(evenUnits.every((unit) => unit.yesKey === "f" && unit.noKey === "j"),
  "偶数被试按键也固定为 F 会到达、J 不会到达");
function blockSignature(stimulus: typeof set): string {
  return stimulus.sequence
    .filter((item) => item.kind === "block")
    .map((item) => item.children.map((trial) => bellUnit(trial).amplitudeDeg).join("-"))
    .join("|");
}
const orders = new Set<string>();
for (let seed = 1; seed <= 8; seed += 1) {
  const generated = generateExperiment5V2RuntimeStimulusSet(participant, { rng: seeded(seed) });
  for (const block of generated.sequence.filter((item) => item.kind === "block")) {
    const amplitudes = new Set(block.children.map((trial) => bellUnit(trial).amplitudeDeg));
    assert(amplitudes.size === EXPERIMENT_5_V2_AMPLITUDES_DEG.length, "每个区组都应混合全部振幅");
  }
  orders.add(blockSignature(generated));
}
assert(orders.size > 1, "区组内振幅顺序应随机");
assert(parseExperiment5V2StimulusSet(JSON.parse(JSON.stringify(set))) !== null,
  "实验五V2刺激集应可序列化解析");
assert(parseExperiment5V2StimulusSet({ ...set, schemaVersion: 7 }) === null,
  "实验五V2应拒绝旧schema");

console.log("verify-experiment-5-v2: OK");
