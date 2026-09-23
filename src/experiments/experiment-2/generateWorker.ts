import type { Experiment2StimulusSet } from "../../shared/experimentTypes";
import {
  EXPERIMENT_2_TOTAL_RUNTIME_TRIALS,
  generateExperiment2RuntimeStimulusSet,
} from "./generateRuntimeSet";

type GenerateWorkerRequest = { subjectId: string };

export type Experiment2GenerateWorkerResponse =
  | { type: "progress"; completedTrials: number; totalTrials: number }
  | { type: "success"; stimulusSet: Experiment2StimulusSet }
  | { type: "error"; message: string };

type WorkerScope = {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<GenerateWorkerRequest>) => void,
  ): void;
  postMessage(message: Experiment2GenerateWorkerResponse): void;
};

const workerScope = globalThis as unknown as WorkerScope;

workerScope.addEventListener("message", (event) => {
  try {
    workerScope.postMessage({
      type: "progress",
      completedTrials: 0,
      totalTrials: EXPERIMENT_2_TOTAL_RUNTIME_TRIALS,
    });
    const stimulusSet = generateExperiment2RuntimeStimulusSet({
      subjectId: event.data.subjectId,
      onProgress: (completedTrials, totalTrials) => {
        workerScope.postMessage({ type: "progress", completedTrials, totalTrials });
      },
    });
    workerScope.postMessage({ type: "success", stimulusSet });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
