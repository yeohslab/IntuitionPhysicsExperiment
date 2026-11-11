import { experiment5V3Definition } from "../experiments/experiment-5-v3/definition";
import { EXPERIMENT_5_V3_TOTAL_RUNTIME_TRIALS } from "../experiments/experiment-5-v3/protocol";
import {
  buildExperiment5SubjectId,
  isExperiment5ParticipantInfo,
  parseExperiment5WithinGroupNumber,
} from "../shared/participant";
import type { ExperimentDefinition } from "../experiments/types";
import {
  disposeExperiment2Start,
  mountWithinSubjectStart,
  type WithinSubjectStartConfig,
} from "./Experiment2StartView";

const config: WithinSubjectStartConfig = {
  experimentId: "experiment-5-v3",
  displayName: "实验五（协议 3.0）",
  subjectPrefix: "E5",
  runnerHash: "#/experiment-5/v3/runner",
  totalTrials: EXPERIMENT_5_V3_TOTAL_RUNTIME_TRIALS,
  definition: experiment5V3Definition as ExperimentDefinition,
  buildSubjectId: buildExperiment5SubjectId,
  parseWithinGroupNumber: parseExperiment5WithinGroupNumber,
  parseParticipant: (value) => isExperiment5ParticipantInfo(value) ? value : null,
};

export function disposeExperiment5V3Start(): void { disposeExperiment2Start(); }
export function mountExperiment5V3Start(container: HTMLElement): void {
  mountWithinSubjectStart(container, config);
}
