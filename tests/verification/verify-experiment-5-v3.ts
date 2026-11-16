import { analyzePendulum, pendulumThetaOmegaAt } from "../../src/experiment/physics/pendulum.ts";
import { PROTOCOL_2_FADE_SEC } from "../../src/experiments/protocol-2/common.ts";
import { generateExperiment5V3RuntimeStimulusSet } from "../../src/experiments/experiment-5-v3/generateRuntimeSet.ts";
import {
  EXPERIMENT_5_V3_AMPLITUDES_DEG,
  EXPERIMENT_5_V3_APPROACH_SIDES,
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
  EXPERIMENT_5_V3_ROD_LENGTH_M,
  EXPERIMENT_5_V3_SLIT_WIDTH_M,
  EXPERIMENT_5_V3_YES_KEY,
  EXPERIMENT_5_V3_NO_KEY,
} from "../../src/experiments/experiment-5-v3/protocol.ts";
import { experiment5V3SlitEdgeLimitM } from "../../src/experiments/experiment-5-v3/slitGrid.ts";
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
const serialized = JSON.stringify(set);
assert(!serialized.includes("gratingCondition"), "协议3.0不使用周期光栅条件");
assert(!serialized.includes("\"G1\"") && !serialized.includes("\"G2\"") && !serialized.includes("\"G3\""),
  "协议3.0不得包含G1/G2/G3");
function assertSlitGrid(
  units: BellReachabilityV3StimulusUnit[],
  amplitude: number,
  side: "left" | "right",
): void {
  const limit = experiment5V3SlitEdgeLimitM(amplitude);
  const half = EXPERIMENT_5_V3_SLIT_WIDTH_M / 2;
  const sign = side === "left" ? 1 : -1;
  const centers = units.map((unit) => sign * unit.slitCenterM).sort((left, right) => left - right);
  centers.forEach((center, index) => {
    const expected = ((index + 0.5) / centers.length) * limit;
    assert(Math.abs(center - expected) < 1e-8, "缝中心应落在出发侧区间的等份中点");
  });
  for (const unit of units) {
    assert(Math.abs(unit.slitWidthM - EXPERIMENT_5_V3_SLIT_WIDTH_M) < 1e-12, "缝宽应为0.45 m");
    assert(Math.abs(unit.slitRightM - unit.slitLeftM - unit.slitWidthM) < 1e-9, "缝宽应等于左右边之差");
    const innerEdge = side === "left" ? unit.slitLeftM : -unit.slitRightM;
    const outerEdge = side === "left" ? unit.slitRightM : -unit.slitLeftM;
    assert(innerEdge > 1e-4 && outerEdge < limit - 1e-4, "整条缝应落在区间内部，不取两端");
    assert(Math.sign(unit.slitCenterM) === sign, "缝中心应在出发侧");
  }
  assert(Math.abs(centers[0]! - half) > 1e-4, "最内侧缝的中心不应贴在半缝宽上");
}
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
  for (const side of EXPERIMENT_5_V3_APPROACH_SIDES) {
    assertSlitGrid(units.filter((unit) => unit.bellSide === side), amplitude, side);
  }
}
const practice = set.sequence.filter((item) => item.kind === "practice")
  .flatMap((item) => item.children).map(bellUnit);
assert(practice.length === EXPERIMENT_5_V3_PRACTICE_TRIALS, "练习应为4条");
assert(practice.every((unit) => unit.amplitudeDeg === EXPERIMENT_5_V3_PRACTICE_AMPLITUDE_DEG),
  "练习振幅应为60°");
assert(practice.filter((unit) => unit.correctResponse === "reachable").length === 2, "练习应有两条可达");
assert(practice.filter((unit) => unit.bellSide === "left").length === 2, "练习左右应各半");
for (const side of EXPERIMENT_5_V3_APPROACH_SIDES) {
  assertSlitGrid(
    practice.filter((unit) => unit.bellSide === side),
    EXPERIMENT_5_V3_PRACTICE_AMPLITUDE_DEG,
    side,
  );
}
const fixation = set.sequence.flatMap((item) => item.kind === "practice" ? item.children : [])
  .flatMap((trial) => trial.units)
  .find((unit) => unit.type === "textDisplay" && unit.text === EXPERIMENT_5_V3_FIXATION_TEXT);
assert(fixation?.type === "textDisplay" && fixation.durationMs === EXPERIMENT_5_V3_FIXATION_MS,
  "应有注视点");
assert(parseExperiment5V3StimulusSet(JSON.parse(JSON.stringify(set))) !== null, "刺激集应可解析");
assert(parseExperiment5V3StimulusSet({ ...set, schemaVersion: 4 }) === null, "实验五V3应拒绝旧schema");
const orders = new Set<string>();
const pairings = new Set<string>();
for (let seed = 1; seed <= 8; seed += 1) {
  const generated = generateExperiment5V3RuntimeStimulusSet(participant, { rng: seeded(seed) });
  const generatedFormal = generated.sequence.filter((item) => item.kind === "block")
    .flatMap((block) => block.children).map(bellUnit);
  orders.add(generated.sequence.filter((item) => item.kind === "block")
    .map((block) => block.children.map((trial) => bellUnit(trial).amplitudeDeg).join("-"))
    .join("|"));
  pairings.add(generatedFormal
    .map((unit) => `${unit.amplitudeDeg}:${unit.bellSide}:${unit.bellAngleOffsetDeg}:${unit.slitCenterM.toFixed(6)}`)
    .sort()
    .join("|"));
}
assert(orders.size > 1, "区组内振幅顺序应随机");
assert(pairings.size > 1, "缝位置与铃铛偏移的配对应随种子变化");
console.log("verify-experiment-5-v3: OK");
