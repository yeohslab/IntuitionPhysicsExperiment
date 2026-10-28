import type { DataCollection } from "jspsych";
import { triggerTextDownload } from "../../shared/download";
import type { Experiment5ParticipantInfo } from "../../shared/participant";
import type { ExperimentStatus } from "../../runtime/export/exportStimulusCsv";
import { EXPERIMENT_5_FORMAL_TRIALS, EXPERIMENT_5_PROTOCOL_VERSION } from "./protocol";

export const EXPERIMENT_5_DATA_SCHEMA_VERSION = 1 as const;
export const EXPERIMENT_5_CSV_COLUMNS = [
  "experiment_id","protocol_version","data_schema_version","subject_id","gender_code","age_years","experiment_status",
  "trial_id","unit_id","segment_kind","block_index","trial_index_in_block","formal_trial_index",
  "energy_J","amplitude_deg","target_angle_deg","boundary_gap_deg","judgment_distance_m","judgment_time_sec","tau_sec",
  "theta_0_deg","omega_0_deg_per_sec","disappearance_theta_deg","disappearance_omega_deg_per_sec",
  "visible_duration_sec","response_deadline_sec","side","reachability","correct_response","yes_key","no_key",
  "response_judgment","response_key","correct","rt_sec","timed_out","boundary_performance_ms","response_start_performance_ms",
  "audio_context_boundary_sec","sim_frame_count","sim_max_frame_gap_ms","sim_boundary_overshoot_ms",
  "visibility_pause_count","visibility_pause_sec","timing_valid","rod_length_m","gravity_m_per_sec2","bob_radius_m",
] as const;

function values(data: DataCollection | readonly Record<string, unknown>[]) {
  return Array.isArray(data) ? data.map((x) => ({ ...x })) : (data.values() as Record<string, unknown>[]).map((x) => ({ ...x }));
}
export function selectExperiment5FormalRows(data: DataCollection | readonly Record<string, unknown>[]) {
  return values(data).filter((x) => x.trial_type === "reachability-pendulum-stimulus" && x.segment_kind === "block" && x.unit_type === "reachabilityPendulumStimulus");
}
export function classifyExperiment5Status(data: DataCollection | readonly Record<string, unknown>[], ended: boolean): ExperimentStatus {
  if (!ended) return "nf";
  const indices = selectExperiment5FormalRows(data).map((x) => Number(x.formal_trial_index));
  return indices.length === EXPERIMENT_5_FORMAL_TRIALS && new Set(indices).size === EXPERIMENT_5_FORMAL_TRIALS ? "f" : "nf";
}
const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function experiment5DataFilename(subjectId: string, status: ExperimentStatus) { return `experiment-5_v1.0_data_subject${subjectId}_${status}.csv`; }
export function buildExperiment5Csv(data: DataCollection | readonly Record<string, unknown>[], participant: Experiment5ParticipantInfo, status: ExperimentStatus): string {
  const rows = selectExperiment5FormalRows(data).map((x) => ({ ...x, experiment_id: "experiment-5", protocol_version: EXPERIMENT_5_PROTOCOL_VERSION, data_schema_version: EXPERIMENT_5_DATA_SCHEMA_VERSION, subject_id: participant.subject_id, gender_code: participant.gender_code, age_years: participant.age_years, experiment_status: status }));
  return `${[EXPERIMENT_5_CSV_COLUMNS.join(","), ...rows.map((r) => EXPERIMENT_5_CSV_COLUMNS.map((c) => cell(r[c])).join(","))].join("\r\n")}\r\n`;
}
export function exportExperiment5Csv(data: DataCollection | readonly Record<string, unknown>[], participant: Experiment5ParticipantInfo, status: ExperimentStatus): void {
  triggerTextDownload(buildExperiment5Csv(data, participant, status), experiment5DataFilename(participant.subject_id, status), "text/csv;charset=utf-8");
}
