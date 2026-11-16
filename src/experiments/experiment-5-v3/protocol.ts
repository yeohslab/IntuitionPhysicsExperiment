import {
  PROTOCOL_2_BOB_RADIUS_M,
  PROTOCOL_2_GRAVITY,
  PROTOCOL_2_MODEL_DT_SEC,
  PROTOCOL_2_ROD_LENGTH_M,
} from "../protocol-2/common";

export const EXPERIMENT_5_V3_ID = "experiment-5-v3" as const;
export const EXPERIMENT_5_V3_LOGICAL_ID = "experiment-5" as const;
export const EXPERIMENT_5_V3_PROTOCOL_VERSION = "3.0.0" as const;
export const EXPERIMENT_5_V3_AMPLITUDES_DEG = [75, 65, 55] as const;
const LOWER_AMPLITUDES = [...EXPERIMENT_5_V3_AMPLITUDES_DEG].sort((a, b) => a - b);
export const EXPERIMENT_5_V3_PRACTICE_AMPLITUDE_DEG =
  (LOWER_AMPLITUDES[0]! + LOWER_AMPLITUDES[1]!) / 2;
export const EXPERIMENT_5_V3_BELL_ANGLE_STEP_DEG = 3;
export const EXPERIMENT_5_V3_BELL_ANGLE_LEVELS = [3, 2, 1, -1, -2, -3] as const;
export const EXPERIMENT_5_V3_BELL_ANGLE_OFFSETS_DEG = EXPERIMENT_5_V3_BELL_ANGLE_LEVELS.map(
  (level) => level * EXPERIMENT_5_V3_BELL_ANGLE_STEP_DEG,
);
export const EXPERIMENT_5_V3_LOWEST_BELL_OFFSET_DEG = Math.min(
  ...EXPERIMENT_5_V3_BELL_ANGLE_OFFSETS_DEG,
);
/**
 * 0.2 秒全空白结束于铃铛侧最低询问角。淡出仍是这之前的 0.3 s。
 * 比原来的 0.1 秒空白多出的 0.1 s 从可见阶段末尾倒退，不缩短淡出。
 * 空白此后延续到该侧最高点。
 */
export const EXPERIMENT_5_V3_BLANK_BEFORE_LOWEST_BELL_SEC = 0.2;
export const EXPERIMENT_5_V3_ROD_LENGTH_M = PROTOCOL_2_ROD_LENGTH_M;
export const EXPERIMENT_5_V3_GRAVITY = PROTOCOL_2_GRAVITY;
export const EXPERIMENT_5_V3_BOB_RADIUS_M = PROTOCOL_2_BOB_RADIUS_M;
/** 整幅只留这一条竖直透光带，宽度与协议 2.0 的透明间隙相同。 */
export const EXPERIMENT_5_V3_SLIT_WIDTH_M = 0.45;
export const EXPERIMENT_5_V3_MODEL_DT_SEC = PROTOCOL_2_MODEL_DT_SEC;
export const EXPERIMENT_5_V3_CUE_MS = 1000;
export const EXPERIMENT_5_V3_FIXATION_TEXT = "+";
export const EXPERIMENT_5_V3_FIXATION_MS = 500;
export const EXPERIMENT_5_V3_APPROACH_SIDES = ["left", "right"] as const;
/**
 * 正式阶段分成三段，只用来控制连续任务量并让被试休息。
 * 段数与振幅档数相同，因此每种振幅可以均分到每一段；段本身不是振幅条件。
 */
export const EXPERIMENT_5_V3_FORMAL_BLOCKS = EXPERIMENT_5_V3_AMPLITUDES_DEG.length;
/** 每种振幅的单侧试次数。段数等于振幅档数时，每个休息段的单侧试次数也是这个数。 */
export const EXPERIMENT_5_V3_FORMAL_TRIALS_PER_SIDE =
  EXPERIMENT_5_V3_BELL_ANGLE_OFFSETS_DEG.length;
export const EXPERIMENT_5_V3_FORMAL_TRIALS_PER_BLOCK =
  EXPERIMENT_5_V3_APPROACH_SIDES.length * EXPERIMENT_5_V3_FORMAL_TRIALS_PER_SIDE;
export const EXPERIMENT_5_V3_FORMAL_TRIALS =
  EXPERIMENT_5_V3_FORMAL_BLOCKS * EXPERIMENT_5_V3_FORMAL_TRIALS_PER_BLOCK;
export const EXPERIMENT_5_V3_PRACTICE_TRIALS = 4;
export const EXPERIMENT_5_V3_TOTAL_RUNTIME_TRIALS =
  EXPERIMENT_5_V3_FORMAL_TRIALS + EXPERIMENT_5_V3_PRACTICE_TRIALS;
export const EXPERIMENT_5_V3_YES_KEY = "f" as const;
export const EXPERIMENT_5_V3_NO_KEY = "j" as const;
