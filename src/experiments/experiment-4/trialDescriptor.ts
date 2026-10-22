import {
  analyzePendulum,
  pendulumOmegaRadForEnergyAtBottom,
  pendulumThetaOmegaAt,
} from "../../experiment/physics/pendulum";
import type {
  Experiment4StimulusSet,
  GratingPendulumStimulusUnit,
} from "../../shared/experimentTypes";
import { lastFullyVisibleEndBefore } from "./grating";
import { EXPERIMENT_4_PROTOCOL_VERSION } from "./protocol";

export type Experiment4TrialDescriptor = {
  experiment_id: "experiment-4";
  protocol_version: typeof EXPERIMENT_4_PROTOCOL_VERSION;
  trial_id: string;
  unit_id: string;
  segment_kind: "practice" | "block";
  block_index: number;
  trial_index_in_block: number;
  formal_trial_index: number | null;
  unit_type: "gratingPendulumStimulus";
  gap_level: "small" | "medium" | "large";
  gap_m: number;
  bar_width_m: number;
  bob_radius_m: number;
  release_side: "left" | "right";
  response_order: "angle_first" | "speed_first";
  theta_0_deg: number;
  theta_0_rad: number;
  duration_sec: number;
  query_time_sec: number;
  occlusion_segment_index: number;
  first_visible_sec: number | null;
  last_visible_end_before_query_sec: number | null;
  time_since_last_visible_sec: number | null;
  theta_q_deg: number;
  theta_q_rad: number;
  omega_q_rad_per_sec: number;
  omega_q_deg_per_sec: number;
  abs_omega_q_rad_per_sec: number;
  linear_speed_q_m_per_sec: number;
  omega_max_rad_per_sec: number;
  pendulum_T_sec: number;
  pendulum_E_J: number;
  rod_length_m: number;
  gravity_m_per_sec2: number;
  occlusion_timeline: GratingPendulumStimulusUnit["occlusionTimeline"];
};

function paramsFromUnit(unit: GratingPendulumStimulusUnit) {
  return {
    theta0Rad: (unit.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: unit.rodLengthM,
    gravity: unit.gravity,
  };
}

export function describeExperiment4Trial(
  unit: GratingPendulumStimulusUnit,
  context: {
    trialId: string;
    segmentKind: "practice" | "block";
    blockIndex: number;
    trialIndexInBlock: number;
    formalTrialIndex: number | null;
  },
): Experiment4TrialDescriptor {
  const params = paramsFromUnit(unit);
  const analysis = analyzePendulum(params);
  const state = pendulumThetaOmegaAt(unit.queryTimeSec, params, analysis);
  const lastVisibleEnd = lastFullyVisibleEndBefore(
    unit.occlusionTimeline,
    unit.queryTimeSec,
  );
  const timeSince =
    lastVisibleEnd === null
      ? null
      : unit.queryTimeSec - lastVisibleEnd;
  return {
    experiment_id: "experiment-4",
    protocol_version: EXPERIMENT_4_PROTOCOL_VERSION,
    trial_id: context.trialId,
    unit_id: unit.id,
    segment_kind: context.segmentKind,
    block_index: context.blockIndex,
    trial_index_in_block: context.trialIndexInBlock,
    formal_trial_index: context.formalTrialIndex,
    unit_type: "gratingPendulumStimulus",
    gap_level: unit.gapLevel,
    gap_m: unit.gapM,
    bar_width_m: unit.barWidthM,
    bob_radius_m: unit.bobRadiusM,
    release_side: unit.releaseSide,
    response_order: unit.responseOrder,
    theta_0_deg: unit.theta0Deg,
    theta_0_rad: params.theta0Rad,
    duration_sec: unit.durationSec,
    query_time_sec: unit.queryTimeSec,
    occlusion_segment_index: unit.occlusionSegmentIndex,
    first_visible_sec: unit.firstVisibleSec,
    last_visible_end_before_query_sec: lastVisibleEnd,
    time_since_last_visible_sec: timeSince,
    theta_q_deg: (state.theta * 180) / Math.PI,
    theta_q_rad: state.theta,
    omega_q_rad_per_sec: state.omega,
    omega_q_deg_per_sec: (state.omega * 180) / Math.PI,
    abs_omega_q_rad_per_sec: Math.abs(state.omega),
    linear_speed_q_m_per_sec: unit.rodLengthM * Math.abs(state.omega),
    omega_max_rad_per_sec: pendulumOmegaRadForEnergyAtBottom(
      analysis.E,
      unit.rodLengthM,
    ),
    pendulum_T_sec: analysis.T,
    pendulum_E_J: analysis.E,
    rod_length_m: unit.rodLengthM,
    gravity_m_per_sec2: unit.gravity,
    occlusion_timeline: unit.occlusionTimeline,
  };
}

export function collectExperiment4TrialDescriptors(
  set: Experiment4StimulusSet,
): Experiment4TrialDescriptor[] {
  const descriptors: Experiment4TrialDescriptor[] = [];
  let formalBlockIndex = 0;
  let formalTrialIndex = 0;
  for (const segment of set.sequence) {
    if (segment.kind !== "practice" && segment.kind !== "block") continue;
    const blockIndex = segment.kind === "practice" ? 0 : ++formalBlockIndex;
    segment.children.forEach((trial, trialOffset) => {
      const unit = trial.units.find(
        (u): u is GratingPendulumStimulusUnit =>
          u.type === "gratingPendulumStimulus",
      );
      if (!unit) return;
      descriptors.push(
        describeExperiment4Trial(unit, {
          trialId: trial.id,
          segmentKind: segment.kind,
          blockIndex,
          trialIndexInBlock: trialOffset + 1,
          formalTrialIndex:
            segment.kind === "block" ? ++formalTrialIndex : null,
        }),
      );
    });
  }
  return descriptors;
}
