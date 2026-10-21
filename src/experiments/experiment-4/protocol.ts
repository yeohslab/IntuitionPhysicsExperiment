import { GRAVITY, ROD_LENGTH_M } from "../../experiment/physics/energySegments";
import { pendulumOmegaRadForEnergyAtBottom } from "../../experiment/physics/pendulum";

export const EXPERIMENT_4_ID = "experiment-4" as const;
export const EXPERIMENT_4_PROTOCOL_VERSION = "1.0.0" as const;

export const EXPERIMENT_4_ROD_LENGTH_M = ROD_LENGTH_M;
export const EXPERIMENT_4_GRAVITY = GRAVITY;
export const EXPERIMENT_4_BOB_RADIUS_M = 0.08;
export const EXPERIMENT_4_BAR_WIDTH_M = 2.2;
/** 预注册试次地平线（秒）。最后一段完全遮挡若延续到此时刻，右端点截断于此。 */
export const EXPERIMENT_4_DURATION_SEC = 8.0;
export const EXPERIMENT_4_RELEASE_CUE_MS = 2000;
export const EXPERIMENT_4_ENERGY_J = GRAVITY * ROD_LENGTH_M; // Ē=1
export const EXPERIMENT_4_QUERY_MIN_SEC = 1.0;
export const EXPERIMENT_4_OCCLUSION_MARGIN_SEC = 0.15;

export const EXPERIMENT_4_GAP_LEVELS = {
  small: 0.45,
  medium: 0.9,
  large: 1.35,
} as const;

export type Experiment4GapLevel = keyof typeof EXPERIMENT_4_GAP_LEVELS;

export const EXPERIMENT_4_GAP_LEVEL_ORDER: Experiment4GapLevel[] = [
  "small",
  "medium",
  "large",
];

export const EXPERIMENT_4_FORMAL_TRIALS_PER_BLOCK = 20;
export const EXPERIMENT_4_FORMAL_BLOCKS = EXPERIMENT_4_GAP_LEVEL_ORDER.length;
export const EXPERIMENT_4_FORMAL_TRIALS =
  EXPERIMENT_4_FORMAL_BLOCKS * EXPERIMENT_4_FORMAL_TRIALS_PER_BLOCK;
export const EXPERIMENT_4_PRACTICE_TRIALS = 3;

export const EXPERIMENT_4_TOTAL_RUNTIME_TRIALS =
  EXPERIMENT_4_PRACTICE_TRIALS + EXPERIMENT_4_FORMAL_TRIALS;

/** 固定左右释放序列（每档间隙 Block 相同） */
export const EXPERIMENT_4_RELEASE_SIDE_SEQUENCE: readonly ("left" | "right")[] = [
  "left",
  "left",
  "left",
  "right",
  "left",
  "right",
  "right",
  "left",
  "right",
  "right",
  "left",
  "right",
  "right",
  "left",
  "right",
  "right",
  "left",
  "right",
  "left",
  "left",
];

export const EXPERIMENT_4_OMEGA_MAX_RAD_PER_SEC = pendulumOmegaRadForEnergyAtBottom(
  EXPERIMENT_4_ENERGY_J,
  EXPERIMENT_4_ROD_LENGTH_M,
);

export const EXPERIMENT_4_FIXATION_MS = 1000;
