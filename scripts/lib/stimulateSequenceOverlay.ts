import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STIMULUS_SET_SCHEMA_VERSION,
  type BlockSegment,
  type ExperimentStimulusSet,
  type PendulumDisplayUnit,
  type PendulumPracticeUnit,
  type PendulumStimulusUnit,
  type PracticeSegment,
  type RestSegment,
  type StimulusUnit,
  type TextControlUnit,
  type TextDisplayUnit,
  type TopLevelSequenceItem,
  type Trial,
} from "../../src/types/experiment.ts";
import {
  pendulumEnergy,
  pendulumOmegaDegPerSecForEnergyAtBottom,
  type PendulumParams,
} from "../../src/physics/pendulum.ts";

const TEMPLATE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../stimulate/instruction-template.json",
);

const FIXATION_TEXT = "+";
const ROD_LENGTH_M = 4;
const GRAVITY = 9.8;
const DISPLAY_TIME_T = 2;

export type InstructionTemplate = {
  welcomeRest: { type: "textControl"; text: string; key: string };
  structureRest: { type: "textControl"; text: string; key: string };
  blockObservationIntro: { type: "textControl"; text: string; key: string };
  blockObservationOutro: { type: "textControl"; text: string; key: string };
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
    units: [makeTextControl(tpl.welcomeRest), makeTextControl(tpl.structureRest)],
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

export function makePendulumDisplayUnit(targetEnergyJ: number, unitId?: string): PendulumDisplayUnit {
  const omega0DegPerSec = pendulumOmegaDegPerSecForEnergyAtBottom(
    targetEnergyJ,
    ROD_LENGTH_M,
  );
  return {
    id: unitId ?? randomUUID(),
    type: "pendulumDisplay",
    theta0Deg: 0,
    omega0DegPerSec,
    rodLengthM: ROD_LENGTH_M,
    gravity: GRAVITY,
    displayTimeT: DISPLAY_TIME_T,
  };
}

export function buildBlockObservationTrial(targetEnergyJ: number, tpl: InstructionTemplate): Trial {
  return {
    id: randomUUID(),
    units: [
      makeTextControl(tpl.blockObservationIntro),
      makePendulumDisplayUnit(targetEnergyJ),
      makeTextControl(tpl.blockObservationOutro),
    ],
  };
}

function isFixation(u: StimulusUnit): boolean {
  return u.type === "textDisplay" && u.text === FIXATION_TEXT;
}

function isPendulumTimedTrial(trial: Trial): boolean {
  return trial.units.some(
    (u) => u.type === "pendulumStimulus" || u.type === "pendulumPractice",
  );
}

function isPendulumTimedUnit(u: StimulusUnit): u is PendulumStimulusUnit | PendulumPracticeUnit {
  return u.type === "pendulumStimulus" || u.type === "pendulumPractice";
}

function pendulumUnits(units: StimulusUnit[]): StimulusUnit[] {
  return units.filter(isPendulumTimedUnit);
}

function firstPendulumTimedIndex(units: StimulusUnit[]): number {
  return units.findIndex(isPendulumTimedUnit);
}

function hasFixationBeforePendulum(units: StimulusUnit[]): boolean {
  const idx = firstPendulumTimedIndex(units);
  if (idx <= 0) return false;
  return isFixation(units[idx - 1]!);
}

/** 在首个摆球刺激/练习单元前插入注视点（若尚未存在） */
export function ensureFixation(trial: Trial, tpl: InstructionTemplate): void {
  const units = trial.units;
  const pIdx = firstPendulumTimedIndex(units);
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

export function energyFromPendulumStimulus(u: PendulumStimulusUnit): number {
  const p: PendulumParams = {
    theta0Rad: (u.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (u.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: u.rodLengthM,
    gravity: u.gravity,
  };
  return pendulumEnergy(p);
}

export function energyFromPendulumPractice(u: PendulumPracticeUnit): number {
  const p: PendulumParams = {
    theta0Rad: (u.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (u.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: u.rodLengthM,
    gravity: u.gravity,
  };
  return pendulumEnergy(p);
}

export function energyFromPendulumDisplay(u: PendulumDisplayUnit): number {
  const p: PendulumParams = {
    theta0Rad: (u.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (u.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: u.rodLengthM,
    gravity: u.gravity,
  };
  return pendulumEnergy(p);
}

export function applyTrialOverlays(
  practice: PracticeSegment,
  blocks: BlockSegment[],
  tpl: InstructionTemplate,
): void {
  applyPracticeLabels(practice, tpl.practiceLabels, tpl);
  for (const block of blocks) {
    for (const trial of block.children) {
      if (!isPendulumTimedTrial(trial)) continue;
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

  const sequence: TopLevelSequenceItem[] = [makeWelcomeRest(tpl), practice];

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
    children: b.children
      .filter((t) => isPendulumTimedTrial(t))
      .map((t) => ({
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
