/**
 * 将 instruction-template.json 中的指导语与结构叠加到 stimulus-01…05；
 * 保留各文件已有物理试次（摆球参数与时序），刷新指导语与结构叠加（schema 5）。
 *
 * 运行：npm run sync-stimulate
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExperimentStimulusSet } from "../src/types/experiment.ts";
import { overlayExistingSet, loadInstructionTemplate } from "./lib/stimulateSequenceOverlay.ts";
import { parseExperimentStimulusSet, validateRunnableSet } from "../src/shared/storage.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "stimulate");

function syncFile(path: string, tpl = loadInstructionTemplate()): void {
  const set = JSON.parse(readFileSync(path, "utf8")) as ExperimentStimulusSet;
  const out = overlayExistingSet(set, tpl);
  const parsed = parseExperimentStimulusSet(JSON.parse(JSON.stringify(out)) as unknown);
  if (!parsed) throw new Error(`解析失败: ${path}`);
  const err = validateRunnableSet(parsed);
  if (err) throw new Error(`${path}: ${err}`);
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`, "utf8");
}

function main(): void {
  const tpl = loadInstructionTemplate();
  for (let i = 1; i <= 5; i++) {
    const name = `stimulus-${String(i).padStart(2, "0")}.json`;
    const path = join(ROOT, name);
    syncFile(path, tpl);
    console.log(`Updated ${name}`);
  }
}

main();
