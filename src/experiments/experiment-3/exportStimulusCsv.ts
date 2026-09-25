import type { DataCollection } from "jspsych";
import { triggerTextDownload } from "../../shared/download";
import type { Experiment3ParticipantInfo } from "../../shared/participant";
import type { ExperimentStatus } from "../../runtime/export/exportStimulusCsv";
import {
  EXPERIMENT_3_FORMAL_TRIALS,
  EXPERIMENT_3_PROTOCOL_VERSION,
} from "./protocol";

export const EXPERIMENT_3_DATA_SCHEMA_VERSION = 1 as const;
const PHYSICS_STIMULUS_TRIAL_TYPE = "physics-stimulus";

export const EXPERIMENT_3_STIMULUS_CSV_COLUMNS = [
  "experiment_id",
  "protocol_version",
  "data_schema_version",
  "subject_id",
  "gender_code",
  "age_years",
  "experiment_status",
  "trial_id",
  "unit_id",
  "unit_type",
  "segment_kind",
  "block_index",
  "trial_index_in_block",
  "formal_trial_index",
  "physics_kind",
  "motion_condition",
  "pendulum_E_J",
  "pendulum_T_sec",
  "pendulum_regime",
  "rod_length_m",
  "gravity_m_per_sec2",
  "total_time_T",
  "show_T",
  "fade_T",
  "hide_T",
  "total_time_sec",
  "show_sec",
  "fade_sec",
  "hide_sec",
  "hide_has_turning",
  "hide_turn_count",
  "hide_first_turn_sec",
  "hide_first_turn_fraction",
  "speed_cue_type",
  "speed_bar_v_min_m_per_sec",
  "speed_bar_v_max_m_per_sec",
  "w_max_deg",
  "theta_x_0_deg",
  "theta_x_0_rad",
  "omega_x_0_deg_per_sec",
  "omega_x_0_rad_per_sec",
  "linear_speed_x_0_m_per_sec",
  "theta_x_t_deg",
  "theta_x_t_rad",
  "omega_x_t_deg_per_sec",
  "omega_x_t_rad_per_sec",
  "linear_speed_x_t_m_per_sec",
  "theta_estimated_deg",
  "theta_estimated_rad",
  "delta_theta_deg",
  "delta_theta_rad",
  "abs_delta_theta_deg",
  "abs_delta_theta_rad",
  "rt_estimate_sec",
  "sim_frame_count",
  "sim_max_frame_gap_ms",
  "sim_end_overshoot_ms",
  "sim_elapsed_actual_sec",
  "visibility_pause_count",
  "visibility_pause_sec",
] as const;

function valuesFromData(
  data: DataCollection | readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.map((row) => ({ ...row }));
  return (data.values() as Record<string, unknown>[]).map((row) => ({ ...row }));
}

export function selectExperiment3FormalRows(
  data: DataCollection | readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return valuesFromData(data).filter(
    (row) =>
      row.trial_type === PHYSICS_STIMULUS_TRIAL_TYPE &&
      row.segment_kind === "block" &&
      row.unit_type === "pendulumStimulus",
  );
}

export function classifyExperiment3Status(
  data: DataCollection | readonly Record<string, unknown>[],
  timelineEndedNaturally: boolean,
): ExperimentStatus {
  if (!timelineEndedNaturally) return "nf";
  const indices = selectExperiment3FormalRows(data).map((row) =>
    Number(row.formal_trial_index),
  );
  const unique = new Set(indices);
  if (
    indices.length !== EXPERIMENT_3_FORMAL_TRIALS ||
    unique.size !== EXPERIMENT_3_FORMAL_TRIALS
  ) {
    return "nf";
  }
  for (let index = 1; index <= EXPERIMENT_3_FORMAL_TRIALS; index++) {
    if (!unique.has(index)) return "nf";
  }
  return "f";
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function experiment3DataFilename(
  subjectId: string,
  status: ExperimentStatus,
): string {
  return `experiment-3_data_subject${subjectId}_${status}.csv`;
}

export function buildExperiment3StimulusTrialsCsv(
  data: DataCollection | readonly Record<string, unknown>[],
  participant: Experiment3ParticipantInfo,
  status: ExperimentStatus,
): string {
  const rows: Record<string, unknown>[] = selectExperiment3FormalRows(data).map((row) => ({
    ...row,
    experiment_id: "experiment-3",
    protocol_version: EXPERIMENT_3_PROTOCOL_VERSION,
    data_schema_version: EXPERIMENT_3_DATA_SCHEMA_VERSION,
    subject_id: participant.subject_id,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
    experiment_status: status,
  }));
  return `${[
    EXPERIMENT_3_STIMULUS_CSV_COLUMNS.join(","),
    ...rows.map((row) =>
      EXPERIMENT_3_STIMULUS_CSV_COLUMNS.map((column) =>
        escapeCsvCell(row[column]),
      ).join(","),
    ),
  ].join("\r\n")}\r\n`;
}

export function exportExperiment3StimulusTrialsCsv(
  data: DataCollection | readonly Record<string, unknown>[],
  participant: Experiment3ParticipantInfo,
  status: ExperimentStatus,
): void {
  triggerTextDownload(
    buildExperiment3StimulusTrialsCsv(data, participant, status),
    experiment3DataFilename(participant.subject_id, status),
    "text/csv;charset=utf-8",
  );
}
