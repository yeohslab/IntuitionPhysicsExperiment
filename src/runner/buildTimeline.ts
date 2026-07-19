import HtmlKeyboardResponsePlugin from "@jspsych/plugin-html-keyboard-response";
import { analyzePendulum } from "../physics/pendulum";
import { withSyncedTotalTimeT } from "../physics/timePhases";
import type { ExperimentStimulusSet, StimulusUnit, Trial } from "../types/experiment";
import { wrapFixationStimulus, wrapImageStimulus, wrapInstructionHtml } from "../shared/html";
import { FIXATION_TEXT } from "../stimulate/instructions";
import { normalizeKeyForJsPsych } from "../shared/keys";
import { controlTrialPrompt } from "./stimulusControl";
import PhysicsPracticePlugin from "./plugins/physicsPracticePlugin";
import PhysicsStimulusPlugin from "./plugins/physicsStimulusPlugin";

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
  if (unit.type === "imageDisplay" || unit.type === "imageControl") {
    return wrapImageStimulus(unit.imageDataUrl);
  }
  return "";
}

function unitToTrial(
  unit: StimulusUnit,
  ctx: UnitTrialContext,
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
    case "pendulumDisplay":
      return {
        type: PhysicsPracticePlugin,
        theta0Deg: unit.theta0Deg,
        omega0DegPerSec: unit.omega0DegPerSec,
        rodLengthM: unit.rodLengthM,
        gravity: unit.gravity,
        displayTimeT: unit.displayTimeT,
        unitMeta: data,
      };
    case "pendulumStimulus":
    case "pendulumPractice": {
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
          show2T: unit.show2T,
          hide2T: unit.hide2T,
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
        show2T: timing.show2T,
        hide2T: timing.hide2T,
        fadeMs: timing.fadeMs ?? 0,
        unitMeta: data,
      };
    }
    case "textDisplay":
    case "imageDisplay": {
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
    case "textControl":
    case "imageControl": {
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
): Record<string, unknown> {
  return {
    timeline: children.map((trial) => ({
      timeline: trial.units.map((unit) =>
        unitToTrial(unit, {
          segmentKind,
          segmentId,
          blockChildKind: "trial",
          blockChildId: trial.id,
        }),
      ),
    })),
  };
}

export function buildTimeline(set: ExperimentStimulusSet): Record<string, unknown>[] {
  const sequence = set.sequence;
  const timeline: Record<string, unknown>[] = [];
  for (const item of sequence) {
    if (item.kind === "block") {
      timeline.push(buildSegmentWithTrialsTimeline(item.id, "block", item.children));
    } else if (item.kind === "practice") {
      timeline.push(buildSegmentWithTrialsTimeline(item.id, "practice", item.children));
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
