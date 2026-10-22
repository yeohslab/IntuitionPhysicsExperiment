import type { DataCollection } from "jspsych";
import { triggerTextDownload } from "../../shared/download";
import type { Experiment4ParticipantInfo } from "../../shared/participant";
import type { ExperimentStatus } from "../../runtime/export/exportStimulusCsv";
import {
  EXPERIMENT_4_FORMAL_TRIALS,
  EXPERIMENT_4_PROTOCOL_VERSION,
} from "./protocol";

export const EXPERIMENT_4_DATA_SCHEMA_VERSION = 2 as const;
const GRATING_TRIAL_TYPE = "grating-pendulum-stimulus";

export const EXPERIMENT_4_STIMULUS_CSV_COLUMNS = [
  "experiment_id",
  "protocol_version",
  "data_schema_version",
  "subject_id",
  "gender_code",
  "age_years",
  "experiment_status",
  "trial_id",
  "unit_id",
  "segment_kind",
  "block_index",
  "trial_index_in_block",
  "formal_trial_index",
  "gap_level",
  "gap_m",
  "bar_width_m",
  "release_side",
  "theta_0_deg",
  "pendulum_E_J",
  "omega_max_rad_per_sec",
  "query_time_sec",
  "occlusion_segment_index",
  "first_visible_sec",
  "last_visible_end_before_query_sec",
  "time_since_last_visible_sec",
  "theta_q_deg",
  "omega_q_rad_per_sec",
  "abs_omega_q_rad_per_sec",
  "theta_reported_deg",
  "theta_reported_rad",
  "speed_strip_position",
  "omega_reported_rad_per_sec",
  "delta_theta_deg",
  "abs_delta_theta_deg",
  "delta_omega_rad_per_sec",
  "abs_delta_omega_rad_per_sec",
  "response_order_first",
  "rt_angle_sec",
  "rt_speed_sec",
  "rt_total_sec",
  "sim_frame_count",
  "sim_max_frame_gap_ms",
  "sim_query_overshoot_ms",
  "visible_frame_count",
  "visibility_pause_count",
  "visibility_pause_sec",
] as const;

function valuesFromData(
  data: DataCollection | readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.map((row) => ({ ...row }));
  return (data.values() as Record<string, unknown>[]).map((row) => ({ ...row }));
}

export function selectExperiment4FormalRows(
  data: DataCollection | readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return valuesFromData(data).filter(
    (row) =>
      row.trial_type === GRATING_TRIAL_TYPE &&
      row.segment_kind === "block" &&
      row.unit_type === "gratingPendulumStimulus",
  );
}

export function classifyExperiment4Status(
  data: DataCollection | readonly Record<string, unknown>[],
  timelineEndedNaturally: boolean,
): ExperimentStatus {
  if (!timelineEndedNaturally) return "nf";
  const indices = selectExperiment4FormalRows(data).map((row) =>
    Number(row.formal_trial_index),
  );
  const unique = new Set(indices);
  if (
    indices.length !== EXPERIMENT_4_FORMAL_TRIALS ||
    unique.size !== EXPERIMENT_4_FORMAL_TRIALS
  ) {
    return "nf";
  }
  for (let index = 1; index <= EXPERIMENT_4_FORMAL_TRIALS; index++) {
    if (!unique.has(index)) return "nf";
  }
  return "f";
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function experiment4DataFilename(
  subjectId: string,
  status: ExperimentStatus,
): string {
  return `experiment-4_v1.0_data_subject${subjectId}_${status}.csv`;
}

export function buildExperiment4StimulusTrialsCsv(
  data: DataCollection | readonly Record<string, unknown>[],
  participant: Experiment4ParticipantInfo,
  status: ExperimentStatus,
): string {
  const rows: Record<string, unknown>[] = selectExperiment4FormalRows(data).map(
    (row) => ({
      ...row,
      experiment_id: "experiment-4",
      protocol_version: EXPERIMENT_4_PROTOCOL_VERSION,
      data_schema_version: EXPERIMENT_4_DATA_SCHEMA_VERSION,
      subject_id: participant.subject_id,
      gender_code: participant.gender_code,
      age_years: participant.age_years,
      experiment_status: status,
    }),
  );
  return `${[
    EXPERIMENT_4_STIMULUS_CSV_COLUMNS.join(","),
    ...rows.map((row) =>
      EXPERIMENT_4_STIMULUS_CSV_COLUMNS.map((column) =>
        escapeCsvCell(row[column]),
      ).join(","),
    ),
  ].join("\r\n")}\r\n`;
}

export function exportExperiment4StimulusTrialsCsv(
  data: DataCollection | readonly Record<string, unknown>[],
  participant: Experiment4ParticipantInfo,
  status: ExperimentStatus,
): void {
  triggerTextDownload(
    buildExperiment4StimulusTrialsCsv(data, participant, status),
    experiment4DataFilename(participant.subject_id, status),
    "text/csv;charset=utf-8",
  );
}
