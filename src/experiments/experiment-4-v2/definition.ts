import { buildTimelineFromDescriptors } from "../../runtime/buildTimeline";
import RefreshRateCheckPlugin from "../../runtime/plugins/refreshRateCheckPlugin";
import { EXPERIMENT_4_V2_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import { isExperiment4ParticipantInfo } from "../../shared/participant";
import { parseExperiment4V2StimulusSet, validateRunnableSet } from "../../shared/storage";
import type { Experiment4V2Definition } from "../types";
import {
  classifyExperiment4V2Status,
  EXPERIMENT_4_V2_DATA_SCHEMA_VERSION,
  exportExperiment4V2Csv,
} from "./exportStimulusCsv";
import { downloadExperiment4V2StimulusJson } from "./exportStimulusSetJson";
import { generateExperiment4V2RuntimeStimulusSetAsync } from "./generateRuntimeSet";
import {
  EXPERIMENT_4_V2_FORMAL_TRIALS,
  EXPERIMENT_4_V2_PROTOCOL_VERSION,
  EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC,
} from "./protocol";
import { collectExperiment4V2TrialDescriptors } from "./trialDescriptor";

export const experiment4V2Definition: Experiment4V2Definition = {
  id: "experiment-4-v2",
  experimentId: "experiment-4",
  title: "实验四",
  summary: "协议 2.0.0：固定60°轨道、三个可见片段与隐藏反向追踪。",
  protocolVersion: EXPERIMENT_4_V2_PROTOCOL_VERSION,
  internalStimulusSchemaVersion: EXPERIMENT_4_V2_STIMULUS_SET_SCHEMA_VERSION,
  dataSchemaVersion: EXPERIMENT_4_V2_DATA_SCHEMA_VERSION,
  formalTrialCount: EXPERIMENT_4_V2_FORMAL_TRIALS,
  startHash: "#/experiment-4/v2/start",
  runnerHash: "#/experiment-4/v2/runner",
  generateStimulusSet: (participant, options) =>
    generateExperiment4V2RuntimeStimulusSetAsync(participant, {
      signal: options?.signal,
      onProgress: options?.onProgress,
    }),
  speedCue: () => ({
    kind: "color-strips",
    minMPerSec: 0,
    maxMPerSec: EXPERIMENT_4_V2_SPEED_SCALE_LINEAR_M_PER_SEC,
    gradient: "turbo",
  }),
  parseParticipant: (value) => isExperiment4ParticipantInfo(value) ? value : null,
  parseStimulusSet: parseExperiment4V2StimulusSet,
  validateStimulusSet: validateRunnableSet,
  buildTimeline: (set) => [
    { type: RefreshRateCheckPlugin, minimumHz: 59, sampleFrames: 120 },
    ...buildTimelineFromDescriptors(
      set,
      collectExperiment4V2TrialDescriptors(set),
      "experiment-4-v2",
    ),
  ],
  classifyStatus: classifyExperiment4V2Status,
  exportCsv: exportExperiment4V2Csv,
  downloadStimulusJson: downloadExperiment4V2StimulusJson,
  dataProperties: (participant) => ({
    experiment_id: "experiment-4",
    runtime_variant_id: "experiment-4-v2",
    protocol_version: EXPERIMENT_4_V2_PROTOCOL_VERSION,
    subject_id: participant.subject_id,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
  }),
};
