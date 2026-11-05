import {
  assertTraining1RuntimeStimulusSet,
  generateTraining1RuntimeStimulusSet,
} from "../../src/experiments/training-1/generateRuntimeSet.ts";
import {
  TRAINING_1_ASSESSMENT_TRIALS,
  TRAINING_1_GUIDED_TRIALS,
  TRAINING_1_LINEAR_SPEED_SCALE_M_PER_SEC,
  TRAINING_1_FEEDBACK_HOLD_MS,
  TRAINING_1_OMEGA_SCALE_RAD_PER_SEC,
  TRAINING_1_REPORT_DELAY_SEC,
  TRAINING_1_REMEDIATION_TRIALS,
  TRAINING_1_SPEED_BIN_COUNT,
  TRAINING_1_SPEED_SCALE_ENERGY_J,
  TRAINING_1_SPEED_SCALE_RELEASE_ANGLE_DEG,
  TRAINING_1_TOTAL_RUNTIME_TRIALS,
} from "../../src/experiments/training-1/protocol.ts";
import {
  linearMotionTrackGeometry,
  linearMotionWorldLayout,
} from "../../src/experiment/physics/render/linearMotionCanvas.ts";
import { trainingMotionStateAt } from "../../src/experiments/training-1/trialPhysics.ts";
import { collectTraining1TrialDescriptors } from "../../src/experiments/training-1/trialDescriptor.ts";
import {
  SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC,
  SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC,
  SPEED_STRIP_SCALE_ENERGY_J,
} from "../../src/experiment/physics/speedStripScale.ts";
import {
  buildTraining1Csv,
  classifyTraining1Status,
} from "../../src/experiments/training-1/exportStimulusCsv.ts";
import {
  evaluateTraining1Mastery,
  training1AssessmentAttemptFromCompletedTrials,
  training1NeedsRemediation,
} from "../../src/experiments/training-1/mastery.ts";
import { parseTraining1StimulusSet } from "../../src/shared/storage.ts";

function assert(condition: boolean, message: string): asserts condition {
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
assert(set.schemaVersion === 7, "训练一刺激 schema 应为 7");
assert(parseTraining1StimulusSet(set) !== null, "新版训练一刺激集应可载入");
assert(
  parseTraining1StimulusSet({ ...set, schemaVersion: 5 }) === null,
  "旧 schema 5 刺激集不得恢复",
);
assert(
  parseTraining1StimulusSet({ ...set, schemaVersion: 6 }) === null,
  "旧 schema 6 刺激集不得恢复",
);
{
  const mismatched = structuredClone(set);
  const stale = mismatched.sequence
    .flatMap((segment) => segment.kind === "practice" ? segment.children : [])
    .flatMap((trial) => trial.units)
    .find((unit) => unit.type === "speedColorTrainingStimulus" && unit.linearSpeedMPerSec > 0);
  assert(stale?.type === "speedColorTrainingStimulus", "应能找到一条运动刺激");
  stale.linearSpeedMPerSec = Math.sqrt(2 * 11.48);
  assert(parseTraining1StimulusSet(mismatched) === null, "45° 标尺下的线速度不得按 60° 标尺恢复");
}

assert(TRAINING_1_SPEED_SCALE_RELEASE_ANGLE_DEG === 60, "训练一右端应按 60° 静止释放标定");
assert(TRAINING_1_SPEED_SCALE_ENERGY_J === 19.6, "训练一标定能量应为 19.6 J");
assert(
  Math.abs(TRAINING_1_LINEAR_SPEED_SCALE_M_PER_SEC - Math.sqrt(2 * 19.6)) < 1e-12,
  "训练一最高线速度应由 19.6 J 和 1 kg 质量得到",
);
assert(
  Math.abs(TRAINING_1_OMEGA_SCALE_RAD_PER_SEC - TRAINING_1_LINEAR_SPEED_SCALE_M_PER_SEC / 4) < 1e-12,
  "训练一角速度应为线速度除以 4 m 摆长",
);
assert(SPEED_STRIP_SCALE_ENERGY_J === 11.48, "实验四色带仍应按 11.48 J 标定");
assert(
  Math.abs(SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC - Math.sqrt(2 * 11.48)) < 1e-12,
  "实验四最高线速度仍应由 11.48 J 得到",
);
assert(
  Math.abs(TRAINING_1_LINEAR_SPEED_SCALE_M_PER_SEC - SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC) > 1 &&
    Math.abs(TRAINING_1_OMEGA_SCALE_RAD_PER_SEC - SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC) > 0.2,
  "训练一不得再与实验四共用线速度和角速度尺度",
);

const descriptors = collectTraining1TrialDescriptors(set);
assert(descriptors.length === TRAINING_1_TOTAL_RUNTIME_TRIALS, "描述符应覆盖全部候选试次");
assert(!descriptors.some((item) => (item.mode as string) === "demonstration"), "训练一不得包含示范试次");
for (const segment of set.sequence) {
  if (segment.kind !== "practice") continue;
  for (const trial of segment.children) {
    const stimulus = trial.units.find((unit) => unit.type === "speedColorTrainingStimulus");
    assert(stimulus?.type === "speedColorTrainingStimulus", "练习试次应包含训练刺激");
    assert(
      trial.units[0]?.type === "textDisplay" && trial.units[0].durationMs === 1000,
      "练习、测验和补强均应先呈现 1 秒注视点",
    );
  }
}

const guided = descriptors.filter((item) =>
  item.mode === "guided" && item.training_segment.startsWith("guided_"));
assert(guided.length === TRAINING_1_GUIDED_TRIALS, "应生成 24 次基础反馈练习");
const remediation = descriptors.filter((item) => item.training_segment === "remediation");
assert(remediation.length === TRAINING_1_REMEDIATION_TRIALS, "应生成 8 次补强练习");
for (let round = 1; round <= 3; round += 1) {
  const rows = guided.filter((item) => item.stage_round_index === round);
  assert(rows.length === TRAINING_1_SPEED_BIN_COUNT, `反馈练习第 ${round} 轮应有 8 条`);
  assert(new Set(rows.map((item) => item.target_bin_index)).size === 8, "每轮应覆盖八个区间");
  assert(rows.every((item) => item.initial_direction === "rightward"), "非静止试次应统一从左向右起步");
}
const firstGuided = guided.filter((item) => item.stage_round_index === 1);
for (const item of firstGuided) {
  const expected = (item.target_bin_index! + 0.5) / 8;
  assert(Math.abs(item.target_strip_position - expected) < 1e-12, "第一轮练习应使用区间中心");
}

for (const attempt of [1, 2]) {
  const rows = descriptors.filter((item) => item.assessment_attempt === attempt);
  assert(rows.length === TRAINING_1_ASSESSMENT_TRIALS, `测验 ${attempt} 应有 6 条`);
  assert(rows.every((item) => !item.feedback_shown), "测验不得显示反馈");
  assert(rows.every((item) => item.stage_round_index === 1), "每套测验应为单轮六题");
  assert(new Set(rows.map((item) => item.target_bin_index)).size === 6, "每套测验应覆盖六个速度区间");
  assert(rows.every((item) => item.initial_direction === "rightward"), "测验应统一从左向右起步");
}

for (const item of descriptors) {
  assert(item.track_left_x_m === -4 && item.track_right_x_m === 4, "应使用固定对称轨道");
  assert(
    item.report_available_at_sec === TRAINING_1_REPORT_DELAY_SEC,
    "提问阶段必须在 4 秒后开放作答",
  );
  if (item.linear_speed_m_per_sec <= 1e-12) {
    assert(item.motion_loop_mode === "stationary" && item.initial_x_m === 0, "零速刺激应在中央静止");
    assert(item.first_traversal_duration_sec === null, "静止刺激没有横穿时长");
  } else {
    assert(item.motion_loop_mode === "ping_pong" && item.initial_x_m === -4, "运动刺激应从左端往复");
    const traversalSec = item.first_traversal_duration_sec!;
    assert(Math.abs(traversalSec - 8 / item.linear_speed_m_per_sec) < 1e-9, "首次横穿时长错误");
    const unit = set.sequence.flatMap((segment) => segment.kind === "practice" ? segment.children : [])
      .flatMap((trial) => trial.units)
      .find((candidate) => candidate.id === item.unit_id);
    assert(unit?.type === "speedColorTrainingStimulus", "描述符应对应训练刺激");
    const start = trainingMotionStateAt(unit, 0);
    const right = trainingMotionStateAt(unit, traversalSec);
    const middleBack = trainingMotionStateAt(unit, traversalSec * 1.5);
    const leftAgain = trainingMotionStateAt(unit, traversalSec * 2);
    const endpointEpsilonSec = 1e-6;
    const justBefore = trainingMotionStateAt(unit, traversalSec - endpointEpsilonSec);
    const justAfter = trainingMotionStateAt(unit, traversalSec + endpointEpsilonSec);
    assert(Math.abs(start.xM + 4) < 1e-9, "应从左端开始");
    assert(Math.abs(right.xM - 4) < 1e-9 && right.direction === "leftward", "右端应连续折返");
    assert(Math.abs(middleBack.xM) < 1e-9 && middleBack.direction === "leftward", "回程速率应恒定");
    assert(Math.abs(leftAgain.xM + 4) < 1e-9, "完整往返后应回到左端");
    assert(
      Math.abs((4 - justBefore.xM) - item.linear_speed_m_per_sec * endpointEpsilonSec) < 1e-9 &&
        Math.abs((4 - justAfter.xM) - item.linear_speed_m_per_sec * endpointEpsilonSec) < 1e-9,
      "折返前后的位置应连续且速率大小恒定",
    );
  }
  assert(Math.abs(item.speed_strip_truth_position - item.target_strip_position) < 1e-12, "线速度与色带目标应一致");
  assert(item.speed_scale_energy_j === 19.6, "描述符应记录 19.6 J 标定能量");
  assert(
    Math.abs(item.linear_speed_m_per_sec - item.target_strip_position * TRAINING_1_LINEAR_SPEED_SCALE_M_PER_SEC) < 1e-12,
    "线速度应按 60° 最低点速度缩放",
  );
}
assert(TRAINING_1_FEEDBACK_HOLD_MS === 2000, "有反馈确认后应继续运动恰好 2 秒");

const logicalLayout = linearMotionWorldLayout(1000, 560);
const track = linearMotionTrackGeometry(logicalLayout);
assert(track.leftCenterPx - track.ballRadiusPx >= 0, "左端球体不得越出画布");
assert(track.rightCenterPx + track.ballRadiusPx <= 1000, "右端球体不得越出画布");
for (const dpr of [1, 1.25, 1.5, 2]) {
  assert((track.leftCenterPx - track.ballRadiusPx) * dpr >= 0, `DPR ${dpr} 左端越界`);
  assert((track.rightCenterPx + track.ballRadiusPx) * dpr <= 1000 * dpr, `DPR ${dpr} 右端越界`);
}
const serialized = JSON.stringify(set);
for (const legacyField of ["theta0Deg", "omega0DegPerSec", "rodLengthM", "gravity", "energyJ"]) {
  assert(!serialized.includes(legacyField), `训练刺激不得包含旧单摆字段 ${legacyField}`);
}

const row = (attempt: number, error: number) => ({
  trial_type: "speed-color-training",
  mode: "assessment",
  assessment_attempt: attempt,
  abs_delta_strip_position: error,
});
const exactBoundaryErrors = [
  ...Array.from({ length: 5 }, () => 0),
  0.9,
];
const passAttempt1 = exactBoundaryErrors.map((error) => row(1, error));
const boundary = evaluateTraining1Mastery(passAttempt1);
assert(boundary.passed && boundary.passedAttempt === 1, "均值 0.15 且恰有 5/6 误差不超过 0.25 时应通过");
assert(classifyTraining1Status(passAttempt1, true) === "f", "首次测验达标应标记 f");
assert(classifyTraining1Status(passAttempt1, false) === "nf", "中断仍应标记 nf");

const failAttempt1 = [
  ...Array.from({ length: 4 }, () => row(1, 0)),
  ...Array.from({ length: 2 }, () => row(1, 0.26)),
];
assert(!evaluateTraining1Mastery(failAttempt1).passed, "仅 4/6 误差不超过 0.25 时不得通过");
const failMean = [
  ...Array.from({ length: 5 }, () => row(1, 0.25)),
  row(1, 0.16),
];
assert(!evaluateTraining1Mastery(failMean).passed, "均值超过 0.15 时不得通过");
const passAttempt2 = exactBoundaryErrors.map((error) => row(2, error));
const secondPass = evaluateTraining1Mastery([...failAttempt1, ...passAttempt2]);
assert(secondPass.passed && secondPass.passedAttempt === 2, "补强后第二次测验可达标");
const failAttempt2 = failAttempt1.map((item) => ({ ...item, assessment_attempt: 2 }));
const passAttempt3 = exactBoundaryErrors.map((error) => row(3, error));
const thirdPass = evaluateTraining1Mastery([...failAttempt1, ...failAttempt2, ...passAttempt3]);
assert(thirdPass.passed && thirdPass.passedAttempt === 3, "应支持补强和测验循环到第三次及以后");
assert(classifyTraining1Status([...failAttempt1, ...failAttempt2], true) === "nf", "尚未通过时应标记 nf");

assert(!training1NeedsRemediation(passAttempt1), "首次通过应跳过补强和重测");
assert(training1NeedsRemediation(failAttempt1), "首次失败应执行补强和重测");
assert(
  training1AssessmentAttemptFromCompletedTrials(0) === 1 &&
    training1AssessmentAttemptFromCompletedTrials(6) === 2 &&
    training1AssessmentAttemptFromCompletedTrials(12) === 3,
  "循环测验应按每 6 题递增测验轮次",
);

const csv = buildTraining1Csv(passAttempt1, participant, "f");
assert(csv.includes("data_schema_version"), "CSV 应记录数据 schema");
assert(csv.includes("mastery_final_mean_abs_error"), "CSV 应记录最终达标指标");
assert(csv.includes("speed_scale_linear_v_max_m_per_sec"), "CSV 应记录最高线速度");
assert(
  !csv.includes("theta_0_deg") && !csv.includes("pendulum_E_J") &&
    !csv.includes("omega_q_rad_per_sec"),
  "CSV 不得保留单摆状态字段",
);
assert(csv.includes("report_available_at_sec"), "CSV 应记录开放作答时间");
assert(csv.includes("motion_elapsed_at_confirmation_sec"), "CSV 应记录确认时累计运动时间");
assert(csv.includes("\r\ntraining-1,1.0.0,8,"), "CSV 数据 schema 应为 8");
assert(csv.includes("mastery_final_within_threshold_count"), "CSV 应记录阈值内次数");
assert(!csv.includes("mastery_final_within_015_count"), "CSV 不再使用 0.15 阈值列名");
assert(csv.includes("feedback_phase_skipped"), "CSV 应记录是否跳过整个反馈阶段");
assert(!csv.includes("training_trial_skipped"), "CSV 不再记录逐题跳过");

console.log("verify-training-1: OK（无示范、6 题测验、误差 0.15/0.25、整段跳过反馈、循环补强，60° 标尺，刺激 schema 7 / 数据 schema 8）");
