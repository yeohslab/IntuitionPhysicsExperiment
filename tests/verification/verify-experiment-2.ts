import {
  EXPERIMENT_2_FORMAL_BLOCKS,
  EXPERIMENT_2_FORMAL_TRIALS,
  EXPERIMENT_2_OSCILLATION_SEGMENTS,
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
  calculateSpeedColorStripGeometry,
  SPEED_COLOR_STRIP_GAP_PX,
  SPEED_COLOR_STRIP_HEIGHT_PX,
  speedColorForLevel,
} from "../../src/runtime/components/speedColorStrips.ts";
import { EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION } from "../../src/shared/experimentTypes.ts";
import { experiment2WelcomeText } from "../../src/experiments/experiment-2/instructions.ts";
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
assert(speedColorForLevel(0) === "hsl(240.000 90% 50%)", "低速应为蓝色");
assert(speedColorForLevel(0.5) === "hsl(300.000 90% 50%)", "半速应为紫红色");
assert(speedColorForLevel(1) === "hsl(360.000 90% 50%)", "高速应为红色");
assert(speedColorForLevel(Infinity) === speedColorForLevel(0), "非法level应回落到蓝色端点");
assert(SPEED_COLOR_STRIP_HEIGHT_PX === 28, "实验二色带厚度应为28 px");
assert(SPEED_COLOR_STRIP_GAP_PX === 4, "实验二色带与运动范围间距应为4 px");
for (const [canvasWidth, canvasHeight] of [
  [1000, 650],
  [360, 234],
] as const) {
  const rodPx = Math.min(canvasWidth, canvasHeight) * 0.36;
  const geometry = calculateSpeedColorStripGeometry({
    rodPx,
    anchorX: canvasWidth / 2,
    anchorY: rodPx + 32,
  });
  assert(geometry.topPx >= 0, `${canvasWidth}px画布顶部色带不得越界`);
  assert(
    geometry.bottomPx + geometry.heightPx <= canvasHeight,
    `${canvasWidth}px画布底部色带不得越界`,
  );
  assert(geometry.widthPx === 2 * rodPx, "色带长度应保持为摆球运动直径");
  assert(geometry.heightPx === 28, "桌面和窄窗口的色带厚度都应固定为28 px");
}
const welcomeText = experiment2WelcomeText();
assert(
  welcomeText.includes("蓝色") && welcomeText.includes("紫红色") && !welcomeText.includes("绿色"),
  "实验二指导语应描述蓝—紫红—红映射",
);

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
assert(
  set.schemaVersion === EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION &&
    set.schemaVersion === 3,
  "实验二运行时刺激schema应为v3",
);
assert(lastProgress === EXPERIMENT_2_TOTAL_RUNTIME_TRIALS, "实验二生成进度终点应为144");
assert(reportedTotal === EXPERIMENT_2_TOTAL_RUNTIME_TRIALS, "实验二生成进度总数应为144");

const formalBlocks = set.sequence.filter((item) => item.kind === "block");
const practices = set.sequence.filter((item) => item.kind === "practice");
assert(formalBlocks.length === EXPERIMENT_2_FORMAL_BLOCKS, "实验二应有15个正式Block");
assert(practices.length === 1 && practices[0]!.children.length === 9, "实验二应有一个9 Trial练习Block");
assert(formalBlocks.every((block) => block.children.length === 9), "每个正式Block应有9个Trial");

const descriptors = collectExperiment2TrialDescriptors(set);
const practice = descriptors.filter((trial) => trial.segment_kind === "practice");
const formal = descriptors.filter((trial) => trial.segment_kind === "block");
assert(descriptors.length === 144, "实验二刺激JSON应有144条描述符");
assert(practice.length === 9 && formal.length === EXPERIMENT_2_FORMAL_TRIALS, "练习/正式数量应为9/135");
assert(formal.filter((trial) => trial.motion_condition === "oscillation").length === 90, "摆动正式Trial应为90");
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
const expectedOscillationEnergies = [
  5.434545,
  12.383636,
  19.332727,
  26.281818,
  33.230909,
  40.18,
  47.129091,
  54.078182,
  61.027273,
  67.976364,
];
assert(EXPERIMENT_2_OSCILLATION_SEGMENTS.length === 10, "实验二应生成10个摆动能量段");
EXPERIMENT_2_OSCILLATION_SEGMENTS.forEach((segment, index) => {
  assert(
    Math.abs(segment.Emid - expectedOscillationEnergies[index]!) < 1e-6,
    `摆动能量中点 ${index + 1} 不符合11等分规则`,
  );
});
const observedOscillationEnergies = new Set(
  formal
    .filter((trial) => trial.motion_condition === "oscillation")
    .map((trial) => trial.pendulum_E_J.toFixed(8)),
);
assert(observedOscillationEnergies.size === 10, "正式摆动应恰有10个能量水平");
for (const segment of EXPERIMENT_2_OSCILLATION_SEGMENTS) {
  assert(
    observedOscillationEnergies.has(segment.Emid.toFixed(8)),
    `缺少摆动能量 ${segment.Emid}`,
  );
}
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
  [...rotationBlockIndices].some((index) => index <= 10),
  "固定测试种子下旋转Block应与摆动Block混排，而不是固定放在末尾",
);

const oscillationFormal = formal.filter(
  (trial) => trial.motion_condition === "oscillation",
);
assert(
  oscillationFormal.filter((trial) => trial.hide_has_turning).length === 45,
  "实验二摆动正式Trial应恰有45条隐藏阶段转向",
);
const turningByTiming = new Map<string, number>();
const turningByEnergy = new Map<string, number>();
for (const trial of oscillationFormal) {
  const timingKey = `${trial.show_T}|${trial.hide_sec}`;
  const energyKey = trial.pendulum_E_J.toFixed(8);
  if (!turningByTiming.has(timingKey)) turningByTiming.set(timingKey, 0);
  if (!turningByEnergy.has(energyKey)) turningByEnergy.set(energyKey, 0);
  if (trial.hide_has_turning) {
    turningByTiming.set(timingKey, turningByTiming.get(timingKey)! + 1);
    turningByEnergy.set(energyKey, turningByEnergy.get(energyKey)! + 1);
  }
}
assert(
  turningByTiming.size === 9 && [...turningByTiming.values()].every((count) => count === 5),
  "实验二每个摆动时序格应恰有5条转向Trial",
);
assert(
  turningByEnergy.size === 10 &&
    [...turningByEnergy.values()].every((count) => count === 4 || count === 5),
  "实验二每个摆动能量水平应有4/5条转向Trial",
);

const completeRows = formal.map((trial) => ({ ...trial, trial_type: "physics-stimulus" }));
assert(classifyExperiment2Status(completeRows, true) === "f", "135个唯一正式响应应标记完成");
assert(classifyExperiment2Status(completeRows, false) === "nf", "非自然结束应标记中断");
assert(classifyExperiment2Status(completeRows.slice(1), true) === "nf", "缺失响应应标记中断");
assert(
  classifyExperiment2Status([
    ...completeRows.slice(0, EXPERIMENT_2_FORMAL_TRIALS - 1),
    completeRows[0]!,
  ], true) === "nf",
  "重复响应不能标记完成",
);

const csv = buildExperiment2StimulusTrialsCsv(completeRows, participant, "f");
assert(csv.split(/\r?\n/).filter(Boolean).length === 136, "实验二CSV应为表头加135行");
assert(csv.includes("experiment_id,protocol_version,data_schema_version"), "实验二CSV应含版本字段");
assert(csv.includes("experiment-2,1.0.0,1,E2-0001"), "实验二CSV元数据不正确");
assert(experiment2DataFilename(participant.subject_id, "f") === "experiment-2_data_subjectE2-0001_f.csv", "实验二CSV文件名不正确");

const json = buildExperiment2StimulusSetExportPayload(set, participant);
assert(json.schema_version === 1 && json.trials.length === 144, "实验二JSON schema或试次数不正确");
assert(experiment2StimulusSetExportFilename(participant) === "experiment-2_stimulus_set_subjectE2-0001.json", "实验二JSON文件名不正确");

console.log("verify-experiment-2: OK（1混合练习Block + 15×9正式Trial，10摆动+5旋转及颜色提示通过）");
