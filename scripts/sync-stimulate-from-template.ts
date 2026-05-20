/**
 * 以 stimulate/stimulus-01.json 中的指导语为准，同步到 stimulus-02…05；
 * 并为所有 practice / block 试次在摆球刺激前插入注视点（textDisplay "+"）。
 *
 * 运行：npx tsx scripts/sync-stimulate-from-template.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExperimentStimulusSet,
  PracticeSegment,
  RestSegment,
  StimulusUnit,
  TextDisplayUnit,
  Trial,
} from "../src/types/experiment.ts";
import { parseExperimentStimulusSet, validateRunnableSet } from "../src/shared/storage.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "stimulate");
const TEMPLATE_PATH = join(ROOT, "stimulus-01.json");
const FIXATION_MS = 1000;
const FIXATION_TEXT = "+";

function cloneRest(seg: RestSegment): RestSegment {
  return {
    kind: "rest",
    id: randomUUID(),
    units: seg.units.map((u) => ({ ...u, id: randomUUID() })),
  };
}

function makeFixation(): TextDisplayUnit {
  return {
    id: randomUUID(),
    type: "textDisplay",
    text: FIXATION_TEXT,
    durationMs: FIXATION_MS,
  };
}

function makePracticeLabel(text: string): TextDisplayUnit {
  return {
    id: randomUUID(),
    type: "textDisplay",
    text,
    durationMs: FIXATION_MS,
  };
}

function isFixation(u: StimulusUnit): boolean {
  return u.type === "textDisplay" && u.text === FIXATION_TEXT;
}

function pendulumUnits(units: StimulusUnit[]): StimulusUnit[] {
  return units.filter((u) => u.type === "pendulumStimulus");
}

function hasFixationBeforePendulum(units: StimulusUnit[]): boolean {
  const idx = units.findIndex((u) => u.type === "pendulumStimulus");
  if (idx <= 0) return false;
  return isFixation(units[idx - 1]!);
}

/** 在首个 pendulumStimulus 前插入注视点（若尚未存在） */
function ensureFixation(trial: Trial): void {
  const units = trial.units;
  const pIdx = units.findIndex((u) => u.type === "pendulumStimulus");
  if (pIdx < 0) return;
  if (hasFixationBeforePendulum(units)) return;
  trial.units = [...units.slice(0, pIdx), makeFixation(), ...units.slice(pIdx)];
}

function practiceLabelTexts(practice: PracticeSegment): string[] {
  return practice.children.map((t) => {
    const label = t.units.find((u) => u.type === "textDisplay" && u.text !== FIXATION_TEXT);
    return label?.type === "textDisplay" ? label.text : "";
  });
}

function applyPracticeLabels(practice: PracticeSegment, labels: string[]): void {
  practice.children.forEach((trial, i) => {
    const labelText = labels[i] ?? labels[labels.length - 1] ?? "";
    const pendulums = pendulumUnits(trial.units);
    const prefix: StimulusUnit[] = labelText
      ? [makePracticeLabel(labelText), makeFixation()]
      : [makeFixation()];
    trial.units = [...prefix, ...pendulums];
  });
}

function loadTemplate(): {
  welcomeRest: RestSegment;
  taskRest: RestSegment;
  practiceLabels: string[];
} {
  const raw = JSON.parse(readFileSync(TEMPLATE_PATH, "utf8")) as ExperimentStimulusSet;
  const welcome = raw.sequence.find((s) => s.kind === "rest");
  const practiceIdx = raw.sequence.findIndex((s) => s.kind === "practice");
  const task = raw.sequence
    .slice(practiceIdx + 1)
    .find((s) => s.kind === "rest");
  const practice = raw.sequence.find((s) => s.kind === "practice") as PracticeSegment | undefined;
  if (!welcome || welcome.kind !== "rest" || !task || task.kind !== "rest" || !practice) {
    throw new Error("stimulus-01.json 需含：欢迎 rest → practice → 任务 rest");
  }
  const labels = practiceLabelTexts(practice);
  if (labels.some((t) => !t.trim())) {
    throw new Error("stimulus-01.json 练习试次缺少阶段说明 textDisplay");
  }
  return {
    welcomeRest: welcome,
    taskRest: task,
    practiceLabels: labels,
  };
}

function syncFile(
  path: string,
  template: ReturnType<typeof loadTemplate>,
  isTemplateFile: boolean,
): void {
  const set = JSON.parse(readFileSync(path, "utf8")) as ExperimentStimulusSet;
  let seq = [...set.sequence];

  if (!isTemplateFile) {
    seq = seq.filter((s) => s.kind !== "rest");
    const practiceIdx = seq.findIndex((s) => s.kind === "practice");
    if (practiceIdx < 0) throw new Error(`${path}: 缺少 practice 段`);
    const practice = seq[practiceIdx] as PracticeSegment;
    applyPracticeLabels(practice, template.practiceLabels);
    seq = [
      cloneRest(template.welcomeRest),
      practice,
      cloneRest(template.taskRest),
      ...seq.filter((s) => s.kind === "block"),
    ];
  } else {
    const practice = seq.find((s) => s.kind === "practice") as PracticeSegment | undefined;
    if (practice) applyPracticeLabels(practice, template.practiceLabels);
  }

  for (const seg of seq) {
    if (seg.kind === "practice" || seg.kind === "block") {
      for (const trial of seg.children) ensureFixation(trial);
    }
  }

  const out: ExperimentStimulusSet = { schemaVersion: set.schemaVersion, sequence: seq };
  const parsed = parseExperimentStimulusSet(JSON.parse(JSON.stringify(out)) as unknown);
  if (!parsed) throw new Error(`解析失败: ${path}`);
  const err = validateRunnableSet(parsed);
  if (err) throw new Error(`${path}: ${err}`);

  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`, "utf8");
}

function main(): void {
  const template = loadTemplate();
  for (let i = 1; i <= 5; i++) {
    const name = `stimulus-${String(i).padStart(2, "0")}.json`;
    const path = join(ROOT, name);
    syncFile(path, template, i === 1);
    console.log(`Updated ${name}`);
  }
}

main();
