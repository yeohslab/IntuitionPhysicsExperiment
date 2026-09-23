import { initJsPsych, type JsPsych } from "jspsych";
import "jspsych/css/jspsych.css";
import "../styles/physics.css";
import type {
  AnyRuntimeStimulusSet,
  ExperimentDefinition,
  ExperimentId,
} from "../experiments/types";
import type { AnyParticipantInfo } from "../shared/participant";
import type { ExperimentStatus } from "../runtime/export/exportStimulusCsv";
import { getExperimentDefinition } from "../experiments/registry";
import {
  cancelStaleKeyboardListeners,
  wireRunnerControls,
} from "../runtime/stimulusControl";
import {
  loadParticipantForExperiment,
  loadStimulusSetForExperiment,
  clearExperimentSession,
} from "../shared/storage";
import {
  checkpointActiveRecovery,
  clearRecoverySnapshot,
  markRecoveryExported,
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

export function mountRunner(container: HTMLElement, experimentId: ExperimentId): void {
  disposeRunner();
  container.innerHTML = "";
  container.className = "runner-view";

  const definition = getExperimentDefinition(experimentId) as ExperimentDefinition;
  const set = definition.parseStimulusSet(loadStimulusSetForExperiment(experimentId));
  const participant = definition.parseParticipant(
    loadParticipantForExperiment(experimentId),
  );
  const err = !participant
    ? "未找到有效的被试信息。请从首页重新开始。"
    : set
      ? definition.validateStimulusSet(set)
      : "未找到要运行的刺激集。请从首页输入被试信息并开始。";

  if (!set || !participant || err) {
    container.innerHTML = `
      <div class="runner-panel runner-panel--error">
        <p>${escapeHtml(err ?? "未知错误")}</p>
        <p><a href="${definition.startHash}" class="btn btn-primary">返回实验首页</a></p>
      </div>
    `;
    return;
  }

  runExperiment(container, set, participant, definition);
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
  set: AnyRuntimeStimulusSet,
  participant: AnyParticipantInfo,
  definition: ExperimentDefinition,
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
    updateRecoveryRows(dataRows(jsPsych), definition.id);
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
      <p>已尝试下载被试 CSV 与刺激集 JSON。若浏览器拦截了下载，请使用下方按钮重新下载。</p>
      <p class="hint muted">请在确认两个文件已成功保存到本地后，再点击「我已确认文件已保存」。在此之前，刷新或返回首页仍可重复导出。</p>
      <div class="runner-done__actions">
        <button type="button" class="btn btn-secondary" id="btn-redownload-data">重新下载 CSV</button>
        <button type="button" class="btn btn-secondary" id="btn-redownload-stimulus">重新下载刺激集</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-saved">我已确认文件已保存</button>
      </div>
    `;
    done.querySelector("#btn-redownload-data")?.addEventListener("click", () => {
      definition.exportCsv(rows, participant, status);
    });
    done.querySelector("#btn-redownload-stimulus")?.addEventListener("click", () => {
      definition.downloadStimulusJson(set, participant);
    });
    done.querySelector("#btn-confirm-saved")?.addEventListener("click", () => {
      clearRecoverySnapshot(definition.id);
      clearExperimentSession(definition.id);
      location.hash = "#/";
    });
  };

  const finalize = (status: ExperimentStatus) => {
    if (finalized) return;
    finalized = true;
    const rows = dataRows(jsPsych);
    updateRecoveryRows(rows, definition.id);
    markRecoveryExported(rows, status, definition.id);
    definition.exportCsv(rows, participant, status);
    definition.downloadStimulusJson(set, participant);
    clearExperimentSession(definition.id);
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
    checkpointActiveRecovery(definition.id);
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
    checkpointActiveRecovery(definition.id);
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
      }, definition.id);
    },
    on_trial_finish: () => {
      persistRows();
      updateRecoveryCursor({ phase: "between_trials" }, definition.id);
    },
    on_data_update: () => {
      persistRows();
    },
    on_finish: () => {
      const status = definition.classifyStatus(
        dataRows(jsPsych),
        !requestedInterrupt,
      );
      finalize(status);
    },
  });

  jsPsych.data.addProperties(definition.dataProperties(participant));
  wireRunnerControls(jsPsych, target);

  interruptButton.addEventListener("click", () => {
    if (!window.confirm("确定中断实验并导出当前已完成的数据吗？")) return;
    interrupt(true);
  });
  window.addEventListener("pagehide", checkpointBeforeLeaving);
  window.addEventListener("beforeunload", checkpointBeforeLeaving);
  activeRun = { interrupt };

  const timeline = definition.buildTimeline(set, participant);
  void jsPsych.run(timeline as Parameters<JsPsych["run"]>[0]);
}
