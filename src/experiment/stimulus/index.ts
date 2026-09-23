/**
 * 实验一刺激生成的向后兼容入口。
 * 新代码应从 src/experiments/experiment-1 导入。
 */
export { generateRuntimeStimulusSet, assertRuntimeStimulusSet, allTimingCombos } from "./generateRuntimeSet";
export type { GenerateRuntimeSetOptions, TimingCombo } from "./generateRuntimeSet";
export { generateRuntimeStimulusSetAsync } from "./generateRuntimeSetAsync";
export type { GenerateRuntimeSetAsyncOptions } from "./generateRuntimeSetAsync";
export { cryptoRandom } from "./cryptoRandom";
