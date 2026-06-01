import type { DataCollection } from "jspsych";

/** 仅导出 physics-stimulus 试次（含练习段与正式 block） */
export const PHYSICS_STIMULUS_TRIAL_TYPE = "physics-stimulus";

/** 分析用 CSV 列顺序（摆球点估计；仅导出下列字段） */
export const STIMULUS_CSV_COLUMNS = [
  "subject_id",
  "unit_type",
  "segment_kind",
  "physicsKind",
  "pendulum_E_J",
  "pendulum_T_sec",
  "pendulum_regime",
  "total_time_T",
  "w_max_deg",
  "theta_actual_deg",
  "theta_estimated_deg",
  "delta_theta_deg",
  "abs_delta_theta_deg",
  "theta_actual_rad",
  "theta_estimated_rad",
  "delta_theta_rad",
  "abs_delta_theta_rad",
  "rt_estimate_sec",
] as const;

/** 实验结束下载文件名；无被试编号时回退通用名 */
export function experimentDataFilename(subjectId: string): string {
  const id = subjectId.trim();
  if (!id) return "experiment_data.csv";
  return `experiment_data_subject${id}.csv`;
}

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
  filename = experimentDataFilename(""),
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
