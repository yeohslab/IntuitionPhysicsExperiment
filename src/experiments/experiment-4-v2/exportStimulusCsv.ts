import type { DataCollection } from "jspsych";
import { triggerTextDownload } from "../../shared/download";
import type { Experiment4ParticipantInfo } from "../../shared/participant";
import type { ExperimentStatus } from "../../runtime/export/exportStimulusCsv";
import {
  EXPERIMENT_4_V2_FORMAL_TRIALS,
  EXPERIMENT_4_V2_PROTOCOL_VERSION,
} from "./protocol";

export const EXPERIMENT_4_V2_DATA_SCHEMA_VERSION = 3 as const;
export const EXPERIMENT_4_V2_CSV_COLUMNS = [
  "experiment_id", "protocol_version", "data_schema_version", "subject_id",
  "gender_code", "age_years", "experiment_status", "trial_id", "unit_id",
  "segment_kind", "block_index", "trial_index_in_block", "formal_trial_index",
  "state_site_id", "tracking_condition", "report_target", "amplitude_deg", "energy_J",
  "theta_0_deg", "omega_0_deg_per_sec", "initial_side", "initial_direction",
  "cue_duration_ms", "query_theta_deg", "query_omega_rad_per_sec",
  "query_time_sec", "blank_start_sec", "blank_duration_sec", "reversal_time_sec",
  "grating_condition", "gap_m", "bar_width_m", "grating_period_m",
  "grating_offset_m", "visible_segments_json",
  "segment_1_start_sec", "segment_1_end_sec",
  "segment_2_start_sec", "segment_2_end_sec",
  "segment_3_start_sec", "segment_3_end_sec",
  "segment_4_start_sec", "segment_4_end_sec",
  "segment_5_start_sec", "segment_5_end_sec",
  "segment_6_start_sec", "segment_6_end_sec",
  "last_segment_truncated_by_blank",
  "speed_scale_linear_m_per_sec", "model_dt_sec", "theta_reported_deg",
  "theta_reported_rad", "speed_strip_position", "linear_speed_reported_m_per_sec",
  "linear_speed_q_m_per_sec", "delta_theta_deg", "abs_delta_theta_deg",
  "delta_linear_speed_m_per_sec", "abs_delta_linear_speed_m_per_sec",
  "rt_angle_sec", "rt_speed_sec", "cue_started_performance_ms",
  "cue_ended_performance_ms", "cue_actual_duration_ms", "motion_started_performance_ms",
  "blank_started_performance_ms", "prompt_performance_ms", "audio_context_boundary_sec",
  "actual_last_visible_frame_sec", "actual_visible_segment_frame_counts",
  "sim_frame_count", "sim_max_frame_gap_ms", "visibility_pause_count",
  "visibility_pause_sec", "timing_valid", "rod_length_m", "gravity_m_per_sec2",
  "bob_radius_m",
] as const;

function values(data: DataCollection | readonly Record<string, unknown>[]) {
  return Array.isArray(data)
    ? data.map((row) => ({ ...row }))
    : (data.values() as Record<string, unknown>[]).map((row) => ({ ...row }));
}

export function selectExperiment4V2FormalRows(
  data: DataCollection | readonly Record<string, unknown>[],
) {
  return values(data).filter((row) =>
    row.trial_type === "tracking-pendulum-v2-stimulus" &&
    row.segment_kind === "block" &&
    row.unit_type === "trackingPendulumV2Stimulus");
}

export function classifyExperiment4V2Status(
  data: DataCollection | readonly Record<string, unknown>[],
  ended: boolean,
): ExperimentStatus {
  if (!ended) return "nf";
  const indices = selectExperiment4V2FormalRows(data).map((row) =>
    Number(row.formal_trial_index));
  return indices.length === EXPERIMENT_4_V2_FORMAL_TRIALS &&
    new Set(indices).size === EXPERIMENT_4_V2_FORMAL_TRIALS ? "f" : "nf";
}

const cell = (value: unknown) => {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function experiment4V2DataFilename(subjectId: string, status: ExperimentStatus) {
  return `experiment-4_v2.0_data_subject${subjectId}_${status}.csv`;
}

export function buildExperiment4V2Csv(
  data: DataCollection | readonly Record<string, unknown>[],
  participant: Experiment4ParticipantInfo,
  status: ExperimentStatus,
): string {
  const rows = selectExperiment4V2FormalRows(data).map((row) => ({
    ...row,
    experiment_id: "experiment-4",
    protocol_version: EXPERIMENT_4_V2_PROTOCOL_VERSION,
    data_schema_version: EXPERIMENT_4_V2_DATA_SCHEMA_VERSION,
    subject_id: participant.subject_id,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
    experiment_status: status,
  }));
  return `${[
    EXPERIMENT_4_V2_CSV_COLUMNS.join(","),
    ...rows.map((row) => EXPERIMENT_4_V2_CSV_COLUMNS.map((column) => cell(row[column])).join(",")),
  ].join("\r\n")}\r\n`;
}

export function exportExperiment4V2Csv(
  data: DataCollection | readonly Record<string, unknown>[],
  participant: Experiment4ParticipantInfo,
  status: ExperimentStatus,
): void {
  triggerTextDownload(
    buildExperiment4V2Csv(data, participant, status),
    experiment4V2DataFilename(participant.subject_id, status),
    "text/csv;charset=utf-8",
  );
}
