import { analyzePendulum } from "../experiment/physics/pendulum";
import { withSyncedTotalTimeT } from "../experiment/physics/timePhases";
import { isParticipantInfo, type ParticipantInfo } from "./participant";
import {
  STIMULUS_SET_SCHEMA_VERSION,
  type BlockSegment,
  type ExperimentStimulusSet,
  type PendulumStimulusUnit,
  type PracticeSegment,
  type RestSegment,
  type StimulusUnit,
  type TopLevelSequenceItem,
  type Trial,
} from "./experimentTypes";

export const SESSION_STIMULUS_KEY = "intuition-physics-stimulus-set";
export const SESSION_PARTICIPANT_KEY = "intuition-physics-participant";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(
  raw: Record<string, unknown>,
  key: string,
): number | null {
  const value = raw[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validId(raw: Record<string, unknown>): string | null {
  return typeof raw.id === "string" && raw.id.length > 0 ? raw.id : null;
}

function parseUnit(raw: unknown): StimulusUnit | null {
  if (!isRecord(raw)) return null;
  const id = validId(raw);
  if (!id) return null;

  if (raw.type === "textDisplay") {
    const durationMs = finiteNumber(raw, "durationMs");
    if (typeof raw.text !== "string" || durationMs === null || durationMs <= 0) {
      return null;
    }
    return { id, type: "textDisplay", text: raw.text, durationMs };
  }

  if (raw.type === "textControl") {
    if (typeof raw.text !== "string" || typeof raw.key !== "string") return null;
    return { id, type: "textControl", text: raw.text, key: raw.key };
  }

  if (raw.type !== "pendulumStimulus") return null;
  const theta0Deg = finiteNumber(raw, "theta0Deg");
  const omega0DegPerSec = finiteNumber(raw, "omega0DegPerSec");
  const rodLengthM = finiteNumber(raw, "rodLengthM");
  const gravity = finiteNumber(raw, "gravity");
  const show1T = finiteNumber(raw, "show1T");
  const hide1T = finiteNumber(raw, "hide1T");
  const fadeMs = finiteNumber(raw, "fadeMs");
  if (
    theta0Deg === null ||
    omega0DegPerSec === null ||
    rodLengthM === null ||
    gravity === null ||
    show1T === null ||
    hide1T === null ||
    fadeMs === null ||
    rodLengthM <= 0 ||
    gravity <= 0 ||
    show1T <= 0 ||
    hide1T <= 0 ||
    fadeMs < 0
  ) {
    return null;
  }

  const base: PendulumStimulusUnit = {
    id,
    type: "pendulumStimulus",
    theta0Deg,
    omega0DegPerSec,
    rodLengthM,
    gravity,
    totalTimeT: 0,
    show1T,
    hide1T,
    fadeMs,
  };
  const periodSec = analyzePendulum({
    theta0Rad: (theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (omega0DegPerSec * Math.PI) / 180,
    rodLengthM,
    gravity,
  }).T;
  return withSyncedTotalTimeT(base, periodSec);
}

function parseTrial(raw: unknown): Trial | null {
  if (!isRecord(raw) || !Array.isArray(raw.units)) return null;
  const id = validId(raw);
  if (!id) return null;
  const units = raw.units.map(parseUnit);
  if (units.some((unit) => unit === null)) return null;
  return { id, units: units as StimulusUnit[] };
}

function parseTrials(
  raw: Record<string, unknown>,
): Trial[] | null {
  if (!Array.isArray(raw.children)) return null;
  const children = raw.children.map(parseTrial);
  if (children.some((trial) => trial === null)) return null;
  return children as Trial[];
}

function parseSequenceItem(raw: unknown): TopLevelSequenceItem | null {
  if (!isRecord(raw)) return null;
  const id = validId(raw);
  if (!id) return null;
  if (raw.kind === "block" || raw.kind === "practice") {
    const children = parseTrials(raw);
    if (!children) return null;
    return raw.kind === "block"
      ? ({ kind: "block", id, children } satisfies BlockSegment)
      : ({ kind: "practice", id, children } satisfies PracticeSegment);
  }
  if (raw.kind === "rest" && Array.isArray(raw.units)) {
    const units = raw.units.map(parseUnit);
    if (units.some((unit) => unit === null)) return null;
    return {
      kind: "rest",
      id,
      units: units as StimulusUnit[],
    } satisfies RestSegment;
  }
  return null;
}

export function parseExperimentStimulusSet(
  raw: unknown,
): ExperimentStimulusSet | null {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== STIMULUS_SET_SCHEMA_VERSION ||
    !Array.isArray(raw.sequence)
  ) {
    return null;
  }
  const sequence = raw.sequence.map(parseSequenceItem);
  if (sequence.length === 0 || sequence.some((item) => item === null)) {
    return null;
  }
  return {
    schemaVersion: STIMULUS_SET_SCHEMA_VERSION,
    sequence: sequence as TopLevelSequenceItem[],
  };
}

export function saveStimulusSetToSession(set: ExperimentStimulusSet): void {
  sessionStorage.setItem(SESSION_STIMULUS_KEY, JSON.stringify(set));
}

export function loadStimulusSetFromSession(): ExperimentStimulusSet | null {
  const serialized = sessionStorage.getItem(SESSION_STIMULUS_KEY);
  if (!serialized) return null;
  try {
    return parseExperimentStimulusSet(JSON.parse(serialized) as unknown);
  } catch {
    return null;
  }
}

export function saveParticipantToSession(participant: ParticipantInfo): void {
  sessionStorage.setItem(SESSION_PARTICIPANT_KEY, JSON.stringify(participant));
}

export function loadParticipantFromSession(): ParticipantInfo | null {
  const serialized = sessionStorage.getItem(SESSION_PARTICIPANT_KEY);
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    return isParticipantInfo(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearExperimentSession(): void {
  sessionStorage.removeItem(SESSION_STIMULUS_KEY);
  sessionStorage.removeItem(SESSION_PARTICIPANT_KEY);
}

export function validateRunnableSet(set: ExperimentStimulusSet): string | null {
  if (set.sequence.length === 0) return "刺激序列为空。";
  for (const item of set.sequence) {
    if (item.kind === "block" || item.kind === "practice") {
      if (item.children.length === 0) return `${item.kind} 中没有 Trial。`;
      if (item.children.some((trial) => trial.units.length === 0)) {
        return `${item.kind} 中存在空 Trial。`;
      }
    } else if (item.units.length === 0) {
      return "休息或指导语段为空。";
    }
  }
  return null;
}
