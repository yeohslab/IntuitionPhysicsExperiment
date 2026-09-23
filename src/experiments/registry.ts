import { experiment1Definition } from "./experiment-1/definition";
import { experiment2Definition } from "./experiment-2/definition";
import type { ExperimentId } from "./types";

export const experimentDefinitions = {
  "experiment-1": experiment1Definition,
  "experiment-2": experiment2Definition,
} as const;

export function isExperimentId(value: string): value is ExperimentId {
  return value === "experiment-1" || value === "experiment-2";
}

export function getExperimentDefinition(experimentId: ExperimentId) {
  return experimentDefinitions[experimentId];
}
