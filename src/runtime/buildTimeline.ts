import HtmlKeyboardResponsePlugin from "@jspsych/plugin-html-keyboard-response";
import { analyzePendulum } from "../experiment/physics/pendulum";
import { withSyncedTotalTimeT } from "../experiment/physics/timePhases";
import type {
  ExperimentStimulusSet,
  StimulusUnit,
  Trial,
} from "../shared/experimentTypes";
import { wrapFixationStimulus, wrapInstructionHtml } from "../shared/html";
import { FIXATION_TEXT } from "../experiment/stimulus/instructions";
import { normalizeKeyForJsPsych } from "../shared/keys";
import { controlTrialPrompt } from "./stimulusControl";
import PhysicsStimulusPlugin from "./plugins/physicsStimulusPlugin";
import type { MotionGroup } from "../shared/participant";
import {
  collectPendulumTrialDescriptors,
  type PendulumTrialDescriptor,
} from "../shared/trialDescriptor";

export type UnitTrialContext = {
  segmentId: string;
  segmentKind: "block" | "rest" | "practice";
  blockChildKind: "trial" | null;
  blockChildId: string | null;
};

function stimulusHtmlForUnit(unit: StimulusUnit): string {
  if (unit.type === "textDisplay" || unit.type === "textControl") {
    if (unit.type === "textDisplay" && unit.text.trim() === FIXATION_TEXT) {
      return wrapFixationStimulus(FIXATION_TEXT);
    }
    return wrapInstructionHtml(unit.text);
  }
  return "";
}

function unitToTrial(
  unit: StimulusUnit,
  ctx: UnitTrialContext,
  descriptor?: PendulumTrialDescriptor,
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
        unitMeta: descriptor ?? data,
        data: descriptor ?? data,
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
  descriptorByUnitId: ReadonlyMap<string, PendulumTrialDescriptor>,
): Record<string, unknown> {
  return {
    timeline: children.map((trial) => ({
      timeline: trial.units.map((unit) =>
        unitToTrial(unit, {
          segmentKind,
          segmentId,
          blockChildKind: "trial",
          blockChildId: trial.id,
        }, descriptorByUnitId.get(unit.id)),
      ),
    })),
  };
}

export function buildTimeline(
  set: ExperimentStimulusSet,
  motionGroup: MotionGroup,
): Record<string, unknown>[] {
  const sequence = set.sequence;
  const descriptorByUnitId = new Map(
    collectPendulumTrialDescriptors(set, motionGroup).map((descriptor) => [
      descriptor.unit_id,
      descriptor,
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
        ),
      );
    } else if (item.kind === "practice") {
      timeline.push(
        buildSegmentWithTrialsTimeline(
          item.id,
          "practice",
          item.children,
          descriptorByUnitId,
        ),
      );
    } else {
      const ctx: UnitTrialContext = {
        segmentKind: "rest",
        segmentId: item.id,
        blockChildKind: null,
        blockChildId: null,
      };
      for (const unit of item.units) {
        timeline.push(unitToTrial(unit, ctx));
      }
    }
  }
  return timeline;
}
