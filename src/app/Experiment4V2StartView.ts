import { experiment4V2Definition } from "../experiments/experiment-4-v2/definition";
import { EXPERIMENT_4_V2_TOTAL_RUNTIME_TRIALS } from "../experiments/experiment-4-v2/protocol";
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

const config: WithinSubjectStartConfig = {
  experimentId: "experiment-4-v2",
  displayName: "实验四（协议 2.0）",
  subjectPrefix: "E4",
  runnerHash: "#/experiment-4/v2/runner",
  totalTrials: EXPERIMENT_4_V2_TOTAL_RUNTIME_TRIALS,
  definition: experiment4V2Definition as ExperimentDefinition,
  buildSubjectId: buildExperiment4SubjectId,
  parseWithinGroupNumber: parseExperiment4WithinGroupNumber,
  parseParticipant: (value) => isExperiment4ParticipantInfo(value) ? value : null,
};

export function disposeExperiment4V2Start(): void { disposeExperiment2Start(); }
export function mountExperiment4V2Start(container: HTMLElement): void {
  mountWithinSubjectStart(container, config);
}
