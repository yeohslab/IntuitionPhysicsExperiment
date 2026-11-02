import type { JsPsych } from "jspsych";
import {
  TRAINING_1_ASSESSMENT_TRIALS,
  TRAINING_1_MASTERY_MEAN_THRESHOLD,
  TRAINING_1_MASTERY_REQUIRED_WITHIN,
  TRAINING_1_MASTERY_SINGLE_THRESHOLD,
} from "./protocol";

export type Training1AttemptResult = {
  attempt: number;
  passed: boolean;
  completedTrials: number;
  meanAbsError: number | null;
  withinThresholdCount: number;
};

export type Training1MasteryResult = {
  passed: boolean;
  passedAttempt: number | null;
  completedGuidedTrials: number;
  completedAssessmentTrials: number;
  finalAttempt: number;
  finalAttemptCompletedTrials: number;
  finalMeanAbsError: number | null;
  finalWithinThresholdCount: number;
  attempt1: Training1AttemptResult;
  attempt2: Training1AttemptResult;
  attempts: Training1AttemptResult[];
};

function relevantRows(rows: readonly Record<string, unknown>[]) {
  return rows.filter((row) => row.trial_type === "speed-color-training");
}

export function training1AssessmentAttemptFromCompletedTrials(
  completedTrials: number,
): number {
  return Math.floor(Math.max(0, completedTrials) / TRAINING_1_ASSESSMENT_TRIALS) + 1;
}

function evaluateAttempt(
  rows: readonly Record<string, unknown>[],
  attempt: number,
): Training1AttemptResult {
  const errors = relevantRows(rows)
    .filter((row) =>
      row.mode === "assessment" && Number(row.assessment_attempt) === attempt)
    .map((row) => Number(row.abs_delta_strip_position))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .slice(0, TRAINING_1_ASSESSMENT_TRIALS);
  const meanAbsError = errors.length === TRAINING_1_ASSESSMENT_TRIALS
    ? errors.reduce((sum, value) => sum + value, 0) / errors.length
    : null;
  const withinThresholdCount = errors.filter(
    (value) => value <= TRAINING_1_MASTERY_SINGLE_THRESHOLD,
  ).length;
  return {
    attempt,
    passed:
      meanAbsError !== null &&
      meanAbsError <= TRAINING_1_MASTERY_MEAN_THRESHOLD &&
      withinThresholdCount >= TRAINING_1_MASTERY_REQUIRED_WITHIN,
    completedTrials: errors.length,
    meanAbsError,
    withinThresholdCount,
  };
}

export function evaluateTraining1Mastery(
  rows: readonly Record<string, unknown>[],
): Training1MasteryResult {
  const attemptNumbers = relevantRows(rows)
    .filter((row) => row.mode === "assessment")
    .map((row) => Number(row.assessment_attempt))
    .filter((value) => Number.isInteger(value) && value >= 1);
  const finalAttempt = Math.max(1, ...attemptNumbers);
  const attempts = Array.from({ length: finalAttempt }, (_, index) =>
    evaluateAttempt(rows, index + 1));
  const attempt1 = attempts[0]!;
  const attempt2 = attempts[1] ?? evaluateAttempt(rows, 2);
  const final = attempts[attempts.length - 1]!;
  const passedAttempt = attempts.find((attempt) => attempt.passed)?.attempt ?? null;
  return {
    passed: passedAttempt !== null,
    passedAttempt,
    completedGuidedTrials: relevantRows(rows).filter((row) => row.mode === "guided").length,
    completedAssessmentTrials: attempts.reduce(
      (total, attempt) => total + attempt.completedTrials,
      0,
    ),
    finalAttempt,
    finalAttemptCompletedTrials: final.completedTrials,
    finalMeanAbsError: final.meanAbsError,
    finalWithinThresholdCount: final.withinThresholdCount,
    attempt1,
    attempt2,
    attempts,
  };
}

export function evaluateTraining1MasteryFromJsPsych(
  jsPsych: JsPsych,
): Training1MasteryResult {
  return evaluateTraining1Mastery(
    jsPsych.data.get().values() as Record<string, unknown>[],
  );
}

export function training1NeedsRemediation(
  rows: readonly Record<string, unknown>[],
): boolean {
  return !evaluateTraining1Mastery(rows).passed;
}
