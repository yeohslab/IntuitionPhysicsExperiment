import { EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import type { Experiment2StimulusSet } from "../../shared/experimentTypes";
import {
  buildKeptEnergySegmentsForGroup,
  ROD_LENGTH_M,
} from "../../experiment/physics/energySegments";
import { pendulumOmegaRadForEnergyAtBottom } from "../../experiment/physics/pendulum";
import {
  assertWithinSubjectRuntimeStimulusSet,
  generateWithinSubjectRuntimeStimulusSet,
  withinSubjectTimingCombos,
  WITHIN_SUBJECT_ROTATION_SEGMENTS,
  type GenerateWithinSubjectRuntimeSetOptions,
  type WithinSubjectTimingCombo,
} from "../within-subject/generateRuntimeSet";
import {
  experiment2BlockRestText,
  experiment2PracticeText,
  experiment2StructureText,
  experiment2WelcomeText,
} from "./instructions";
import {
  EXPERIMENT_2_OSCILLATION_BLOCKS,
  EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
} from "./protocol";

export {
  EXPERIMENT_2_FORMAL_BLOCKS,
  EXPERIMENT_2_FORMAL_TRIALS,
  EXPERIMENT_2_OSCILLATION_BLOCKS,
  EXPERIMENT_2_PRACTICE_TRIALS,
  EXPERIMENT_2_ROTATION_BLOCKS,
  EXPERIMENT_2_ROTATION_PRACTICE_ENERGY_J,
  EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
  EXPERIMENT_2_TOTAL_RUNTIME_TRIALS,
  EXPERIMENT_2_TRIALS_PER_BLOCK,
} from "./protocol";

export const EXPERIMENT_2_OSCILLATION_SEGMENTS =
  buildKeptEnergySegmentsForGroup(1, EXPERIMENT_2_OSCILLATION_BLOCKS);
export const EXPERIMENT_2_ROTATION_SEGMENTS = WITHIN_SUBJECT_ROTATION_SEGMENTS;
export const EXPERIMENT_2_MAX_FORMAL_ENERGY_J = Math.max(
  ...EXPERIMENT_2_OSCILLATION_SEGMENTS.map((segment) => segment.Emid),
  ...EXPERIMENT_2_ROTATION_SEGMENTS.map((segment) => segment.Emid),
);
const experiment2DerivedSpeedVMaxMPerSec =
  ROD_LENGTH_M *
  pendulumOmegaRadForEnergyAtBottom(
    EXPERIMENT_2_MAX_FORMAL_ENERGY_J,
    ROD_LENGTH_M,
  );
if (
  Math.abs(
    experiment2DerivedSpeedVMaxMPerSec -
      EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
  ) > 1e-12
) {
  throw new Error("实验二统一颜色速度上限与所选正式能量不一致");
}
export const experiment2TimingCombos = withinSubjectTimingCombos;
export type Experiment2TimingCombo = WithinSubjectTimingCombo;
export type GenerateExperiment2RuntimeSetOptions =
  GenerateWithinSubjectRuntimeSetOptions;

const experiment2ProtocolConfig = {
  label: "实验二",
  schemaVersion: EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  oscillationSegments: EXPERIMENT_2_OSCILLATION_SEGMENTS,
  rotationSegments: EXPERIMENT_2_ROTATION_SEGMENTS,
  instructions: {
    welcomeText: experiment2WelcomeText,
    structureText: experiment2StructureText,
    practiceText: experiment2PracticeText,
    blockRestText: experiment2BlockRestText,
  },
};

export function generateExperiment2RuntimeStimulusSet(
  options: GenerateExperiment2RuntimeSetOptions,
): Experiment2StimulusSet {
  return generateWithinSubjectRuntimeStimulusSet(
    options,
    experiment2ProtocolConfig,
  ) as Experiment2StimulusSet;
}

export function assertExperiment2RuntimeStimulusSet(
  set: Experiment2StimulusSet,
): void {
  assertWithinSubjectRuntimeStimulusSet(set, experiment2ProtocolConfig);
}
