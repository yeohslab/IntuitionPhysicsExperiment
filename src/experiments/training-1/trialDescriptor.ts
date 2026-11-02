import {
  SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC,
  SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC,
  SPEED_STRIP_SCALE_ENERGY_J,
  speedStripPositionFromLinearSpeedMPerSec,
} from "../../experiment/physics/speedStripScale";
import type {
  ExperimentTraining1StimulusSet,
  SpeedColorTrainingStimulusUnit,
} from "../../shared/experimentTypes";
import { TRAINING_1_PROTOCOL_VERSION } from "./protocol";

export type ExperimentTraining1TrialDescriptor = {
  experiment_id: "training-1";
  protocol_version: typeof TRAINING_1_PROTOCOL_VERSION;
  trial_id: string;
  unit_id: string;
  segment_kind: "practice";
  sequence_stage_index: number;
  trial_index_in_stage: number;
  formal_trial_index: null;
  unit_type: "speedColorTrainingStimulus";
  mode: SpeedColorTrainingStimulusUnit["mode"];
  training_segment: SpeedColorTrainingStimulusUnit["trainingSegment"];
  stage_round_index: number;
  target_bin_index: number | null;
  assessment_attempt: number | null;
  feedback_shown: boolean;
  initial_direction: SpeedColorTrainingStimulusUnit["initialDirection"];
  motion_loop_mode: SpeedColorTrainingStimulusUnit["loopMode"];
  target_strip_position: number;
  speed_strip_truth_position: number;
  linear_speed_m_per_sec: number;
  track_left_x_m: number;
  track_right_x_m: number;
  initial_x_m: number;
  report_available_at_sec: number | null;
  first_traversal_duration_sec: number | null;
  speed_scale_energy_j: number;
  speed_scale_linear_v_max_m_per_sec: number;
  speed_scale_omega_max_rad_per_sec: number;
};

export function describeTraining1Trial(
  unit: SpeedColorTrainingStimulusUnit,
  context: {
    trialId: string;
    sequenceStageIndex: number;
    trialIndexInStage: number;
  },
): ExperimentTraining1TrialDescriptor {
  return {
    experiment_id: "training-1",
    protocol_version: TRAINING_1_PROTOCOL_VERSION,
    trial_id: context.trialId,
    unit_id: unit.id,
    segment_kind: "practice",
    sequence_stage_index: context.sequenceStageIndex,
    trial_index_in_stage: context.trialIndexInStage,
    formal_trial_index: null,
    unit_type: "speedColorTrainingStimulus",
    mode: unit.mode,
    training_segment: unit.trainingSegment,
    stage_round_index: unit.stageRoundIndex,
    target_bin_index: unit.targetBinIndex,
    assessment_attempt: unit.assessmentAttempt,
    feedback_shown: unit.feedbackShown,
    initial_direction: unit.initialDirection,
    motion_loop_mode: unit.loopMode,
    target_strip_position: unit.targetStripPosition,
    speed_strip_truth_position: speedStripPositionFromLinearSpeedMPerSec(
      unit.linearSpeedMPerSec,
    ),
    linear_speed_m_per_sec: unit.linearSpeedMPerSec,
    track_left_x_m: unit.trackLeftXM,
    track_right_x_m: unit.trackRightXM,
    initial_x_m: unit.initialXM,
    report_available_at_sec: unit.reportDelaySec,
    first_traversal_duration_sec: unit.firstTraversalDurationSec,
    speed_scale_energy_j: SPEED_STRIP_SCALE_ENERGY_J,
    speed_scale_linear_v_max_m_per_sec: SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC,
    speed_scale_omega_max_rad_per_sec: SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC,
  };
}

export function collectTraining1TrialDescriptors(
  set: ExperimentTraining1StimulusSet,
): ExperimentTraining1TrialDescriptor[] {
  const descriptors: ExperimentTraining1TrialDescriptor[] = [];
  let sequenceStageIndex = 0;
  for (const segment of set.sequence) {
    if (segment.kind !== "practice") continue;
    sequenceStageIndex += 1;
    segment.children.forEach((trial, trialOffset) => {
      const unit = trial.units.find(
        (value): value is SpeedColorTrainingStimulusUnit =>
          value.type === "speedColorTrainingStimulus",
      );
      if (!unit) return;
      descriptors.push(describeTraining1Trial(unit, {
        trialId: trial.id,
        sequenceStageIndex,
        trialIndexInStage: trialOffset + 1,
      }));
    });
  }
  return descriptors;
}
