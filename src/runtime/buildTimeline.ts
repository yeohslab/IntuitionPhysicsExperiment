import HtmlKeyboardResponsePlugin from "@jspsych/plugin-html-keyboard-response";
import { analyzePendulum } from "../experiment/physics/pendulum";
import { withSyncedTotalTimeT } from "../experiment/physics/timePhases";
import type {
  RuntimeStimulusSet,
  StimulusUnit,
  Trial,
} from "../shared/experimentTypes";
import type { ExperimentId } from "../experiments/types";
import { wrapFixationStimulus, wrapInstructionHtml } from "../shared/html";
import { WITHIN_SUBJECT_FIXATION_TEXT } from "../experiments/within-subject/protocol";
import { normalizeKeyForJsPsych } from "../shared/keys";
import { controlTrialPrompt } from "./stimulusControl";
import PhysicsStimulusPlugin from "./plugins/physicsStimulusPlugin";
import GratingPendulumPlugin from "./plugins/gratingPendulumPlugin";
import ReachabilityPendulumPlugin from "./plugins/reachabilityPendulumPlugin";
import type {
  GratingPendulumStimulusUnit,
  ReachabilityPendulumStimulusUnit,
  SpeedColorTrainingStimulusUnit,
} from "../shared/experimentTypes";
import SpeedColorTrainingPlugin from "./plugins/speedColorTrainingPlugin";
import Training1SummaryPlugin from "./plugins/training1SummaryPlugin";

export type BuildTimelineOptions = {
  wrapPracticeSegment?: (
    segmentId: string,
    node: Record<string, unknown>,
  ) => Record<string, unknown>;
  wrapRestSegment?: (
    segmentId: string,
    node: Record<string, unknown>,
  ) => Record<string, unknown>;
};

export type UnitTrialContext = {
  segmentId: string;
  segmentKind: "block" | "rest" | "practice";
  blockChildKind: "trial" | null;
  blockChildId: string | null;
};

function stimulusHtmlForUnit(unit: StimulusUnit): string {
  if (unit.type === "textDisplay" || unit.type === "textControl") {
    if (unit.type === "textDisplay" && unit.text.trim() === WITHIN_SUBJECT_FIXATION_TEXT) {
      return wrapFixationStimulus(WITHIN_SUBJECT_FIXATION_TEXT);
    }
    return wrapInstructionHtml(unit.text);
  }
  return "";
}

function unitToTrial(
  unit: StimulusUnit,
  ctx: UnitTrialContext,
  descriptor?: Record<string, unknown>,
  experimentId: ExperimentId = "experiment-2",
): Record<string, unknown> {
  const data = {
    unitId: unit.id,
    unitType: unit.type,
    segmentKind: ctx.segmentKind,
    segmentId: ctx.segmentId,
    blockChildKind: ctx.blockChildKind ?? "",
    blockChildId: ctx.blockChildId ?? "",
  };
  switch (unit.type) {
    case "reachabilityPendulumStimulus": {
      const rUnit = unit as ReachabilityPendulumStimulusUnit;
      return {
        type: ReachabilityPendulumPlugin,
        theta0Deg: rUnit.theta0Deg,
        omega0DegPerSec: rUnit.omega0DegPerSec,
        rodLengthM: rUnit.rodLengthM,
        gravity: rUnit.gravity,
        bobRadiusM: rUnit.bobRadiusM,
        targetAngleDeg: rUnit.targetAngleDeg,
        amplitudeDeg: rUnit.amplitudeDeg,
        visibleDurationSec: rUnit.visibleDurationSec,
        responseDeadlineSec: rUnit.responseDeadlineSec,
        yesKey: rUnit.yesKey,
        noKey: rUnit.noKey,
        correctResponse: rUnit.correctResponse,
        practice: ctx.segmentKind === "practice",
        unitMeta: descriptor
          ? { ...descriptor, runtime_experiment_id: experimentId }
          : { ...data, runtime_experiment_id: experimentId },
        data: descriptor
          ? { ...descriptor, runtime_experiment_id: experimentId, unit_type: "reachabilityPendulumStimulus" }
          : { ...data, runtime_experiment_id: experimentId, unit_type: "reachabilityPendulumStimulus" },
      };
    }
    case "speedColorTrainingStimulus": {
      const sUnit = unit as SpeedColorTrainingStimulusUnit;
      return {
        type: SpeedColorTrainingPlugin,
        mode: sUnit.mode,
        trainingSegment: sUnit.trainingSegment,
        initialDirection: sUnit.initialDirection,
        loopMode: sUnit.loopMode,
        linearSpeedMPerSec: sUnit.linearSpeedMPerSec,
        trackLeftXM: sUnit.trackLeftXM,
        trackRightXM: sUnit.trackRightXM,
        initialXM: sUnit.initialXM,
        reportDelaySec: sUnit.reportDelaySec,
        firstTraversalDurationSec: sUnit.firstTraversalDurationSec,
        feedbackShown: sUnit.feedbackShown,
        unitMeta: descriptor
          ? { ...descriptor, runtime_experiment_id: experimentId }
          : { ...data, runtime_experiment_id: experimentId },
        data: descriptor
          ? {
              ...descriptor,
              runtime_experiment_id: experimentId,
              unit_type: "speedColorTrainingStimulus",
              training_segment: sUnit.trainingSegment,
            }
          : {
              ...data,
              runtime_experiment_id: experimentId,
              unit_type: "speedColorTrainingStimulus",
              training_segment: sUnit.trainingSegment,
            },
      };
    }
    case "training1Summary": {
      return {
        type: Training1SummaryPlugin,
        unitMeta: descriptor
          ? { ...descriptor, runtime_experiment_id: experimentId }
          : { ...data, runtime_experiment_id: experimentId },
        data: descriptor
          ? { ...descriptor, runtime_experiment_id: experimentId, unit_type: "training1Summary" }
          : { ...data, runtime_experiment_id: experimentId, unit_type: "training1Summary" },
      };
    }
    case "gratingPendulumStimulus": {
      const gUnit = unit as GratingPendulumStimulusUnit;
      return {
        type: GratingPendulumPlugin,
        theta0Deg: gUnit.theta0Deg,
        omega0DegPerSec: gUnit.omega0DegPerSec,
        rodLengthM: gUnit.rodLengthM,
        gravity: gUnit.gravity,
        durationSec: gUnit.durationSec,
        queryTimeSec: gUnit.queryTimeSec,
        gapM: gUnit.gapM,
        responseOrder: gUnit.responseOrder,
        unitMeta: descriptor
          ? { ...descriptor, runtime_experiment_id: experimentId }
          : { ...data, runtime_experiment_id: experimentId },
        data: descriptor
          ? { ...descriptor, runtime_experiment_id: experimentId, unit_type: "gratingPendulumStimulus" }
          : { ...data, runtime_experiment_id: experimentId, unit_type: "gratingPendulumStimulus" },
      };
    }
    case "pendulumStimulus": {
      const periodSec = analyzePendulum({
        theta0Rad: (unit.theta0Deg * Math.PI) / 180,
        omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
        rodLengthM: unit.rodLengthM,
        gravity: unit.gravity,
      }).T;
      const timing = withSyncedTotalTimeT(
        {
          totalTimeT: unit.totalTimeT,
          show1T: unit.show1T,
          hide1T: unit.hide1T,
          fadeMs: unit.fadeMs,
        },
        periodSec,
      );
      return {
        type: PhysicsStimulusPlugin,
        theta0Deg: unit.theta0Deg,
        omega0DegPerSec: unit.omega0DegPerSec,
        rodLengthM: unit.rodLengthM,
        gravity: unit.gravity,
        totalTimeT: timing.totalTimeT,
        show1T: timing.show1T,
        hide1T: timing.hide1T,
        fadeMs: timing.fadeMs ?? 0,
        unitMeta: descriptor
          ? { ...descriptor, runtime_experiment_id: experimentId }
          : { ...data, runtime_experiment_id: experimentId },
        data: descriptor
          ? { ...descriptor, runtime_experiment_id: experimentId }
          : { ...data, runtime_experiment_id: experimentId },
      };
    }
    case "textDisplay": {
      const stimulus = stimulusHtmlForUnit(unit);
      return {
        type: HtmlKeyboardResponsePlugin,
        stimulus,
        choices: "NO_KEYS" as const,
        trial_duration: unit.durationMs,
        response_ends_trial: false,
        data,
      };
    }
    case "textControl": {
      const stimulus = stimulusHtmlForUnit(unit);
      const key = normalizeKeyForJsPsych(unit.key);
      return {
        type: HtmlKeyboardResponsePlugin,
        stimulus,
        prompt: controlTrialPrompt(key),
        choices: [key],
        response_ends_trial: true,
        data,
      };
    }
    default: {
      const _exhaust: never = unit;
      return _exhaust;
    }
  }
}

function buildSegmentWithTrialsTimeline(
  segmentId: string,
  segmentKind: "block" | "practice",
  children: Trial[],
  descriptorByUnitId: ReadonlyMap<string, Record<string, unknown>>,
  experimentId: ExperimentId,
): Record<string, unknown> {
  return {
    timeline: children.map((trial) => ({
      timeline: trial.units.map((unit) =>
        unitToTrial(unit, {
          segmentKind,
          segmentId,
          blockChildKind: "trial",
          blockChildId: trial.id,
        }, descriptorByUnitId.get(unit.id), experimentId),
      ),
    })),
  };
}

export function buildTimelineFromDescriptors(
  set: RuntimeStimulusSet,
  descriptors: readonly { unit_id: string }[],
  experimentId: ExperimentId,
  options?: BuildTimelineOptions,
): Record<string, unknown>[] {
  const sequence = set.sequence;
  const descriptorByUnitId = new Map<string, Record<string, unknown>>(
    descriptors.map((descriptor) => [
      descriptor.unit_id,
      { ...descriptor },
    ]),
  );
  const timeline: Record<string, unknown>[] = [];
  for (const item of sequence) {
    if (item.kind === "block") {
      timeline.push(
        buildSegmentWithTrialsTimeline(
          item.id,
          "block",
          item.children,
          descriptorByUnitId,
          experimentId,
        ),
      );
    } else if (item.kind === "practice") {
      let practiceNode = buildSegmentWithTrialsTimeline(
        item.id,
        "practice",
        item.children,
        descriptorByUnitId,
        experimentId,
      );
      if (options?.wrapPracticeSegment) {
        practiceNode = options.wrapPracticeSegment(item.id, practiceNode);
      }
      timeline.push(practiceNode);
    } else {
      const ctx: UnitTrialContext = {
        segmentKind: "rest",
        segmentId: item.id,
        blockChildKind: null,
        blockChildId: null,
      };
      const restTrials = item.units.map((unit) =>
        unitToTrial(unit, ctx, undefined, experimentId));
      if (options?.wrapRestSegment) {
        timeline.push(options.wrapRestSegment(item.id, { timeline: restTrials }));
      } else {
        timeline.push(...restTrials);
      }
    }
  }
  return timeline;
}
