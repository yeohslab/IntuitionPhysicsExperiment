import type { ExperimentStimulusSet } from "./experimentTypes";
import type { ParticipantInfo } from "./participant";
import {
  collectPendulumTrialDescriptors,
  type PendulumTrialDescriptor,
} from "./trialDescriptor";
import { triggerTextDownload } from "./download";

export type StimulusSetExportPayload = {
  schema_version: 2;
  participant: ParticipantInfo;
  trials: PendulumTrialDescriptor[];
};

export function stimulusSetExportFilename(participant: ParticipantInfo): string {
  return `stimulus_set_group${participant.motion_group}_subject${participant.subject_id}.json`;
}

export function buildStimulusSetExportPayload(
  set: ExperimentStimulusSet,
  participant: ParticipantInfo,
): StimulusSetExportPayload {
  return {
    schema_version: 2,
    participant: { ...participant },
    trials: collectPendulumTrialDescriptors(set, participant.motion_group),
  };
}

export function downloadStimulusSetJson(
  set: ExperimentStimulusSet,
  participant: ParticipantInfo,
): void {
  const payload = buildStimulusSetExportPayload(set, participant);
  triggerTextDownload(
    `${JSON.stringify(payload, null, 2)}\n`,
    stimulusSetExportFilename(participant),
    "application/json;charset=utf-8",
  );
}
