import { initJsPsych, type JsPsych } from "jspsych";
import "jspsych/css/jspsych.css";
import "../styles/physics.css";
import type { ExperimentStimulusSet } from "../shared/experimentTypes";
import type { ParticipantInfo } from "../shared/participant";
import { buildTimeline } from "../runtime/buildTimeline";
import {
  classifyExperimentStatus,
  exportStimulusTrialsCsv,
  type ExperimentStatus,
} from "../runtime/export/exportStimulusCsv";
import {
  cancelStaleKeyboardListeners,
  wireRunnerControls,
} from "../runtime/stimulusControl";
import {
  loadParticipantFromSession,
  loadStimulusSetFromSession,
  validateRunnableSet,
} from "../shared/storage";
import { downloadStimulusSetJson } from "../shared/exportStimulusSetJson";
import {
  checkpointActiveRecovery,
  clearRecoverySnapshot,
  updateRecoveryCursor,
  updateRecoveryRows,
} from "../shared/recovery";
import { PHYSICS_ABORT_EVENT } from "../runtime/plugins/physicsStimulusPlugin";

type ActiveRun = {
  interrupt: (showDone: boolean) => void;
};

let activeRun: ActiveRun | null = null;

export function disposeRunner(): void {
  activeRun?.interrupt(false);
  activeRun = null;
}

export function mountRunner(container: HTMLElement): void {
  disposeRunner();
  container.innerHTML = "";
  container.className = "runner-view";

  const set = loadStimulusSetFromSession();
  const participant = loadParticipantFromSession();
  const err = !participant
    ? "未找到有效的被试信息。请从首页重新开始。"
    : set
      ? validateRunnableSet(set)
      : "未找到要运行的刺激集。请从首页输入被试信息并开始。";

  if (!set || !participant || err) {
    container.innerHTML = `
      <div class="runner-panel runner-panel--error">
        <p>${escapeHtml(err ?? "未知错误")}</p>
        <p><a href="#/start" class="btn btn-primary">返回实验首页</a></p>
      </div>
    `;
    return;
  }

  runExperiment(container, set, participant);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dataRows(jsPsych: JsPsych): Record<string, unknown>[] {
  return (jsPsych.data.get().values() as Record<string, unknown>[]).map((row) => ({
    ...row,
  }));
}

function runExperiment(
  container: HTMLElement,
  set: ExperimentStimulusSet,
  participant: ParticipantInfo,
): void {
  const toolbar = document.createElement("div");
  toolbar.className = "runner-toolbar";
  const interruptButton = document.createElement("button");
  interruptButton.type = "button";
  interruptButton.className = "btn btn-danger";
  interruptButton.textContent = "中断并导出";
  toolbar.appendChild(interruptButton);

  const target = document.createElement("div");
  target.id = "jspsych-target";
  target.className = "jspsych-target";

  const done = document.createElement("div");
  done.className = "runner-done";
  done.hidden = true;

  container.appendChild(toolbar);
  container.appendChild(target);
  container.appendChild(done);

  let requestedInterrupt = false;
  let showDoneAfterInterrupt = true;
  let finalized = false;
  let jsPsych!: JsPsych;

  const persistRows = () => {
    if (!jsPsych) return;
    updateRecoveryRows(dataRows(jsPsych));
  };

  const removePageListeners = () => {
    window.removeEventListener("pagehide", checkpointBeforeLeaving);
    window.removeEventListener("beforeunload", checkpointBeforeLeaving);
  };

  const showDoneScreen = (
    status: ExperimentStatus,
    rows: readonly Record<string, unknown>[],
  ) => {
    toolbar.hidden = true;
    target.hidden = true;
    done.hidden = false;
    done.innerHTML = `
      <h2>${status === "f" ? "实验已完成" : "实验已中断"}</h2>
      <p>已尝试下载被试 CSV 与刺激集 JSON。若浏览器拦截了下载，请使用下方按钮。</p>
      <div class="runner-done__actions">
        <button type="button" class="btn btn-secondary" id="btn-redownload-data">重新下载 CSV</button>
        <button type="button" class="btn btn-secondary" id="btn-redownload-stimulus">重新下载刺激集</button>
        <a href="#/start" class="btn btn-primary">返回实验首页</a>
      </div>
    `;
    done.querySelector("#btn-redownload-data")?.addEventListener("click", () => {
      exportStimulusTrialsCsv(rows, participant, status);
    });
    done.querySelector("#btn-redownload-stimulus")?.addEventListener("click", () => {
      downloadStimulusSetJson(set, participant);
    });
  };

  const finalize = (status: ExperimentStatus) => {
    if (finalized) return;
    finalized = true;
    const rows = dataRows(jsPsych);
    updateRecoveryRows(rows);
    exportStimulusTrialsCsv(rows, participant, status);
    downloadStimulusSetJson(set, participant);
    clearRecoverySnapshot();
    removePageListeners();
    activeRun = null;
    if (container.isConnected && (status === "f" || showDoneAfterInterrupt)) {
      showDoneScreen(status, rows);
    }
  };

  const interrupt = (showDone: boolean) => {
    if (finalized || requestedInterrupt) return;
    requestedInterrupt = true;
    showDoneAfterInterrupt = showDone;
    persistRows();
    checkpointActiveRecovery();
    window.dispatchEvent(new Event(PHYSICS_ABORT_EVENT));
    try {
      jsPsych.abortExperiment("实验已中断");
    } catch (error) {
      console.error(error);
      finalize("nf");
    }
  };

  const checkpointBeforeLeaving = () => {
    persistRows();
    checkpointActiveRecovery();
  };

  jsPsych = initJsPsych({
    display_element: target,
    on_trial_start: (trialObject: unknown) => {
      cancelStaleKeyboardListeners(jsPsych);
      const trial = trialObject as Record<string, unknown>;
      const trialData =
        typeof trial.data === "object" && trial.data !== null
          ? (trial.data as Record<string, unknown>)
          : {};
      const metadata =
        typeof trial.unitMeta === "object" && trial.unitMeta !== null
          ? (trial.unitMeta as Record<string, unknown>)
          : {};
      const segmentKind = String(
        metadata.segment_kind ?? trialData.segmentKind ?? "",
      );
      updateRecoveryCursor({
        segment_kind: segmentKind,
        block_index: Number(metadata.block_index ?? 0),
        trial_index_in_block: Number(metadata.trial_index_in_block ?? 0),
        formal_trial_index:
          metadata.formal_trial_index === null
            ? null
            : Number(metadata.formal_trial_index ?? 0),
        phase:
          trialData.unitType === "textDisplay" &&
          (segmentKind === "block" || segmentKind === "practice")
            ? "fixation"
            : "timeline_unit",
      });
    },
    on_trial_finish: () => {
      persistRows();
      updateRecoveryCursor({ phase: "between_trials" });
    },
    on_data_update: () => {
      persistRows();
    },
    on_finish: () => {
      const status = classifyExperimentStatus(
        dataRows(jsPsych),
        !requestedInterrupt,
      );
      finalize(status);
    },
  });

  jsPsych.data.addProperties({
    subject_id: participant.subject_id,
    motion_group: participant.motion_group,
    gender_code: participant.gender_code,
    age_years: participant.age_years,
  });
  wireRunnerControls(jsPsych, target);

  interruptButton.addEventListener("click", () => {
    if (!window.confirm("确定中断实验并导出当前已完成的数据吗？")) return;
    interrupt(true);
  });
  window.addEventListener("pagehide", checkpointBeforeLeaving);
  window.addEventListener("beforeunload", checkpointBeforeLeaving);
  activeRun = { interrupt };

  const timeline = buildTimeline(set, participant.motion_group);
  void jsPsych.run(timeline as Parameters<JsPsych["run"]>[0]);
}
