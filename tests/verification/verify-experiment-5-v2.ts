import {
  generateExperiment5V2RuntimeStimulusSet,
  selectExperiment5V2QuerySite,
} from "../../src/experiments/experiment-5-v2/generateRuntimeSet.ts";
import {
  EXPERIMENT_5_V2_AMPLITUDES_DEG,
  EXPERIMENT_5_V2_DELTA_H_M,
  EXPERIMENT_5_V2_FORMAL_TRIALS,
} from "../../src/experiments/experiment-5-v2/protocol.ts";
import type { BellReachabilityV2StimulusUnit } from "../../src/shared/experimentTypes.ts";
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
const formal = blocks.flatMap((block) => block.children.map((trial) =>
  trial.units[0] as BellReachabilityV2StimulusUnit));
assert(formal.length === EXPERIMENT_5_V2_FORMAL_TRIALS, "正式试次应为108条");
assert(new Set(formal.map((unit) => unit.amplitudeDeg)).size === 3, "应覆盖3个振幅");
for (const amplitude of EXPERIMENT_5_V2_AMPLITUDES_DEG) {
  const amplitudeUnits = formal.filter((unit) => unit.amplitudeDeg === amplitude);
  assert(amplitudeUnits.length === 36, `${amplitude}°应有36条`);
  assert(new Set(amplitudeUnits.map((unit) => unit.stateSiteId)).size === 1,
    "查询状态应跨光栅共享");
  for (const grating of ["G1", "G2", "G3"] as const) {
    const group = amplitudeUnits.filter((unit) => unit.gratingCondition === grating);
    assert(group.length === 12, "每个振幅×光栅应有12条");
    const fingerprint = (unit: BellReachabilityV2StimulusUnit) => JSON.stringify([
      unit.theta0Deg, unit.omega0DegPerSec, unit.queryThetaDeg,
      unit.queryOmegaRadPerSec, unit.queryTimeSec, unit.visibleSegments,
    ]);
    assert(new Set(group.map(fingerprint)).size === 1, "12个铃铛条件必须共享运动片段");
    assert(new Set(group.map((unit) => `${unit.deltaHM}:${unit.bellSide}`)).size === 12,
      "应覆盖6高度×2侧别");
  }
  for (const delta of EXPERIMENT_5_V2_DELTA_H_M) {
    const deltaUnits = amplitudeUnits.filter((unit) => unit.deltaHM === delta);
    assert(deltaUnits.length === 6, "每个高度偏移应在区组内出现6次");
  }
}
for (const unit of formal) {
  assert((unit.deltaHM <= 0) === (unit.correctResponse === "reachable"),
    "评分必须使用deltaH<=0");
  const expectedHeight = 4 * (1 - Math.cos(unit.amplitudeDeg * Math.PI / 180)) + unit.deltaHM;
  assert(Math.abs(unit.bellContactHeightM - expectedHeight) < 1e-12,
    "铃铛接触高度错误");
  assert(unit.visibleSegments.length === 3 && Math.abs(unit.blankDurationSec - 0.3) < 1e-12,
    "三片段或空白时长错误");
}
const practice = set.sequence.filter((item) => item.kind === "practice")
  .flatMap((item) => item.children).map((trial) => trial.units[0] as BellReachabilityV2StimulusUnit);
assert(practice.length === 6, "练习应为6条");
assert(new Set(practice.map((unit) => unit.deltaHM)).size === 6, "练习应覆盖六档高度偏移");
assert(practice.filter((unit) => unit.bellSide === "left").length === 3, "练习左右应3/3");
assert(selectExperiment5V2QuerySite(60, 1, participant).id !==
  selectExperiment5V2QuerySite(60, 1, { ...participant, subject_id: "E5-0002" }).id,
  "相邻被试应轮换查询状态");
assert(parseExperiment5V2StimulusSet(JSON.parse(JSON.stringify(set))) !== null,
  "实验五V2刺激集应可序列化解析");
assert(parseExperiment5V2StimulusSet({ ...set, schemaVersion: 2 }) === null,
  "实验五V2应拒绝错误schema");

console.log("verify-experiment-5-v2: OK");
