import { initJsPsych, type JsPsych } from "jspsych";
import "jspsych/css/jspsych.css";
import "../styles/physics.css";
import type { ExperimentStimulusSet } from "../types/experiment";
import { buildTimeline } from "./buildTimeline";
import { cancelStaleKeyboardListeners, wireRunnerControls } from "./stimulusControl";
import {
  loadStimulusSetFromSession,
  SESSION_STIMULUS_FILE_INDEX_KEY,
  SESSION_SUBJECT_ID_KEY,
  validateRunnableSet,
} from "../shared/storage";

let activeJsPsych: JsPsych | null = null;

export function disposeRunner(): void {
  if (activeJsPsych) {
    try {
      activeJsPsych.abortExperiment("已离开运行页");
    } catch {
      /* ignore */
    }
    activeJsPsych = null;
  }
}

export function mountRunner(container: HTMLElement): void {
  disposeRunner();
  container.innerHTML = "";
  container.className = "runner-view";

  const set = loadStimulusSetFromSession();
  const err = set ? validateRunnableSet(set) : "未找到要运行的刺激集。请从首页输入被试编号并开始，或在编辑页点击「运行实验」。";

  if (!set || err) {
    container.innerHTML = `
      <div class="runner-panel runner-panel--error">
        <p>${escapeAttr(err ?? "未知错误")}</p>
        <p><a href="#/start" class="btn btn-primary">返回实验首页</a>
        <a href="#/editor" class="btn btn-secondary">刺激编写</a></p>
      </div>
    `;
    return;
  }

  runExperiment(container, set);
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function runExperiment(container: HTMLElement, set: ExperimentStimulusSet): void {
  const toolbar = document.createElement("div");
  toolbar.className = "runner-toolbar";
  toolbar.innerHTML = `<a href="#/start" class="btn btn-ghost">实验首页</a><a href="#/editor" class="btn btn-ghost">刺激编写</a>`;

  const target = document.createElement("div");
  target.id = "jspsych-target";
  target.className = "jspsych-target";

  const done = document.createElement("div");
  done.className = "runner-done";
  done.hidden = true;
  done.innerHTML = `
    <p>实验已结束。若浏览器未自动下载 CSV，请检查是否被拦截下载。</p>
    <p><a href="#/start" class="btn btn-primary">实验首页</a> <a href="#/editor" class="btn btn-secondary">刺激编写</a></p>
  `;

  container.appendChild(toolbar);
  container.appendChild(target);
  container.appendChild(done);

  const jsPsych = initJsPsych({
    display_element: target,
    on_trial_start: () => {
      cancelStaleKeyboardListeners(jsPsych);
    },
    on_finish: () => {
      activeJsPsych = null;
      try {
        jsPsych.data.get().localSave("csv", "experiment_data.csv");
      } catch (e) {
        console.error(e);
      }
      toolbar.hidden = true;
      target.hidden = true;
      done.hidden = false;
    },
  });

  activeJsPsych = jsPsych;
  const subjectId = sessionStorage.getItem(SESSION_SUBJECT_ID_KEY) ?? "";
  const idxRaw = sessionStorage.getItem(SESSION_STIMULUS_FILE_INDEX_KEY);
  const stimulusSetIndex = idxRaw !== null && idxRaw !== "" ? Number(idxRaw) : NaN;
  jsPsych.data.addProperties({
    subject_id: subjectId,
    stimulus_set_index: Number.isFinite(stimulusSetIndex) ? stimulusSetIndex : null,
  });
  wireRunnerControls(jsPsych, target);
  const timeline = buildTimeline(set);
  void jsPsych.run(timeline as Parameters<JsPsych["run"]>[0]);
}
