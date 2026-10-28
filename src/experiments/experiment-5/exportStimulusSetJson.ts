import type { Experiment5StimulusSet } from "../../shared/experimentTypes";
import type { Experiment5ParticipantInfo } from "../../shared/participant";
import { triggerTextDownload } from "../../shared/download";
import { collectExperiment5TrialDescriptors } from "./trialDescriptor";
import { EXPERIMENT_5_PROTOCOL_VERSION } from "./protocol";

export function experiment5StimulusSetFilename(p: Experiment5ParticipantInfo) { return `experiment-5_v1.0_stimulus_set_subject${p.subject_id}.json`; }
export function buildExperiment5StimulusSetPayload(set: Experiment5StimulusSet, participant: Experiment5ParticipantInfo) {
  return { schema_version: 1, experiment_id: "experiment-5" as const, protocol_version: EXPERIMENT_5_PROTOCOL_VERSION, participant: { ...participant }, trials: collectExperiment5TrialDescriptors(set) };
}
export function downloadExperiment5StimulusSetJson(set: Experiment5StimulusSet, participant: Experiment5ParticipantInfo): void {
  triggerTextDownload(`${JSON.stringify(buildExperiment5StimulusSetPayload(set, participant), null, 2)}\n`, experiment5StimulusSetFilename(participant), "application/json;charset=utf-8");
}
