import {
  PENDULUM_MASS_KG,
  pendulumOmegaRadForEnergyAtBottom,
} from "../../experiment/physics/pendulum";
import {
  EXPERIMENT_4_GRAVITY,
  EXPERIMENT_4_ROD_LENGTH_M,
} from "../experiment-4/protocol";

export const TRAINING_1_ID = "training-1" as const;
export const TRAINING_1_PROTOCOL_VERSION = "1.0.0" as const;

/** 色带右端对应从此角度静止释放后，摆球在最低点的速度。 */
export const TRAINING_1_SPEED_SCALE_RELEASE_ANGLE_DEG = 60;

/**
 * cos(60°)=1/2，能量取确定值，不用 Math.cos。
 * E = m g L (1 − 1/2) = 19.6 J。
 */
export const TRAINING_1_SPEED_SCALE_ENERGY_J =
  PENDULUM_MASS_KG *
  EXPERIMENT_4_GRAVITY *
  EXPERIMENT_4_ROD_LENGTH_M *
  (1 - 1 / 2);

export const TRAINING_1_OMEGA_SCALE_RAD_PER_SEC = pendulumOmegaRadForEnergyAtBottom(
  TRAINING_1_SPEED_SCALE_ENERGY_J,
  EXPERIMENT_4_ROD_LENGTH_M,
);

export const TRAINING_1_LINEAR_SPEED_SCALE_M_PER_SEC =
  EXPERIMENT_4_ROD_LENGTH_M * TRAINING_1_OMEGA_SCALE_RAD_PER_SEC;

export const TRAINING_1_FIXATION_MS = 1000;
export const TRAINING_1_FIXATION_TEXT = "+";
export const TRAINING_1_REPORT_DELAY_SEC = 4;
export const TRAINING_1_TRACK_HALF_SPAN_M = EXPERIMENT_4_ROD_LENGTH_M;
export const TRAINING_1_FEEDBACK_HOLD_MS = 2000;

export const TRAINING_1_MASTERY_MEAN_THRESHOLD = 0.15;
export const TRAINING_1_MASTERY_SINGLE_THRESHOLD = 0.25;
export const TRAINING_1_MASTERY_REQUIRED_WITHIN = 5;
export const TRAINING_1_ASSESSMENT_TRIALS = 6;

export const TRAINING_1_SPEED_BIN_COUNT = 8;
export const TRAINING_1_GUIDED_ROUNDS = 3;
export const TRAINING_1_GUIDED_TRIALS =
  TRAINING_1_GUIDED_ROUNDS * TRAINING_1_SPEED_BIN_COUNT;
export const TRAINING_1_REMEDIATION_TRIALS = TRAINING_1_SPEED_BIN_COUNT;
export const TRAINING_1_TOTAL_RUNTIME_TRIALS =
  TRAINING_1_GUIDED_TRIALS +
  TRAINING_1_ASSESSMENT_TRIALS +
  TRAINING_1_REMEDIATION_TRIALS +
  TRAINING_1_ASSESSMENT_TRIALS;

/** 有反馈练习三轮包在这条时间线里，便于一次跳过整个阶段。 */
export const TRAINING_1_FEEDBACK_PHASE_TIMELINE = "training-1-feedback-phase";

export const TRAINING_1_SEGMENT_IDS = {
  guided1: "training-1-guided-1",
  guided2: "training-1-guided-2",
  guided3: "training-1-guided-3",
  assessment1: "training-1-assessment-1",
  remediationIntro: "training-1-remediation-intro",
  remediation: "training-1-remediation",
  assessment2Intro: "training-1-assessment-2-intro",
  assessment2: "training-1-assessment-2",
} as const;
