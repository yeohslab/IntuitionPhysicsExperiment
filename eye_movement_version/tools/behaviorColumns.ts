import { EXPERIMENT_2_STIMULUS_CSV_COLUMNS } from "../../src/experiments/experiment-2/exportStimulusCsv";
import { EXPERIMENT_4_V2_CSV_COLUMNS } from "../../src/experiments/experiment-4-v2/exportStimulusCsv";
import { EXPERIMENT_5_V3_CSV_COLUMNS } from "../../src/experiments/experiment-5-v3/exportStimulusCsv";
import { TRAINING_1_CSV_COLUMNS } from "../../src/experiments/training-1/exportStimulusCsv";

/** Columns added by the headless/session export for response reconstruction. */
export const BEHAVIOR_COLUMNS = [
  "response_judgment",
  "response_key",
  "correct",
  "rt_sec",
  "timed_out",
] as const;

export type BehaviorColumn = (typeof BEHAVIOR_COLUMNS)[number];

const BASE_COLUMNS: Record<string, readonly string[]> = {
  "training-1": TRAINING_1_CSV_COLUMNS,
  "experiment-2": EXPERIMENT_2_STIMULUS_CSV_COLUMNS,
  "experiment-4-v2": EXPERIMENT_4_V2_CSV_COLUMNS,
  "experiment-5-v3": EXPERIMENT_5_V3_CSV_COLUMNS,
};

/**
 * Returns the original runtime CSV column order followed by the stable response
 * columns used by the offline runner.
 */
export function behaviorColumnsForVariant(runtimeVariantId: string): string[] {
  const base = BASE_COLUMNS[runtimeVariantId] ?? [];
  return [...base, ...BEHAVIOR_COLUMNS.filter((column) => !base.includes(column))];
}

/** Adds response fields to descriptor rows while preserving unknown values as blank. */
export function behaviorRow(
  descriptor: Record<string, unknown>,
  response: Partial<Record<BehaviorColumn, unknown>> = {},
): Record<string, unknown> {
  return {
    ...descriptor,
    response_judgment: response.response_judgment ?? descriptor.response_judgment ?? "",
    response_key: response.response_key ?? descriptor.response_key ?? "",
    correct: response.correct ?? descriptor.correct ?? "",
    rt_sec: response.rt_sec ?? descriptor.rt_sec ?? "",
    timed_out: response.timed_out ?? descriptor.timed_out ?? "",
  };
}

export function behaviorCsv(
  runtimeVariantId: string,
  rows: readonly Record<string, unknown>[],
): string {
  const columns = behaviorColumnsForVariant(runtimeVariantId);
  const cell = (value: unknown): string => {
    if (value === undefined || value === null || value === "") return "";
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${[
    columns.join(","),
    ...rows.map((row) => columns.map((column) => cell(row[column])).join(",")),
  ].join("\r\n")}\r\n`;
}

