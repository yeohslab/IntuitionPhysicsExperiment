import type { JsPsych } from "jspsych";
import type { ExperimentTraining1StimulusSet } from "../../shared/experimentTypes";
import {
  buildTimelineFromDescriptors,
  type BuildTimelineOptions,
} from "../../runtime/buildTimeline";
import { evaluateTraining1MasteryFromJsPsych } from "./mastery";
import { training1MasterySegmentId } from "./protocol";
import { collectTraining1TrialDescriptors } from "./trialDescriptor";

export function buildTraining1Timeline(
  set: ExperimentTraining1StimulusSet,
  jsPsych?: JsPsych,
): Record<string, unknown>[] {
  const descriptors = collectTraining1TrialDescriptors(set);
  const options: BuildTimelineOptions | undefined = jsPsych
    ? {
        wrapPracticeSegment: (segmentId, node) => {
          const adaptiveIds = [3, 4, 5].map(training1MasterySegmentId);
          return adaptiveIds.includes(segmentId)
            ? { ...node, conditional_function: () => !evaluateTraining1MasteryFromJsPsych(jsPsych).passed }
            : node;
        },
      }
    : undefined;
  return buildTimelineFromDescriptors(set, descriptors, "training-1", options);
}
