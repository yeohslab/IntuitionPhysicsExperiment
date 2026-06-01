import HtmlKeyboardResponsePlugin from "@jspsych/plugin-html-keyboard-response";
import { analyzePendulum } from "../physics/pendulum";
import { springAnalysis } from "../physics/spring";
import { withSyncedTotalTimeT } from "../physics/timePhases";
import type { ExperimentStimulusSet, StimulusUnit, Trial } from "../types/experiment";
import { wrapImageStimulus, wrapStimulus } from "../shared/html";
import { normalizeKeyForJsPsych } from "../shared/keys";
import { controlTrialPrompt } from "./stimulusControl";
import PhysicsPracticePlugin from "./plugins/physicsPracticePlugin";
import PhysicsStimulusPlugin from "./plugins/physicsStimulusPlugin";
import { applySubjectBlockShuffle } from "./shuffleSequence";

export type UnitTrialContext = {
  segmentId: string;
  segmentKind: "block" | "rest" | "practice";
  blockChildKind: "trial" | null;
  blockChildId: string | null;
};

function stimulusHtmlForUnit(unit: StimulusUnit): string {
  if (unit.type === "textDisplay" || unit.type === "textControl") {
    return wrapStimulus(unit.text);
  }
  if (unit.type === "imageDisplay" || unit.type === "imageControl") {
    return wrapImageStimulus(unit.imageDataUrl);
  }
  return "";
}

function unitToTrial(
  unit: StimulusUnit,
  ctx: UnitTrialContext,
  developerMode: boolean,
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
        physicsKind: "pendulum",
        theta0Deg: unit.theta0Deg,
        omega0DegPerSec: unit.omega0DegPerSec,
        rodLengthM: unit.rodLengthM,
        gravity: unit.gravity,
        displayTimeT: unit.displayTimeT,
        massKg: 1,
        stiffness: 4,
        x0M: 0,
        v0Mps: 0,
        unitMeta: data,
      };
    case "springPractice":
      return {
        type: PhysicsPracticePlugin,
        physicsKind: "spring",
        theta0Deg: 0,
        omega0DegPerSec: 0,
        rodLengthM: 1,
        gravity: 9.8,
        displayTimeT: unit.displayTimeT,
        massKg: unit.massKg,
        stiffness: unit.stiffness,
        x0M: unit.x0M,
        v0Mps: unit.v0Mps,
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
        physicsKind: "pendulum",
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
        massKg: 1,
        stiffness: 4,
        x0M: 0,
        v0Mps: 0,
        unitMeta: data,
        developerMode,
        hideSemiVisible: unit.type === "pendulumPractice",
      };
    }
    case "springStimulus": {
      const periodSec = springAnalysis({
        massKg: unit.massKg,
        stiffness: unit.stiffness,
        x0M: unit.x0M,
        v0Mps: unit.v0Mps,
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
        physicsKind: "spring",
        theta0Deg: 0,
        omega0DegPerSec: 0,
        rodLengthM: 1,
        gravity: 9.8,
        totalTimeT: timing.totalTimeT,
        show1T: timing.show1T,
        hide1T: timing.hide1T,
        show2T: timing.show2T,
        hide2T: timing.hide2T,
        fadeMs: timing.fadeMs ?? 0,
        massKg: unit.massKg,
        stiffness: unit.stiffness,
        x0M: unit.x0M,
        v0Mps: unit.v0Mps,
        unitMeta: data,
        developerMode,
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
  developerMode: boolean,
): Record<string, unknown> {
  return {
    timeline: children.map((trial) => ({
      timeline: trial.units.map((unit) =>
        unitToTrial(
          unit,
          {
            segmentKind,
            segmentId,
            blockChildKind: "trial",
            blockChildId: trial.id,
          },
          developerMode,
        ),
      ),
    })),
  };
}

export function buildTimeline(
  set: ExperimentStimulusSet,
  options?: {
    developerMode?: boolean;
    subjectId?: string;
    stimulusSetIndex?: number;
  },
): Record<string, unknown>[] {
  const developerMode = options?.developerMode ?? false;
  let sequence = set.sequence;
  const subjectId = options?.subjectId ?? "";
  const idx = options?.stimulusSetIndex;
  if (subjectId && idx !== undefined && Number.isFinite(idx)) {
    sequence = applySubjectBlockShuffle(set, subjectId, idx).sequence;
  }
  const timeline: Record<string, unknown>[] = [];
  for (const item of sequence) {
    if (item.kind === "block") {
      timeline.push(buildSegmentWithTrialsTimeline(item.id, "block", item.children, developerMode));
    } else if (item.kind === "practice") {
      timeline.push(
        buildSegmentWithTrialsTimeline(item.id, "practice", item.children, developerMode),
      );
    } else {
      const ctx: UnitTrialContext = {
        segmentKind: "rest",
        segmentId: item.id,
        blockChildKind: null,
        blockChildId: null,
      };
      for (const unit of item.units) {
        timeline.push(unitToTrial(unit, ctx, developerMode));
      }
    }
  }
  return timeline;
}
