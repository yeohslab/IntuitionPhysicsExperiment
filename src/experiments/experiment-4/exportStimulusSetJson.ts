import type { Experiment4StimulusSet } from "../../shared/experimentTypes";
import { triggerTextDownload } from "../../shared/download";
import type { Experiment4ParticipantInfo } from "../../shared/participant";
import { collectExperiment4TrialDescriptors } from "./trialDescriptor";
import { EXPERIMENT_4_PROTOCOL_VERSION } from "./protocol";
import {
  SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC,
  SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC,
  SPEED_STRIP_SCALE_ENERGY_J,
} from "../../experiment/physics/speedStripScale";

export const EXPERIMENT_4_STIMULUS_EXPORT_SCHEMA_VERSION = 3 as const;

export function experiment4StimulusSetExportFilename(
  participant: Experiment4ParticipantInfo,
): string {
  return `experiment-4_v1.0_stimulus_set_subject${participant.subject_id}.json`;
}

export function buildExperiment4StimulusSetExportPayload(
  set: Experiment4StimulusSet,
  participant: Experiment4ParticipantInfo,
) {
  return {
    schema_version: EXPERIMENT_4_STIMULUS_EXPORT_SCHEMA_VERSION,
    experiment_id: "experiment-4" as const,
    protocol_version: EXPERIMENT_4_PROTOCOL_VERSION,
    speed_scale: {
      energy_j: SPEED_STRIP_SCALE_ENERGY_J,
      linear_v_max_m_per_sec: SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC,
      omega_max_rad_per_sec: SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC,
    },
    participant: { ...participant },
    trials: collectExperiment4TrialDescriptors(set),
  };
}

export function downloadExperiment4StimulusSetJson(
  set: Experiment4StimulusSet,
  participant: Experiment4ParticipantInfo,
): void {
  triggerTextDownload(
    `${JSON.stringify(buildExperiment4StimulusSetExportPayload(set, participant), null, 2)}\n`,
    experiment4StimulusSetExportFilename(participant),
    "application/json;charset=utf-8",
  );
}
