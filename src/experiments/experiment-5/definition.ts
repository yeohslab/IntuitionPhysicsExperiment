import { buildTimelineFromDescriptors } from "../../runtime/buildTimeline";
import { EXPERIMENT_5_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import { isExperiment5ParticipantInfo } from "../../shared/participant";
import { parseExperiment5StimulusSet, validateRunnableSet } from "../../shared/storage";
import type { Experiment5Definition } from "../types";
import { classifyExperiment5Status, EXPERIMENT_5_DATA_SCHEMA_VERSION, exportExperiment5Csv } from "./exportStimulusCsv";
import { downloadExperiment5StimulusSetJson } from "./exportStimulusSetJson";
import { generateExperiment5RuntimeStimulusSetAsync } from "./generateRuntimeSet";
import { EXPERIMENT_5_FORMAL_TRIALS, EXPERIMENT_5_PROTOCOL_VERSION } from "./protocol";
import { collectExperiment5TrialDescriptors } from "./trialDescriptor";

export const experiment5Definition: Experiment5Definition = {
  id: "experiment-5", title: "实验五", summary: "协议 1.0.0：连续能量单摆的目标可达性判断。",
  protocolVersion: EXPERIMENT_5_PROTOCOL_VERSION, internalStimulusSchemaVersion: EXPERIMENT_5_STIMULUS_SET_SCHEMA_VERSION,
  dataSchemaVersion: EXPERIMENT_5_DATA_SCHEMA_VERSION, formalTrialCount: EXPERIMENT_5_FORMAL_TRIALS,
  startHash: "#/experiment-5/start", runnerHash: "#/experiment-5/runner",
  generateStimulusSet: (participant, options) => generateExperiment5RuntimeStimulusSetAsync(participant, { onProgress: options?.onProgress }),
  parseParticipant: (v) => isExperiment5ParticipantInfo(v) ? v : null,
  parseStimulusSet: parseExperiment5StimulusSet,
  validateStimulusSet: validateRunnableSet,
  buildTimeline: (set) => buildTimelineFromDescriptors(set, collectExperiment5TrialDescriptors(set), "experiment-5"),
  classifyStatus: classifyExperiment5Status, exportCsv: exportExperiment5Csv, downloadStimulusJson: downloadExperiment5StimulusSetJson,
  dataProperties: (p) => ({ experiment_id: "experiment-5", protocol_version: EXPERIMENT_5_PROTOCOL_VERSION, subject_id: p.subject_id, gender_code: p.gender_code, age_years: p.age_years }),
};
