import { triggerTextDownload } from "../../shared/download";
import type { Training1ParticipantInfo } from "../../shared/participant";
import {
  EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION,
  type ExperimentTraining1StimulusSet,
} from "../../shared/experimentTypes";
import { TRAINING_1_PROTOCOL_VERSION } from "./protocol";
import { collectTraining1TrialDescriptors } from "./trialDescriptor";

export function training1StimulusSetFilename(participant: Training1ParticipantInfo): string {
  return `training-1_v1.0_stimulus_set_subject${participant.subject_id}.json`;
}

export function buildTraining1StimulusSetPayload(
  set: ExperimentTraining1StimulusSet,
  participant: Training1ParticipantInfo,
) {
  return {
    schema_version: EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION,
    experiment_id: "training-1" as const,
    protocol_version: TRAINING_1_PROTOCOL_VERSION,
    participant: { ...participant },
    trials: collectTraining1TrialDescriptors(set),
  };
}

export function downloadTraining1StimulusSetJson(
  set: ExperimentTraining1StimulusSet,
  participant: Training1ParticipantInfo,
): void {
  triggerTextDownload(
    JSON.stringify(buildTraining1StimulusSetPayload(set, participant), null, 2),
    training1StimulusSetFilename(participant),
    "application/json;charset=utf-8",
  );
}
