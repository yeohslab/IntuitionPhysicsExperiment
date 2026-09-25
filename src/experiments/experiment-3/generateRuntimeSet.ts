import { EXPERIMENT_3_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import type { Experiment3StimulusSet } from "../../shared/experimentTypes";
import {
  assertWithinSubjectRuntimeStimulusSet,
  generateWithinSubjectRuntimeStimulusSet,
  withinSubjectTimingCombos,
  WITHIN_SUBJECT_MAX_FORMAL_ENERGY_J,
  WITHIN_SUBJECT_OSCILLATION_SEGMENTS,
  WITHIN_SUBJECT_ROTATION_SEGMENTS,
  type GenerateWithinSubjectRuntimeSetOptions,
  type WithinSubjectTimingCombo,
} from "../within-subject/generateRuntimeSet";
import {
  experiment3BlockRestText,
  experiment3PracticeText,
  experiment3StructureText,
  experiment3WelcomeText,
} from "./instructions";

export {
  EXPERIMENT_3_FORMAL_BLOCKS,
  EXPERIMENT_3_FORMAL_TRIALS,
  EXPERIMENT_3_PRACTICE_TRIALS,
  EXPERIMENT_3_ROTATION_PRACTICE_ENERGY_J,
  EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC,
  EXPERIMENT_3_SPEED_BAR_V_MIN_M_PER_SEC,
  EXPERIMENT_3_TOTAL_RUNTIME_TRIALS,
  EXPERIMENT_3_TRIALS_PER_BLOCK,
} from "./protocol";

export const EXPERIMENT_3_OSCILLATION_SEGMENTS =
  WITHIN_SUBJECT_OSCILLATION_SEGMENTS;
export const EXPERIMENT_3_ROTATION_SEGMENTS = WITHIN_SUBJECT_ROTATION_SEGMENTS;
export const EXPERIMENT_3_MAX_FORMAL_ENERGY_J =
  WITHIN_SUBJECT_MAX_FORMAL_ENERGY_J;
export const experiment3TimingCombos = withinSubjectTimingCombos;
export type Experiment3TimingCombo = WithinSubjectTimingCombo;
export type GenerateExperiment3RuntimeSetOptions =
  GenerateWithinSubjectRuntimeSetOptions;

const experiment3ProtocolConfig = {
  label: "实验三",
  schemaVersion: EXPERIMENT_3_STIMULUS_SET_SCHEMA_VERSION,
  oscillationSegments: EXPERIMENT_3_OSCILLATION_SEGMENTS,
  rotationSegments: EXPERIMENT_3_ROTATION_SEGMENTS,
  instructions: {
    welcomeText: experiment3WelcomeText,
    structureText: experiment3StructureText,
    practiceText: experiment3PracticeText,
    blockRestText: experiment3BlockRestText,
  },
};

export function generateExperiment3RuntimeStimulusSet(
  options: GenerateExperiment3RuntimeSetOptions,
): Experiment3StimulusSet {
  return generateWithinSubjectRuntimeStimulusSet(
    options,
    experiment3ProtocolConfig,
  ) as Experiment3StimulusSet;
}

export function assertExperiment3RuntimeStimulusSet(
  set: Experiment3StimulusSet,
): void {
  assertWithinSubjectRuntimeStimulusSet(set, experiment3ProtocolConfig);
}
