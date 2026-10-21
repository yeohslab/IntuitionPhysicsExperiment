import { experiment2Definition } from "./experiment-2/definition";
import { experiment4Definition } from "./experiment-4/definition";
import type { ExperimentId } from "./types";

export const experimentDefinitions = {
  "experiment-2": experiment2Definition,
  "experiment-4": experiment4Definition,
} as const;

export function isExperimentId(value: string): value is ExperimentId {
  return value === "experiment-2" || value === "experiment-4";
}

export function getExperimentDefinition(experimentId: ExperimentId) {
  return experimentDefinitions[experimentId];
}
