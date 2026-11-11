import type { DataCollection } from "jspsych";
import { triggerTextDownload } from "../../shared/download";
import type { Experiment5ParticipantInfo } from "../../shared/participant";
import type { ExperimentStatus } from "../../runtime/export/exportStimulusCsv";
import { EXPERIMENT_5_V3_FORMAL_TRIALS, EXPERIMENT_5_V3_PROTOCOL_VERSION } from "./protocol";

export const EXPERIMENT_5_V3_DATA_SCHEMA_VERSION = 1 as const;
export const EXPERIMENT_5_V3_CSV_COLUMNS = [
  "experiment_id", "protocol_version", "data_schema_version", "subject_id",
  "gender_code", "age_years", "experiment_status", "trial_id", "unit_id",
  "segment_kind", "block_index", "trial_index_in_block", "formal_trial_index",
  "state_site_id", "amplitude_deg", "energy_J", "theta_0_deg",
  "omega_0_deg_per_sec", "query_theta_deg", "query_omega_rad_per_sec",
  "query_time_sec", "blank_start_sec", "blank_duration_sec",
  "bell_angle_offset_deg", "bell_contact_height_m", "bell_theta_deg", "bell_side",
  "correct_response", "yes_key", "no_key", "response_judgment", "response_key",
  "correct", "rt_sec", "timed_out", "actual_last_visible_frame_sec",
  "blank_started_performance_ms", "prompt_performance_ms", "audio_context_boundary_sec",
  "sim_frame_count", "sim_max_frame_gap_ms", "visibility_pause_count",
  "visibility_pause_sec", "timing_valid", "model_dt_sec", "rod_length_m",
  "gravity_m_per_sec2", "bob_radius_m",
] as const;

function values(data: DataCollection | readonly Record<string, unknown>[]) {
  return Array.isArray(data) ? data.map((row) => ({ ...row }))
    : (data.values() as Record<string, unknown>[]).map((row) => ({ ...row }));
}

export function selectExperiment5V3FormalRows(
  data: DataCollection | readonly Record<string, unknown>[],
) {
  return values(data).filter((row) =>
    row.trial_type === "bell-reachability-v3-stimulus" &&
    row.segment_kind === "block" &&
    row.unit_type === "bellReachabilityV3Stimulus");
}

export function classifyExperiment5V3Status(
  data: DataCollection | readonly Record<string, unknown>[],
  ended: boolean,
): ExperimentStatus {
  if (!ended) return "nf";
  const indices = selectExperiment5V3FormalRows(data).map((row) => Number(row.formal_trial_index));
  return indices.length === EXPERIMENT_5_V3_FORMAL_TRIALS &&
    new Set(indices).size === EXPERIMENT_5_V3_FORMAL_TRIALS ? "f" : "nf";
}

const cell = (value: unknown) => {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function experiment5V3DataFilename(subjectId: string, status: ExperimentStatus) {
  return `experiment-5_v3.0_data_subject${subjectId}_${status}.csv`;
}

export function buildExperiment5V3Csv(
  data: DataCollection | readonly Record<string, unknown>[],
  participant: Experiment5ParticipantInfo,
  status: ExperimentStatus,
): string {
  const rows = selectExperiment5V3FormalRows(data).map((row) => ({
    ...row,
    experiment_id: "experiment-5",
    protocol_version: EXPERIMENT_5_V3_PROTOCOL_VERSION,
    data_schema_version: EXPERIMENT_5_V3_DATA_SCHEMA_VERSION,
    subject_id: participant.subject_id,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
    experiment_status: status,
  }));
  return `${[
    EXPERIMENT_5_V3_CSV_COLUMNS.join(","),
    ...rows.map((row) => EXPERIMENT_5_V3_CSV_COLUMNS.map((column) => cell(row[column])).join(",")),
  ].join("\r\n")}\r\n`;
}

export function exportExperiment5V3Csv(
  data: DataCollection | readonly Record<string, unknown>[],
  participant: Experiment5ParticipantInfo,
  status: ExperimentStatus,
): void {
  triggerTextDownload(
    buildExperiment5V3Csv(data, participant, status),
    experiment5V3DataFilename(participant.subject_id, status),
    "text/csv;charset=utf-8",
  );
}
