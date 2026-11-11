import type {
  BellReachabilityV3StimulusUnit,
  Experiment5V3StimulusSet,
} from "../../shared/experimentTypes";
import { EXPERIMENT_5_V3_PROTOCOL_VERSION } from "./protocol";

export type Experiment5V3TrialDescriptor = Record<string, unknown> & { unit_id: string };

export function collectExperiment5V3TrialDescriptors(
  set: Experiment5V3StimulusSet,
): Experiment5V3TrialDescriptor[] {
  const result: Experiment5V3TrialDescriptor[] = [];
  let formalIndex = 0;
  let blockIndex = 0;
  for (const item of set.sequence) {
    if (item.kind !== "block" && item.kind !== "practice") continue;
    if (item.kind === "block") blockIndex += 1;
    item.children.forEach((trial, trialIndex) => {
      const unit = trial.units.find(
        (value): value is BellReachabilityV3StimulusUnit =>
          value.type === "bellReachabilityV3Stimulus",
      );
      if (!unit) return;
      if (item.kind === "block") formalIndex += 1;
      result.push({
        experiment_id: "experiment-5",
        protocol_version: EXPERIMENT_5_V3_PROTOCOL_VERSION,
        trial_id: trial.id,
        unit_id: unit.id,
        segment_kind: item.kind,
        block_index: item.kind === "block" ? blockIndex : 0,
        trial_index_in_block: trialIndex + 1,
        formal_trial_index: item.kind === "block" ? formalIndex : null,
        unit_type: unit.type,
        state_site_id: unit.stateSiteId,
        amplitude_deg: unit.amplitudeDeg,
        energy_J: unit.energyJ,
        theta_0_deg: unit.theta0Deg,
        omega_0_deg_per_sec: unit.omega0DegPerSec,
        query_theta_deg: unit.queryThetaDeg,
        query_omega_rad_per_sec: unit.queryOmegaRadPerSec,
        query_time_sec: unit.queryTimeSec,
        blank_start_sec: unit.blankStartSec,
        blank_duration_sec: unit.blankDurationSec,
        bell_angle_offset_deg: unit.bellAngleOffsetDeg,
        bell_contact_height_m: unit.bellContactHeightM,
        bell_theta_deg: unit.bellThetaDeg,
        bell_side: unit.bellSide,
        correct_response: unit.correctResponse,
        yes_key: unit.yesKey,
        no_key: unit.noKey,
        model_dt_sec: unit.modelDtSec,
        rod_length_m: unit.rodLengthM,
        gravity_m_per_sec2: unit.gravity,
        bob_radius_m: unit.bobRadiusM,
      });
    });
  }
  return result;
}
