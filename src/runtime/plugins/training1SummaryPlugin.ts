import type { JsPsych } from "jspsych";
import { ParameterType } from "jspsych";
import { training1SummaryText } from "../../experiments/training-1/instructions";
import { evaluateTraining1MasteryFromJsPsych } from "../../experiments/training-1/mastery";
import { wrapInstructionHtml } from "../../shared/html";
import { normalizeKeyForJsPsych } from "../../shared/keys";

const SPACE_KEY = normalizeKeyForJsPsych(" ");

const info = {
  name: "training-1-summary",
  version: "1.0.0",
  parameters: {
    unitMeta: { type: ParameterType.COMPLEX, default: {} },
  },
  data: {},
} as const;

class Training1SummaryPlugin {
  static info = info;
  constructor(private jsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: { unitMeta: Record<string, unknown> }): void {
    const result = evaluateTraining1MasteryFromJsPsych(this.jsPsych);
    display_element.innerHTML = wrapInstructionHtml(training1SummaryText(result));
    this.jsPsych.pluginAPI.getKeyboardResponse({
      callback_function: () => {
        this.jsPsych.finishTrial({
          ...trial.unitMeta,
          mastery_passed: result.passed,
          completed_report_trials: result.completedReportTrials,
          mastery_recent_mean_abs_error: result.recentMeanAbsError,
          mastery_recent_within_015_count: result.recentWithinThresholdCount,
        });
      },
      valid_responses: [SPACE_KEY],
      rt_method: "performance",
      persist: false,
      allow_held_key: false,
    });
  }
}

export default Training1SummaryPlugin;
