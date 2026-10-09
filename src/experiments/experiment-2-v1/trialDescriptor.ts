import { analyzePendulum } from "../../experiment/physics/pendulum";
import type {
  Experiment2StimulusSet,
  PendulumStimulusUnit,
} from "../../shared/experimentTypes";
import { describePendulumTrial, type PendulumTrialDescriptor } from "../../shared/trialDescriptor";
import {
  EXPERIMENT_2_PROTOCOL_VERSION,
  EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
} from "./protocol";

export type Experiment2MotionCondition = "oscillation" | "rotation";

export type Experiment2TrialDescriptor = Omit<
  PendulumTrialDescriptor,
  "speed_bar_v_max_m_per_sec"
> & {
  experiment_id: "experiment-2";
  protocol_version: typeof EXPERIMENT_2_PROTOCOL_VERSION;
  motion_condition: Experiment2MotionCondition;
  speed_cue_type: "color-strips";
  speed_color_v_min_m_per_sec: 0;
  speed_color_v_max_m_per_sec: typeof EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC;
};

function motionConditionForUnit(
  unit: PendulumStimulusUnit,
): Experiment2MotionCondition {
  const analysis = analyzePendulum({
    theta0Rad: (unit.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: unit.rodLengthM,
    gravity: unit.gravity,
  });
  return analysis.regime === "rotation" ? "rotation" : "oscillation";
}

export function collectExperiment2TrialDescriptors(
  set: Experiment2StimulusSet,
): Experiment2TrialDescriptor[] {
  const descriptors: Experiment2TrialDescriptor[] = [];
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
      const { speed_bar_v_max_m_per_sec: _unused, ...physicsFields } = base;
      void _unused;
      descriptors.push({
        experiment_id: "experiment-2",
        protocol_version: EXPERIMENT_2_PROTOCOL_VERSION,
        motion_condition: motionCondition,
        speed_cue_type: "color-strips",
        speed_color_v_min_m_per_sec: 0,
        speed_color_v_max_m_per_sec: EXPERIMENT_2_SPEED_COLOR_V_MAX_M_PER_SEC,
        ...physicsFields,
      });
    });
  }
  return descriptors;
}
