import type { Experiment3StimulusSet } from "../../shared/experimentTypes";
import { triggerTextDownload } from "../../shared/download";
import type { Experiment3ParticipantInfo } from "../../shared/participant";
import { collectExperiment3TrialDescriptors } from "./trialDescriptor";
import { EXPERIMENT_3_PROTOCOL_VERSION } from "./protocol";

export const EXPERIMENT_3_STIMULUS_EXPORT_SCHEMA_VERSION = 1 as const;

export function experiment3StimulusSetExportFilename(
  participant: Experiment3ParticipantInfo,
): string {
  return `experiment-3_stimulus_set_subject${participant.subject_id}.json`;
}

export function buildExperiment3StimulusSetExportPayload(
  set: Experiment3StimulusSet,
  participant: Experiment3ParticipantInfo,
) {
  return {
    schema_version: EXPERIMENT_3_STIMULUS_EXPORT_SCHEMA_VERSION,
    experiment_id: "experiment-3" as const,
    protocol_version: EXPERIMENT_3_PROTOCOL_VERSION,
    participant: { ...participant },
    trials: collectExperiment3TrialDescriptors(set),
  };
}

export function downloadExperiment3StimulusSetJson(
  set: Experiment3StimulusSet,
  participant: Experiment3ParticipantInfo,
): void {
  triggerTextDownload(
    `${JSON.stringify(buildExperiment3StimulusSetExportPayload(set, participant), null, 2)}\n`,
    experiment3StimulusSetExportFilename(participant),
    "application/json;charset=utf-8",
  );
}
