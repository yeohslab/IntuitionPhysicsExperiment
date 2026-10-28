import { training1Definition } from "../experiments/training-1/definition";
import { TRAINING_1_TOTAL_RUNTIME_TRIALS } from "../experiments/training-1/protocol";
import {
  buildTraining1SubjectId,
  isTraining1ParticipantInfo,
  parseTraining1WithinGroupNumber,
} from "../shared/participant";
import type { ExperimentDefinition } from "../experiments/types";
import {
  disposeExperiment2Start,
  mountWithinSubjectStart,
  type WithinSubjectStartConfig,
} from "./Experiment2StartView";

const config: WithinSubjectStartConfig = {
  experimentId: "training-1",
  displayName: "训练一",
  subjectPrefix: "T1",
  runnerHash: "#/training-1/runner",
  totalTrials: TRAINING_1_TOTAL_RUNTIME_TRIALS,
  definition: training1Definition as ExperimentDefinition,
  buildSubjectId: buildTraining1SubjectId,
  parseWithinGroupNumber: parseTraining1WithinGroupNumber,
  parseParticipant: (value) => (isTraining1ParticipantInfo(value) ? value : null),
};

export function disposeTraining1Start(): void {
  disposeExperiment2Start();
}

export function mountTraining1Start(container: HTMLElement): void {
  mountWithinSubjectStart(container, config);
}
