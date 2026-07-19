/**
 * 运行时刺激集生成（正式实验唯一入口）。
 */
export { generateRuntimeStimulusSet, assertRuntimeStimulusSet, allTimingCombos } from "./generateRuntimeSet";
export type { GenerateRuntimeSetOptions, TimingCombo } from "./generateRuntimeSet";
export { cryptoRandom } from "./cryptoRandom";
