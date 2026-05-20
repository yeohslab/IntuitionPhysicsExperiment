/**
 * 刺激集唯一数据源：仓库根目录 `stimulate/*.json`。
 * 编辑页默认、实验首页按被试编号分配，均由此模块解析（构建时打入产物）。
 */
import type { ExperimentStimulusSet } from "../types/experiment";
import { parseExperimentStimulusSet, validateRunnableSet } from "../shared/storage";

import raw01 from "../../stimulate/stimulus-01.json";
import raw02 from "../../stimulate/stimulus-02.json";
import raw03 from "../../stimulate/stimulus-03.json";
import raw04 from "../../stimulate/stimulus-04.json";
import raw05 from "../../stimulate/stimulus-05.json";

const FILE_NAMES = [
  "stimulus-01.json",
  "stimulus-02.json",
  "stimulus-03.json",
  "stimulus-04.json",
  "stimulus-05.json",
] as const;

const RAW_SETS = [raw01, raw02, raw03, raw04, raw05] as const;

function loadStimulusSet(raw: unknown, fileName: string): ExperimentStimulusSet {
  const set = parseExperimentStimulusSet(raw);
  if (!set) {
    throw new Error(`stimulate/${fileName} 无效或 schema 不是 3`);
  }
  const err = validateRunnableSet(set);
  if (err) throw new Error(`stimulate/${fileName}: ${err}`);
  return set;
}

/** 五份预置刺激集（与 `stimulate/stimulus-01` … `05` 一一对应） */
export const STIMULUS_SETS: readonly ExperimentStimulusSet[] = RAW_SETS.map((raw, i) =>
  loadStimulusSet(raw, FILE_NAMES[i]!),
);

/** 编辑页无本地草稿时的默认刺激集（stimulus-01） */
export const DEFAULT_STIMULUS_SET: ExperimentStimulusSet = STIMULUS_SETS[0]!;

export function cloneStimulusSet(set: ExperimentStimulusSet): ExperimentStimulusSet {
  return structuredClone(set);
}
