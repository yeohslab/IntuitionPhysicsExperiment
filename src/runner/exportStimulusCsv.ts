import type { DataCollection } from "jspsych";

/** 仅导出 physics-stimulus 试次（含练习段与正式 block） */
export const PHYSICS_STIMULUS_TRIAL_TYPE = "physics-stimulus";

/** 分析用 CSV 列顺序（摆球 + 弹簧并表，非本类型字段为空） */
export const STIMULUS_CSV_COLUMNS = [
  "subject_id",
  "stimulus_set_index",
  "trial_index",
  "response_mode",
  "physicsKind",
  "pendulum_E_J",
  "pendulum_T_sec",
  "pendulum_regime",
  "stimulus_time_phases_json",
  "total_time_T",
  "theta_actual_deg",
  "theta_estimated_deg",
  "delta_theta_deg",
  "abs_delta_theta_deg",
  "theta_actual_rad",
  "theta_estimated_rad",
  "delta_theta_rad",
  "abs_delta_theta_rad",
  "rt_estimate_sec",
  "arc_half_width_deg",
  "arc_span_deg",
  "w_max_deg",
  "interval_hit",
  "interval_overflow_deg",
  "arc_half_width_rad",
  "interval_overflow_rad",
  "rt_arc_sec",
  "spring_E_J",
  "spring_T_sec",
  "x_actual_m",
  "x_estimated_m",
  "delta_x_m",
  "abs_delta_x_m",
  "interval_half_width_m",
  "interval_span_m",
  "w_max_m",
  "interval_overflow_m",
  "trial_score",
  "score_max",
] as const;

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowToCsvLine(row: Record<string, unknown>, columns: readonly string[]): string {
  return columns.map((col) => escapeCsvCell(row[col])).join(",");
}

/**
 * 从 jsPsych 数据中筛出物理刺激试次，按白名单列导出并触发下载。
 */
export function exportStimulusTrialsCsv(
  data: DataCollection,
  filename = "experiment_data.csv",
): void {
  const rows = data
    .filter({ trial_type: PHYSICS_STIMULUS_TRIAL_TYPE })
    .values() as Record<string, unknown>[];

  const columns = STIMULUS_CSV_COLUMNS;
  const lines = [columns.join(","), ...rows.map((row) => rowToCsvLine(row, columns))];
  const blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
