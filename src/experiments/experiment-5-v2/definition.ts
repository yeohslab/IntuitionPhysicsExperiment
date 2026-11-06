import { buildTimelineFromDescriptors } from "../../runtime/buildTimeline";
import RefreshRateCheckPlugin from "../../runtime/plugins/refreshRateCheckPlugin";
import { EXPERIMENT_5_V2_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import { isExperiment5ParticipantInfo } from "../../shared/participant";
import { parseExperiment5V2StimulusSet, validateRunnableSet } from "../../shared/storage";
import type { Experiment5V2Definition } from "../types";
import {
  classifyExperiment5V2Status,
  EXPERIMENT_5_V2_DATA_SCHEMA_VERSION,
  exportExperiment5V2Csv,
} from "./exportStimulusCsv";
import { downloadExperiment5V2StimulusJson } from "./exportStimulusSetJson";
import { generateExperiment5V2RuntimeStimulusSetAsync } from "./generateRuntimeSet";
import {
  EXPERIMENT_5_V2_FORMAL_TRIALS,
  EXPERIMENT_5_V2_PROTOCOL_VERSION,
} from "./protocol";
import { collectExperiment5V2TrialDescriptors } from "./trialDescriptor";

export const experiment5V2Definition: Experiment5V2Definition = {
  id: "experiment-5-v2",
  experimentId: "experiment-5",
  title: "实验五",
  summary: "协议 2.0.0：光栅编号加3个可见片段后的铃铛可达性判断。",
  protocolVersion: EXPERIMENT_5_V2_PROTOCOL_VERSION,
  internalStimulusSchemaVersion: EXPERIMENT_5_V2_STIMULUS_SET_SCHEMA_VERSION,
  dataSchemaVersion: EXPERIMENT_5_V2_DATA_SCHEMA_VERSION,
  formalTrialCount: EXPERIMENT_5_V2_FORMAL_TRIALS,
  startHash: "#/experiment-5/v2/start",
  runnerHash: "#/experiment-5/v2/runner",
  generateStimulusSet: (participant, options) =>
    generateExperiment5V2RuntimeStimulusSetAsync(participant, {
      signal: options?.signal,
      onProgress: options?.onProgress,
    }),
  parseParticipant: (value) => isExperiment5ParticipantInfo(value) ? value : null,
  parseStimulusSet: parseExperiment5V2StimulusSet,
  validateStimulusSet: validateRunnableSet,
  buildTimeline: (set) => [
    { type: RefreshRateCheckPlugin, minimumHz: 59, sampleFrames: 120 },
    ...buildTimelineFromDescriptors(
      set,
      collectExperiment5V2TrialDescriptors(set),
      "experiment-5-v2",
    ),
  ],
  classifyStatus: classifyExperiment5V2Status,
  exportCsv: exportExperiment5V2Csv,
  downloadStimulusJson: downloadExperiment5V2StimulusJson,
  dataProperties: (participant) => ({
    experiment_id: "experiment-5",
    runtime_variant_id: "experiment-5-v2",
    protocol_version: EXPERIMENT_5_V2_PROTOCOL_VERSION,
    subject_id: participant.subject_id,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
  }),
};
