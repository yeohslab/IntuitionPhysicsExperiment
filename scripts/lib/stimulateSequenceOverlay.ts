import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STIMULUS_SET_SCHEMA_VERSION,
  type BlockSegment,
  type ExperimentStimulusSet,
  type PracticeSegment,
  type RestSegment,
  type StimulusUnit,
  type TextControlUnit,
  type TextDisplayUnit,
  type TopLevelSequenceItem,
  type Trial,
} from "../../src/types/experiment.ts";

const TEMPLATE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../stimulate/instruction-template.json",
);

const FIXATION_TEXT = "+";

export type InstructionTemplate = {
  welcomeRest: { type: "textControl"; text: string; key: string };
  taskRest: { type: "textControl"; text: string; key: string };
  practiceLabels: string[];
  blockRestTemplate: { type: "textControl"; text: string; key: string };
  fixation: { type: "textDisplay"; text: string; durationMs: number };
};

export function loadInstructionTemplate(path = TEMPLATE_PATH): InstructionTemplate {
  return JSON.parse(readFileSync(path, "utf8")) as InstructionTemplate;
}

function makeTextControl(src: { text: string; key: string }): TextControlUnit {
  return {
    id: randomUUID(),
    type: "textControl",
    text: src.text,
    key: src.key,
  };
}

function makeFixation(tpl: InstructionTemplate): TextDisplayUnit {
  return {
    id: randomUUID(),
    type: "textDisplay",
    text: tpl.fixation.text,
    durationMs: tpl.fixation.durationMs,
  };
}

function makePracticeLabel(text: string, tpl: InstructionTemplate): TextDisplayUnit {
  return {
    id: randomUUID(),
    type: "textDisplay",
    text,
    durationMs: tpl.fixation.durationMs,
  };
}

export function makeWelcomeRest(tpl: InstructionTemplate): RestSegment {
  return {
    kind: "rest",
    id: randomUUID(),
    units: [makeTextControl(tpl.welcomeRest)],
  };
}

export function makeTaskRest(tpl: InstructionTemplate): RestSegment {
  return {
    kind: "rest",
    id: randomUUID(),
    units: [makeTextControl(tpl.taskRest)],
  };
}

export function makeBlockRest(current: number, total: number, tpl: InstructionTemplate): RestSegment {
  const text = tpl.blockRestTemplate.text
    .replace(/\{current\}/g, String(current))
    .replace(/\{total\}/g, String(total));
  return {
    kind: "rest",
    id: randomUUID(),
    units: [makeTextControl({ text, key: tpl.blockRestTemplate.key })],
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
export function ensureFixation(trial: Trial, tpl: InstructionTemplate): void {
  const units = trial.units;
  const pIdx = units.findIndex((u) => u.type === "pendulumStimulus");
  if (pIdx < 0) return;
  if (hasFixationBeforePendulum(units)) return;
  trial.units = [...units.slice(0, pIdx), makeFixation(tpl), ...units.slice(pIdx)];
}

export function applyPracticeLabels(
  practice: PracticeSegment,
  labels: string[],
  tpl: InstructionTemplate,
): void {
  practice.children.forEach((trial, i) => {
    const labelText = labels[i] ?? labels[labels.length - 1] ?? "";
    const pendulums = pendulumUnits(trial.units);
    const prefix: StimulusUnit[] = labelText
      ? [makePracticeLabel(labelText, tpl), makeFixation(tpl)]
      : [makeFixation(tpl)];
    trial.units = [...prefix, ...pendulums];
  });
}

export function stripOverlayUnits(trial: Trial): void {
  trial.units = pendulumUnits(trial.units);
}

export function applyTrialOverlays(
  practice: PracticeSegment,
  blocks: BlockSegment[],
  tpl: InstructionTemplate,
): void {
  applyPracticeLabels(practice, tpl.practiceLabels, tpl);
  for (const block of blocks) {
    for (const trial of block.children) {
      stripOverlayUnits(trial);
      ensureFixation(trial, tpl);
    }
  }
}

export type PhysicsOnlySet = {
  practice: PracticeSegment;
  blocks: BlockSegment[];
};

export function assembleFullSequence(
  physics: PhysicsOnlySet,
  tpl: InstructionTemplate,
): TopLevelSequenceItem[] {
  const practice: PracticeSegment = {
    kind: "practice",
    id: physics.practice.id,
    children: physics.practice.children.map((t) => ({
      id: t.id,
      units: [...t.units],
    })),
  };
  const blocks: BlockSegment[] = physics.blocks.map((b) => ({
    kind: "block",
    id: b.id,
    children: b.children.map((t) => ({
      id: t.id,
      units: [...t.units],
    })),
  }));

  applyTrialOverlays(practice, blocks, tpl);

  const sequence: TopLevelSequenceItem[] = [
    makeWelcomeRest(tpl),
    practice,
    makeTaskRest(tpl),
  ];

  const total = blocks.length;
  blocks.forEach((block, i) => {
    sequence.push(makeBlockRest(i + 1, total, tpl));
    sequence.push(block);
  });

  return sequence;
}

/** 从完整刺激集抽出物理段（用于 sync：保留 blocks/practice 的 pendulum 参数） */
export function extractPhysicsOnly(set: ExperimentStimulusSet): PhysicsOnlySet | null {
  const practice = set.sequence.find((s) => s.kind === "practice") as PracticeSegment | undefined;
  const blocks = set.sequence.filter((s) => s.kind === "block") as BlockSegment[];
  if (!practice || blocks.length === 0) return null;

  const practiceCopy: PracticeSegment = {
    kind: "practice",
    id: practice.id,
    children: practice.children.map((t) => {
      const trial: Trial = { id: t.id, units: pendulumUnits(t.units) };
      return trial;
    }),
  };

  const blocksCopy = blocks.map((b) => ({
    kind: "block" as const,
    id: b.id,
    children: b.children.map((t) => ({
      id: t.id,
      units: pendulumUnits(t.units),
    })),
  }));

  return { practice: practiceCopy, blocks: blocksCopy };
}

export function overlayExistingSet(
  set: ExperimentStimulusSet,
  tpl?: InstructionTemplate,
): ExperimentStimulusSet {
  const template = tpl ?? loadInstructionTemplate();
  const physics = extractPhysicsOnly(set);
  if (!physics) throw new Error("刺激集缺少 practice 或 block 段");

  const sequence = assembleFullSequence(physics, template);
  return { schemaVersion: STIMULUS_SET_SCHEMA_VERSION, sequence };
}
