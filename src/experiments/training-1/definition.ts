import { EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import { isTraining1ParticipantInfo } from "../../shared/participant";
import { parseTraining1StimulusSet, validateRunnableSet } from "../../shared/storage";
import type { Training1Definition } from "../types";
import {
  classifyTraining1Status,
  exportTraining1Csv,
  TRAINING_1_DATA_SCHEMA_VERSION,
} from "./exportStimulusCsv";
import { downloadTraining1StimulusSetJson } from "./exportStimulusSetJson";
import { generateTraining1RuntimeStimulusSetAsync } from "./generateRuntimeSet";
import { buildTraining1Timeline } from "./buildTimeline";
import { TRAINING_1_PROTOCOL_VERSION } from "./protocol";

export const training1Definition: Training1Definition = {
  id: "training-1",
  title: "训练一",
  summary: "协议 1.0.0：通过锚点示范与自适应反馈学习瞬时速度—颜色映射。",
  protocolVersion: TRAINING_1_PROTOCOL_VERSION,
  internalStimulusSchemaVersion: EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION,
  dataSchemaVersion: TRAINING_1_DATA_SCHEMA_VERSION,
  formalTrialCount: 0,
  startHash: "#/training-1/start",
  runnerHash: "#/training-1/runner",
  generateStimulusSet: (participant, options) =>
    generateTraining1RuntimeStimulusSetAsync(participant, {
      onProgress: options?.onProgress,
    }),
  parseParticipant: (value) => (isTraining1ParticipantInfo(value) ? value : null),
  parseStimulusSet: parseTraining1StimulusSet,
  validateStimulusSet: validateRunnableSet,
  buildTimeline: (set, _participant, jsPsych) => buildTraining1Timeline(set, jsPsych),
  classifyStatus: classifyTraining1Status,
  exportCsv: exportTraining1Csv,
  downloadStimulusJson: downloadTraining1StimulusSetJson,
  dataProperties: (participant) => ({
    experiment_id: "training-1",
    protocol_version: TRAINING_1_PROTOCOL_VERSION,
    subject_id: participant.subject_id,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
  }),
};
