import { buildTimelineFromDescriptors } from "../../runtime/buildTimeline";
import { EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import { isExperiment2ParticipantInfo } from "../../shared/participant";
import {
  parseExperiment2StimulusSet,
  validateRunnableSet,
} from "../../shared/storage";
import type { Experiment2Definition } from "../types";
import {
  EXPERIMENT_2_DATA_SCHEMA_VERSION,
  classifyExperiment2Status,
  exportExperiment2StimulusTrialsCsv,
} from "./exportStimulusCsv";
import { downloadExperiment2StimulusSetJson } from "./exportStimulusSetJson";
import { collectExperiment2TrialDescriptors } from "./trialDescriptor";
import {
  EXPERIMENT_2_FORMAL_TRIALS,
  EXPERIMENT_2_PROTOCOL_VERSION,
  EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
} from "./protocol";
import { generateExperiment2RuntimeStimulusSetAsync } from "./generateRuntimeSetAsync";

export const experiment2Definition: Experiment2Definition = {
  id: "experiment-2",
  title: "实验二",
  summary: "上下颜色速度条；摆动与低能量旋转 Block 混合呈现。",
  protocolVersion: EXPERIMENT_2_PROTOCOL_VERSION,
  internalStimulusSchemaVersion: EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  dataSchemaVersion: EXPERIMENT_2_DATA_SCHEMA_VERSION,
  formalTrialCount: EXPERIMENT_2_FORMAL_TRIALS,
  startHash: "#/experiment-2/start",
  runnerHash: "#/experiment-2/runner",
  generateStimulusSet: (participant, options) =>
    generateExperiment2RuntimeStimulusSetAsync({
      subjectId: participant.subject_id,
      ...options,
    }),
  speedCue: () => ({
    kind: "color-strips",
    minMPerSec: 0,
    maxMPerSec: EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
    gradient: "green-yellow-red",
  }),
  parseParticipant: (value) =>
    isExperiment2ParticipantInfo(value) ? value : null,
  parseStimulusSet: parseExperiment2StimulusSet,
  validateStimulusSet: validateRunnableSet,
  buildTimeline: (set) =>
    buildTimelineFromDescriptors(
      set,
      collectExperiment2TrialDescriptors(set),
      "experiment-2",
    ),
  classifyStatus: classifyExperiment2Status,
  exportCsv: exportExperiment2StimulusTrialsCsv,
  downloadStimulusJson: downloadExperiment2StimulusSetJson,
  dataProperties: (participant) => ({
    experiment_id: "experiment-2",
    protocol_version: EXPERIMENT_2_PROTOCOL_VERSION,
    subject_id: participant.subject_id,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
  }),
};
