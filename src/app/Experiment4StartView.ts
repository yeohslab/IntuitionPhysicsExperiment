import { experiment4Definition } from "../experiments/experiment-4/definition";
import { EXPERIMENT_4_TOTAL_RUNTIME_TRIALS } from "../experiments/experiment-4/protocol";
import {
  buildExperiment4SubjectId,
  isExperiment4ParticipantInfo,
  parseExperiment4WithinGroupNumber,
} from "../shared/participant";
import type { ExperimentDefinition } from "../experiments/types";
import {
  disposeExperiment2Start,
  mountWithinSubjectStart,
  type WithinSubjectStartConfig,
} from "./Experiment2StartView";

const experiment4StartConfig: WithinSubjectStartConfig = {
  experimentId: "experiment-4",
  displayName: "实验四",
  subjectPrefix: "E4",
  runnerHash: "#/experiment-4/runner",
  totalTrials: EXPERIMENT_4_TOTAL_RUNTIME_TRIALS,
  definition: experiment4Definition as ExperimentDefinition,
  buildSubjectId: buildExperiment4SubjectId,
  parseWithinGroupNumber: parseExperiment4WithinGroupNumber,
  parseParticipant: (value) =>
    isExperiment4ParticipantInfo(value) ? value : null,
};

export function disposeExperiment4Start(): void {
  disposeExperiment2Start();
}

export function mountExperiment4Start(container: HTMLElement): void {
  mountWithinSubjectStart(container, experiment4StartConfig);
}
