import type { JsPsych } from "jspsych";
import type { ExperimentTraining1StimulusSet } from "../../shared/experimentTypes";
import { buildTimelineFromDescriptors } from "../../runtime/buildTimeline";
import { evaluateTraining1MasteryFromJsPsych } from "./mastery";
import {
  TRAINING_1_FEEDBACK_PHASE_TIMELINE,
  TRAINING_1_SEGMENT_IDS,
} from "./protocol";
import { collectTraining1TrialDescriptors } from "./trialDescriptor";

export function buildTraining1Timeline(
  set: ExperimentTraining1StimulusSet,
  jsPsych?: JsPsych,
): Record<string, unknown>[] {
  const descriptors = collectTraining1TrialDescriptors(set);
  const nodes = buildTimelineFromDescriptors(set, descriptors, "training-1");
  if (!jsPsych) return nodes;

  const retryStart = set.sequence.findIndex(
    (item) => item.id === TRAINING_1_SEGMENT_IDS.remediationIntro,
  );
  const summaryIndex = set.sequence.findIndex((item) =>
    item.kind === "rest" && item.units.some((unit) => unit.type === "training1Summary"));
  if (retryStart < 0 || summaryIndex <= retryStart || nodes.length !== set.sequence.length) {
    throw new Error("训练一循环补强时间线结构错误");
  }

  const feedbackStart = set.sequence.findIndex(
    (item) => item.kind === "practice" && item.id === TRAINING_1_SEGMENT_IDS.guided1,
  );
  const feedbackEnd = set.sequence.findIndex(
    (item) => item.kind === "practice" && item.id === TRAINING_1_SEGMENT_IDS.guided3,
  );
  if (feedbackStart < 0 || feedbackEnd !== feedbackStart + 2 || feedbackEnd >= retryStart) {
    throw new Error("训练一反馈阶段时间线结构错误");
  }

  const needsAnotherCycle = () =>
    !evaluateTraining1MasteryFromJsPsych(jsPsych).passed;
  const retryLoop = {
    timeline: nodes.slice(retryStart, summaryIndex),
    conditional_function: needsAnotherCycle,
    loop_function: needsAnotherCycle,
  };
  return [
    ...nodes.slice(0, feedbackStart),
    {
      name: TRAINING_1_FEEDBACK_PHASE_TIMELINE,
      timeline: nodes.slice(feedbackStart, feedbackEnd + 1),
    },
    ...nodes.slice(feedbackEnd + 1, retryStart),
    retryLoop,
    ...nodes.slice(summaryIndex),
  ];
}
