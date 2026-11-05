import {
  PROTOCOL_2_BLANK_DURATION_SEC,
  PROTOCOL_2_BOB_RADIUS_M,
  PROTOCOL_2_GRATING_CONDITIONS,
  PROTOCOL_2_GRATING_ORDER,
  PROTOCOL_2_GRAVITY,
  PROTOCOL_2_MODEL_DT_SEC,
  PROTOCOL_2_ROD_LENGTH_M,
} from "../protocol-2/common";

export const EXPERIMENT_5_V2_ID = "experiment-5-v2" as const;
export const EXPERIMENT_5_V2_LOGICAL_ID = "experiment-5" as const;
export const EXPERIMENT_5_V2_PROTOCOL_VERSION = "2.0.0" as const;
export const EXPERIMENT_5_V2_AMPLITUDES_DEG = [40, 60, 80] as const;
export const EXPERIMENT_5_V2_PRACTICE_AMPLITUDE_DEG = 50;
export const EXPERIMENT_5_V2_DELTA_H_M = [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5] as const;
export const EXPERIMENT_5_V2_ROD_LENGTH_M = PROTOCOL_2_ROD_LENGTH_M;
export const EXPERIMENT_5_V2_GRAVITY = PROTOCOL_2_GRAVITY;
export const EXPERIMENT_5_V2_BOB_RADIUS_M = PROTOCOL_2_BOB_RADIUS_M;
export const EXPERIMENT_5_V2_BLANK_DURATION_SEC = PROTOCOL_2_BLANK_DURATION_SEC;
export const EXPERIMENT_5_V2_MODEL_DT_SEC = PROTOCOL_2_MODEL_DT_SEC;
export const EXPERIMENT_5_V2_GRATINGS = PROTOCOL_2_GRATING_CONDITIONS;
export const EXPERIMENT_5_V2_GRATING_ORDER = PROTOCOL_2_GRATING_ORDER;
export const EXPERIMENT_5_V2_FORMAL_BLOCKS = 3;
export const EXPERIMENT_5_V2_FORMAL_TRIALS_PER_BLOCK = 36;
export const EXPERIMENT_5_V2_FORMAL_TRIALS = 108;
export const EXPERIMENT_5_V2_PRACTICE_TRIALS = 6;
export const EXPERIMENT_5_V2_TOTAL_RUNTIME_TRIALS = 114;

export function experiment5V2KeyMapping(subjectId: string): {
  yesKey: "f" | "j";
  noKey: "f" | "j";
} {
  const value = Number(subjectId.slice(3));
  return value % 2 === 1
    ? { yesKey: "f", noKey: "j" }
    : { yesKey: "j", noKey: "f" };
}
