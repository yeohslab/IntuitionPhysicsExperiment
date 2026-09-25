import { analyzePendulum } from "../../experiment/physics/pendulum";
import type {
  Experiment3StimulusSet,
  PendulumStimulusUnit,
} from "../../shared/experimentTypes";
import {
  describePendulumTrial,
  type PendulumTrialDescriptor,
} from "../../shared/trialDescriptor";
import {
  EXPERIMENT_3_PROTOCOL_VERSION,
  EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC,
  EXPERIMENT_3_SPEED_BAR_V_MIN_M_PER_SEC,
} from "./protocol";

export type Experiment3MotionCondition = "oscillation" | "rotation";

export type Experiment3TrialDescriptor = PendulumTrialDescriptor & {
  experiment_id: "experiment-3";
  protocol_version: typeof EXPERIMENT_3_PROTOCOL_VERSION;
  motion_condition: Experiment3MotionCondition;
  speed_cue_type: "level-bars";
  speed_bar_v_min_m_per_sec: typeof EXPERIMENT_3_SPEED_BAR_V_MIN_M_PER_SEC;
  speed_bar_v_max_m_per_sec: typeof EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC;
};

function motionConditionForUnit(
  unit: PendulumStimulusUnit,
): Experiment3MotionCondition {
  const analysis = analyzePendulum({
    theta0Rad: (unit.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: unit.rodLengthM,
    gravity: unit.gravity,
  });
  return analysis.regime === "rotation" ? "rotation" : "oscillation";
}

export function collectExperiment3TrialDescriptors(
  set: Experiment3StimulusSet,
): Experiment3TrialDescriptor[] {
  const descriptors: Experiment3TrialDescriptor[] = [];
  let formalBlockIndex = 0;
  let formalTrialIndex = 0;
  for (const segment of set.sequence) {
    if (segment.kind !== "practice" && segment.kind !== "block") continue;
    const blockIndex = segment.kind === "practice" ? 0 : ++formalBlockIndex;
    segment.children.forEach((trial, trialOffset) => {
      const unit = trial.units.find(
        (candidate): candidate is PendulumStimulusUnit =>
          candidate.type === "pendulumStimulus",
      );
      if (!unit) return;
      const motionCondition = motionConditionForUnit(unit);
      const base = describePendulumTrial(
        unit,
        {
          trialId: trial.id,
          segmentKind: segment.kind,
          blockIndex,
          trialIndexInBlock: trialOffset + 1,
          formalTrialIndex: segment.kind === "block" ? ++formalTrialIndex : null,
        },
        motionCondition === "rotation" ? 2 : 1,
      );
      descriptors.push({
        ...base,
        experiment_id: "experiment-3",
        protocol_version: EXPERIMENT_3_PROTOCOL_VERSION,
        motion_condition: motionCondition,
        speed_cue_type: "level-bars",
        speed_bar_v_min_m_per_sec: EXPERIMENT_3_SPEED_BAR_V_MIN_M_PER_SEC,
        speed_bar_v_max_m_per_sec: EXPERIMENT_3_SPEED_BAR_V_MAX_M_PER_SEC,
      });
    });
  }
  return descriptors;
}
