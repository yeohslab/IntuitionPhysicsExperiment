import { analyzePendulum } from "../experiment/physics/pendulum";
import { TRAINING_1_LINEAR_SPEED_SCALE_M_PER_SEC } from "../experiments/training-1/protocol";
import { withSyncedTotalTimeT } from "../experiment/physics/timePhases";
import {
  isExperiment2ParticipantInfo,
  isExperiment4ParticipantInfo,
  isExperiment5ParticipantInfo,
  isTraining1ParticipantInfo,
  type AnyParticipantInfo,
  type Experiment2ParticipantInfo,
} from "./participant";
import {
  EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION,
  EXPERIMENT_5_STIMULUS_SET_SCHEMA_VERSION,
  EXPERIMENT_4_V2_STIMULUS_SET_SCHEMA_VERSION,
  EXPERIMENT_5_V2_STIMULUS_SET_SCHEMA_VERSION,
  EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION,
  type BlockSegment,
  type Experiment2StimulusSet,
  type Experiment4StimulusSet,
  type Experiment5StimulusSet,
  type Experiment4V2StimulusSet,
  type Experiment5V2StimulusSet,
  type ExperimentTraining1StimulusSet,
  type SpeedColorTrainingStimulusUnit,
  type GratingOcclusionSegmentRecord,
  type PendulumStimulusUnit,
  type ReachabilityPendulumStimulusUnit,
  type PracticeSegment,
  type RestSegment,
  type StimulusUnit,
  type TopLevelSequenceItem,
  type RuntimeStimulusSet,
  type Trial,
  type TrackingPendulumV2StimulusUnit,
  type BellReachabilityV2StimulusUnit,
  type Protocol2PendulumDemoUnit,
} from "./experimentTypes";
import type { ExperimentId } from "../experiments/types";
import { EXPERIMENT_4_GRATING_CONDITIONS } from "../experiments/experiment-4/protocol";
import {
  PROTOCOL_2_BLANK_DURATION_SEC,
  PROTOCOL_2_GRATING_CONDITIONS,
  protocol2VisibleSegmentCount,
} from "../experiments/protocol-2/common";

/** 存在且与人口学/刺激集同时有效时，才允许进入 runner。 */
export const SESSION_RUN_TOKEN_KEY = "intuition-physics:experiment-2:run-active";

function sessionKey(experimentId: ExperimentId, suffix: string): string {
  return `intuition-physics:${experimentId}:${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(
  raw: Record<string, unknown>,
  key: string,
): number | null {
  const value = raw[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validId(raw: Record<string, unknown>): string | null {
  return typeof raw.id === "string" && raw.id.length > 0 ? raw.id : null;
}

function parseUnit(raw: unknown): StimulusUnit | null {
  if (!isRecord(raw)) return null;
  const id = validId(raw);
  if (!id) return null;

  if (raw.type === "textDisplay") {
    const durationMs = finiteNumber(raw, "durationMs");
    if (typeof raw.text !== "string" || durationMs === null || durationMs <= 0) {
      return null;
    }
    return { id, type: "textDisplay", text: raw.text, durationMs };
  }

  if (raw.type === "textControl") {
    if (typeof raw.text !== "string" || typeof raw.key !== "string") return null;
    return { id, type: "textControl", text: raw.text, key: raw.key };
  }

  if (raw.type === "protocol2PendulumDemo") {
    const amplitudeDeg = finiteNumber(raw, "amplitudeDeg");
    const rodLengthM = finiteNumber(raw, "rodLengthM");
    const gravity = finiteNumber(raw, "gravity");
    const bobRadiusM = finiteNumber(raw, "bobRadiusM");
    if (
      amplitudeDeg === null || rodLengthM === null || gravity === null ||
      bobRadiusM === null || amplitudeDeg <= 0 || amplitudeDeg >= 90 ||
      rodLengthM <= 0 || gravity <= 0 || bobRadiusM <= 0
    ) return null;
    return {
      id, type: "protocol2PendulumDemo", amplitudeDeg, rodLengthM, gravity,
      bobRadiusM,
    } satisfies Protocol2PendulumDemoUnit;
  }

  if (
    raw.type === "trackingPendulumV2Stimulus" ||
    raw.type === "bellReachabilityV2Stimulus"
  ) {
    const numericKeys = [
      "theta0Deg", "omega0DegPerSec", "rodLengthM", "gravity", "bobRadiusM",
      "energyJ", "amplitudeDeg", "queryThetaDeg", "queryOmegaRadPerSec",
      "queryTimeSec", "blankStartSec", "blankDurationSec", "gapM",
      "barWidthM", "gratingPeriodM", "gratingOffsetM", "modelDtSec",
    ] as const;
    const n = Object.fromEntries(
      numericKeys.map((key) => [key, finiteNumber(raw, key)]),
    ) as Record<(typeof numericKeys)[number], number | null>;
    if (
      numericKeys.some((key) => n[key] === null) ||
      n.rodLengthM! <= 0 || n.gravity! <= 0 || n.bobRadiusM! <= 0 ||
      n.energyJ! <= 0 || n.amplitudeDeg! <= 0 || n.queryTimeSec! <= 0 ||
      n.blankStartSec! <= 0 || n.blankDurationSec! <= 0 ||
      n.queryTimeSec! <= n.blankStartSec! || n.gapM! <= 0 ||
      n.barWidthM! <= 0 || n.gratingPeriodM! <= 0 || n.modelDtSec! <= 0 ||
      (raw.gratingCondition !== "G1" && raw.gratingCondition !== "G2" &&
        raw.gratingCondition !== "G3") ||
      typeof raw.stateSiteId !== "string" || !Array.isArray(raw.visibleSegments)
    ) return null;
    const visibleSegments = raw.visibleSegments.map((item) => {
      if (!isRecord(item)) return null;
      const tStartSec = finiteNumber(item, "tStartSec");
      const tEndSec = finiteNumber(item, "tEndSec");
      if (
        tStartSec === null || tEndSec === null || tStartSec < 0 ||
        tEndSec <= tStartSec || typeof item.truncatedByBlank !== "boolean"
      ) return null;
      return { tStartSec, tEndSec, truncatedByBlank: item.truncatedByBlank };
    });
    const protocol2Geometry = PROTOCOL_2_GRATING_CONDITIONS[raw.gratingCondition];
    if (visibleSegments.some((segment) => segment === null)) return null;
    if (raw.type === "trackingPendulumV2Stimulus" && (
      visibleSegments.length !== protocol2VisibleSegmentCount(raw.gratingCondition) ||
      Math.abs(n.blankDurationSec! - PROTOCOL_2_BLANK_DURATION_SEC) > 1e-12
    )) {
      return null;
    }
    if (
      Math.abs(n.gapM! - protocol2Geometry.gapM) > 1e-9 ||
      Math.abs(n.barWidthM! - protocol2Geometry.barWidthM) > 1e-9 ||
      Math.abs(n.gratingPeriodM! - protocol2Geometry.periodM) > 1e-9 ||
      Math.abs(n.gratingOffsetM! - protocol2Geometry.offsetM) > 1e-9
    ) return null;
    const base = {
      id,
      theta0Deg: n.theta0Deg!, omega0DegPerSec: n.omega0DegPerSec!,
      rodLengthM: n.rodLengthM!, gravity: n.gravity!, bobRadiusM: n.bobRadiusM!,
      energyJ: n.energyJ!, amplitudeDeg: n.amplitudeDeg!,
      queryThetaDeg: n.queryThetaDeg!, queryOmegaRadPerSec: n.queryOmegaRadPerSec!,
      queryTimeSec: n.queryTimeSec!, blankStartSec: n.blankStartSec!,
      blankDurationSec: n.blankDurationSec!,
      visibleSegments: visibleSegments as NonNullable<(typeof visibleSegments)[number]>[],
      gratingCondition: raw.gratingCondition,
      gapM: n.gapM!, barWidthM: n.barWidthM!,
      gratingPeriodM: n.gratingPeriodM!, gratingOffsetM: n.gratingOffsetM!,
      stateSiteId: raw.stateSiteId, modelDtSec: n.modelDtSec!,
    } as const;
    if (raw.type === "trackingPendulumV2Stimulus") {
      const cueDurationMs = finiteNumber(raw, "cueDurationMs");
      const reversalRaw = raw.reversalTimeSec;
      const reversalTimeSec = reversalRaw === null
        ? null
        : finiteNumber(raw, "reversalTimeSec");
      const speedScaleLinearMPerSec = finiteNumber(raw, "speedScaleLinearMPerSec");
      if (
        (raw.trackingCondition !== "no_hidden_reversal" &&
          raw.trackingCondition !== "hidden_reversal") ||
        (raw.initialSide !== "left" && raw.initialSide !== "right") ||
        (raw.initialDirection !== "leftward" && raw.initialDirection !== "rightward") ||
        cueDurationMs === null || cueDurationMs <= 0 ||
        speedScaleLinearMPerSec === null || speedScaleLinearMPerSec <= 0 ||
        (reversalRaw !== null && reversalTimeSec === null) ||
        (raw.reportTarget !== "angle" && raw.reportTarget !== "speed")
      ) return null;
      return {
        ...base, type: "trackingPendulumV2Stimulus",
        trackingCondition: raw.trackingCondition,
        initialSide: raw.initialSide, initialDirection: raw.initialDirection,
        cueDurationMs, reversalTimeSec, speedScaleLinearMPerSec,
        reportTarget: raw.reportTarget,
      } satisfies TrackingPendulumV2StimulusUnit;
    }
    const bellNumericKeys = [
      "deltaHM", "bellContactHeightM", "bellThetaDeg",
    ] as const;
    const b = Object.fromEntries(
      bellNumericKeys.map((key) => [key, finiteNumber(raw, key)]),
    ) as Record<(typeof bellNumericKeys)[number], number | null>;
    const plannedTurnRaw = raw.plannedVisibleTurnTimeSec;
    const plannedContactRaw = raw.plannedVisibleContactTimeSec;
    const plannedVisibleTurnTimeSec = plannedTurnRaw === null
      ? null : finiteNumber(raw, "plannedVisibleTurnTimeSec");
    const plannedVisibleContactTimeSec = plannedContactRaw === null
      ? null : finiteNumber(raw, "plannedVisibleContactTimeSec");
    if (
      bellNumericKeys.some((key) => b[key] === null) ||
      (raw.bellSide !== "left" && raw.bellSide !== "right") ||
      (raw.correctResponse !== "reachable" && raw.correctResponse !== "unreachable") ||
      (raw.yesKey !== "f" && raw.yesKey !== "j") ||
      (raw.noKey !== "f" && raw.noKey !== "j") || raw.yesKey === raw.noKey ||
      typeof raw.plannedVisibleTurn !== "boolean" ||
      typeof raw.plannedVisibleContact !== "boolean" ||
      (plannedTurnRaw !== null && plannedVisibleTurnTimeSec === null) ||
      (plannedContactRaw !== null && plannedVisibleContactTimeSec === null)
    ) return null;
    return {
      ...base, type: "bellReachabilityV2Stimulus",
      deltaHM: b.deltaHM!, bellContactHeightM: b.bellContactHeightM!,
      bellThetaDeg: b.bellThetaDeg!, bellSide: raw.bellSide,
      correctResponse: raw.correctResponse, yesKey: raw.yesKey, noKey: raw.noKey,
      plannedVisibleTurn: raw.plannedVisibleTurn,
      plannedVisibleTurnTimeSec, plannedVisibleContact: raw.plannedVisibleContact,
      plannedVisibleContactTimeSec,
    } satisfies BellReachabilityV2StimulusUnit;
  }

  if (raw.type === "gratingPendulumStimulus") {
    const theta0Deg = finiteNumber(raw, "theta0Deg");
    const omega0DegPerSec = finiteNumber(raw, "omega0DegPerSec");
    const rodLengthM = finiteNumber(raw, "rodLengthM");
    const gravity = finiteNumber(raw, "gravity");
    const energyJ = finiteNumber(raw, "energyJ");
    const durationSec = finiteNumber(raw, "durationSec");
    const queryTimeSec = finiteNumber(raw, "queryTimeSec");
    const visibleWindowCountRaw = finiteNumber(raw, "visibleWindowCount");
    const gapM = finiteNumber(raw, "gapM");
    const barWidthM = finiteNumber(raw, "barWidthM");
    const gratingPeriodM = finiteNumber(raw, "gratingPeriodM");
    const gratingOffsetM = finiteNumber(raw, "gratingOffsetM");
    const bobRadiusM = finiteNumber(raw, "bobRadiusM");
    const initialSide = raw.initialSide;
    const initialDirection = raw.initialDirection;
    const responseOrder =
      raw.responseOrder === undefined ? "angle_first" : raw.responseOrder;
    const occlusionSegmentIndex = finiteNumber(raw, "occlusionSegmentIndex");
    const queryBarIndex = finiteNumber(raw, "queryBarIndex");
    const firstVisibleSecRaw = raw.firstVisibleSec;
    if (
      theta0Deg === null ||
      omega0DegPerSec === null ||
      rodLengthM === null ||
      gravity === null ||
      energyJ === null ||
      durationSec === null ||
      queryTimeSec === null ||
      visibleWindowCountRaw === null ||
      gapM === null ||
      barWidthM === null ||
      gratingPeriodM === null ||
      gratingOffsetM === null ||
      bobRadiusM === null ||
      occlusionSegmentIndex === null ||
      queryBarIndex === null ||
      !Number.isInteger(queryBarIndex) ||
      (visibleWindowCountRaw !== 2 &&
        visibleWindowCountRaw !== 3 &&
        visibleWindowCountRaw !== 4) ||
      (initialSide !== "left" && initialSide !== "right") ||
      (initialDirection !== "leftward" && initialDirection !== "rightward") ||
      (responseOrder !== "angle_first" && responseOrder !== "speed_first") ||
      rodLengthM <= 0 ||
      gravity <= 0 ||
      energyJ <= 0 ||
      durationSec <= 0 ||
      queryTimeSec < 0 ||
      queryTimeSec > durationSec
    ) {
      return null;
    }
    const visibleWindowCount = visibleWindowCountRaw as 2 | 3 | 4;
    const expectedGeometry = EXPERIMENT_4_GRATING_CONDITIONS[visibleWindowCount];
    if (
      Math.abs(gapM - expectedGeometry.gapM) > 1e-9 ||
      Math.abs(barWidthM - expectedGeometry.barWidthM) > 1e-9 ||
      Math.abs(gratingPeriodM - expectedGeometry.periodM) > 1e-9 ||
      Math.abs(gratingOffsetM - expectedGeometry.offsetM) > 1e-9 ||
      Math.abs(gratingPeriodM - (barWidthM + gapM)) > 1e-9
    ) {
      return null;
    }
    if (!Array.isArray(raw.occlusionTimeline)) return null;
    const occlusionTimeline: GratingOcclusionSegmentRecord[] = [];
    for (const item of raw.occlusionTimeline) {
      if (!isRecord(item)) return null;
      const kind = item.kind;
      const tStartSec = finiteNumber(item, "tStartSec");
      const tEndSec = finiteNumber(item, "tEndSec");
      if (
        (kind !== "fully_occluded" &&
          kind !== "fully_visible" &&
          kind !== "partial") ||
        tStartSec === null ||
        tEndSec === null
      ) {
        return null;
      }
      occlusionTimeline.push({
        kind,
        tStartSec,
        tEndSec,
      });
    }
    const firstVisibleSec =
      firstVisibleSecRaw === null
        ? null
        : typeof firstVisibleSecRaw === "number" && Number.isFinite(firstVisibleSecRaw)
          ? firstVisibleSecRaw
          : null;
    return {
      id,
      type: "gratingPendulumStimulus",
      theta0Deg,
      omega0DegPerSec,
      rodLengthM,
      gravity,
      energyJ,
      durationSec,
      queryTimeSec,
      visibleWindowCount,
      gapM,
      barWidthM,
      gratingPeriodM,
      gratingOffsetM,
      bobRadiusM,
      initialSide,
      initialDirection,
      responseOrder,
      occlusionSegmentIndex,
      queryBarIndex,
      occlusionTimeline,
      firstVisibleSec,
    };
  }

  if (raw.type === "speedColorTrainingStimulus") {
    const linearSpeedMPerSec = finiteNumber(raw, "linearSpeedMPerSec");
    const trackLeftXM = finiteNumber(raw, "trackLeftXM");
    const trackRightXM = finiteNumber(raw, "trackRightXM");
    const initialXM = finiteNumber(raw, "initialXM");
    const reportDelayRaw = raw.reportDelaySec;
    const reportDelaySec = reportDelayRaw === null
      ? null
      : finiteNumber(raw, "reportDelaySec");
    const firstTraversalRaw = raw.firstTraversalDurationSec;
    const firstTraversalDurationSec = firstTraversalRaw === null
      ? null
      : finiteNumber(raw, "firstTraversalDurationSec");
    const targetStripPosition = finiteNumber(raw, "targetStripPosition");
    const stageRoundIndex = finiteNumber(raw, "stageRoundIndex");
    const targetBinIndexRaw = raw.targetBinIndex;
    const assessmentAttemptRaw = raw.assessmentAttempt;
    const mode = raw.mode;
    const trainingSegment = raw.trainingSegment;
    const initialDirection = raw.initialDirection;
    const loopMode = raw.loopMode;
    const feedbackShown = raw.feedbackShown;
    if (
      linearSpeedMPerSec === null ||
      trackLeftXM === null ||
      trackRightXM === null ||
      initialXM === null ||
      (reportDelayRaw !== null && reportDelaySec === null) ||
      (firstTraversalRaw !== null && firstTraversalDurationSec === null) ||
      targetStripPosition === null ||
      stageRoundIndex === null ||
      !Number.isInteger(stageRoundIndex) ||
      (mode !== "guided" && mode !== "assessment") ||
      (trainingSegment !== "guided_1" &&
        trainingSegment !== "guided_2" &&
        trainingSegment !== "guided_3" &&
        trainingSegment !== "assessment_1" &&
        trainingSegment !== "remediation" &&
        trainingSegment !== "assessment_2") ||
      (initialDirection !== "rightward" && initialDirection !== "stationary") ||
      (loopMode !== "ping_pong" && loopMode !== "stationary") ||
      typeof feedbackShown !== "boolean" ||
      linearSpeedMPerSec < 0 ||
      targetStripPosition < 0 ||
      targetStripPosition > 1 ||
      Math.abs(trackLeftXM + 4) > 1e-9 ||
      Math.abs(trackRightXM - 4) > 1e-9 ||
      initialXM < trackLeftXM - 1e-9 ||
      initialXM > trackRightXM + 1e-9 ||
      stageRoundIndex < 0 ||
      stageRoundIndex > 3
    ) {
      return null;
    }
    const targetBinIndex = targetBinIndexRaw === null
      ? null
      : typeof targetBinIndexRaw === "number" &&
          Number.isInteger(targetBinIndexRaw) &&
          targetBinIndexRaw >= 0 && targetBinIndexRaw < 8
        ? targetBinIndexRaw
        : null;
    const assessmentAttempt = assessmentAttemptRaw === null
      ? null
      : assessmentAttemptRaw === 1 || assessmentAttemptRaw === 2
        ? assessmentAttemptRaw
        : null;
    if (targetBinIndexRaw !== null && targetBinIndex === null) return null;
    if (assessmentAttemptRaw !== null && assessmentAttempt === null) return null;
    if (mode === "guided") {
      if (targetBinIndex === null || assessmentAttempt !== null ||
          !feedbackShown ||
          reportDelaySec !== 4 ||
          (trainingSegment !== "remediation" &&
            trainingSegment !== `guided_${stageRoundIndex}`)) return null;
    } else if (
      targetBinIndex === null ||
      targetBinIndex >= 6 ||
      assessmentAttempt === null ||
      feedbackShown ||
      reportDelaySec !== 4 ||
      trainingSegment !== `assessment_${assessmentAttempt}` ||
      stageRoundIndex !== 1
    ) {
      return null;
    }
    const expectedLinearSpeed =
      Math.max(0, Math.min(1, targetStripPosition)) * TRAINING_1_LINEAR_SPEED_SCALE_M_PER_SEC;
    if (Math.abs(linearSpeedMPerSec - expectedLinearSpeed) > 1e-9) return null;
    const stationary = linearSpeedMPerSec <= 1e-12;
    if (stationary) {
      if (initialDirection !== "stationary" || loopMode !== "stationary" ||
          initialXM !== 0 || firstTraversalDurationSec !== null) return null;
    } else {
      const expectedTraversalSec = (trackRightXM - trackLeftXM) / linearSpeedMPerSec;
      if (initialDirection !== "rightward" || loopMode !== "ping_pong" ||
          Math.abs(initialXM - trackLeftXM) > 1e-9 ||
          firstTraversalDurationSec === null || firstTraversalDurationSec <= 0 ||
          Math.abs(firstTraversalDurationSec - expectedTraversalSec) > 1e-9) return null;
    }
    return {
      id,
      type: "speedColorTrainingStimulus",
      mode,
      trainingSegment,
      stageRoundIndex,
      targetBinIndex,
      assessmentAttempt,
      feedbackShown,
      initialDirection,
      loopMode,
      targetStripPosition,
      linearSpeedMPerSec,
      trackLeftXM,
      trackRightXM,
      initialXM,
      reportDelaySec,
      firstTraversalDurationSec,
    } satisfies SpeedColorTrainingStimulusUnit;
  }

  if (raw.type === "training1Summary") {
    if (typeof raw.text !== "string") return null;
    return { id, type: "training1Summary", text: raw.text };
  }

  if (raw.type === "reachabilityPendulumStimulus") {
    const numericKeys = [
      "theta0Deg", "omega0DegPerSec", "disappearanceThetaDeg",
      "disappearanceOmegaDegPerSec", "rodLengthM", "gravity", "bobRadiusM",
      "energyJ", "amplitudeDeg", "targetAngleDeg", "boundaryGapDeg",
      "judgmentDistanceM", "judgmentTimeSec", "visibleDurationSec", "responseDeadlineSec",
      "visibleWindowCount", "gapM", "barWidthM", "gratingPeriodM", "gratingOffsetM",
    ] as const;
    const n = Object.fromEntries(numericKeys.map((key) => [key, finiteNumber(raw, key)])) as Record<typeof numericKeys[number], number | null>;
    if (
      numericKeys.some((key) => n[key] === null) ||
      (raw.side !== "left" && raw.side !== "right") ||
      (raw.relation !== "reachable" && raw.relation !== "unreachable") ||
      (raw.correctResponse !== "reachable" && raw.correctResponse !== "unreachable") ||
      (raw.yesKey !== "f" && raw.yesKey !== "j") ||
      (raw.noKey !== "f" && raw.noKey !== "j") ||
      raw.yesKey === raw.noKey ||
      n.rodLengthM! <= 0 || n.gravity! <= 0 || n.bobRadiusM! <= 0 ||
      n.energyJ! <= 0 || n.judgmentDistanceM! <= 0 || n.judgmentTimeSec! <= 0 ||
      n.visibleDurationSec! <= 0 || n.responseDeadlineSec! <= 0
    ) return null;
    if (n.visibleWindowCount !== 2 && n.visibleWindowCount !== 3 && n.visibleWindowCount !== 4) return null;
    const visibleWindowCount = n.visibleWindowCount as 2 | 3 | 4;
    const geometry = EXPERIMENT_4_GRATING_CONDITIONS[visibleWindowCount];
    if (
      Math.abs(n.gapM! - geometry.gapM) > 1e-9 ||
      Math.abs(n.barWidthM! - geometry.barWidthM) > 1e-9 ||
      Math.abs(n.gratingPeriodM! - geometry.periodM) > 1e-9 ||
      Math.abs(n.gratingOffsetM! - geometry.offsetM) > 1e-9 ||
      Math.abs(n.gratingPeriodM! - n.barWidthM! - n.gapM!) > 1e-9
    ) return null;
    return {
      id, type: "reachabilityPendulumStimulus",
      theta0Deg: n.theta0Deg!, omega0DegPerSec: n.omega0DegPerSec!,
      disappearanceThetaDeg: n.disappearanceThetaDeg!, disappearanceOmegaDegPerSec: n.disappearanceOmegaDegPerSec!,
      rodLengthM: n.rodLengthM!, gravity: n.gravity!, bobRadiusM: n.bobRadiusM!, energyJ: n.energyJ!,
      amplitudeDeg: n.amplitudeDeg!, targetAngleDeg: n.targetAngleDeg!, boundaryGapDeg: n.boundaryGapDeg!,
      judgmentDistanceM: n.judgmentDistanceM!, judgmentTimeSec: n.judgmentTimeSec!,
      visibleDurationSec: n.visibleDurationSec!, responseDeadlineSec: n.responseDeadlineSec!,
      visibleWindowCount, gapM: n.gapM!, barWidthM: n.barWidthM!,
      gratingPeriodM: n.gratingPeriodM!, gratingOffsetM: n.gratingOffsetM!,
      side: raw.side, relation: raw.relation, correctResponse: raw.correctResponse,
      yesKey: raw.yesKey, noKey: raw.noKey,
    } satisfies ReachabilityPendulumStimulusUnit;
  }

  if (raw.type !== "pendulumStimulus") return null;
  const theta0Deg = finiteNumber(raw, "theta0Deg");
  const omega0DegPerSec = finiteNumber(raw, "omega0DegPerSec");
  const rodLengthM = finiteNumber(raw, "rodLengthM");
  const gravity = finiteNumber(raw, "gravity");
  const show1T = finiteNumber(raw, "show1T");
  const hide1T = finiteNumber(raw, "hide1T");
  const fadeMs = finiteNumber(raw, "fadeMs");
  if (
    theta0Deg === null ||
    omega0DegPerSec === null ||
    rodLengthM === null ||
    gravity === null ||
    show1T === null ||
    hide1T === null ||
    fadeMs === null ||
    rodLengthM <= 0 ||
    gravity <= 0 ||
    show1T <= 0 ||
    hide1T <= 0 ||
    fadeMs < 0
  ) {
    return null;
  }

  const base: PendulumStimulusUnit = {
    id,
    type: "pendulumStimulus",
    theta0Deg,
    omega0DegPerSec,
    rodLengthM,
    gravity,
    totalTimeT: 0,
    show1T,
    hide1T,
    fadeMs,
  };
  const periodSec = analyzePendulum({
    theta0Rad: (theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (omega0DegPerSec * Math.PI) / 180,
    rodLengthM,
    gravity,
  }).T;
  return withSyncedTotalTimeT(base, periodSec);
}

function parseTrial(raw: unknown): Trial | null {
  if (!isRecord(raw) || !Array.isArray(raw.units)) return null;
  const id = validId(raw);
  if (!id) return null;
  const units = raw.units.map(parseUnit);
  if (units.some((unit) => unit === null)) return null;
  return { id, units: units as StimulusUnit[] };
}

function parseTrials(
  raw: Record<string, unknown>,
): Trial[] | null {
  if (!Array.isArray(raw.children)) return null;
  const children = raw.children.map(parseTrial);
  if (children.some((trial) => trial === null)) return null;
  return children as Trial[];
}

function parseSequenceItem(raw: unknown): TopLevelSequenceItem | null {
  if (!isRecord(raw)) return null;
  const id = validId(raw);
  if (!id) return null;
  if (raw.kind === "block" || raw.kind === "practice") {
    const children = parseTrials(raw);
    if (!children) return null;
    return raw.kind === "block"
      ? ({ kind: "block", id, children } satisfies BlockSegment)
      : ({ kind: "practice", id, children } satisfies PracticeSegment);
  }
  if (raw.kind === "rest" && Array.isArray(raw.units)) {
    const units = raw.units.map(parseUnit);
    if (units.some((unit) => unit === null)) return null;
    return {
      kind: "rest",
      id,
      units: units as StimulusUnit[],
    } satisfies RestSegment;
  }
  return null;
}

function parseRuntimeStimulusSet(
  raw: unknown,
  schemaVersion: number,
): RuntimeStimulusSet | null {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== schemaVersion ||
    !Array.isArray(raw.sequence)
  ) {
    return null;
  }
  const sequence = raw.sequence.map(parseSequenceItem);
  if (sequence.length === 0 || sequence.some((item) => item === null)) {
    return null;
  }
  return {
    schemaVersion,
    sequence: sequence as TopLevelSequenceItem[],
  };
}

export function parseExperiment2StimulusSet(
  raw: unknown,
): Experiment2StimulusSet | null {
  return parseRuntimeStimulusSet(
    raw,
    EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  ) as Experiment2StimulusSet | null;
}

export function parseExperiment4StimulusSet(
  raw: unknown,
): Experiment4StimulusSet | null {
  return parseRuntimeStimulusSet(
    raw,
    EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION,
  ) as Experiment4StimulusSet | null;
}

export function parseExperiment5StimulusSet(
  raw: unknown,
): Experiment5StimulusSet | null {
  return parseRuntimeStimulusSet(raw, EXPERIMENT_5_STIMULUS_SET_SCHEMA_VERSION) as Experiment5StimulusSet | null;
}

export function parseExperiment4V2StimulusSet(
  raw: unknown,
): Experiment4V2StimulusSet | null {
  return parseRuntimeStimulusSet(
    raw,
    EXPERIMENT_4_V2_STIMULUS_SET_SCHEMA_VERSION,
  ) as Experiment4V2StimulusSet | null;
}

export function parseExperiment5V2StimulusSet(
  raw: unknown,
): Experiment5V2StimulusSet | null {
  return parseRuntimeStimulusSet(
    raw,
    EXPERIMENT_5_V2_STIMULUS_SET_SCHEMA_VERSION,
  ) as Experiment5V2StimulusSet | null;
}

export function parseTraining1StimulusSet(
  raw: unknown,
): ExperimentTraining1StimulusSet | null {
  return parseRuntimeStimulusSet(
    raw,
    EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION,
  ) as ExperimentTraining1StimulusSet | null;
}

function parseSetForExperiment(
  experimentId: ExperimentId,
  raw: unknown,
): RuntimeStimulusSet | null {
  if (experimentId === "experiment-2") return parseExperiment2StimulusSet(raw);
  if (experimentId === "experiment-4") return parseExperiment4StimulusSet(raw);
  if (experimentId === "experiment-4-v2") return parseExperiment4V2StimulusSet(raw);
  if (experimentId === "experiment-5") return parseExperiment5StimulusSet(raw);
  if (experimentId === "experiment-5-v2") return parseExperiment5V2StimulusSet(raw);
  if (experimentId === "training-1") return parseTraining1StimulusSet(raw);
  return null;
}

function parseParticipantForExperiment(
  experimentId: ExperimentId,
  raw: unknown,
): AnyParticipantInfo | null {
  if (experimentId === "experiment-2") {
    return isExperiment2ParticipantInfo(raw) ? raw : null;
  }
  if (experimentId === "experiment-4") {
    return isExperiment4ParticipantInfo(raw) ? raw : null;
  }
  if (experimentId === "experiment-4-v2") {
    return isExperiment4ParticipantInfo(raw) ? raw : null;
  }
  if (experimentId === "experiment-5") {
    return isExperiment5ParticipantInfo(raw) ? raw : null;
  }
  if (experimentId === "experiment-5-v2") {
    return isExperiment5ParticipantInfo(raw) ? raw : null;
  }
  if (experimentId === "training-1") {
    return isTraining1ParticipantInfo(raw) ? raw : null;
  }
  return null;
}

export function saveStimulusSetForExperiment(
  experimentId: ExperimentId,
  set: RuntimeStimulusSet,
): void {
  sessionStorage.setItem(sessionKey(experimentId, "stimulus-set"), JSON.stringify(set));
}

export function loadStimulusSetForExperiment(
  experimentId: ExperimentId,
): RuntimeStimulusSet | null {
  const serialized = sessionStorage.getItem(sessionKey(experimentId, "stimulus-set"));
  if (!serialized) return null;
  try {
    return parseSetForExperiment(experimentId, JSON.parse(serialized) as unknown);
  } catch {
    return null;
  }
}

export function saveParticipantForExperiment(
  experimentId: ExperimentId,
  participant: AnyParticipantInfo,
): void {
  sessionStorage.setItem(sessionKey(experimentId, "participant"), JSON.stringify(participant));
}

export function markExperimentRunActiveForExperiment(experimentId: ExperimentId): void {
  sessionStorage.setItem(sessionKey(experimentId, "run-active"), "1");
}

export function hasActiveExperimentRunSession(
  experimentId: ExperimentId = "experiment-2",
): boolean {
  if (sessionStorage.getItem(sessionKey(experimentId, "run-active")) !== "1") return false;
  return (
    loadParticipantForExperiment(experimentId) !== null &&
    loadStimulusSetForExperiment(experimentId) !== null
  );
}

export function beginExperimentRunSessionForExperiment(
  experimentId: ExperimentId,
  participant: AnyParticipantInfo,
  set: RuntimeStimulusSet,
): void {
  saveParticipantForExperiment(experimentId, participant);
  saveStimulusSetForExperiment(experimentId, set);
  markExperimentRunActiveForExperiment(experimentId);
}

export function loadParticipantForExperiment(
  experimentId: ExperimentId,
): AnyParticipantInfo | null {
  const serialized = sessionStorage.getItem(sessionKey(experimentId, "participant"));
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    return parseParticipantForExperiment(experimentId, parsed);
  } catch {
    return null;
  }
}

export function clearExperimentSession(
  experimentId: ExperimentId = "experiment-2",
): void {
  sessionStorage.removeItem(sessionKey(experimentId, "stimulus-set"));
  sessionStorage.removeItem(sessionKey(experimentId, "participant"));
  sessionStorage.removeItem(sessionKey(experimentId, "run-active"));
}

export function validateRunnableSet(set: RuntimeStimulusSet): string | null {
  if (set.sequence.length === 0) return "刺激序列为空。";
  for (const item of set.sequence) {
    if (item.kind === "block" || item.kind === "practice") {
      if (item.children.length === 0) return `${item.kind} 中没有 Trial。`;
      if (item.children.some((trial) => trial.units.length === 0)) {
        return `${item.kind} 中存在空 Trial。`;
      }
    } else if (item.units.length === 0) {
      return "休息或指导语段为空。";
    }
  }
  return null;
}

export type { Experiment2ParticipantInfo };
