import { experiment2Definition } from "./experiment-2/definition";
import { experiment4Definition } from "./experiment-4/definition";
import { experiment5Definition } from "./experiment-5/definition";
import { experiment4V2Definition } from "./experiment-4-v2/definition";
import { experiment5V2Definition } from "./experiment-5-v2/definition";
import { training1Definition } from "./training-1/definition";
import type { ExperimentId } from "./types";

export const experimentDefinitions = {
  "training-1": training1Definition,
  "experiment-2": experiment2Definition,
  "experiment-4": experiment4Definition,
  "experiment-4-v2": experiment4V2Definition,
  "experiment-5": experiment5Definition,
  "experiment-5-v2": experiment5V2Definition,
} as const;

export function isExperimentId(value: string): value is ExperimentId {
  return (
    value === "experiment-2" ||
    value === "experiment-4" ||
    value === "experiment-4-v2" ||
    value === "experiment-5" ||
    value === "experiment-5-v2" ||
    value === "training-1"
  );
}

export function getExperimentDefinition(experimentId: ExperimentId) {
  return experimentDefinitions[experimentId];
}
