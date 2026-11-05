import type { Experiment5StimulusSet, ReachabilityPendulumStimulusUnit } from "../../shared/experimentTypes";
import { EXPERIMENT_5_PROTOCOL_VERSION } from "./protocol";

export type Experiment5TrialDescriptor = {
  experiment_id: "experiment-5";
  protocol_version: typeof EXPERIMENT_5_PROTOCOL_VERSION;
  trial_id: string;
  unit_id: string;
  segment_kind: "practice" | "block";
  block_index: number;
  trial_index_in_block: number;
  formal_trial_index: number | null;
  unit_type: "reachabilityPendulumStimulus";
  energy_J: number;
  amplitude_deg: number;
  target_angle_deg: number;
  boundary_gap_deg: number;
  judgment_distance_m: number;
  judgment_time_sec: number;
  tau_sec: number;
  theta_0_deg: number;
  omega_0_deg_per_sec: number;
  disappearance_theta_deg: number;
  disappearance_omega_deg_per_sec: number;
  visible_duration_sec: number;
  response_deadline_sec: number;
  visible_window_count: 2 | 3 | 4;
  gap_m: number;
  bar_width_m: number;
  grating_period_m: number;
  grating_offset_m: number;
  side: "left" | "right";
  reachability: "reachable" | "unreachable";
  correct_response: "reachable" | "unreachable";
  yes_key: "f" | "j";
  no_key: "f" | "j";
  rod_length_m: number;
  gravity_m_per_sec2: number;
  bob_radius_m: number;
};

export function collectExperiment5TrialDescriptors(set: Experiment5StimulusSet): Experiment5TrialDescriptor[] {
  const out: Experiment5TrialDescriptor[] = [];
  let blockIndex = 0;
  let formalIndex = 0;
  for (const segment of set.sequence) {
    if (segment.kind !== "practice" && segment.kind !== "block") continue;
    const currentBlock = segment.kind === "block" ? ++blockIndex : 0;
    segment.children.forEach((trial, i) => {
      const u = trial.units.find((x): x is ReachabilityPendulumStimulusUnit => x.type === "reachabilityPendulumStimulus");
      if (!u) return;
      out.push({
        experiment_id: "experiment-5", protocol_version: EXPERIMENT_5_PROTOCOL_VERSION,
        trial_id: trial.id, unit_id: u.id, segment_kind: segment.kind,
        block_index: currentBlock, trial_index_in_block: i + 1,
        formal_trial_index: segment.kind === "block" ? ++formalIndex : null,
        unit_type: "reachabilityPendulumStimulus",
        energy_J: u.energyJ, amplitude_deg: u.amplitudeDeg, target_angle_deg: u.targetAngleDeg,
        boundary_gap_deg: u.boundaryGapDeg, judgment_distance_m: u.judgmentDistanceM,
        judgment_time_sec: u.judgmentTimeSec, theta_0_deg: u.theta0Deg,
        tau_sec: u.judgmentTimeSec,
        omega_0_deg_per_sec: u.omega0DegPerSec, disappearance_theta_deg: u.disappearanceThetaDeg,
        disappearance_omega_deg_per_sec: u.disappearanceOmegaDegPerSec,
        visible_duration_sec: u.visibleDurationSec, response_deadline_sec: u.responseDeadlineSec,
        visible_window_count: u.visibleWindowCount, gap_m: u.gapM, bar_width_m: u.barWidthM,
        grating_period_m: u.gratingPeriodM, grating_offset_m: u.gratingOffsetM,
        side: u.side, reachability: u.relation, correct_response: u.correctResponse,
        yes_key: u.yesKey, no_key: u.noKey, rod_length_m: u.rodLengthM,
        gravity_m_per_sec2: u.gravity, bob_radius_m: u.bobRadiusM,
      });
    });
  }
  return out;
}
