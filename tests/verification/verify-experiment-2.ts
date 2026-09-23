import {
  EXPERIMENT_2_FORMAL_BLOCKS,
  EXPERIMENT_2_FORMAL_TRIALS,
  EXPERIMENT_2_ROTATION_SEGMENTS,
  EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
  EXPERIMENT_2_TOTAL_RUNTIME_TRIALS,
  generateExperiment2RuntimeStimulusSet,
} from "../../src/experiments/experiment-2/generateRuntimeSet.ts";
import { collectExperiment2TrialDescriptors } from "../../src/experiments/experiment-2/trialDescriptor.ts";
import {
  buildExperiment2StimulusSetExportPayload,
  experiment2StimulusSetExportFilename,
} from "../../src/experiments/experiment-2/exportStimulusSetJson.ts";
import {
  buildExperiment2StimulusTrialsCsv,
  classifyExperiment2Status,
  experiment2DataFilename,
} from "../../src/experiments/experiment-2/exportStimulusCsv.ts";
import {
  absoluteSpeedColorLevel,
  speedColorForLevel,
} from "../../src/runtime/components/speedColorStrips.ts";
import {
  buildExperiment2SubjectId,
  isExperiment2ParticipantInfo,
  type Experiment2ParticipantInfo,
} from "../../src/shared/participant.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const participant: Experiment2ParticipantInfo = {
  subject_id: buildExperiment2SubjectId("0001"),
  gender_code: 0,
  age_years: 22,
};
assert(isExperiment2ParticipantInfo(participant), "实验二被试编号应有效");
assert(!isExperiment2ParticipantInfo({ ...participant, subject_id: "20001" }), "实验一编号不能冒充实验二编号");

assert(absoluteSpeedColorLevel(0, EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC) === 0, "零速应映射到0");
assert(
  Math.abs(
    absoluteSpeedColorLevel(
      EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC / 2,
      EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
    ) - 0.5,
  ) < 1e-12,
  "半速应映射到0.5",
);
assert(absoluteSpeedColorLevel(Infinity, EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC) === 0, "非法速度应回落为0");
assert(absoluteSpeedColorLevel(999, EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC) === 1, "超上限速度应钳制");
assert(speedColorForLevel(0) === "hsl(120.000 80% 45%)", "低速应为绿色");
assert(speedColorForLevel(0.5) === "hsl(60.000 80% 45%)", "半速应为黄色");
assert(speedColorForLevel(1) === "hsl(0.000 80% 45%)", "高速应为红色");

let lastProgress = 0;
let reportedTotal = 0;
const set = generateExperiment2RuntimeStimulusSet({
  subjectId: participant.subject_id,
  rng: mulberry32(92_001),
  onProgress: (completed, total) => {
    lastProgress = completed;
    reportedTotal = total;
  },
});
assert(lastProgress === EXPERIMENT_2_TOTAL_RUNTIME_TRIALS, "实验二生成进度终点应为189");
assert(reportedTotal === EXPERIMENT_2_TOTAL_RUNTIME_TRIALS, "实验二生成进度总数应为189");

const formalBlocks = set.sequence.filter((item) => item.kind === "block");
const practices = set.sequence.filter((item) => item.kind === "practice");
assert(formalBlocks.length === EXPERIMENT_2_FORMAL_BLOCKS, "实验二应有20个正式Block");
assert(practices.length === 1 && practices[0]!.children.length === 9, "实验二应有一个9 Trial练习Block");
assert(formalBlocks.every((block) => block.children.length === 9), "每个正式Block应有9个Trial");

const descriptors = collectExperiment2TrialDescriptors(set);
const practice = descriptors.filter((trial) => trial.segment_kind === "practice");
const formal = descriptors.filter((trial) => trial.segment_kind === "block");
assert(descriptors.length === 189, "实验二刺激JSON应有189条描述符");
assert(practice.length === 9 && formal.length === EXPERIMENT_2_FORMAL_TRIALS, "练习/正式数量应为9/180");
assert(formal.filter((trial) => trial.motion_condition === "oscillation").length === 135, "摆动正式Trial应为135");
assert(formal.filter((trial) => trial.motion_condition === "rotation").length === 45, "旋转正式Trial应为45");
const practiceCounts = [
  practice.filter((trial) => trial.motion_condition === "oscillation").length,
  practice.filter((trial) => trial.motion_condition === "rotation").length,
].sort();
assert(practiceCounts[0] === 4 && practiceCounts[1] === 5, "混合练习应按4/5分配");
assert(
  descriptors.every(
    (trial) =>
      trial.experiment_id === "experiment-2" &&
      trial.protocol_version === "1.0.0" &&
      trial.speed_cue_type === "color-strips" &&
      trial.speed_color_v_min_m_per_sec === 0 &&
      trial.speed_color_v_max_m_per_sec === EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
  ),
  "实验二描述符应记录统一颜色速度提示",
);

const rotationEnergies = new Set(
  formal
    .filter((trial) => trial.motion_condition === "rotation")
    .map((trial) => trial.pendulum_E_J.toFixed(8)),
);
assert(rotationEnergies.size === 5, "正式旋转应恰有5个能量水平");
for (const segment of EXPERIMENT_2_ROTATION_SEGMENTS) {
  assert(rotationEnergies.has(segment.Emid.toFixed(8)), `缺少旋转能量 ${segment.Emid}`);
}
const rotationBlockIndices = new Set(
  formal
    .filter((trial) => trial.motion_condition === "rotation")
    .map((trial) => trial.block_index),
);
assert(
  [...rotationBlockIndices].some((index) => index <= 15),
  "固定测试种子下旋转Block应与摆动Block混排，而不是固定放在末尾",
);

const completeRows = formal.map((trial) => ({ ...trial, trial_type: "physics-stimulus" }));
assert(classifyExperiment2Status(completeRows, true) === "f", "180个唯一正式响应应标记完成");
assert(classifyExperiment2Status(completeRows, false) === "nf", "非自然结束应标记中断");
assert(classifyExperiment2Status(completeRows.slice(1), true) === "nf", "缺失响应应标记中断");
assert(
  classifyExperiment2Status([...completeRows.slice(0, 179), completeRows[0]!], true) === "nf",
  "重复响应不能标记完成",
);

const csv = buildExperiment2StimulusTrialsCsv(completeRows, participant, "f");
assert(csv.split(/\r?\n/).filter(Boolean).length === 181, "实验二CSV应为表头加180行");
assert(csv.includes("experiment_id,protocol_version,data_schema_version"), "实验二CSV应含版本字段");
assert(csv.includes("experiment-2,1.0.0,1,E2-0001"), "实验二CSV元数据不正确");
assert(experiment2DataFilename(participant.subject_id, "f") === "experiment-2_data_subjectE2-0001_f.csv", "实验二CSV文件名不正确");

const json = buildExperiment2StimulusSetExportPayload(set, participant);
assert(json.schema_version === 1 && json.trials.length === 189, "实验二JSON schema或试次数不正确");
assert(experiment2StimulusSetExportFilename(participant) === "experiment-2_stimulus_set_subjectE2-0001.json", "实验二JSON文件名不正确");

console.log("verify-experiment-2: OK（1混合练习Block + 20×9正式Trial，颜色提示与独立导出协议通过）");
