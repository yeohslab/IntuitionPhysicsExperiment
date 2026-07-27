/**
 * schema v2 刺激集和 CSV 导出协议自检。
 * 运行：npm run verify-export
 */
import {
  buildStimulusTrialsCsv,
  classifyExperimentStatus,
  experimentDataFilename,
} from "../../src/runtime/export/exportStimulusCsv.ts";
import { speedBarVMaxForGroup } from "../../src/experiment/physics/energySegments.ts";
import { HIDE_LEVELS_SEC } from "../../src/experiment/physics/timePhases.ts";
import { absoluteSpeedBarLevel } from "../../src/runtime/components/speedIndicatorBar.ts";
import {
  buildStimulusSetExportPayload,
  stimulusSetExportFilename,
} from "../../src/shared/exportStimulusSetJson.ts";
import { generateRuntimeStimulusSet } from "../../src/experiment/stimulus/generateRuntimeSet.ts";
import {
  normalizeAgeYears,
  normalizeGenderCode,
  type MotionGroup,
  type ParticipantInfo,
} from "../../src/shared/participant.ts";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertDemographicValidation(): void {
  assert(normalizeGenderCode("0") === 0, "gender_code=0 应合法");
  assert(normalizeGenderCode(1) === 1, "gender_code=1 应合法");
  for (const value of ["", -1, 2, "0.5", "male"]) {
    assert(normalizeGenderCode(value) === null, `非法 gender_code 未拒绝：${value}`);
  }
  assert(normalizeAgeYears(1) === 1, "年龄下界 1 应合法");
  assert(normalizeAgeYears("120") === 120, "年龄上界 120 应合法");
  for (const value of ["", 0, 121, -2, 20.5, "20.5"]) {
    assert(normalizeAgeYears(value) === null, `非法 age_years 未拒绝：${value}`);
  }
}

function assertGroupExport(group: MotionGroup): void {
  const participant: ParticipantInfo = {
    subject_id: "0001",
    motion_group: group,
    gender_code: 0,
    age_years: 20,
  };
  const set = generateRuntimeStimulusSet({
    group,
    subjectId: participant.subject_id,
    rng: mulberry32(71_000 + group),
  });
  const payload = buildStimulusSetExportPayload(set, participant);
  assert(payload.schema_version === 2, "刺激集 schema_version 应为 2");
  assert(payload.trials.length === 144, `组 ${group} 刺激 Trial 应为 144`);
  assert(
    payload.trials.filter((trial) => trial.segment_kind === "practice").length === 9,
    `组 ${group} 练习 Trial 应为 9`,
  );
  assert(
    payload.trials.filter((trial) => trial.segment_kind === "block").length === 135,
    `组 ${group} 正式 Trial 应为 135`,
  );

  const expectedVMax = speedBarVMaxForGroup(group);
  assert(absoluteSpeedBarLevel(0, expectedVMax) === 0, "零速应为空条");
  assert(
    absoluteSpeedBarLevel(expectedVMax, expectedVMax) === 1,
    "组内 Vmax 应为满条",
  );
  assert(
    absoluteSpeedBarLevel(2 * expectedVMax, expectedVMax) === 1,
    "超出 Vmax 应钳位到满条",
  );
  const hideLevels = new Set<number>(HIDE_LEVELS_SEC);
  for (const trial of payload.trials) {
    assert(hideLevels.has(trial.hide_sec), `非法 hide_sec=${trial.hide_sec}`);
    assert(
      Math.abs(trial.speed_bar_v_max_m_per_sec - expectedVMax) < 1e-12,
      `组 ${group} Vmax 不统一`,
    );
    for (const [key, value] of Object.entries(trial)) {
      if (typeof value === "number") {
        assert(Number.isFinite(value), `${key} 应为有限数`);
      }
    }
  }

  const serialized = JSON.stringify(payload);
  for (const forbidden of [
    '"text"',
    '"durationMs"',
    '"imageDataUrl"',
    '"response"',
    '"theta_actual',
    '"omega_actual',
  ]) {
    assert(!serialized.includes(forbidden), `刺激集含禁止字段 ${forbidden}`);
  }

  const formal = payload.trials.find((trial) => trial.segment_kind === "block")!;
  const responseRow = {
    ...formal,
    trial_type: "physics-stimulus",
    theta_estimated_deg: formal.theta_x_t_deg,
    theta_estimated_rad: formal.theta_x_t_rad,
    delta_theta_deg: 0,
    delta_theta_rad: 0,
    abs_delta_theta_deg: 0,
    abs_delta_theta_rad: 0,
    rt_estimate_sec: 0.5,
    sim_frame_count: 100,
    sim_max_frame_gap_ms: 17,
    sim_end_overshoot_ms: 1,
    sim_elapsed_actual_sec: formal.total_time_sec + 0.001,
    visibility_pause_count: 0,
    visibility_pause_sec: 0,
  };
  const csv = buildStimulusTrialsCsv([responseRow], participant, "nf");
  assert(csv.split(/\r?\n/).length >= 3, "CSV 应包含表头和正式响应");
  assert(csv.includes("theta_x_0_deg"), "CSV 缺少 x_0 状态字段");
  assert(csv.includes("theta_x_t_deg"), "CSV 缺少 x_t 状态字段");
  assert(!csv.includes("theta_actual"), "新 CSV 不应输出历史 theta_actual");
  assert(!csv.includes("physicsKind"), "新 CSV 不应输出 physicsKind");
  const csvLines = csv.trim().split(/\r?\n/);
  const csvHeader = csvLines[0]!.split(",");
  const csvValues = csvLines[1]!.split(",");
  const csvRow = Object.fromEntries(
    csvHeader.map((column, index) => [column, csvValues[index] ?? ""]),
  );
  for (const [field, value] of Object.entries(formal)) {
    assert(
      csvRow[field] === (value === null ? "" : String(value)),
      `JSON/CSV 共有字段不一致：${field}`,
    );
  }
  assert(
    classifyExperimentStatus([], true) === "nf",
    "零正式响应必须标记 nf",
  );
  assert(
    classifyExperimentStatus([responseRow], true) === "nf",
    "部分正式响应必须标记 nf",
  );
  const completeRows = payload.trials
    .filter((trial) => trial.segment_kind === "block")
    .map((trial) => ({
      ...responseRow,
      ...trial,
      trial_type: "physics-stimulus",
    }));
  assert(
    classifyExperimentStatus(completeRows, true) === "f",
    "自然完成 135 个正式响应应标记 f",
  );
  assert(
    classifyExperimentStatus(completeRows, false) === "nf",
    "非自然结束即使有 135 个响应也必须标记 nf",
  );
  assert(
    classifyExperimentStatus([...completeRows.slice(0, 134), completeRows[0]!], true) ===
      "nf",
    "重复响应不能伪装成完成",
  );

  assert(
    experimentDataFilename("0001", "f") === "experiment_data_subject0001_f.csv",
    "完成文件名不正确",
  );
  assert(
    experimentDataFilename("0001", "nf") === "experiment_data_subject0001_nf.csv",
    "中断文件名不正确",
  );
  assert(
    stimulusSetExportFilename(participant) ===
      `stimulus_set_group${group}_subject0001.json`,
    "刺激集文件名不正确",
  );
  console.log(`组 ${group}：schema v2 144 Trial、CSV 与命名协议通过`);
}

assertDemographicValidation();
assertGroupExport(1);
assertGroupExport(2);
console.log("verify-export-contract: 全部通过");
