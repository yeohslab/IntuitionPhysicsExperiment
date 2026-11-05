import type { Experiment5V2StimulusSet } from "../../shared/experimentTypes";
import type { Experiment5ParticipantInfo } from "../../shared/participant";
import { triggerTextDownload } from "../../shared/download";
import { collectExperiment5V2TrialDescriptors } from "./trialDescriptor";
import { EXPERIMENT_5_V2_PROTOCOL_VERSION } from "./protocol";

export function experiment5V2StimulusFilename(participant: Experiment5ParticipantInfo) {
  return `experiment-5_v2.0_stimulus_set_subject${participant.subject_id}.json`;
}

export function buildExperiment5V2StimulusPayload(
  set: Experiment5V2StimulusSet,
  participant: Experiment5ParticipantInfo,
) {
  return {
    schema_version: 1,
    experiment_id: "experiment-5" as const,
    protocol_version: EXPERIMENT_5_V2_PROTOCOL_VERSION,
    participant: { ...participant },
    trials: collectExperiment5V2TrialDescriptors(set),
  };
}

export function downloadExperiment5V2StimulusJson(
  set: Experiment5V2StimulusSet,
  participant: Experiment5ParticipantInfo,
): void {
  triggerTextDownload(
    `${JSON.stringify(buildExperiment5V2StimulusPayload(set, participant), null, 2)}\n`,
    experiment5V2StimulusFilename(participant),
    "application/json;charset=utf-8",
  );
}
