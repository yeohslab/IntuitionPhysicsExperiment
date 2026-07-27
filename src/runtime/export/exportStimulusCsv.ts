import type { DataCollection } from "jspsych";
import type { ParticipantInfo } from "../../shared/participant";
import { triggerTextDownload } from "../../shared/download";

export const DATA_SCHEMA_VERSION = 2 as const;
export const PHYSICS_STIMULUS_TRIAL_TYPE = "physics-stimulus";
export type ExperimentStatus = "f" | "nf";

export const STIMULUS_CSV_COLUMNS = [
  "data_schema_version",
  "subject_id",
  "motion_group",
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

export function experimentDataFilename(
  subjectId: string,
  status: ExperimentStatus,
): string {
  const id = subjectId.trim();
  if (!id) return `experiment_data_${status}.csv`;
  return `experiment_data_subject${id}_${status}.csv`;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const serialized = String(value);
  if (/[",\r\n]/.test(serialized)) {
    return `"${serialized.replace(/"/g, '""')}"`;
  }
  return serialized;
}

function rowToCsvLine(
  row: Record<string, unknown>,
  columns: readonly string[],
): string {
  return columns.map((column) => escapeCsvCell(row[column])).join(",");
}

function valuesFromData(
  data: DataCollection | readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.map((row) => ({ ...row }));
  return (data.values() as Record<string, unknown>[]).map((row) => ({ ...row }));
}

export function selectFormalStimulusRows(
  data: DataCollection | readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return valuesFromData(data).filter(
    (row) =>
      row.trial_type === PHYSICS_STIMULUS_TRIAL_TYPE &&
      row.segment_kind === "block" &&
      row.unit_type === "pendulumStimulus",
  );
}

/** 只有时间线自然结束且 1–135 号正式响应各恰有一条时才视为完成。 */
export function classifyExperimentStatus(
  data: DataCollection | readonly Record<string, unknown>[],
  timelineEndedNaturally: boolean,
): ExperimentStatus {
  if (!timelineEndedNaturally) return "nf";
  const indices = selectFormalStimulusRows(data).map((row) =>
    Number(row.formal_trial_index),
  );
  const unique = new Set(indices);
  if (indices.length !== 135 || unique.size !== 135) return "nf";
  for (let index = 1; index <= 135; index++) {
    if (!unique.has(index)) return "nf";
  }
  return "f";
}

export function buildStimulusTrialsCsv(
  data: DataCollection | readonly Record<string, unknown>[],
  participant: ParticipantInfo,
  status: ExperimentStatus,
): string {
  const rows = selectFormalStimulusRows(data).map((row) => ({
    ...row,
    data_schema_version: DATA_SCHEMA_VERSION,
    subject_id: participant.subject_id,
    motion_group: participant.motion_group,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
    experiment_status: status,
  }));
  const lines = [
    STIMULUS_CSV_COLUMNS.join(","),
    ...rows.map((row) => rowToCsvLine(row, STIMULUS_CSV_COLUMNS)),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function exportStimulusTrialsCsv(
  data: DataCollection | readonly Record<string, unknown>[],
  participant: ParticipantInfo,
  status: ExperimentStatus,
): void {
  triggerTextDownload(
    buildStimulusTrialsCsv(data, participant, status),
    experimentDataFilename(participant.subject_id, status),
    "text/csv;charset=utf-8",
  );
}
