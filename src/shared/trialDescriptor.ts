import type { MotionGroup } from "./participant";
import type {
  ExperimentStimulusSet,
  PendulumStimulusUnit,
} from "./experimentTypes";
import {
  analyzePendulum,
  type PendulumParams,
} from "../experiment/physics/pendulum";
import { pendulumStateAtSimEnd } from "../experiment/physics/simEndState";
import {
  stimulusPhaseDurationsForExport,
  stimulusTotalTimeT,
  withSyncedTotalTimeT,
} from "../experiment/physics/timePhases";
import {
  pendulumAngleDegFromRad,
  pendulumWMaxDeg,
  radToDeg,
  wrapAngleRad,
} from "../experiment/physics/pendulumArcScore";
import { speedBarVMaxForGroup } from "../experiment/physics/energySegments";

export interface PendulumTrialDescriptor {
  trial_id: string;
  unit_id: string;
  segment_kind: "practice" | "block";
  block_index: number;
  trial_index_in_block: number;
  formal_trial_index: number | null;
  unit_type: "pendulumStimulus";
  physics_kind: "pendulum";
  pendulum_E_J: number;
  pendulum_T_sec: number;
  pendulum_regime: "oscillation" | "rotation" | "critical";
  rod_length_m: number;
  gravity_m_per_sec2: number;
  total_time_T: number;
  show_T: number;
  fade_T: number;
  hide_T: number;
  total_time_sec: number;
  show_sec: number;
  fade_sec: number;
  hide_sec: number;
  speed_bar_v_max_m_per_sec: number;
  w_max_deg: number;
  theta_x_0_deg: number;
  theta_x_0_rad: number;
  omega_x_0_deg_per_sec: number;
  omega_x_0_rad_per_sec: number;
  linear_speed_x_0_m_per_sec: number;
  theta_x_t_deg: number;
  theta_x_t_rad: number;
  omega_x_t_deg_per_sec: number;
  omega_x_t_rad_per_sec: number;
  linear_speed_x_t_m_per_sec: number;
}

export interface TrialDescriptorContext {
  trialId: string;
  segmentKind: "practice" | "block";
  blockIndex: number;
  trialIndexInBlock: number;
  formalTrialIndex: number | null;
}

function paramsFromUnit(unit: PendulumStimulusUnit): PendulumParams {
  return {
    theta0Rad: (unit.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: unit.rodLengthM,
    gravity: unit.gravity,
  };
}

export function describePendulumTrial(
  unit: PendulumStimulusUnit,
  context: TrialDescriptorContext,
  motionGroup: MotionGroup,
): PendulumTrialDescriptor {
  const params = paramsFromUnit(unit);
  const analysis = analyzePendulum(params);
  const timing = withSyncedTotalTimeT(unit, analysis.T);
  const phaseDurations = stimulusPhaseDurationsForExport(timing, analysis.T);
  const endState = pendulumStateAtSimEnd(params, timing);
  const theta0Rad = wrapAngleRad(params.theta0Rad);
  const thetaTRad = wrapAngleRad(endState.theta);

  return {
    trial_id: context.trialId,
    unit_id: unit.id,
    segment_kind: context.segmentKind,
    block_index: context.blockIndex,
    trial_index_in_block: context.trialIndexInBlock,
    formal_trial_index: context.formalTrialIndex,
    unit_type: "pendulumStimulus",
    physics_kind: "pendulum",
    pendulum_E_J: analysis.E,
    pendulum_T_sec: analysis.T,
    pendulum_regime: analysis.regime,
    rod_length_m: unit.rodLengthM,
    gravity_m_per_sec2: unit.gravity,
    total_time_T: stimulusTotalTimeT(timing, analysis.T),
    ...phaseDurations,
    speed_bar_v_max_m_per_sec: speedBarVMaxForGroup(motionGroup),
    w_max_deg: pendulumWMaxDeg(
      analysis.E,
      analysis.regime,
      unit.rodLengthM,
      unit.gravity,
    ),
    theta_x_0_deg: pendulumAngleDegFromRad(theta0Rad),
    theta_x_0_rad: theta0Rad,
    omega_x_0_deg_per_sec: radToDeg(params.omega0RadPerSec),
    omega_x_0_rad_per_sec: params.omega0RadPerSec,
    linear_speed_x_0_m_per_sec:
      unit.rodLengthM * Math.abs(params.omega0RadPerSec),
    theta_x_t_deg: pendulumAngleDegFromRad(thetaTRad),
    theta_x_t_rad: thetaTRad,
    omega_x_t_deg_per_sec: radToDeg(endState.omega),
    omega_x_t_rad_per_sec: endState.omega,
    linear_speed_x_t_m_per_sec: unit.rodLengthM * Math.abs(endState.omega),
  };
}

/** 按实际呈现顺序收集练习与正式物理 Trial，不包含指导语、休息或注视点。 */
export function collectPendulumTrialDescriptors(
  set: ExperimentStimulusSet,
  motionGroup: MotionGroup,
): PendulumTrialDescriptor[] {
  const descriptors: PendulumTrialDescriptor[] = [];
  let formalBlockIndex = 0;
  let formalTrialIndex = 0;

  for (const segment of set.sequence) {
    if (segment.kind !== "practice" && segment.kind !== "block") continue;
    const blockIndex = segment.kind === "practice" ? 0 : ++formalBlockIndex;
    for (let trialOffset = 0; trialOffset < segment.children.length; trialOffset++) {
      const trial = segment.children[trialOffset]!;
      const unit = trial.units.find(
        (candidate): candidate is PendulumStimulusUnit =>
          candidate.type === "pendulumStimulus",
      );
      if (!unit) continue;
      const nextFormalIndex =
        segment.kind === "block" ? ++formalTrialIndex : null;
      descriptors.push(
        describePendulumTrial(
          unit,
          {
            trialId: trial.id,
            segmentKind: segment.kind,
            blockIndex,
            trialIndexInBlock: trialOffset + 1,
            formalTrialIndex: nextFormalIndex,
          },
          motionGroup,
        ),
      );
    }
  }
  return descriptors;
}
