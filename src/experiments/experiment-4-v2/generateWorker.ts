import type { Experiment4ParticipantInfo } from "../../shared/participant";
import type { Experiment4V2StimulusSet } from "../../shared/experimentTypes";
import { EXPERIMENT_4_V2_TOTAL_RUNTIME_TRIALS } from "./protocol";
import { generateExperiment4V2RuntimeStimulusSet } from "./generateRuntimeSet";

type Message =
  | { type: "progress"; completed: number; total: number }
  | { type: "success"; set: Experiment4V2StimulusSet }
  | { type: "error"; message: string };
type Scope = {
  addEventListener(type: "message", listener: (event: MessageEvent<{ participant: Experiment4ParticipantInfo }>) => void): void;
  postMessage(message: Message): void;
};
const scope = globalThis as unknown as Scope;
scope.addEventListener("message", (event) => {
  try {
    scope.postMessage({ type: "progress", completed: 0, total: EXPERIMENT_4_V2_TOTAL_RUNTIME_TRIALS });
    const set = generateExperiment4V2RuntimeStimulusSet(event.data.participant, {
      onProgress: (completed, total) => scope.postMessage({ type: "progress", completed, total }),
    });
    scope.postMessage({ type: "success", set });
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
