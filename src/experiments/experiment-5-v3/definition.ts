import { buildTimelineFromDescriptors } from "../../runtime/buildTimeline";
import RefreshRateCheckPlugin from "../../runtime/plugins/refreshRateCheckPlugin";
import { EXPERIMENT_5_V3_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import { isExperiment5ParticipantInfo } from "../../shared/participant";
import { parseExperiment5V3StimulusSet, validateRunnableSet } from "../../shared/storage";
import type { Experiment5V3Definition } from "../types";
import {
  classifyExperiment5V3Status,
  EXPERIMENT_5_V3_DATA_SCHEMA_VERSION,
  exportExperiment5V3Csv,
} from "./exportStimulusCsv";
import { downloadExperiment5V3StimulusJson } from "./exportStimulusSetJson";
import { generateExperiment5V3RuntimeStimulusSetAsync } from "./generateRuntimeSet";
import {
  EXPERIMENT_5_V3_FORMAL_TRIALS,
  EXPERIMENT_5_V3_PROTOCOL_VERSION,
} from "./protocol";
import { collectExperiment5V3TrialDescriptors } from "./trialDescriptor";

export const experiment5V3Definition: Experiment5V3Definition = {
  id: "experiment-5-v3",
  experimentId: "experiment-5",
  title: "实验五",
  summary: "协议 3.0.0：整幅遮挡，只留一条位置会变的缝。",
  protocolVersion: EXPERIMENT_5_V3_PROTOCOL_VERSION,
  internalStimulusSchemaVersion: EXPERIMENT_5_V3_STIMULUS_SET_SCHEMA_VERSION,
  dataSchemaVersion: EXPERIMENT_5_V3_DATA_SCHEMA_VERSION,
  formalTrialCount: EXPERIMENT_5_V3_FORMAL_TRIALS,
  startHash: "#/experiment-5/v3/start",
  runnerHash: "#/experiment-5/v3/runner",
  generateStimulusSet: (participant, options) =>
    generateExperiment5V3RuntimeStimulusSetAsync(participant, {
      signal: options?.signal,
      onProgress: options?.onProgress,
    }),
  parseParticipant: (value) => isExperiment5ParticipantInfo(value) ? value : null,
  parseStimulusSet: parseExperiment5V3StimulusSet,
  validateStimulusSet: validateRunnableSet,
  buildTimeline: (set) => [
    { type: RefreshRateCheckPlugin, minimumHz: 59, sampleFrames: 120 },
    ...buildTimelineFromDescriptors(
      set,
      collectExperiment5V3TrialDescriptors(set),
      "experiment-5-v3",
    ),
  ],
  classifyStatus: classifyExperiment5V3Status,
  exportCsv: exportExperiment5V3Csv,
  downloadStimulusJson: downloadExperiment5V3StimulusJson,
  dataProperties: (participant) => ({
    experiment_id: "experiment-5",
    runtime_variant_id: "experiment-5-v3",
    protocol_version: EXPERIMENT_5_V3_PROTOCOL_VERSION,
    subject_id: participant.subject_id,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
  }),
};
