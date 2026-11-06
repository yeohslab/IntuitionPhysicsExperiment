import type {
  BellReachabilityV2StimulusUnit,
  Experiment5V2StimulusSet,
} from "../../shared/experimentTypes";
import { EXPERIMENT_5_V2_PROTOCOL_VERSION } from "./protocol";

const MAX_EXPORTED_VISIBLE_SEGMENTS = 6;

function visibleSegmentColumns(
  segments: Array<{ tStartSec: number; tEndSec: number; truncatedByBlank: boolean }>,
): Record<string, number | boolean | null> {
  const columns: Record<string, number | boolean | null> = {};
  for (let index = 0; index < MAX_EXPORTED_VISIBLE_SEGMENTS; index += 1) {
    const segment = segments[index];
    const number = index + 1;
    columns[`segment_${number}_start_sec`] = segment?.tStartSec ?? null;
    columns[`segment_${number}_end_sec`] = segment?.tEndSec ?? null;
  }
  columns.last_segment_truncated_by_blank =
    segments[segments.length - 1]?.truncatedByBlank ?? false;
  return columns;
}

export type Experiment5V2TrialDescriptor = Record<string, unknown> & { unit_id: string };

export function collectExperiment5V2TrialDescriptors(
  set: Experiment5V2StimulusSet,
): Experiment5V2TrialDescriptor[] {
  const result: Experiment5V2TrialDescriptor[] = [];
  let formalIndex = 0;
  let blockIndex = 0;
  for (const item of set.sequence) {
    if (item.kind !== "block" && item.kind !== "practice") continue;
    if (item.kind === "block") blockIndex += 1;
    item.children.forEach((trial, trialIndex) => {
      const unit = trial.units.find(
        (value): value is BellReachabilityV2StimulusUnit =>
          value.type === "bellReachabilityV2Stimulus",
      );
      if (!unit) return;
      if (item.kind === "block") formalIndex += 1;
      result.push({
        experiment_id: "experiment-5",
        protocol_version: EXPERIMENT_5_V2_PROTOCOL_VERSION,
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
        grating_condition: unit.gratingCondition,
        gap_m: unit.gapM,
        bar_width_m: unit.barWidthM,
        grating_period_m: unit.gratingPeriodM,
        grating_offset_m: unit.gratingOffsetM,
        visible_segments_json: JSON.stringify(unit.visibleSegments),
        ...visibleSegmentColumns(unit.visibleSegments),
        delta_h_m: unit.deltaHM,
        bell_contact_height_m: unit.bellContactHeightM,
        bell_theta_deg: unit.bellThetaDeg,
        bell_side: unit.bellSide,
        correct_response: unit.correctResponse,
        yes_key: unit.yesKey,
        no_key: unit.noKey,
        planned_visible_turn: unit.plannedVisibleTurn,
        planned_visible_turn_first_time_sec: unit.plannedVisibleTurnTimeSec,
        planned_visible_contact: unit.plannedVisibleContact,
        planned_visible_contact_first_time_sec: unit.plannedVisibleContactTimeSec,
        model_dt_sec: unit.modelDtSec,
        rod_length_m: unit.rodLengthM,
        gravity_m_per_sec2: unit.gravity,
        bob_radius_m: unit.bobRadiusM,
      });
    });
  }
  return result;
}
