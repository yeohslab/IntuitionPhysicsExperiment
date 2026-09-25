import { buildTimelineFromDescriptors } from "../../runtime/buildTimeline";
import { EXPERIMENT_3_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import { isExperiment3ParticipantInfo } from "../../shared/participant";
import {
  parseExperiment3StimulusSet,
  validateRunnableSet,
} from "../../shared/storage";
import type { Experiment3Definition } from "../types";
import {
  EXPERIMENT_3_DATA_SCHEMA_VERSION,
  classifyExperiment3Status,
  exportExperiment3StimulusTrialsCsv,
} from "./exportStimulusCsv";
import { downloadExperiment3StimulusSetJson } from "./exportStimulusSetJson";
import { generateExperiment3RuntimeStimulusSetAsync } from "./generateRuntimeSetAsync";
import {
  EXPERIMENT_3_FORMAL_TRIALS,
  EXPERIMENT_3_PROTOCOL_VERSION,
  EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC,
} from "./protocol";
import { collectExperiment3TrialDescriptors } from "./trialDescriptor";

export const experiment3Definition: Experiment3Definition = {
  id: "experiment-3",
  title: "实验三",
  summary: "左右高度速度条；摆动与低能量旋转 Block 被试内混合呈现。",
  protocolVersion: EXPERIMENT_3_PROTOCOL_VERSION,
  internalStimulusSchemaVersion: EXPERIMENT_3_STIMULUS_SET_SCHEMA_VERSION,
  dataSchemaVersion: EXPERIMENT_3_DATA_SCHEMA_VERSION,
  formalTrialCount: EXPERIMENT_3_FORMAL_TRIALS,
  startHash: "#/experiment-3/start",
  runnerHash: "#/experiment-3/runner",
  generateStimulusSet: (participant, options) =>
    generateExperiment3RuntimeStimulusSetAsync({
      subjectId: participant.subject_id,
      ...options,
    }),
  speedCue: () => ({
    kind: "level-bars",
    minMPerSec: 0,
    maxMPerSec: EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC,
  }),
  parseParticipant: (value) =>
    isExperiment3ParticipantInfo(value) ? value : null,
  parseStimulusSet: parseExperiment3StimulusSet,
  validateStimulusSet: validateRunnableSet,
  buildTimeline: (set) =>
    buildTimelineFromDescriptors(
      set,
      collectExperiment3TrialDescriptors(set),
      "experiment-3",
    ),
  classifyStatus: classifyExperiment3Status,
  exportCsv: exportExperiment3StimulusTrialsCsv,
  downloadStimulusJson: downloadExperiment3StimulusSetJson,
  dataProperties: (participant) => ({
    experiment_id: "experiment-3",
    protocol_version: EXPERIMENT_3_PROTOCOL_VERSION,
    subject_id: participant.subject_id,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
  }),
};
