import { analyzePendulum, pendulumThetaOmegaAt } from "../../src/experiment/physics/pendulum.ts";
import { PROTOCOL_2_FADE_SEC } from "../../src/experiments/protocol-2/common.ts";
import { generateExperiment5V3RuntimeStimulusSet } from "../../src/experiments/experiment-5-v3/generateRuntimeSet.ts";
import {
  EXPERIMENT_5_V3_AMPLITUDES_DEG,
  EXPERIMENT_5_V3_BELL_ANGLE_OFFSETS_DEG,
  EXPERIMENT_5_V3_BLANK_BEFORE_LOWEST_BELL_SEC,
  EXPERIMENT_5_V3_CUE_MS,
  EXPERIMENT_5_V3_FIXATION_MS,
  EXPERIMENT_5_V3_FIXATION_TEXT,
  EXPERIMENT_5_V3_FORMAL_TRIALS,
  EXPERIMENT_5_V3_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_5_V3_LOWEST_BELL_OFFSET_DEG,
  EXPERIMENT_5_V3_PRACTICE_AMPLITUDE_DEG,
  EXPERIMENT_5_V3_PRACTICE_TRIALS,
  EXPERIMENT_5_V3_YES_KEY,
  EXPERIMENT_5_V3_NO_KEY,
} from "../../src/experiments/experiment-5-v3/protocol.ts";
import {
  experiment5V3BlockText,
  experiment5V3StructureText,
  experiment5V3WelcomeText,
} from "../../src/experiments/experiment-5-v3/instructions.ts";
import type { BellReachabilityV3StimulusUnit, Trial } from "../../src/shared/experimentTypes.ts";
import { parseExperiment5V3StimulusSet } from "../../src/shared/storage.ts";

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
const set = generateExperiment5V3RuntimeStimulusSet(participant, { rng: seeded(5) });
const blocks = set.sequence.filter((item) => item.kind === "block");
assert(blocks.length === 3, "实验五V3应有3个休息区组");

function bellUnit(trial: Trial): BellReachabilityV3StimulusUnit {
  const unit = trial.units.find((item) => item.type === "bellReachabilityV3Stimulus");
  assert(unit?.type === "bellReachabilityV3Stimulus", "试次缺少铃铛刺激");
  return unit;
}

function thetaAt(unit: BellReachabilityV3StimulusUnit, time: number): number {
  const params = {
    theta0Rad: (unit.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: unit.rodLengthM,
    gravity: unit.gravity,
  };
  return pendulumThetaOmegaAt(time, params, analyzePendulum(params)).theta * 180 / Math.PI;
}

const formal = blocks.flatMap((block) => block.children).map(bellUnit);
for (const block of blocks) {
  const units = block.children.map(bellUnit);
  assert(new Set(units.map((unit) => unit.energyJ)).size === 3, "每个区组都应混合三种能量");
  for (const amplitude of EXPERIMENT_5_V3_AMPLITUDES_DEG) {
    assert(units.filter((unit) => unit.amplitudeDeg === amplitude).length === 4,
      "每个区组每种振幅应为4条");
  }
  assert(units.filter((unit) => unit.bellSide === "left").length === 6, "每个区组左右应各半");
}
assert(formal.length === EXPERIMENT_5_V3_FORMAL_TRIALS, "正式试次应为36条");
assert(formal.length === 36, "正式试次计数");
const participantInstructions = [
  experiment5V3WelcomeText(),
  experiment5V3StructureText(),
  experiment5V3BlockText(1, 3),
  ...set.sequence.flatMap((item) => item.kind === "rest" ? item.units : [])
    .map((unit) => unit.type === "textControl" ? unit.text : ""),
].join("\n");
assert(!participantInstructions.includes("°"), "指导语不应写出角度");
assert(!participantInstructions.includes("振幅"), "指导语不应说明振幅设计");
assert(
  !participantInstructions.includes("最高点") && !participantInstructions.includes("最低"),
  "指导语不应说明出发点和空白对应的摆球位置",
);
assert(!JSON.stringify(set).includes("gratingCondition"), "协议3.0不得包含光栅");
for (const amplitude of EXPERIMENT_5_V3_AMPLITUDES_DEG) {
  const units = formal.filter((unit) => unit.amplitudeDeg === amplitude);
  assert(units.length === EXPERIMENT_5_V3_FORMAL_TRIALS_PER_BLOCK, `${amplitude}°试次数错误`);
  const lowest = amplitude + EXPERIMENT_5_V3_LOWEST_BELL_OFFSET_DEG;
  for (const unit of units) {
    const startSign = unit.bellSide === "left" ? 1 : -1;
    const apexSign = -startSign;
    assert(Math.abs(unit.theta0Deg - startSign * lowest) < 1e-6, "起点应为对侧最低询问角");
    assert(Math.sign(unit.omega0DegPerSec) === apexSign, "初速度应朝向铃铛");
    assert(EXPERIMENT_5_V3_BLANK_BEFORE_LOWEST_BELL_SEC === 0.2, "到达最低询问角前的全空白应为0.2秒");
    assert(PROTOCOL_2_FADE_SEC === 0.3, "淡出仍应为0.3秒");
    const lowestBellTime = unit.blankStartSec + EXPERIMENT_5_V3_BLANK_BEFORE_LOWEST_BELL_SEC;
    const atLow = thetaAt(unit, lowestBellTime);
    assert(Math.abs(atLow - apexSign * lowest) < 0.05, "0.2秒空白结束时应到达铃铛侧最低询问角");
    const visibleEnd = unit.blankStartSec - PROTOCOL_2_FADE_SEC;
    assert(visibleEnd > 0.05, "可见阶段应在淡出之前");
    assert(Math.abs(lowestBellTime - visibleEnd - 0.5) < 1e-9, "可见阶段应比0.1秒空白时提前0.1秒结束");
    assert(Math.abs(unit.queryThetaDeg - apexSign * amplitude) < 0.05, "查询角度应为该侧最高点");
    assert(unit.blankDurationSec > EXPERIMENT_5_V3_BLANK_BEFORE_LOWEST_BELL_SEC, "空白应延续到最高点");
    assert(unit.queryTimeSec > unit.blankStartSec + PROTOCOL_2_FADE_SEC, "查询应晚于淡出结束");
    assert(unit.yesKey === EXPERIMENT_5_V3_YES_KEY && unit.noKey === EXPERIMENT_5_V3_NO_KEY, "按键固定");
    const cue = blocks.flatMap((block) => block.children)
      .find((trial) => bellUnit(trial) === unit)?.units[0];
    assert(cue?.type === "textDisplay" && cue.durationMs === EXPERIMENT_5_V3_CUE_MS, "应有方向提示");
  }
  for (const offset of EXPERIMENT_5_V3_BELL_ANGLE_OFFSETS_DEG) {
    const matched = units.filter((unit) => unit.bellAngleOffsetDeg === offset);
    assert(matched.length === 2, "每个角度偏移应左右各一条");
    assert(matched.every((unit) => (unit.correctResponse === "reachable") === (offset < 0)),
      "可达性应与偏移符号一致");
  }
}
const practice = set.sequence.filter((item) => item.kind === "practice")
  .flatMap((item) => item.children).map(bellUnit);
assert(practice.length === EXPERIMENT_5_V3_PRACTICE_TRIALS, "练习应为4条");
assert(practice.every((unit) => unit.amplitudeDeg === EXPERIMENT_5_V3_PRACTICE_AMPLITUDE_DEG),
  "练习振幅应为60°");
assert(practice.filter((unit) => unit.correctResponse === "reachable").length === 2, "练习应有两条可达");
assert(practice.filter((unit) => unit.bellSide === "left").length === 2, "练习左右应各半");
const fixation = set.sequence.flatMap((item) => item.kind === "practice" ? item.children : [])
  .flatMap((trial) => trial.units)
  .find((unit) => unit.type === "textDisplay" && unit.text === EXPERIMENT_5_V3_FIXATION_TEXT);
assert(fixation?.type === "textDisplay" && fixation.durationMs === EXPERIMENT_5_V3_FIXATION_MS,
  "应有注视点");
assert(parseExperiment5V3StimulusSet(JSON.parse(JSON.stringify(set))) !== null, "刺激集应可解析");
assert(parseExperiment5V3StimulusSet({ ...set, schemaVersion: 3 }) === null, "实验五V3应拒绝旧schema");
const orders = new Set<string>();
for (let seed = 1; seed <= 8; seed += 1) {
  const generated = generateExperiment5V3RuntimeStimulusSet(participant, { rng: seeded(seed) });
  orders.add(generated.sequence.filter((item) => item.kind === "block")
    .map((block) => block.children.map((trial) => bellUnit(trial).amplitudeDeg).join("-"))
    .join("|"));
}
assert(orders.size > 1, "区组内振幅顺序应随机");
console.log("verify-experiment-5-v3: OK");
