import { analyzePendulum } from "../experiment/physics/pendulum";
import { withSyncedTotalTimeT } from "../experiment/physics/timePhases";
import {
  isExperiment2ParticipantInfo,
  isParticipantInfo,
  type AnyParticipantInfo,
  type Experiment2ParticipantInfo,
  type ParticipantInfo,
} from "./participant";
import {
  EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  STIMULUS_SET_SCHEMA_VERSION,
  type BlockSegment,
  type ExperimentStimulusSet,
  type Experiment2StimulusSet,
  type PendulumStimulusUnit,
  type PracticeSegment,
  type RestSegment,
  type StimulusUnit,
  type TopLevelSequenceItem,
  type RuntimeStimulusSet,
  type Trial,
} from "./experimentTypes";
import type { ExperimentId } from "../experiments/types";

export const LEGACY_SESSION_STIMULUS_KEY = "intuition-physics-stimulus-set";
export const LEGACY_SESSION_PARTICIPANT_KEY = "intuition-physics-participant";
export const LEGACY_SESSION_RUN_TOKEN_KEY = "intuition-physics-run-active";
export const SESSION_STIMULUS_KEY = "intuition-physics:experiment-1:stimulus-set";
export const SESSION_PARTICIPANT_KEY = "intuition-physics:experiment-1:participant";
/** 存在且与人口学/刺激集同时有效时，才允许进入对应实验 runner。 */
export const SESSION_RUN_TOKEN_KEY = "intuition-physics:experiment-1:run-active";

function sessionKey(experimentId: ExperimentId, suffix: string): string {
  return `intuition-physics:${experimentId}:${suffix}`;
}

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

function parseRuntimeStimulusSet(
  raw: unknown,
  schemaVersion: number,
): RuntimeStimulusSet | null {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== schemaVersion ||
    !Array.isArray(raw.sequence)
  ) {
    return null;
  }
  const sequence = raw.sequence.map(parseSequenceItem);
  if (sequence.length === 0 || sequence.some((item) => item === null)) {
    return null;
  }
  return {
    schemaVersion,
    sequence: sequence as TopLevelSequenceItem[],
  };
}

export function parseExperimentStimulusSet(
  raw: unknown,
): ExperimentStimulusSet | null {
  return parseRuntimeStimulusSet(
    raw,
    STIMULUS_SET_SCHEMA_VERSION,
  ) as ExperimentStimulusSet | null;
}

export function parseExperiment2StimulusSet(
  raw: unknown,
): Experiment2StimulusSet | null {
  return parseRuntimeStimulusSet(
    raw,
    EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  ) as Experiment2StimulusSet | null;
}

function parseSetForExperiment(
  experimentId: ExperimentId,
  raw: unknown,
): RuntimeStimulusSet | null {
  return experimentId === "experiment-1"
    ? parseExperimentStimulusSet(raw)
    : parseExperiment2StimulusSet(raw);
}

function parseParticipantForExperiment(
  experimentId: ExperimentId,
  raw: unknown,
): AnyParticipantInfo | null {
  if (experimentId === "experiment-1") {
    return isParticipantInfo(raw) ? raw : null;
  }
  return isExperiment2ParticipantInfo(raw) ? raw : null;
}

export function saveStimulusSetToSession(set: ExperimentStimulusSet): void {
  saveStimulusSetForExperiment("experiment-1", set);
}

export function saveStimulusSetForExperiment(
  experimentId: ExperimentId,
  set: RuntimeStimulusSet,
): void {
  sessionStorage.setItem(sessionKey(experimentId, "stimulus-set"), JSON.stringify(set));
}

export function loadStimulusSetFromSession(): ExperimentStimulusSet | null {
  return loadStimulusSetForExperiment("experiment-1") as ExperimentStimulusSet | null;
}

export function loadStimulusSetForExperiment(
  experimentId: ExperimentId,
): RuntimeStimulusSet | null {
  const serialized = sessionStorage.getItem(sessionKey(experimentId, "stimulus-set"));
  if (!serialized) return null;
  try {
    return parseSetForExperiment(experimentId, JSON.parse(serialized) as unknown);
  } catch {
    return null;
  }
}

export function saveParticipantToSession(participant: ParticipantInfo): void {
  saveParticipantForExperiment("experiment-1", participant);
}

export function saveParticipantForExperiment(
  experimentId: ExperimentId,
  participant: AnyParticipantInfo,
): void {
  sessionStorage.setItem(sessionKey(experimentId, "participant"), JSON.stringify(participant));
}

export function markExperimentRunActive(): void {
  markExperimentRunActiveForExperiment("experiment-1");
}

export function markExperimentRunActiveForExperiment(experimentId: ExperimentId): void {
  sessionStorage.setItem(sessionKey(experimentId, "run-active"), "1");
}

export function hasActiveExperimentRunSession(
  experimentId: ExperimentId = "experiment-1",
): boolean {
  if (sessionStorage.getItem(sessionKey(experimentId, "run-active")) !== "1") return false;
  return (
    loadParticipantForExperiment(experimentId) !== null &&
    loadStimulusSetForExperiment(experimentId) !== null
  );
}

export function beginExperimentRunSession(
  participant: ParticipantInfo,
  set: ExperimentStimulusSet,
): void {
  beginExperimentRunSessionForExperiment("experiment-1", participant, set);
}

export function beginExperimentRunSessionForExperiment(
  experimentId: ExperimentId,
  participant: AnyParticipantInfo,
  set: RuntimeStimulusSet,
): void {
  saveParticipantForExperiment(experimentId, participant);
  saveStimulusSetForExperiment(experimentId, set);
  markExperimentRunActiveForExperiment(experimentId);
}

export function loadParticipantFromSession(): ParticipantInfo | null {
  return loadParticipantForExperiment("experiment-1") as ParticipantInfo | null;
}

export function loadParticipantForExperiment(
  experimentId: ExperimentId,
): AnyParticipantInfo | null {
  const serialized = sessionStorage.getItem(sessionKey(experimentId, "participant"));
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    return parseParticipantForExperiment(experimentId, parsed);
  } catch {
    return null;
  }
}

export function clearExperimentSession(
  experimentId: ExperimentId = "experiment-1",
): void {
  sessionStorage.removeItem(sessionKey(experimentId, "stimulus-set"));
  sessionStorage.removeItem(sessionKey(experimentId, "participant"));
  sessionStorage.removeItem(sessionKey(experimentId, "run-active"));
}

export function validateRunnableSet(set: RuntimeStimulusSet): string | null {
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

/** 将旧单实验 sessionStorage 原子式迁移到实验一命名空间；已有新记录优先。 */
export function migrateLegacyExperiment1Session(): boolean {
  try {
    const legacyParticipant = sessionStorage.getItem(LEGACY_SESSION_PARTICIPANT_KEY);
    const legacySet = sessionStorage.getItem(LEGACY_SESSION_STIMULUS_KEY);
    const legacyToken = sessionStorage.getItem(LEGACY_SESSION_RUN_TOKEN_KEY);
    if (!legacyParticipant && !legacySet && !legacyToken) return false;
    const participant = legacyParticipant
      ? JSON.parse(legacyParticipant) as unknown
      : null;
    const set = legacySet ? JSON.parse(legacySet) as unknown : null;
    if (!isParticipantInfo(participant) || !parseExperimentStimulusSet(set)) return false;

    if (!sessionStorage.getItem(SESSION_PARTICIPANT_KEY)) {
      sessionStorage.setItem(SESSION_PARTICIPANT_KEY, legacyParticipant!);
    }
    if (!sessionStorage.getItem(SESSION_STIMULUS_KEY)) {
      sessionStorage.setItem(SESSION_STIMULUS_KEY, legacySet!);
    }
    if (legacyToken === "1" && !sessionStorage.getItem(SESSION_RUN_TOKEN_KEY)) {
      sessionStorage.setItem(SESSION_RUN_TOKEN_KEY, "1");
    }
    if (!loadParticipantFromSession() || !loadStimulusSetFromSession()) return false;
    sessionStorage.removeItem(LEGACY_SESSION_PARTICIPANT_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_STIMULUS_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_RUN_TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}

export type { Experiment2ParticipantInfo };
