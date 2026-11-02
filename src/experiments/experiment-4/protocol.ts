import { GRAVITY, ROD_LENGTH_M } from "../../experiment/physics/energySegments";
import { pendulumOmegaRadForEnergyAtBottom } from "../../experiment/physics/pendulum";

export const EXPERIMENT_4_ID = "experiment-4" as const;
export const EXPERIMENT_4_PROTOCOL_VERSION = "1.0.0" as const;

export const EXPERIMENT_4_ROD_LENGTH_M = ROD_LENGTH_M;
export const EXPERIMENT_4_GRAVITY = GRAVITY;
export const EXPERIMENT_4_BOB_RADIUS_M = 0.08;
export const EXPERIMENT_4_BAR_WIDTH_M = 2.2;
/** 预注册试次地平线（秒）。最后一段完全遮挡若延续到此时刻，右端点截断于此。 */
export const EXPERIMENT_4_DURATION_SEC = 10.0;
export const EXPERIMENT_4_INITIAL_CUE_MS = 2000;
/** 每个试次的机械能固定为原抽样区间 [8.48, 14.48] J 的中点。 */
export const EXPERIMENT_4_ENERGY_CENTER_J = 11.48;
/** 训练一和实验四速度色带右端使用的标定能量。 */
export const EXPERIMENT_4_SPEED_SCALE_ENERGY_J = EXPERIMENT_4_ENERGY_CENTER_J;
/** 实验五仍使用的原区间半宽。 */
export const EXPERIMENT_4_ENERGY_HALF_RANGE_J = 3;
export const EXPERIMENT_4_ENERGY_MIN_J =
  EXPERIMENT_4_ENERGY_CENTER_J - EXPERIMENT_4_ENERGY_HALF_RANGE_J;
export const EXPERIMENT_4_ENERGY_MAX_J =
  EXPERIMENT_4_ENERGY_CENTER_J + EXPERIMENT_4_ENERGY_HALF_RANGE_J;
export const EXPERIMENT_4_QUERY_MIN_SEC = 1.0;
export const EXPERIMENT_4_OCCLUSION_MARGIN_SEC = 0.15;
/** 初始相位距转折点至少一个周期的 0.5%，确保初速度严格非零。 */
export const EXPERIMENT_4_INITIAL_TURN_MARGIN_FRACTION = 0.005;

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

/** 固定左右初始位置序列（每档间隙 Block 相同）。 */
export const EXPERIMENT_4_INITIAL_SIDE_SEQUENCE: readonly ("left" | "right")[] = [
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

export type Experiment4InitialDirection = "leftward" | "rightward";

/** 原能量区间下端在最低点的角速度，供实验五兼容使用。 */
export const EXPERIMENT_4_OMEGA_MIN_RAD_PER_SEC = pendulumOmegaRadForEnergyAtBottom(
  EXPERIMENT_4_ENERGY_MIN_J,
  EXPERIMENT_4_ROD_LENGTH_M,
);
/** 实验四固定能量在最低点的最大角速度，也是速度色带右端。 */
export const EXPERIMENT_4_OMEGA_MAX_RAD_PER_SEC = pendulumOmegaRadForEnergyAtBottom(
  EXPERIMENT_4_SPEED_SCALE_ENERGY_J,
  EXPERIMENT_4_ROD_LENGTH_M,
);

export const EXPERIMENT_4_FIXATION_MS = 1000;

export type Experiment4ResponseOrder = "angle_first" | "speed_first";
export const EXPERIMENT_4_RESPONSE_ORDERS: readonly Experiment4ResponseOrder[] = [
  "angle_first",
  "speed_first",
];
