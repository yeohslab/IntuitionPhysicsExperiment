import type { Experiment4V2StimulusSet } from "../../shared/experimentTypes";
import type { Experiment4ParticipantInfo } from "../../shared/participant";
import { triggerTextDownload } from "../../shared/download";
import { collectExperiment4V2TrialDescriptors } from "./trialDescriptor";
import { EXPERIMENT_4_V2_PROTOCOL_VERSION } from "./protocol";

export function experiment4V2StimulusFilename(participant: Experiment4ParticipantInfo) {
  return `experiment-4_v2.0_stimulus_set_subject${participant.subject_id}.json`;
}

export function buildExperiment4V2StimulusPayload(
  set: Experiment4V2StimulusSet,
  participant: Experiment4ParticipantInfo,
) {
  return {
    schema_version: 1,
    experiment_id: "experiment-4" as const,
    protocol_version: EXPERIMENT_4_V2_PROTOCOL_VERSION,
    participant: { ...participant },
    trials: collectExperiment4V2TrialDescriptors(set),
  };
}

export function downloadExperiment4V2StimulusJson(
  set: Experiment4V2StimulusSet,
  participant: Experiment4ParticipantInfo,
): void {
  triggerTextDownload(
    `${JSON.stringify(buildExperiment4V2StimulusPayload(set, participant), null, 2)}\n`,
    experiment4V2StimulusFilename(participant),
    "application/json;charset=utf-8",
  );
}
