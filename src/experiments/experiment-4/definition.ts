import { buildTimelineFromDescriptors } from "../../runtime/buildTimeline";
import { EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import { isExperiment4ParticipantInfo } from "../../shared/participant";
import {
  parseExperiment4StimulusSet,
  validateRunnableSet,
} from "../../shared/storage";
import type { Experiment4Definition } from "../types";
import {
  EXPERIMENT_4_DATA_SCHEMA_VERSION,
  classifyExperiment4Status,
  exportExperiment4StimulusTrialsCsv,
} from "./exportStimulusCsv";
import { downloadExperiment4StimulusSetJson } from "./exportStimulusSetJson";
import { collectExperiment4TrialDescriptors } from "./trialDescriptor";
import {
  EXPERIMENT_4_FORMAL_TRIALS,
  EXPERIMENT_4_PROTOCOL_VERSION,
} from "./protocol";
import { generateExperiment4RuntimeStimulusSetAsync } from "./generateRuntimeSet";

export const experiment4Definition: Experiment4Definition = {
  id: "experiment-4",
  title: "实验四",
  summary: "协议 1.0.0：光栅遮挡单摆；先角度后速度。",
  protocolVersion: EXPERIMENT_4_PROTOCOL_VERSION,
  internalStimulusSchemaVersion: EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION,
  dataSchemaVersion: EXPERIMENT_4_DATA_SCHEMA_VERSION,
  formalTrialCount: EXPERIMENT_4_FORMAL_TRIALS,
  startHash: "#/experiment-4/start",
  runnerHash: "#/experiment-4/runner",
  generateStimulusSet: (_participant, options) =>
    generateExperiment4RuntimeStimulusSetAsync({
      onProgress: options?.onProgress,
    }),
  parseParticipant: (value) =>
    isExperiment4ParticipantInfo(value) ? value : null,
  parseStimulusSet: parseExperiment4StimulusSet,
  validateStimulusSet: validateRunnableSet,
  buildTimeline: (set) =>
    buildTimelineFromDescriptors(
      set,
      collectExperiment4TrialDescriptors(set),
      "experiment-4",
    ),
  classifyStatus: classifyExperiment4Status,
  exportCsv: exportExperiment4StimulusTrialsCsv,
  downloadStimulusJson: downloadExperiment4StimulusSetJson,
  dataProperties: (participant) => ({
    experiment_id: "experiment-4",
    protocol_version: EXPERIMENT_4_PROTOCOL_VERSION,
    subject_id: participant.subject_id,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
  }),
};
