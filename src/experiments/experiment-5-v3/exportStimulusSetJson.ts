import type { Experiment5V3StimulusSet } from "../../shared/experimentTypes";
import type { Experiment5ParticipantInfo } from "../../shared/participant";
import { triggerTextDownload } from "../../shared/download";
import { collectExperiment5V3TrialDescriptors } from "./trialDescriptor";
import { EXPERIMENT_5_V3_PROTOCOL_VERSION } from "./protocol";

export function experiment5V3StimulusFilename(participant: Experiment5ParticipantInfo) {
  return `experiment-5_v3.0_stimulus_set_subject${participant.subject_id}.json`;
}

export function downloadExperiment5V3StimulusJson(
  set: Experiment5V3StimulusSet,
  participant: Experiment5ParticipantInfo,
): void {
  triggerTextDownload(
    `${JSON.stringify({
      schema_version: 1,
      experiment_id: "experiment-5",
      protocol_version: EXPERIMENT_5_V3_PROTOCOL_VERSION,
      participant: { ...participant },
      trials: collectExperiment5V3TrialDescriptors(set),
    }, null, 2)}\n`,
    experiment5V3StimulusFilename(participant),
    "application/json;charset=utf-8",
  );
}
