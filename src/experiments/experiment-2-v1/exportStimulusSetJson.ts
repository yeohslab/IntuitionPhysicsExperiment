import type { Experiment2StimulusSet } from "../../shared/experimentTypes";
import { triggerTextDownload } from "../../shared/download";
import type { Experiment2ParticipantInfo } from "../../shared/participant";
import { collectExperiment2TrialDescriptors } from "./trialDescriptor";
import { EXPERIMENT_2_PROTOCOL_VERSION } from "./protocol";

export const EXPERIMENT_2_STIMULUS_EXPORT_SCHEMA_VERSION = 1 as const;

export function experiment2StimulusSetExportFilename(
  participant: Experiment2ParticipantInfo,
): string {
  return `experiment-2_stimulus_set_subject${participant.subject_id}.json`;
}

export function buildExperiment2StimulusSetExportPayload(
  set: Experiment2StimulusSet,
  participant: Experiment2ParticipantInfo,
) {
  return {
    schema_version: EXPERIMENT_2_STIMULUS_EXPORT_SCHEMA_VERSION,
    experiment_id: "experiment-2" as const,
    protocol_version: EXPERIMENT_2_PROTOCOL_VERSION,
    participant: { ...participant },
    trials: collectExperiment2TrialDescriptors(set),
  };
}

export function downloadExperiment2StimulusSetJson(
  set: Experiment2StimulusSet,
  participant: Experiment2ParticipantInfo,
): void {
  triggerTextDownload(
    `${JSON.stringify(buildExperiment2StimulusSetExportPayload(set, participant), null, 2)}\n`,
    experiment2StimulusSetExportFilename(participant),
    "application/json;charset=utf-8",
  );
}
