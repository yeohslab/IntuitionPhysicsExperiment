/** 实验一稳定协议入口；旧路径保留给仓库内部兼容。 */
export {
  allTimingCombos,
  assertRuntimeStimulusSet,
  generateRuntimeStimulusSet,
  TOTAL_RUNTIME_TRIALS,
} from "./generateRuntimeSet";
export { generateRuntimeStimulusSetAsync } from "./generateRuntimeSetAsync";
export type {
  GenerateRuntimeSetOptions,
  TimingCombo,
} from "./generateRuntimeSet";
