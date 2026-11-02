import {
  linearSpeedMPerSecFromSpeedStripPosition,
  speedStripPositionFromLinearSpeedMPerSec,
} from "../../experiment/physics/speedStripScale";
import type {
  SpeedColorTrainingStimulusUnit,
} from "../../shared/experimentTypes";
import {
  TRAINING_1_REPORT_DELAY_SEC,
  TRAINING_1_TRACK_HALF_SPAN_M,
} from "./protocol";

type TrainingUnitFields = Omit<SpeedColorTrainingStimulusUnit, "id" | "type">;

export function trainingLinearSpeedMPerSec(targetStripPosition: number): number {
  return linearSpeedMPerSecFromSpeedStripPosition(targetStripPosition);
}

export type TrainingMotionState = {
  xM: number;
  direction: "leftward" | "rightward" | "stationary";
};

export function trainingMotionStateAt(
  unit: Pick<
    SpeedColorTrainingStimulusUnit,
    | "trackLeftXM"
    | "trackRightXM"
    | "initialXM"
    | "linearSpeedMPerSec"
    | "loopMode"
  >,
  timeSec: number,
): TrainingMotionState {
  if (unit.loopMode === "stationary" || unit.linearSpeedMPerSec <= 1e-12) {
    return { xM: unit.initialXM, direction: "stationary" };
  }
  const spanM = unit.trackRightXM - unit.trackLeftXM;
  if (!(spanM > 0)) throw new Error("训练一轨道左右端点无效");
  const distanceM = unit.linearSpeedMPerSec * Math.max(0, timeSec);
  const cycleDistanceM = spanM * 2;
  const cyclePositionM = distanceM % cycleDistanceM;
  if (Math.abs(cyclePositionM - spanM) <= 1e-10) {
    return { xM: unit.trackRightXM, direction: "leftward" };
  }
  if (Math.abs(cyclePositionM) <= 1e-10) {
    return { xM: unit.trackLeftXM, direction: "rightward" };
  }
  if (cyclePositionM < spanM) {
    return {
      xM: unit.trackLeftXM + cyclePositionM,
      direction: "rightward",
    };
  }
  return {
    xM: unit.trackRightXM - (cyclePositionM - spanM),
    direction: "leftward",
  };
}

export function buildLinearTrainingUnit(
  targetStripPosition: number,
  meta: Pick<
    TrainingUnitFields,
    | "mode"
    | "trainingSegment"
    | "stageRoundIndex"
    | "targetBinIndex"
    | "assessmentAttempt"
    | "feedbackShown"
  >,
): TrainingUnitFields {
  if (!Number.isFinite(targetStripPosition) ||
      targetStripPosition < 0 || targetStripPosition > 1) {
    throw new Error(`无效训练一色带位置 ${targetStripPosition}`);
  }
  const linearSpeedMPerSec = trainingLinearSpeedMPerSec(targetStripPosition);
  const stationary = linearSpeedMPerSec <= 1e-12;
  const trackLeftXM = -TRAINING_1_TRACK_HALF_SPAN_M;
  const trackRightXM = TRAINING_1_TRACK_HALF_SPAN_M;
  const firstTraversalDurationSec = stationary
    ? null
    : (trackRightXM - trackLeftXM) / linearSpeedMPerSec;
  const truth = speedStripPositionFromLinearSpeedMPerSec(linearSpeedMPerSec);
  if (Math.abs(truth - targetStripPosition) > 1e-12) {
    throw new Error("训练一线速度与色带目标不一致");
  }
  return {
    ...meta,
    initialDirection: stationary ? "stationary" : "rightward",
    loopMode: stationary ? "stationary" : "ping_pong",
    targetStripPosition,
    linearSpeedMPerSec,
    trackLeftXM,
    trackRightXM,
    initialXM: stationary ? 0 : trackLeftXM,
    reportDelaySec: TRAINING_1_REPORT_DELAY_SEC,
    firstTraversalDurationSec,
  };
}
