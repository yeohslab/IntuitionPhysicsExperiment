import type { MotionGroup } from "../physics/energySegments";
import type { ExperimentStimulusSet } from "../../shared/experimentTypes";
import {
  generateRuntimeStimulusSet,
  TOTAL_RUNTIME_TRIALS,
} from "./generateRuntimeSet";

type GenerateWorkerRequest = {
  group: MotionGroup;
  subjectId: string;
};

export type GenerateWorkerResponse =
  | {
      type: "progress";
      completedTrials: number;
      totalTrials: number;
    }
  | {
      type: "success";
      stimulusSet: ExperimentStimulusSet;
    }
  | {
      type: "error";
      message: string;
    };

type WorkerScope = {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<GenerateWorkerRequest>) => void,
  ): void;
  postMessage(message: GenerateWorkerResponse): void;
};

const workerScope = globalThis as unknown as WorkerScope;

workerScope.addEventListener("message", (event) => {
  try {
    workerScope.postMessage({
      type: "progress",
      completedTrials: 0,
      totalTrials: TOTAL_RUNTIME_TRIALS,
    });
    const stimulusSet = generateRuntimeStimulusSet({
      group: event.data.group,
      subjectId: event.data.subjectId,
      onProgress: (completedTrials, totalTrials) => {
        workerScope.postMessage({
          type: "progress",
          completedTrials,
          totalTrials,
        });
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
