import {
  EXPERIMENT_4_BOB_RADIUS_M,
  EXPERIMENT_4_ENERGY_MAX_J,
  EXPERIMENT_4_ENERGY_MIN_J,
  EXPERIMENT_4_GRAVITY,
  EXPERIMENT_4_ROD_LENGTH_M,
} from "../experiment-4/protocol";

export const EXPERIMENT_5_ID = "experiment-5" as const;
export const EXPERIMENT_5_PROTOCOL_VERSION = "1.0.0" as const;
export const EXPERIMENT_5_ROD_LENGTH_M = EXPERIMENT_4_ROD_LENGTH_M;
export const EXPERIMENT_5_GRAVITY = EXPERIMENT_4_GRAVITY;
export const EXPERIMENT_5_BOB_RADIUS_M = EXPERIMENT_4_BOB_RADIUS_M;
export const EXPERIMENT_5_ENERGY_MIN_J = EXPERIMENT_4_ENERGY_MIN_J;
export const EXPERIMENT_5_ENERGY_MAX_J = EXPERIMENT_4_ENERGY_MAX_J;
export const EXPERIMENT_5_VISIBLE_DURATION_SEC = 0.4;
export const EXPERIMENT_5_RESPONSE_DEADLINE_SEC = 4;
export const EXPERIMENT_5_FIXATION_MS = 1000;
export const EXPERIMENT_5_FIXATION_TEXT = "+";
export const EXPERIMENT_5_BOUNDARY_GAPS_DEG = [2, 4, 6] as const;
export const EXPERIMENT_5_JUDGMENT_DISTANCES_M = [0.15, 0.3, 0.45, 0.6] as const;
export const EXPERIMENT_5_FORMAL_BLOCKS = 4;
export const EXPERIMENT_5_FORMAL_TRIALS_PER_BLOCK = 12;
export const EXPERIMENT_5_FORMAL_TRIALS = 48;
export const EXPERIMENT_5_PRACTICE_TRIALS = 6;
export const EXPERIMENT_5_TOTAL_RUNTIME_TRIALS = 54;

export type Experiment5BoundaryGapDeg = typeof EXPERIMENT_5_BOUNDARY_GAPS_DEG[number];
export type Experiment5JudgmentDistanceM = typeof EXPERIMENT_5_JUDGMENT_DISTANCES_M[number];

export function experiment5KeyMapping(subjectId: string): {
  yesKey: "f" | "j";
  noKey: "f" | "j";
} {
  const number = Number(subjectId.slice(3));
  return number % 2 === 1
    ? { yesKey: "f", noKey: "j" }
    : { yesKey: "j", noKey: "f" };
}
