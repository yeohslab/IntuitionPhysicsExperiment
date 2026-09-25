import type { Experiment3StimulusSet } from "../../shared/experimentTypes";
import {
  EXPERIMENT_3_TOTAL_RUNTIME_TRIALS,
  generateExperiment3RuntimeStimulusSet,
} from "./generateRuntimeSet";

type GenerateWorkerRequest = { subjectId: string };

export type Experiment3GenerateWorkerResponse =
  | { type: "progress"; completedTrials: number; totalTrials: number }
  | { type: "success"; stimulusSet: Experiment3StimulusSet }
  | { type: "error"; message: string };

type WorkerScope = {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<GenerateWorkerRequest>) => void,
  ): void;
  postMessage(message: Experiment3GenerateWorkerResponse): void;
};

const workerScope = globalThis as unknown as WorkerScope;

workerScope.addEventListener("message", (event) => {
  try {
    workerScope.postMessage({
      type: "progress",
      completedTrials: 0,
      totalTrials: EXPERIMENT_3_TOTAL_RUNTIME_TRIALS,
    });
    const stimulusSet = generateExperiment3RuntimeStimulusSet({
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
