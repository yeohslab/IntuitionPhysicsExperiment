import type { JsPsych } from "jspsych";
import {
  TRAINING_1_BLOCK_SIZE,
  TRAINING_1_MASTERY_MEAN_THRESHOLD,
  TRAINING_1_MASTERY_REQUIRED_WITHIN,
  TRAINING_1_MASTERY_SINGLE_THRESHOLD,
  TRAINING_1_MIN_REPORT_TRIALS,
} from "./protocol";

export type Training1MasteryResult = {
  passed: boolean;
  completedReportTrials: number;
  recentCount: number;
  recentMeanAbsError: number | null;
  recentWithinThresholdCount: number;
};

export function evaluateTraining1Mastery(
  rows: readonly Record<string, unknown>[],
): Training1MasteryResult {
  const errors = rows
    .filter(
      (row) =>
        row.trial_type === "speed-color-training" && row.mode === "report",
    )
    .map((row) => Number(row.abs_delta_strip_position))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const recent = errors.slice(-TRAINING_1_BLOCK_SIZE);
  const recentMeanAbsError =
    recent.length === TRAINING_1_BLOCK_SIZE
      ? recent.reduce((sum, value) => sum + value, 0) / recent.length
      : null;
  const recentWithinThresholdCount = recent.filter(
    (value) => value <= TRAINING_1_MASTERY_SINGLE_THRESHOLD,
  ).length;
  return {
    passed:
      errors.length >= TRAINING_1_MIN_REPORT_TRIALS &&
      recentMeanAbsError !== null &&
      recentMeanAbsError <= TRAINING_1_MASTERY_MEAN_THRESHOLD &&
      recentWithinThresholdCount >= TRAINING_1_MASTERY_REQUIRED_WITHIN,
    completedReportTrials: errors.length,
    recentCount: recent.length,
    recentMeanAbsError,
    recentWithinThresholdCount,
  };
}

export function evaluateTraining1MasteryFromJsPsych(
  jsPsych: JsPsych,
): Training1MasteryResult {
  return evaluateTraining1Mastery(
    jsPsych.data.get().values() as Record<string, unknown>[],
  );
}
