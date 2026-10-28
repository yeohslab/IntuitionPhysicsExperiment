import type { DataCollection } from "jspsych";
import { triggerTextDownload } from "../../shared/download";
import type { Training1ParticipantInfo } from "../../shared/participant";
import type { ExperimentStatus } from "../../runtime/export/exportStimulusCsv";
import { TRAINING_1_PROTOCOL_VERSION } from "./protocol";
import { evaluateTraining1Mastery } from "./mastery";

export const TRAINING_1_DATA_SCHEMA_VERSION = 2 as const;
const TRIAL_TYPE = "speed-color-training";

export const TRAINING_1_CSV_COLUMNS = [
  "experiment_id",
  "protocol_version",
  "data_schema_version",
  "subject_id",
  "gender_code",
  "age_years",
  "experiment_status",
  "trial_id",
  "unit_id",
  "training_segment",
  "mode",
  "mastery_block_index",
  "target_bin_index",
  "target_strip_position",
  "theta_0_deg",
  "omega_0_deg_per_sec",
  "theta_q_deg",
  "omega_q_deg_per_sec",
  "energy_j",
  "query_time_sec",
  "speed_strip_position",
  "speed_strip_truth_position",
  "delta_strip_position",
  "abs_delta_strip_position",
  "speed_scale_omega_max_rad_per_sec",
  "omega_reported_rad_per_sec",
  "omega_q_rad_per_sec",
  "rt_speed_sec",
  "rt_total_sec",
  "mastery_passed",
  "completed_report_trials",
  "mastery_recent_mean_abs_error",
  "mastery_recent_within_015_count",
] as const;

function valuesFromData(
  data: DataCollection | readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.map((row) => ({ ...row }));
  return (data.values() as Record<string, unknown>[]).map((row) => ({ ...row }));
}

export function selectTraining1Rows(
  data: DataCollection | readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return valuesFromData(data).filter((row) => row.trial_type === TRIAL_TYPE);
}

export function classifyTraining1Status(
  rows: readonly Record<string, unknown>[],
  timelineEndedNaturally: boolean,
): ExperimentStatus {
  if (!timelineEndedNaturally) return "nf";
  return evaluateTraining1Mastery(rows).passed ? "f" : "nf";
}

export function training1DataFilename(
  subjectId: string,
  status: ExperimentStatus,
): string {
  return `training-1_v1.0_data_subject${subjectId}_${status}.csv`;
}

export function buildTraining1Csv(
  data: DataCollection | readonly Record<string, unknown>[],
  participant: Training1ParticipantInfo,
  status: ExperimentStatus,
): string {
  const sourceRows = valuesFromData(data);
  const mastery = evaluateTraining1Mastery(sourceRows);
  const rows: Record<string, unknown>[] = selectTraining1Rows(sourceRows).map((row) => ({
    ...row,
    experiment_id: "training-1",
    protocol_version: TRAINING_1_PROTOCOL_VERSION,
    data_schema_version: TRAINING_1_DATA_SCHEMA_VERSION,
    subject_id: participant.subject_id,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
    experiment_status: status,
    mastery_passed: mastery.passed,
    completed_report_trials: mastery.completedReportTrials,
    mastery_recent_mean_abs_error: mastery.recentMeanAbsError,
    mastery_recent_within_015_count: mastery.recentWithinThresholdCount,
  }));
  const header = TRAINING_1_CSV_COLUMNS.join(",");
  const body = rows
    .map((row) =>
      TRAINING_1_CSV_COLUMNS.map((col) => JSON.stringify(row[col] ?? "")).join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}

export function exportTraining1Csv(
  data: DataCollection | readonly Record<string, unknown>[],
  participant: Training1ParticipantInfo,
  status: ExperimentStatus,
): void {
  triggerTextDownload(
    buildTraining1Csv(data, participant, status),
    training1DataFilename(participant.subject_id, status),
    "text/csv;charset=utf-8",
  );
}
