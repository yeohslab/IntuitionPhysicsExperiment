import { experiment1Definition } from "./experiment-1/definition";
import { experiment2Definition } from "./experiment-2/definition";
import { experiment3Definition } from "./experiment-3/definition";
import type { ExperimentId } from "./types";

export const experimentDefinitions = {
  "experiment-1": experiment1Definition,
  "experiment-2": experiment2Definition,
  "experiment-3": experiment3Definition,
} as const;

export function isExperimentId(value: string): value is ExperimentId {
  return (
    value === "experiment-1" ||
    value === "experiment-2" ||
    value === "experiment-3"
  );
}

export function getExperimentDefinition(experimentId: ExperimentId) {
  return experimentDefinitions[experimentId];
}
