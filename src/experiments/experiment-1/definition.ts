import { buildTimeline } from "../../runtime/buildTimeline";
import {
  DATA_SCHEMA_VERSION,
  classifyExperimentStatus,
  exportStimulusTrialsCsv,
} from "../../runtime/export/exportStimulusCsv";
import { STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import { downloadStimulusSetJson } from "../../shared/exportStimulusSetJson";
import { isParticipantInfo } from "../../shared/participant";
import {
  parseExperimentStimulusSet,
  validateRunnableSet,
} from "../../shared/storage";
import type { Experiment1Definition } from "../types";
import { speedBarVMaxForGroup } from "../../experiment/physics/energySegments";
import { generateRuntimeStimulusSetAsync } from "./generateRuntimeSetAsync";

export const experiment1Definition: Experiment1Definition = {
  id: "experiment-1",
  title: "实验一",
  summary: "左右高度速度条；摆动组与旋转组分组进行。",
  protocolVersion: "1.0.0",
  internalStimulusSchemaVersion: STIMULUS_SET_SCHEMA_VERSION,
  dataSchemaVersion: DATA_SCHEMA_VERSION,
  formalTrialCount: 135,
  startHash: "#/experiment-1/start",
  runnerHash: "#/experiment-1/runner",
  generateStimulusSet: (participant, options) =>
    generateRuntimeStimulusSetAsync({
      group: participant.motion_group,
      subjectId: participant.subject_id,
      ...options,
    }),
  speedCue: (participant) => ({
    kind: "level-bars",
    minMPerSec: 0,
    maxMPerSec: speedBarVMaxForGroup(participant.motion_group),
  }),
  parseParticipant: (value) => (isParticipantInfo(value) ? value : null),
  parseStimulusSet: parseExperimentStimulusSet,
  validateStimulusSet: validateRunnableSet,
  buildTimeline: (set, participant) => buildTimeline(set, participant.motion_group),
  classifyStatus: classifyExperimentStatus,
  exportCsv: exportStimulusTrialsCsv,
  downloadStimulusJson: downloadStimulusSetJson,
  dataProperties: (participant) => ({
    subject_id: participant.subject_id,
    motion_group: participant.motion_group,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
  }),
};
