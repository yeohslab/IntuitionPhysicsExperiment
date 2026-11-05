import {
  generateExperiment4V2RuntimeStimulusSet,
} from "../../src/experiments/experiment-4-v2/generateRuntimeSet.ts";
import {
  EXPERIMENT_4_V2_FORMAL_TRIALS,
  EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC,
} from "../../src/experiments/experiment-4-v2/protocol.ts";
import {
  PROTOCOL_2_GRATING_ORDER,
  protocol2StateSites,
} from "../../src/experiments/protocol-2/common.ts";
import type { TrackingPendulumV2StimulusUnit } from "../../src/shared/experimentTypes.ts";
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
const formal = blocks.flatMap((block) => block.children.map((trial) =>
  trial.units[0] as TrackingPendulumV2StimulusUnit));
assert(formal.length === EXPERIMENT_4_V2_FORMAL_TRIALS, "正式试次应为78条");
assert(new Set(formal.map((unit) => unit.gratingCondition)).size === 3, "应覆盖G1/G2/G3");
for (const grating of PROTOCOL_2_GRATING_ORDER) {
  const units = formal.filter((unit) => unit.gratingCondition === grating);
  assert(units.length === 26, `${grating}应有26条`);
  assert(units.filter((unit) => unit.trackingCondition === "hidden_reversal").length === 2,
    `${grating}应有2条隐藏反向`);
  assert(units.filter((unit) => unit.trackingCondition === "no_hidden_reversal").length === 24,
    `${grating}应有24条无反向槽位`);
}
for (const unit of formal) {
  assert(unit.visibleSegments.length === 3, "每条正式试次应有3个可见片段");
  assert(unit.visibleSegments.every((segment) => segment.tEndSec - segment.tStartSec >= 2 / 60 - 1e-9),
    "可见片段不得短于两个60Hz帧");
  assert(Math.abs(unit.blankDurationSec - 0.3) < 1e-12, "空白应为0.30秒");
  assert(unit.cueDurationMs === 2000, "提示应为2秒");
  assert((unit.trackingCondition === "hidden_reversal") === (unit.reversalTimeSec !== null),
    "反向标签必须与物理验证一致");
}
assert(
  Math.abs(EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC - Math.sqrt(39.2)) < 1e-12,
  "速度色带右端应为sqrt(gl)",
);
const practice = set.sequence.filter((item) => item.kind === "practice")
  .flatMap((item) => item.children).map((trial) => trial.units[0] as TrackingPendulumV2StimulusUnit);
assert(practice.length === 3 && new Set(practice.map((unit) => unit.gratingCondition)).size === 3,
  "练习应为每档光栅各1条");
assert(parseExperiment4V2StimulusSet(JSON.parse(JSON.stringify(set))) !== null,
  "实验四V2刺激集应可序列化解析");
assert(parseExperiment4V2StimulusSet({ ...set, schemaVersion: 2 }) === null,
  "实验四V2应拒绝错误schema");

console.log("verify-experiment-4-v2: OK");
