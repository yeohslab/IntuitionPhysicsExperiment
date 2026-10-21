import type { ExperimentId } from "../experiments/types";
import type { RuntimeStimulusSet } from "./experimentTypes";
import type { AnyParticipantInfo } from "./participant";
import {
  isExperiment2ParticipantInfo,
  isExperiment4ParticipantInfo,
} from "./participant";
import {
  parseExperiment2StimulusSet,
  parseExperiment4StimulusSet,
} from "./storage";

export type RecoveryExperimentStatus = "f" | "nf";
export type RecoveryLifecycle = "running" | "exported";

export type RecoveryPhase =
  | "generated"
  | "timeline_unit"
  | "fixation"
  | "show"
  | "fade"
  | "hide"
  | "estimate"
  | "feedback"
  | "between_trials";

export interface RecoveryCursor {
  segment_kind?: string;
  block_index?: number;
  trial_index_in_block?: number;
  formal_trial_index?: number | null;
  phase: RecoveryPhase;
}

export interface RecoverySnapshot {
  version: 1;
  lifecycle: RecoveryLifecycle;
  experiment_status?: RecoveryExperimentStatus;
  participant: AnyParticipantInfo;
  stimulus_set: RuntimeStimulusSet;
  rows: Record<string, unknown>[];
  cursor: RecoveryCursor;
  updated_at: string;
}

const activeSnapshots = new Map<ExperimentId, RecoverySnapshot>();

function recoveryKey(experimentId: ExperimentId): string {
  return `intuition-physics:${experimentId}:recovery-v1`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecoveryExperimentStatus(value: unknown): value is RecoveryExperimentStatus {
  return value === "f" || value === "nf";
}

function parseLifecycle(raw: Record<string, unknown>): RecoveryLifecycle | null {
  if (raw.lifecycle === "running" || raw.lifecycle === "exported") return raw.lifecycle;
  return raw.status === "running" ? "running" : null;
}

function parseParticipant(
  experimentId: ExperimentId,
  value: unknown,
): AnyParticipantInfo | null {
  if (experimentId === "experiment-2") {
    return isExperiment2ParticipantInfo(value) ? value : null;
  }
  if (experimentId === "experiment-4") {
    return isExperiment4ParticipantInfo(value) ? value : null;
  }
  return null;
}

function parseStimulusSet(
  experimentId: ExperimentId,
  value: unknown,
): RuntimeStimulusSet | null {
  if (experimentId === "experiment-2") return parseExperiment2StimulusSet(value);
  if (experimentId === "experiment-4") return parseExperiment4StimulusSet(value);
  return null;
}

function writeSnapshot(
  experimentId: ExperimentId,
  snapshot: RecoverySnapshot,
): boolean {
  try {
    localStorage.setItem(recoveryKey(experimentId), JSON.stringify(snapshot));
    activeSnapshots.set(experimentId, snapshot);
    return true;
  } catch (error) {
    console.error(`无法保存 ${experimentId} 恢复快照`, error);
    return false;
  }
}

export function beginRecoverySnapshot(
  participant: AnyParticipantInfo,
  stimulusSet: RuntimeStimulusSet,
  experimentId: ExperimentId = "experiment-2",
): boolean {
  return writeSnapshot(experimentId, {
    version: 1,
    lifecycle: "running",
    participant: { ...participant },
    stimulus_set: stimulusSet,
    rows: [],
    cursor: { phase: "generated" },
    updated_at: new Date().toISOString(),
  });
}

export function updateRecoveryRows(
  rows: readonly Record<string, unknown>[],
  experimentId: ExperimentId = "experiment-2",
): boolean {
  const active = activeSnapshots.get(experimentId) ?? loadRecoverySnapshot(experimentId);
  if (!active || active.lifecycle === "exported") return false;
  return writeSnapshot(experimentId, {
    ...active,
    rows: rows.map((row) => ({ ...row })),
    updated_at: new Date().toISOString(),
  });
}

export function updateRecoveryCursor(
  cursor: RecoveryCursor,
  experimentId: ExperimentId = "experiment-2",
): boolean {
  const active = activeSnapshots.get(experimentId) ?? loadRecoverySnapshot(experimentId);
  if (!active || active.lifecycle === "exported") return false;
  return writeSnapshot(experimentId, {
    ...active,
    cursor: { ...active.cursor, ...cursor },
    updated_at: new Date().toISOString(),
  });
}

export function checkpointActiveRecovery(
  experimentId: ExperimentId = "experiment-2",
): boolean {
  const active = activeSnapshots.get(experimentId) ?? loadRecoverySnapshot(experimentId);
  if (!active) return false;
  return writeSnapshot(experimentId, {
    ...active,
    updated_at: new Date().toISOString(),
  });
}

export function markRecoveryExported(
  rows: readonly Record<string, unknown>[],
  experimentStatus: RecoveryExperimentStatus,
  experimentId: ExperimentId = "experiment-2",
): boolean {
  const active = activeSnapshots.get(experimentId) ?? loadRecoverySnapshot(experimentId);
  if (!active) return false;
  return writeSnapshot(experimentId, {
    ...active,
    lifecycle: "exported",
    experiment_status: experimentStatus,
    rows: rows.map((row) => ({ ...row })),
    cursor: { ...active.cursor, phase: "between_trials" },
    updated_at: new Date().toISOString(),
  });
}

export function loadRecoverySnapshot(
  experimentId: ExperimentId = "experiment-2",
): RecoverySnapshot | null {
  try {
    const serialized = localStorage.getItem(recoveryKey(experimentId));
    if (!serialized) return null;
    const raw = JSON.parse(serialized) as unknown;
    if (!isRecord(raw) || raw.version !== 1) return null;
    const lifecycle = parseLifecycle(raw);
    if (!lifecycle) return null;
    if (lifecycle === "exported" && !isRecoveryExperimentStatus(raw.experiment_status)) {
      return null;
    }
    const participant = parseParticipant(experimentId, raw.participant);
    const stimulusSet = parseStimulusSet(experimentId, raw.stimulus_set);
    if (!participant || !stimulusSet || !Array.isArray(raw.rows) || !isRecord(raw.cursor)) {
      return null;
    }
    if (typeof raw.cursor.phase !== "string") return null;
    const snapshot: RecoverySnapshot = {
      version: 1,
      lifecycle,
      experiment_status: isRecoveryExperimentStatus(raw.experiment_status)
        ? raw.experiment_status
        : undefined,
      participant,
      stimulus_set: stimulusSet,
      rows: raw.rows.filter(isRecord).map((row) => ({ ...row })),
      cursor: raw.cursor as unknown as RecoveryCursor,
      updated_at:
        typeof raw.updated_at === "string" ? raw.updated_at : new Date(0).toISOString(),
    };
    activeSnapshots.set(experimentId, snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

export function clearRecoverySnapshot(
  experimentId: ExperimentId = "experiment-2",
): void {
  activeSnapshots.delete(experimentId);
  try {
    localStorage.removeItem(recoveryKey(experimentId));
  } catch (error) {
    console.error(`无法清除 ${experimentId} 恢复快照`, error);
  }
}
