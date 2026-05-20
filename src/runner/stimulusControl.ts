import type { JsPsych } from "jspsych";
import { escapeHtml } from "../shared/html";
import { labelForKey } from "../shared/keys";

const DIV = "div";

/** 清除可能残留的键盘监听（如物理刺激汇报阶段的 persist 监听） */
export function cancelStaleKeyboardListeners(jsPsych: JsPsych): void {
  const api = jsPsych.pluginAPI as typeof jsPsych.pluginAPI & {
    cancelAllKeyboardResponses?: () => void;
  };
  api.cancelAllKeyboardResponses?.();
}

/** 控制类试次：屏幕按钮 + 键盘等效，避免仅键盘时卡死 */
export function controlTrialPrompt(key: string): string {
  const label = labelForKey(key);
  const keyAttr = escapeHtml(key);
  return `<${DIV} class="stimulus-control-prompt">
    <p class="muted">按 <kbd>${escapeHtml(label)}</kbd> 或点击下方按钮继续</p>
    <button type="button" class="btn btn-primary jspsych-stimulus-continue" data-stimulus-key="${keyAttr}">继续</button>
  </${DIV}>`;
}

export function wireRunnerControls(jsPsych: JsPsych, root: HTMLElement): void {
  root.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".jspsych-stimulus-continue");
    if (!btn || !(btn instanceof HTMLButtonElement)) return;
    e.preventDefault();
    const key = btn.dataset.stimulusKey ?? " ";
    jsPsych.pluginAPI.pressKey(key);
  });
}
