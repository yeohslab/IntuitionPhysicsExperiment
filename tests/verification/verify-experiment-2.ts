import {
  EXPERIMENT_2_FORMAL_BLOCKS,
  EXPERIMENT_2_FORMAL_ENERGY_LEVELS_J,
  EXPERIMENT_2_FORMAL_TRIALS,
  EXPERIMENT_2_HIDE_LEVELS_SEC,
  EXPERIMENT_2_SHOW_T,
  EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
  EXPERIMENT_2_TOTAL_RUNTIME_TRIALS,
  EXPERIMENT_2_TRIALS_PER_BLOCK,
  generateExperiment2RuntimeStimulusSet,
} from "../../src/experiments/experiment-2/generateRuntimeSet.ts";
import { EXPERIMENT_2_ENDPOINTS_PER_ENERGY } from "../../src/experiments/experiment-2/protocol.ts";
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
  endpointBaselinesRadForEnergy,
  endpointSampleHalfWidthRadForEnergy,
} from "../../src/experiments/experiment-2/endpointTargets.ts";
import {
  absoluteSpeedColorLevel,
  calculateSpeedColorStripGeometry,
  SPEED_COLOR_STRIP_GAP_PX,
  SPEED_COLOR_STRIP_HEIGHT_PX,
  speedColorForLevel,
} from "../../src/runtime/components/speedColorStrips.ts";
import {
  pendulumLayout,
  PENDULUM_BOB_RADIUS_PX,
} from "../../src/experiment/physics/render/pendulumCanvas.ts";
import { EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION } from "../../src/shared/experimentTypes.ts";
import { experiment2WelcomeText } from "../../src/experiments/experiment-2/instructions.ts";
import {
  buildExperiment2SubjectId,
  isExperiment2ParticipantInfo,
  type Experiment2ParticipantInfo,
} from "../../src/shared/participant.ts";
import {
  pendulumAngularErrorRad,
  pendulumThetaMaxRad,
  THETA_END_TOL_RAD,
} from "../../src/experiment/physics/pendulumUnitFit.ts";
import { wrapAngleRad } from "../../src/experiment/physics/pendulumArcScore.ts";
import { ROD_LENGTH_M } from "../../src/experiment/physics/energySegments.ts";

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

assert(
  EXPERIMENT_2_FORMAL_ENERGY_LEVELS_J.length === 10,
  "实验二 V2 应有 10 个正式能量",
);
assert(
  EXPERIMENT_2_FORMAL_TRIALS === 150 &&
    EXPERIMENT_2_FORMAL_BLOCKS === 3 &&
    EXPERIMENT_2_TRIALS_PER_BLOCK === 50,
  "实验二 V2 正式试次结构应为 3×50=150",
);
assert(
  Math.abs(EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC - 15.336231610144651) < 1e-9,
  "实验二 V2 颜色速度上限应匹配 117.6 J 最低点线速度",
);

const welcomeText = experiment2WelcomeText();
assert(
  welcomeText.includes("深蓝紫色") && welcomeText.includes("没有分档"),
  "实验二指导语应描述连续Turbo映射",
);

let lastProgress = 0;
const set = generateExperiment2RuntimeStimulusSet({
  subjectId: participant.subject_id,
  rng: mulberry32(92_002),
  onProgress: (completed, total) => {
    lastProgress = completed;
    assert(total === EXPERIMENT_2_TOTAL_RUNTIME_TRIALS, "生成进度总数应为 159");
  },
});
assert(set.schemaVersion === EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION, "schema 应为 v3");
assert(lastProgress === EXPERIMENT_2_TOTAL_RUNTIME_TRIALS, "生成进度终点应为 159");

const formalBlocks = set.sequence.filter((item) => item.kind === "block");
const practices = set.sequence.filter((item) => item.kind === "practice");
assert(formalBlocks.length === 3, "应有 3 个正式 Block");
assert(practices.length === 1 && practices[0]!.children.length === 9, "应有 1 个 9 Trial 练习 Block");
assert(formalBlocks.every((block) => block.children.length === 50), "每 Block 应有 50 条");

const descriptors = collectExperiment2TrialDescriptors(set);
const practice = descriptors.filter((trial) => trial.segment_kind === "practice");
const formal = descriptors.filter((trial) => trial.segment_kind === "block");
assert(descriptors.length === EXPERIMENT_2_TOTAL_RUNTIME_TRIALS, "描述符总数应为 159");
assert(formal.length === EXPERIMENT_2_FORMAL_TRIALS, "正式描述符应为 150");
assert(
  descriptors.every((trial) => trial.show_T === EXPERIMENT_2_SHOW_T),
  "所有 Trial 的 show_T 应为 1.2",
);
assert(
  descriptors.every(
    (trial) =>
      trial.protocol_version === "2.0.0" &&
      trial.speed_color_v_max_m_per_sec === EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
  ),
  "描述符应记录协议 2.0.0 与颜色速度上限",
);

for (const hideSec of EXPERIMENT_2_HIDE_LEVELS_SEC) {
  const blocksWithHide = formalBlocks.filter((block) => {
    const trial = block.children[0]!;
    const unit = trial.units.find((u) => u.type === "pendulumStimulus");
    return unit && Math.abs(unit.hide1T - hideSec) < 1e-9;
  });
  assert(blocksWithHide.length === 1, `遮挡 ${hideSec} s 应恰有 1 个 Block`);
  const blockFormal = formal.filter(
    (trial) =>
      trial.block_index === formalBlocks.indexOf(blocksWithHide[0]!) + 1,
  );
  assert(
    blockFormal.every((trial) => Math.abs(trial.hide_sec - hideSec) < 1e-9),
    `Block 内 hide_sec 应统一为 ${hideSec}`,
  );
  const energyCounts = new Map<string, number>();
  for (const trial of blockFormal) {
    const key = trial.pendulum_E_J.toFixed(8);
    energyCounts.set(key, (energyCounts.get(key) ?? 0) + 1);
  }
  assert(energyCounts.size === 10, `遮挡 ${hideSec} s Block 应覆盖 10 个能量`);
  for (const energyJ of EXPERIMENT_2_FORMAL_ENERGY_LEVELS_J) {
    assert(
      energyCounts.get(energyJ.toFixed(8)) === EXPERIMENT_2_ENDPOINTS_PER_ENERGY,
      `能量 ${energyJ} J 在 Block 内应出现 5 次`,
    );
  }
}

for (const trial of formal) {
  const regime =
    trial.motion_condition === "rotation" ? "rotation" : "oscillation";
  const nominalEnergyJ =
    EXPERIMENT_2_FORMAL_ENERGY_LEVELS_J.find(
      (energyJ) => Math.abs(energyJ - trial.pendulum_E_J) < 2e-3,
    ) ?? trial.pendulum_E_J;
  const thetaMax = pendulumThetaMaxRad(nominalEnergyJ, ROD_LENGTH_M, trial.gravity_m_per_sec2);
  const baselines = endpointBaselinesRadForEnergy(nominalEnergyJ);
  const halfWidth = endpointSampleHalfWidthRadForEnergy(nominalEnergyJ);
  const actual =
    regime === "rotation"
      ? wrapAngleRad(trial.theta_x_t_rad)
      : trial.theta_x_t_rad;
  const inNeighborhood = baselines.some((baselineRad) => {
    const targetBaseline =
      regime === "rotation" ? wrapAngleRad(baselineRad) : baselineRad;
    const err = pendulumAngularErrorRad(
      actual,
      targetBaseline,
      regime,
      thetaMax,
    );
    return err <= halfWidth + THETA_END_TOL_RAD;
  });
  assert(inNeighborhood, `正式 Trial ${trial.trial_id} 终态角应落在基准邻域内`);
}

const practiceCounts = [
  practice.filter((trial) => trial.motion_condition === "oscillation").length,
  practice.filter((trial) => trial.motion_condition === "rotation").length,
].sort();
assert(practiceCounts[0] === 4 && practiceCounts[1] === 5, "练习应按 4/5 分配运动类型");

const completeRows = formal.map((trial) => ({ ...trial, trial_type: "physics-stimulus" }));
assert(classifyExperiment2Status(completeRows, true) === "f", "150 个唯一正式响应应标记完成");
assert(classifyExperiment2Status(completeRows.slice(1), true) === "nf", "缺失响应应标记中断");

const csv = buildExperiment2StimulusTrialsCsv(completeRows, participant, "f");
assert(csv.split(/\r?\n/).filter(Boolean).length === 151, "CSV 应为表头加 150 行");
assert(csv.includes("experiment-2,2.0.0,1,E2-0001"), "CSV 元数据应含协议 2.0.0");
assert(
  experiment2DataFilename(participant.subject_id, "f") ===
    "experiment-2_v2.0_data_subjectE2-0001_f.csv",
  "V2 CSV 文件名应含 v2.0",
);

const json = buildExperiment2StimulusSetExportPayload(set, participant);
assert(json.trials.length === EXPERIMENT_2_TOTAL_RUNTIME_TRIALS, "JSON 试次数应为 159");
assert(
  experiment2StimulusSetExportFilename(participant) ===
    "experiment-2_v2.0_stimulus_set_subjectE2-0001.json",
  "V2 JSON 文件名应含 v2.0",
);

assert(SPEED_COLOR_STRIP_HEIGHT_PX === 28, "色带厚度应为 28 px");
for (const [canvasWidth, canvasHeight] of [
  [1000, 650],
  [360, 234],
] as const) {
  const edgeClearancePx =
    SPEED_COLOR_STRIP_HEIGHT_PX + SPEED_COLOR_STRIP_GAP_PX + PENDULUM_BOB_RADIUS_PX;
  const layout = pendulumLayout(canvasWidth, canvasHeight, edgeClearancePx);
  const geometry = calculateSpeedColorStripGeometry({
    rodPx: layout.rodPx,
    anchorX: layout.anchorX,
    anchorY: layout.anchorY,
  });
  assert(geometry.topPx >= 0, "色带不得越界");
  assert(
    geometry.bottomPx + geometry.heightPx <= canvasHeight,
    "色带不得越界",
  );
}
assert(absoluteSpeedColorLevel(0, EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC) === 0, "零速映射");

console.log("verify-experiment-2: OK（协议 2.0.0：3×50 正式 Trial，遮挡分 Block）");
