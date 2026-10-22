import { analyzePendulum } from "../experiment/physics/pendulum";
import { withSyncedTotalTimeT } from "../experiment/physics/timePhases";
import {
  isExperiment2ParticipantInfo,
  isExperiment4ParticipantInfo,
  type AnyParticipantInfo,
  type Experiment2ParticipantInfo,
} from "./participant";
import {
  EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION,
  type BlockSegment,
  type Experiment2StimulusSet,
  type Experiment4StimulusSet,
  type GratingOcclusionSegmentRecord,
  type PendulumStimulusUnit,
  type PracticeSegment,
  type RestSegment,
  type StimulusUnit,
  type TopLevelSequenceItem,
  type RuntimeStimulusSet,
  type Trial,
} from "./experimentTypes";
import type { ExperimentId } from "../experiments/types";

/** 存在且与人口学/刺激集同时有效时，才允许进入 runner。 */
export const SESSION_RUN_TOKEN_KEY = "intuition-physics:experiment-2:run-active";

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

  if (raw.type === "gratingPendulumStimulus") {
    const theta0Deg = finiteNumber(raw, "theta0Deg");
    const omega0DegPerSec = finiteNumber(raw, "omega0DegPerSec");
    const rodLengthM = finiteNumber(raw, "rodLengthM");
    const gravity = finiteNumber(raw, "gravity");
    const energyJ = finiteNumber(raw, "energyJ");
    const durationSec = finiteNumber(raw, "durationSec");
    const queryTimeSec = finiteNumber(raw, "queryTimeSec");
    const gapM = finiteNumber(raw, "gapM");
    const barWidthM = finiteNumber(raw, "barWidthM");
    const bobRadiusM = finiteNumber(raw, "bobRadiusM");
    const gapLevel = raw.gapLevel;
    const releaseSide = raw.releaseSide;
    const responseOrder =
      raw.responseOrder === undefined ? "angle_first" : raw.responseOrder;
    const occlusionSegmentIndex = finiteNumber(raw, "occlusionSegmentIndex");
    const firstVisibleSecRaw = raw.firstVisibleSec;
    if (
      theta0Deg === null ||
      omega0DegPerSec === null ||
      rodLengthM === null ||
      gravity === null ||
      energyJ === null ||
      durationSec === null ||
      queryTimeSec === null ||
      gapM === null ||
      barWidthM === null ||
      bobRadiusM === null ||
      occlusionSegmentIndex === null ||
      (gapLevel !== "small" && gapLevel !== "medium" && gapLevel !== "large") ||
      (releaseSide !== "left" && releaseSide !== "right") ||
      (responseOrder !== "angle_first" && responseOrder !== "speed_first") ||
      rodLengthM <= 0 ||
      gravity <= 0 ||
      energyJ <= 0 ||
      durationSec <= 0 ||
      queryTimeSec < 0 ||
      queryTimeSec > durationSec
    ) {
      return null;
    }
    if (!Array.isArray(raw.occlusionTimeline)) return null;
    const occlusionTimeline: GratingOcclusionSegmentRecord[] = [];
    for (const item of raw.occlusionTimeline) {
      if (!isRecord(item)) return null;
      const kind = item.kind;
      const tStartSec = finiteNumber(item, "tStartSec");
      const tEndSec = finiteNumber(item, "tEndSec");
      if (
        (kind !== "fully_occluded" &&
          kind !== "fully_visible" &&
          kind !== "partial") ||
        tStartSec === null ||
        tEndSec === null
      ) {
        return null;
      }
      occlusionTimeline.push({
        kind,
        tStartSec,
        tEndSec,
      });
    }
    const firstVisibleSec =
      firstVisibleSecRaw === null
        ? null
        : typeof firstVisibleSecRaw === "number" && Number.isFinite(firstVisibleSecRaw)
          ? firstVisibleSecRaw
          : null;
    return {
      id,
      type: "gratingPendulumStimulus",
      theta0Deg,
      omega0DegPerSec,
      rodLengthM,
      gravity,
      energyJ,
      durationSec,
      queryTimeSec,
      gapLevel,
      gapM,
      barWidthM,
      bobRadiusM,
      releaseSide,
      responseOrder,
      occlusionSegmentIndex,
      occlusionTimeline,
      firstVisibleSec,
    };
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

export function parseExperiment2StimulusSet(
  raw: unknown,
): Experiment2StimulusSet | null {
  return parseRuntimeStimulusSet(
    raw,
    EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  ) as Experiment2StimulusSet | null;
}

export function parseExperiment4StimulusSet(
  raw: unknown,
): Experiment4StimulusSet | null {
  return parseRuntimeStimulusSet(
    raw,
    EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION,
  ) as Experiment4StimulusSet | null;
}

function parseSetForExperiment(
  experimentId: ExperimentId,
  raw: unknown,
): RuntimeStimulusSet | null {
  if (experimentId === "experiment-2") return parseExperiment2StimulusSet(raw);
  if (experimentId === "experiment-4") return parseExperiment4StimulusSet(raw);
  return null;
}

function parseParticipantForExperiment(
  experimentId: ExperimentId,
  raw: unknown,
): AnyParticipantInfo | null {
  if (experimentId === "experiment-2") {
    return isExperiment2ParticipantInfo(raw) ? raw : null;
  }
  if (experimentId === "experiment-4") {
    return isExperiment4ParticipantInfo(raw) ? raw : null;
  }
  return null;
}

export function saveStimulusSetForExperiment(
  experimentId: ExperimentId,
  set: RuntimeStimulusSet,
): void {
  sessionStorage.setItem(sessionKey(experimentId, "stimulus-set"), JSON.stringify(set));
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

export function saveParticipantForExperiment(
  experimentId: ExperimentId,
  participant: AnyParticipantInfo,
): void {
  sessionStorage.setItem(sessionKey(experimentId, "participant"), JSON.stringify(participant));
}

export function markExperimentRunActiveForExperiment(experimentId: ExperimentId): void {
  sessionStorage.setItem(sessionKey(experimentId, "run-active"), "1");
}

export function hasActiveExperimentRunSession(
  experimentId: ExperimentId = "experiment-2",
): boolean {
  if (sessionStorage.getItem(sessionKey(experimentId, "run-active")) !== "1") return false;
  return (
    loadParticipantForExperiment(experimentId) !== null &&
    loadStimulusSetForExperiment(experimentId) !== null
  );
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
  experimentId: ExperimentId = "experiment-2",
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

export type { Experiment2ParticipantInfo };
