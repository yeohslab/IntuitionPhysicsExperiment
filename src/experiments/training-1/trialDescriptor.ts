import type {
  ExperimentTraining1StimulusSet,
  SpeedColorTrainingStimulusUnit,
} from "../../shared/experimentTypes";
import { trainingStateAtQuery, truthStripPositionAtQuery } from "./trialPhysics";
import { TRAINING_1_PROTOCOL_VERSION } from "./protocol";
import { paramsFromDegrees } from "./trialDescriptorUtil";

export type ExperimentTraining1TrialDescriptor = {
  experiment_id: "training-1";
  protocol_version: typeof TRAINING_1_PROTOCOL_VERSION;
  trial_id: string;
  unit_id: string;
  segment_kind: "practice";
  block_index: number;
  trial_index_in_block: number;
  formal_trial_index: null;
  unit_type: "speedColorTrainingStimulus";
  mode: SpeedColorTrainingStimulusUnit["mode"];
  training_segment: SpeedColorTrainingStimulusUnit["trainingSegment"];
  mastery_block_index: number;
  target_bin_index: number | null;
  start_side: SpeedColorTrainingStimulusUnit["startSide"];
  target_strip_position: number;
  theta_0_deg: number;
  omega_0_deg_per_sec: number;
  theta_q_deg: number;
  omega_q_deg_per_sec: number;
  energy_j: number;
  query_time_sec: number;
  truth_strip_position: number;
  rod_length_m: number;
  gravity_m_per_sec2: number;
};

export function describeTraining1Trial(
  unit: SpeedColorTrainingStimulusUnit,
  context: {
    trialId: string;
    blockIndex: number;
    trialIndexInBlock: number;
  },
): ExperimentTraining1TrialDescriptor {
  const params = paramsFromDegrees(unit);
  const queryTimeSec = unit.queryTimeSec;
  const truth = truthStripPositionAtQuery(params, queryTimeSec);
  const queryState = trainingStateAtQuery(params, queryTimeSec);
  return {
    experiment_id: "training-1",
    protocol_version: TRAINING_1_PROTOCOL_VERSION,
    trial_id: context.trialId,
    unit_id: unit.id,
    segment_kind: "practice",
    block_index: context.blockIndex,
    trial_index_in_block: context.trialIndexInBlock,
    formal_trial_index: null,
    unit_type: "speedColorTrainingStimulus",
    mode: unit.mode,
    training_segment: unit.trainingSegment,
    mastery_block_index: unit.blockIndex ?? 0,
    target_bin_index: unit.targetBinIndex ?? null,
    start_side: unit.startSide,
    target_strip_position: unit.targetStripPosition,
    theta_0_deg: unit.theta0Deg,
    omega_0_deg_per_sec: unit.omega0DegPerSec,
    theta_q_deg: (queryState.theta * 180) / Math.PI,
    omega_q_deg_per_sec: (queryState.omega * 180) / Math.PI,
    energy_j: unit.energyJ,
    query_time_sec: queryTimeSec,
    truth_strip_position: truth,
    rod_length_m: unit.rodLengthM,
    gravity_m_per_sec2: unit.gravity,
  };
}

export function collectTraining1TrialDescriptors(
  set: ExperimentTraining1StimulusSet,
): ExperimentTraining1TrialDescriptor[] {
  const descriptors: ExperimentTraining1TrialDescriptor[] = [];
  let blockIndex = 0;
  for (const segment of set.sequence) {
    if (segment.kind !== "practice") continue;
    blockIndex += 1;
    segment.children.forEach((trial, trialOffset) => {
      const unit = trial.units.find(
        (u): u is SpeedColorTrainingStimulusUnit =>
          u.type === "speedColorTrainingStimulus",
      );
      if (!unit) return;
      descriptors.push(
        describeTraining1Trial(unit, {
          trialId: trial.id,
          blockIndex,
          trialIndexInBlock: trialOffset + 1,
        }),
      );
    });
  }
  return descriptors;
}
