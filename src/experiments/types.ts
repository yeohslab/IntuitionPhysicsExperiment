import type { ExperimentStatus } from "../runtime/export/exportStimulusCsv";
import type {
  Experiment2StimulusSet,
  Experiment3StimulusSet,
  ExperimentStimulusSet,
  RuntimeStimulusSet,
} from "../shared/experimentTypes";
import type {
  AnyParticipantInfo,
  Experiment2ParticipantInfo,
  Experiment3ParticipantInfo,
  ParticipantInfo,
} from "../shared/participant";

export type ExperimentId = "experiment-1" | "experiment-2" | "experiment-3";
export type AnyRuntimeStimulusSet =
  | ExperimentStimulusSet
  | Experiment2StimulusSet
  | Experiment3StimulusSet;

export type SpeedCueConfig =
  | {
      kind: "level-bars";
      minMPerSec: 0;
      maxMPerSec: number;
    }
  | {
      kind: "color-strips";
      minMPerSec: 0;
      maxMPerSec: number;
      gradient: "blue-magenta-red";
    };

export type GenerateStimulusSetOptions = {
  signal?: AbortSignal;
  onProgress?: (completedTrials: number, totalTrials: number) => void;
};

export interface ExperimentDefinition<
  P extends AnyParticipantInfo = AnyParticipantInfo,
  S extends RuntimeStimulusSet = AnyRuntimeStimulusSet,
> {
  id: ExperimentId;
  title: string;
  summary: string;
  protocolVersion: string;
  internalStimulusSchemaVersion: number;
  dataSchemaVersion: number;
  formalTrialCount: number;
  startHash: string;
  runnerHash: string;
  generateStimulusSet(
    participant: P,
    options?: GenerateStimulusSetOptions,
  ): Promise<S>;
  speedCue(participant: P): SpeedCueConfig;
  parseParticipant(value: unknown): P | null;
  parseStimulusSet(value: unknown): S | null;
  validateStimulusSet(set: S): string | null;
  buildTimeline(set: S, participant: P): Record<string, unknown>[];
  classifyStatus(
    rows: readonly Record<string, unknown>[],
    timelineEndedNaturally: boolean,
  ): ExperimentStatus;
  exportCsv(
    rows: readonly Record<string, unknown>[],
    participant: P,
    status: ExperimentStatus,
  ): void;
  downloadStimulusJson(set: S, participant: P): void;
  dataProperties(participant: P): Record<string, unknown>;
}

export type Experiment1Definition = ExperimentDefinition<
  ParticipantInfo,
  ExperimentStimulusSet
>;
export type Experiment2Definition = ExperimentDefinition<
  Experiment2ParticipantInfo,
  Experiment2StimulusSet
>;
export type Experiment3Definition = ExperimentDefinition<
  Experiment3ParticipantInfo,
  Experiment3StimulusSet
>;
