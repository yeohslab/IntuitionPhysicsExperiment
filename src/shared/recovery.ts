import type { ParticipantInfo } from "./participant";
import type { ExperimentStimulusSet } from "./experimentTypes";
import { isParticipantInfo } from "./participant";
import { parseExperimentStimulusSet } from "./storage";

const RECOVERY_KEY = "intuition-physics-recovery-v1";

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
  status: "running";
  participant: ParticipantInfo;
  stimulus_set: ExperimentStimulusSet;
  rows: Record<string, unknown>[];
  cursor: RecoveryCursor;
  updated_at: string;
}

let activeSnapshot: RecoverySnapshot | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeSnapshot(snapshot: RecoverySnapshot): boolean {
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(snapshot));
    activeSnapshot = snapshot;
    return true;
  } catch (error) {
    console.error("无法保存实验恢复快照", error);
    return false;
  }
}

export function beginRecoverySnapshot(
  participant: ParticipantInfo,
  stimulusSet: ExperimentStimulusSet,
): boolean {
  return writeSnapshot({
    version: 1,
    status: "running",
    participant: { ...participant },
    stimulus_set: stimulusSet,
    rows: [],
    cursor: { phase: "generated" },
    updated_at: new Date().toISOString(),
  });
}

export function updateRecoveryRows(rows: readonly Record<string, unknown>[]): boolean {
  if (!activeSnapshot) activeSnapshot = loadRecoverySnapshot();
  if (!activeSnapshot) return false;
  return writeSnapshot({
    ...activeSnapshot,
    rows: rows.map((row) => ({ ...row })),
    updated_at: new Date().toISOString(),
  });
}

export function updateRecoveryCursor(cursor: RecoveryCursor): boolean {
  if (!activeSnapshot) activeSnapshot = loadRecoverySnapshot();
  if (!activeSnapshot) return false;
  return writeSnapshot({
    ...activeSnapshot,
    cursor: { ...activeSnapshot.cursor, ...cursor },
    updated_at: new Date().toISOString(),
  });
}

export function checkpointActiveRecovery(): boolean {
  if (!activeSnapshot) activeSnapshot = loadRecoverySnapshot();
  if (!activeSnapshot) return false;
  return writeSnapshot({
    ...activeSnapshot,
    updated_at: new Date().toISOString(),
  });
}

export function loadRecoverySnapshot(): RecoverySnapshot | null {
  try {
    const serialized = localStorage.getItem(RECOVERY_KEY);
    if (!serialized) return null;
    const raw = JSON.parse(serialized) as unknown;
    if (!isRecord(raw) || raw.version !== 1 || raw.status !== "running") return null;
    if (!isParticipantInfo(raw.participant)) return null;
    const stimulusSet = parseExperimentStimulusSet(raw.stimulus_set);
    if (!stimulusSet || !Array.isArray(raw.rows) || !isRecord(raw.cursor)) return null;
    const rows = raw.rows.filter(isRecord).map((row) => ({ ...row }));
    const phase = raw.cursor.phase;
    if (typeof phase !== "string") return null;
    const snapshot: RecoverySnapshot = {
      version: 1,
      status: "running",
      participant: raw.participant,
      stimulus_set: stimulusSet,
      rows,
      cursor: raw.cursor as unknown as RecoveryCursor,
      updated_at:
        typeof raw.updated_at === "string" ? raw.updated_at : new Date(0).toISOString(),
    };
    activeSnapshot = snapshot;
    return snapshot;
  } catch {
    return null;
  }
}

export function clearRecoverySnapshot(): void {
  activeSnapshot = null;
  try {
    localStorage.removeItem(RECOVERY_KEY);
  } catch (error) {
    console.error("无法清除实验恢复快照", error);
  }
}
