import { pendulumOmegaRadForEnergyAtBottom } from "../../experiment/physics/pendulum";
import { ROD_LENGTH_M } from "../../experiment/physics/energySegments";
import { WITHIN_SUBJECT_PRACTICE_TRIALS } from "../within-subject/protocol";
import {
  EXPERIMENT_2_V2_FORMAL_ENERGY_LEVELS_J,
  EXPERIMENT_2_V2_ROTATION_E_MAX_J,
  experiment2V2PracticeOscillationEnergyJ,
  experiment2V2PracticeRotationEnergyJ,
} from "./energyLevels";

export const EXPERIMENT_2_ID = "experiment-2" as const;
export const EXPERIMENT_2_PROTOCOL_VERSION = "2.0.0" as const;
export const EXPERIMENT_2_SHOW_T = 1.2;
export const EXPERIMENT_2_HIDE_LEVELS_SEC = [0.7, 1.0, 1.3] as const;
export const EXPERIMENT_2_FORMAL_BLOCKS = EXPERIMENT_2_HIDE_LEVELS_SEC.length;
export const EXPERIMENT_2_ENERGY_LEVELS_PER_BLOCK =
  EXPERIMENT_2_V2_FORMAL_ENERGY_LEVELS_J.length;
export const EXPERIMENT_2_ENDPOINTS_PER_ENERGY = 5;
export const EXPERIMENT_2_TRIALS_PER_BLOCK =
  EXPERIMENT_2_ENERGY_LEVELS_PER_BLOCK * EXPERIMENT_2_ENDPOINTS_PER_ENERGY;
export const EXPERIMENT_2_FORMAL_TRIALS =
  EXPERIMENT_2_FORMAL_BLOCKS * EXPERIMENT_2_TRIALS_PER_BLOCK;
export const EXPERIMENT_2_PRACTICE_TRIALS = WITHIN_SUBJECT_PRACTICE_TRIALS;
export const EXPERIMENT_2_TOTAL_RUNTIME_TRIALS =
  EXPERIMENT_2_PRACTICE_TRIALS + EXPERIMENT_2_FORMAL_TRIALS;
export const EXPERIMENT_2_PRACTICE_OSCILLATION_ENERGY_J =
  experiment2V2PracticeOscillationEnergyJ();
export const EXPERIMENT_2_PRACTICE_ROTATION_ENERGY_J =
  experiment2V2PracticeRotationEnergyJ();
export const EXPERIMENT_2_MAX_FORMAL_ENERGY_J = EXPERIMENT_2_V2_ROTATION_E_MAX_J;
export const EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC =
  ROD_LENGTH_M *
  pendulumOmegaRadForEnergyAtBottom(
    EXPERIMENT_2_MAX_FORMAL_ENERGY_J,
    ROD_LENGTH_M,
  );
export const EXPERIMENT_2_FORMAL_ENERGY_LEVELS_J =
  EXPERIMENT_2_V2_FORMAL_ENERGY_LEVELS_J;
