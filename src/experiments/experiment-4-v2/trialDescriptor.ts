import type {
  Experiment4V2StimulusSet,
  TrackingPendulumV2StimulusUnit,
} from "../../shared/experimentTypes";
import { EXPERIMENT_4_V2_PROTOCOL_VERSION } from "./protocol";

export type Experiment4V2TrialDescriptor = Record<string, unknown> & {
  unit_id: string;
};

export function collectExperiment4V2TrialDescriptors(
  set: Experiment4V2StimulusSet,
): Experiment4V2TrialDescriptor[] {
  const result: Experiment4V2TrialDescriptor[] = [];
  let formalIndex = 0;
  let blockIndex = 0;
  for (const item of set.sequence) {
    if (item.kind !== "block" && item.kind !== "practice") continue;
    if (item.kind === "block") blockIndex += 1;
    item.children.forEach((trial, trialIndex) => {
      const unit = trial.units.find(
        (value): value is TrackingPendulumV2StimulusUnit =>
          value.type === "trackingPendulumV2Stimulus",
      );
      if (!unit) return;
      if (item.kind === "block") formalIndex += 1;
      result.push({
        experiment_id: "experiment-4",
        protocol_version: EXPERIMENT_4_V2_PROTOCOL_VERSION,
        trial_id: trial.id,
        unit_id: unit.id,
        segment_kind: item.kind,
        block_index: item.kind === "block" ? blockIndex : 0,
        trial_index_in_block: trialIndex + 1,
        formal_trial_index: item.kind === "block" ? formalIndex : null,
        unit_type: unit.type,
        state_site_id: unit.stateSiteId,
        tracking_condition: unit.trackingCondition,
        amplitude_deg: unit.amplitudeDeg,
        energy_J: unit.energyJ,
        theta_0_deg: unit.theta0Deg,
        omega_0_deg_per_sec: unit.omega0DegPerSec,
        initial_side: unit.initialSide,
        initial_direction: unit.initialDirection,
        cue_duration_ms: unit.cueDurationMs,
        query_theta_deg: unit.queryThetaDeg,
        query_omega_rad_per_sec: unit.queryOmegaRadPerSec,
        query_time_sec: unit.queryTimeSec,
        blank_start_sec: unit.blankStartSec,
        blank_duration_sec: unit.blankDurationSec,
        reversal_time_sec: unit.reversalTimeSec,
        grating_condition: unit.gratingCondition,
        gap_m: unit.gapM,
        bar_width_m: unit.barWidthM,
        grating_period_m: unit.gratingPeriodM,
        grating_offset_m: unit.gratingOffsetM,
        visible_segments_json: JSON.stringify(unit.visibleSegments),
        segment_1_start_sec: unit.visibleSegments[0]!.tStartSec,
        segment_1_end_sec: unit.visibleSegments[0]!.tEndSec,
        segment_2_start_sec: unit.visibleSegments[1]!.tStartSec,
        segment_2_end_sec: unit.visibleSegments[1]!.tEndSec,
        segment_3_start_sec: unit.visibleSegments[2]!.tStartSec,
        segment_3_end_sec: unit.visibleSegments[2]!.tEndSec,
        last_segment_truncated_by_blank: unit.visibleSegments[2]!.truncatedByBlank,
        speed_scale_linear_m_per_sec: unit.speedScaleLinearMPerSec,
        model_dt_sec: unit.modelDtSec,
        rod_length_m: unit.rodLengthM,
        gravity_m_per_sec2: unit.gravity,
        bob_radius_m: unit.bobRadiusM,
      });
    });
  }
  return result;
}
