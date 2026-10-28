import {
  assertTraining1RuntimeStimulusSet,
  generateTraining1RuntimeStimulusSet,
} from "../../src/experiments/training-1/generateRuntimeSet.ts";
import {
  TRAINING_1_ANCHOR_POSITIONS,
  TRAINING_1_BLOCK_SIZE,
  TRAINING_1_DEMO_TRIALS,
  TRAINING_1_MAX_BLOCKS,
  TRAINING_1_MAX_REPORT_TRIALS,
  TRAINING_1_MIN_VISIBLE_BEFORE_QUERY_SEC,
  TRAINING_1_OMEGA_SCALE_RAD_PER_SEC,
} from "../../src/experiments/training-1/protocol.ts";
import { collectTraining1TrialDescriptors } from "../../src/experiments/training-1/trialDescriptor.ts";
import { SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC } from "../../src/experiment/physics/speedStripScale.ts";
import {
  buildTraining1Csv,
  classifyTraining1Status,
} from "../../src/experiments/training-1/exportStimulusCsv.ts";
import { evaluateTraining1Mastery } from "../../src/experiments/training-1/mastery.ts";
import { parseTraining1StimulusSet } from "../../src/shared/storage.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const participant = { subject_id: "T1-0001", gender_code: 0 as const, age_years: 22 };
let rngState = 0x12345678;
const rng = () => {
  rngState = (1664525 * rngState + 1013904223) >>> 0;
  return rngState / 0x1_0000_0000;
};
const set = generateTraining1RuntimeStimulusSet(participant, { rng });
assertTraining1RuntimeStimulusSet(set);
assert(set.schemaVersion === 2, "训练一刺激 schema 应为 2");
assert(parseTraining1StimulusSet(set) !== null, "新版训练一刺激集应可载入");
assert(
  parseTraining1StimulusSet({ ...set, schemaVersion: 1 }) === null,
  "旧 schema 1 刺激集不得恢复",
);
assert(
  Math.abs(SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC - TRAINING_1_OMEGA_SCALE_RAD_PER_SEC) < 1e-12,
  "训练一必须与实验四色带共用尺度",
);

const descriptors = collectTraining1TrialDescriptors(set);
assert(
  descriptors.length === TRAINING_1_DEMO_TRIALS + TRAINING_1_MAX_REPORT_TRIALS,
  "描述符应覆盖五个锚点和全部候选作答试次",
);
const anchors = descriptors.filter((item) => item.mode === "demonstration");
TRAINING_1_ANCHOR_POSITIONS.forEach((position, index) => {
  assert(Math.abs(anchors[index]!.target_strip_position - position) < 1e-9, `锚点 ${position} 错误`);
});
const reports = descriptors.filter((item) => item.mode === "report");
for (let block = 1; block <= TRAINING_1_MAX_BLOCKS; block += 1) {
  const rows = reports.filter((item) => item.mastery_block_index === block);
  assert(rows.length === TRAINING_1_BLOCK_SIZE, `Block ${block} 应有 8 条`);
  assert(new Set(rows.map((item) => item.target_bin_index)).size === 8, `Block ${block} 应覆盖八个区间`);
  assert(rows.filter((item) => item.start_side === "left").length === 4, `Block ${block} 左右镜像应平衡`);
}
for (const item of descriptors) {
  assert(
    Math.abs(item.truth_strip_position - item.target_strip_position) < 1e-6,
    `试次 ${item.trial_id} 的真实速度与目标不一致`,
  );
  assert(
    Math.abs(item.query_time_sec - TRAINING_1_MIN_VISIBLE_BEFORE_QUERY_SEC) < 1e-12,
    `试次 ${item.trial_id} 必须显示恰好 0.8 秒`,
  );
  if (item.target_strip_position > 1e-4) {
    assert(item.truth_strip_position > 0, `非零目标 ${item.trial_id} 不得显示为静止`);
  }
}

const row = (error: number) => ({
  trial_type: "speed-color-training",
  mode: "report",
  abs_delta_strip_position: error,
});
const exactBoundary = Array.from({ length: 16 }, () => row(0.1));
assert(evaluateTraining1Mastery(exactBoundary).passed, "均值 0.10 和单次 0.15 边界应包含在达标内");
assert(classifyTraining1Status(exactBoundary, true) === "f", "达标且自然结束应标记 f");
assert(classifyTraining1Status(exactBoundary, false) === "nf", "中断仍应标记 nf");
assert(
  !evaluateTraining1Mastery(Array.from({ length: 15 }, () => row(0))).passed,
  "少于 16 次不得达标",
);
const onlyFiveWithin = [0, 0, 0, 0, 0, 0.16, 0.16, 0.16];
assert(
  !evaluateTraining1Mastery([
    ...Array.from({ length: 8 }, () => row(0)),
    ...onlyFiveWithin.map(row),
  ]).passed,
  "最近八次少于六次误差不超过 0.15 时不得达标",
);
assert(
  classifyTraining1Status(Array.from({ length: 40 }, () => row(0.2)), true) === "nf",
  "40 次后未达标仍应标记 nf",
);

const csv = buildTraining1Csv(exactBoundary, participant, "f");
assert(csv.includes("data_schema_version"), "CSV 应记录数据 schema");
assert(csv.includes("mastery_recent_mean_abs_error"), "CSV 应记录最终达标指标");
assert(csv.includes(",2,"), "CSV 数据 schema 应为 2");

console.log("verify-training-1: OK（刺激/数据 schema 2，协议 1.0.0）");
