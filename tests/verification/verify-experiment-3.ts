import {
  EXPERIMENT_3_FORMAL_BLOCKS,
  EXPERIMENT_3_FORMAL_TRIALS,
  EXPERIMENT_3_ROTATION_SEGMENTS,
  EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC,
  EXPERIMENT_3_TOTAL_RUNTIME_TRIALS,
  generateExperiment3RuntimeStimulusSet,
} from "../../src/experiments/experiment-3/generateRuntimeSet.ts";
import { collectExperiment3TrialDescriptors } from "../../src/experiments/experiment-3/trialDescriptor.ts";
import {
  buildExperiment3StimulusSetExportPayload,
  experiment3StimulusSetExportFilename,
} from "../../src/experiments/experiment-3/exportStimulusSetJson.ts";
import {
  buildExperiment3StimulusTrialsCsv,
  classifyExperiment3Status,
  experiment3DataFilename,
} from "../../src/experiments/experiment-3/exportStimulusCsv.ts";
import { absoluteSpeedBarLevel } from "../../src/runtime/components/speedIndicatorBar.ts";
import {
  buildExperiment3SubjectId,
  isExperiment3ParticipantInfo,
  type Experiment3ParticipantInfo,
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

const participant: Experiment3ParticipantInfo = {
  subject_id: buildExperiment3SubjectId("0001"),
  gender_code: 1,
  age_years: 23,
};
assert(isExperiment3ParticipantInfo(participant), "实验三被试编号应有效");
assert(
  !isExperiment3ParticipantInfo({ ...participant, subject_id: "E2-0001" }),
  "实验二编号不能冒充实验三编号",
);

assert(absoluteSpeedBarLevel(0, EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC) === 0, "零速应为空条");
assert(
  absoluteSpeedBarLevel(
    EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC,
    EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC,
  ) === 1,
  "统一速度上限应映射为满条",
);

let lastProgress = 0;
let reportedTotal = 0;
const set = generateExperiment3RuntimeStimulusSet({
  subjectId: participant.subject_id,
  rng: mulberry32(93_001),
  onProgress: (completed, total) => {
    lastProgress = completed;
    reportedTotal = total;
  },
});
assert(lastProgress === EXPERIMENT_3_TOTAL_RUNTIME_TRIALS, "实验三生成进度终点应为189");
assert(reportedTotal === EXPERIMENT_3_TOTAL_RUNTIME_TRIALS, "实验三生成进度总数应为189");

const formalBlocks = set.sequence.filter((item) => item.kind === "block");
const practices = set.sequence.filter((item) => item.kind === "practice");
assert(formalBlocks.length === EXPERIMENT_3_FORMAL_BLOCKS, "实验三应有20个正式Block");
assert(practices.length === 1 && practices[0]!.children.length === 9, "实验三应有一个9 Trial练习Block");
assert(formalBlocks.every((block) => block.children.length === 9), "每个正式Block应有9个Trial");

const descriptors = collectExperiment3TrialDescriptors(set);
const practice = descriptors.filter((trial) => trial.segment_kind === "practice");
const formal = descriptors.filter((trial) => trial.segment_kind === "block");
assert(descriptors.length === 189, "实验三刺激JSON应有189条描述符");
assert(practice.length === 9 && formal.length === 180, "练习/正式数量应为9/180");
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
      trial.experiment_id === "experiment-3" &&
      trial.protocol_version === "1.0.0" &&
      trial.speed_cue_type === "level-bars" &&
      trial.speed_bar_v_min_m_per_sec === 0 &&
      trial.speed_bar_v_max_m_per_sec === EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC,
  ),
  "实验三描述符应记录统一左右高度条",
);

const rotationEnergies = new Set(
  formal
    .filter((trial) => trial.motion_condition === "rotation")
    .map((trial) => trial.pendulum_E_J.toFixed(8)),
);
assert(rotationEnergies.size === 5, "正式旋转应恰有5个能量水平");
for (const segment of EXPERIMENT_3_ROTATION_SEGMENTS) {
  assert(rotationEnergies.has(segment.Emid.toFixed(8)), `缺少旋转能量 ${segment.Emid}`);
}

const completeRows = formal.map((trial) => ({ ...trial, trial_type: "physics-stimulus" }));
assert(classifyExperiment3Status(completeRows, true) === "f", "180个唯一正式响应应标记完成");
assert(classifyExperiment3Status(completeRows, false) === "nf", "非自然结束应标记中断");
assert(classifyExperiment3Status(completeRows.slice(1), true) === "nf", "缺少响应应标记中断");

const csv = buildExperiment3StimulusTrialsCsv(completeRows, participant, "f");
assert(csv.includes("experiment_id,protocol_version,data_schema_version"), "实验三CSV应含版本字段");
assert(csv.includes("experiment-3,1.0.0,1,E3-0001"), "实验三CSV元数据不正确");
assert(csv.includes(",level-bars,0,14.515508947329405,"), "实验三CSV应记录统一高度条量程");
assert(experiment3DataFilename(participant.subject_id, "f") === "experiment-3_data_subjectE3-0001_f.csv", "实验三CSV文件名不正确");

const payload = buildExperiment3StimulusSetExportPayload(set, participant);
assert(payload.schema_version === 1 && payload.experiment_id === "experiment-3", "实验三刺激JSON版本不正确");
assert(payload.trials.length === 189, "实验三刺激JSON Trial数不正确");
assert(experiment3StimulusSetExportFilename(participant) === "experiment-3_stimulus_set_subjectE3-0001.json", "实验三JSON文件名不正确");

console.log("verify-experiment-3: OK（1混合练习Block + 20×9正式Trial，统一左右高度条与独立导出协议通过）");
