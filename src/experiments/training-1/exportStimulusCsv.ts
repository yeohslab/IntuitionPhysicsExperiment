import type { DataCollection } from "jspsych";
import { triggerTextDownload } from "../../shared/download";
import type { Training1ParticipantInfo } from "../../shared/participant";
import type { ExperimentStatus } from "../../runtime/export/exportStimulusCsv";
import { TRAINING_1_PROTOCOL_VERSION } from "./protocol";
import { evaluateTraining1Mastery } from "./mastery";

export const TRAINING_1_DATA_SCHEMA_VERSION = 8 as const;
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
  "sequence_stage_index",
  "trial_index_in_stage",
  "training_segment",
  "mode",
  "stage_round_index",
  "target_bin_index",
  "assessment_attempt",
  "feedback_shown",
  "initial_direction",
  "motion_loop_mode",
  "track_left_x_m",
  "track_right_x_m",
  "initial_x_m",
  "report_available_at_sec",
  "first_traversal_duration_sec",
  "motion_elapsed_at_confirmation_sec",
  "feedback_phase_skipped",
  "target_strip_position",
  "linear_speed_m_per_sec",
  "speed_strip_position",
  "speed_strip_truth_position",
  "delta_strip_position",
  "abs_delta_strip_position",
  "speed_scale_energy_j",
  "speed_scale_linear_v_max_m_per_sec",
  "speed_scale_omega_max_rad_per_sec",
  "speed_reported_m_per_sec",
  "rt_speed_sec",
  "rt_total_sec",
  "mastery_passed",
  "mastery_passed_attempt",
  "completed_guided_trials",
  "completed_assessment_trials",
  "mastery_final_attempt",
  "mastery_final_mean_abs_error",
  "mastery_final_within_threshold_count",
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

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
    mastery_passed_attempt: mastery.passedAttempt,
    completed_guided_trials: mastery.completedGuidedTrials,
    completed_assessment_trials: mastery.completedAssessmentTrials,
    mastery_final_attempt: mastery.finalAttempt,
    mastery_final_mean_abs_error: mastery.finalMeanAbsError,
    mastery_final_within_threshold_count: mastery.finalWithinThresholdCount,
  }));
  return `${[
    TRAINING_1_CSV_COLUMNS.join(","),
    ...rows.map((row) =>
      TRAINING_1_CSV_COLUMNS.map((column) => escapeCsvCell(row[column])).join(",")),
  ].join("\r\n")}\r\n`;
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
