import type { Experiment5ParticipantInfo } from "../../shared/participant";
import type { Experiment5V3StimulusSet } from "../../shared/experimentTypes";
import { EXPERIMENT_5_V3_TOTAL_RUNTIME_TRIALS } from "./protocol";
import { generateExperiment5V3RuntimeStimulusSet } from "./generateRuntimeSet";

type Message =
  | { type: "progress"; completed: number; total: number }
  | { type: "success"; set: Experiment5V3StimulusSet }
  | { type: "error"; message: string };
type Scope = {
  addEventListener(type: "message", listener: (event: MessageEvent<{ participant: Experiment5ParticipantInfo }>) => void): void;
  postMessage(message: Message): void;
};
const scope = globalThis as unknown as Scope;
scope.addEventListener("message", (event) => {
  try {
    scope.postMessage({ type: "progress", completed: 0, total: EXPERIMENT_5_V3_TOTAL_RUNTIME_TRIALS });
    const set = generateExperiment5V3RuntimeStimulusSet(event.data.participant, {
      onProgress: (completed, total) => scope.postMessage({ type: "progress", completed, total }),
    });
    scope.postMessage({ type: "success", set });
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
