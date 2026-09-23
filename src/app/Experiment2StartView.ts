import { experiment2Definition } from "../experiments/experiment-2/definition";
import {
  buildExperiment2SubjectId,
  isExperiment2ParticipantInfo,
  normalizeAgeYears,
  normalizeGenderCode,
  normalizeWithinGroupNumber,
  parseExperiment2WithinGroupNumber,
  SUBJECT_ID_NUM_MAX,
  SUBJECT_ID_NUM_MIN,
  type Experiment2ParticipantInfo,
} from "../shared/participant";
import type { Experiment2StimulusSet } from "../shared/experimentTypes";
import {
  beginExperimentRunSessionForExperiment,
  clearExperimentSession,
  saveParticipantForExperiment,
  saveStimulusSetForExperiment,
} from "../shared/storage";
import { primeExperimentAudioInUserGesture } from "../shared/playEstimateCue";
import {
  beginRecoverySnapshot,
  clearRecoverySnapshot,
  loadRecoverySnapshot,
} from "../shared/recovery";

const EXPERIMENT_ID = "experiment-2" as const;
let activeGenerationAbort: AbortController | null = null;

export function disposeExperiment2Start(): void {
  activeGenerationAbort?.abort();
  activeGenerationAbort = null;
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountExperiment2Start(container: HTMLElement): void {
  container.innerHTML = "";
  container.className = "start-view";
  container.innerHTML = `
    <div class="start-panel">
      <h1 class="start-panel__title">直觉物理实验二</h1>
      <div class="start-panel__actions">
        <button type="button" class="btn btn-primary btn-lg" id="btn-start-exp2">开始实验</button>
        <a class="btn btn-ghost" href="#/">返回实验选择</a>
      </div>
      <p class="hint muted" id="exp2-start-error" hidden></p>
    </div>
    <dialog class="start-dialog" id="dialog-exp2-subject">
      <form class="start-dialog__form" id="form-exp2-subject">
        <h2>输入实验二被试信息</h2>
        <div class="start-recovery" id="exp2-start-recovery" hidden>
          <p><strong>检测到实验二未清除的记录。</strong></p>
          <p class="hint muted" id="exp2-recovery-detail"></p>
          <div class="start-dialog__buttons">
            <button type="button" class="btn btn-primary" id="btn-exp2-export-recovery">导出记录</button>
            <button type="button" class="btn btn-danger" id="btn-exp2-discard-recovery">丢弃记录</button>
          </div>
        </div>
        <div id="exp2-new-participant">
          <label class="start-dialog__label" for="exp2-subject-number">组内序号（保存为 E2-0001 格式）</label>
          <input type="text" id="exp2-subject-number" class="start-dialog__input" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="4" required placeholder="例如 0001" aria-label="实验二组内序号" />
          <label class="start-dialog__label" for="exp2-gender">性别编码</label>
          <select id="exp2-gender" class="start-dialog__input" required aria-label="性别编码">
            <option value="">请选择</option>
            <option value="0">0（男）</option>
            <option value="1">1（女）</option>
          </select>
          <label class="start-dialog__label" for="exp2-age">年龄（岁）</label>
          <input type="number" id="exp2-age" class="start-dialog__input" inputmode="numeric" min="1" max="120" step="1" autocomplete="off" required placeholder="1–120" aria-label="年龄" />
          <p class="hint muted" id="exp2-dialog-status" hidden></p>
          <div class="start-dialog__buttons">
            <button type="button" class="btn btn-secondary" id="btn-exp2-export-stimulus" disabled>导出刺激集</button>
            <button type="submit" class="btn btn-primary" id="btn-exp2-confirm-subject">确认</button>
            <button type="button" class="btn btn-primary" id="btn-exp2-run-subject" disabled>开始</button>
            <button type="button" class="btn btn-ghost" id="btn-exp2-cancel-subject">取消</button>
          </div>
          <p class="hint muted" id="exp2-generating" hidden>正在随机生成实验二刺激集，请稍候…</p>
        </div>
      </form>
    </dialog>`;

  const dialog = container.querySelector("#dialog-exp2-subject") as HTMLDialogElement;
  const numberInput = container.querySelector("#exp2-subject-number") as HTMLInputElement;
  const genderInput = container.querySelector("#exp2-gender") as HTMLSelectElement;
  const ageInput = container.querySelector("#exp2-age") as HTMLInputElement;
  const error = container.querySelector("#exp2-start-error") as HTMLElement;
  const status = container.querySelector("#exp2-dialog-status") as HTMLElement;
  const generating = container.querySelector("#exp2-generating") as HTMLElement;
  const confirm = container.querySelector("#btn-exp2-confirm-subject") as HTMLButtonElement;
  const exportButton = container.querySelector("#btn-exp2-export-stimulus") as HTMLButtonElement;
  const runButton = container.querySelector("#btn-exp2-run-subject") as HTMLButtonElement;
  const recoveryPanel = container.querySelector("#exp2-start-recovery") as HTMLElement;
  const recoveryDetail = container.querySelector("#exp2-recovery-detail") as HTMLElement;
  const newParticipantPanel = container.querySelector("#exp2-new-participant") as HTMLElement;

  let pendingSet: Experiment2StimulusSet | null = null;
  let pendingParticipant: Experiment2ParticipantInfo | null = null;

  const readParticipant = (): Experiment2ParticipantInfo | null => {
    const within = normalizeWithinGroupNumber(numberInput.value);
    if (!within) {
      error.textContent = `组内序号须为 ${SUBJECT_ID_NUM_MIN}–${SUBJECT_ID_NUM_MAX}，并显示为四位数字。`;
      error.hidden = false;
      return null;
    }
    const genderCode = normalizeGenderCode(genderInput.value);
    if (genderCode === null) {
      error.textContent = "请选择性别编码。";
      error.hidden = false;
      return null;
    }
    const ageYears = normalizeAgeYears(ageInput.value);
    if (ageYears === null) {
      error.textContent = "年龄须为1–120之间的整数。";
      error.hidden = false;
      return null;
    }
    error.hidden = true;
    return {
      subject_id: buildExperiment2SubjectId(within),
      gender_code: genderCode,
      age_years: ageYears,
    };
  };

  const clearPending = () => {
    pendingSet = null;
    pendingParticipant = null;
    exportButton.disabled = true;
    runButton.disabled = true;
    status.hidden = true;
    status.textContent = "";
  };
  const setReady = (
    participant: Experiment2ParticipantInfo,
    message = "实验二刺激集已生成，可导出 JSON 或开始实验。",
  ) => {
    pendingParticipant = participant;
    exportButton.disabled = false;
    runButton.disabled = false;
    status.textContent = message;
    status.hidden = false;
  };
  const setGenerating = (on: boolean, completed = 0, total = 189) => {
    generating.hidden = !on;
    generating.textContent = on
      ? `正在后台生成刺激集：${completed} / ${total} Trial。页面可以保持响应，请稍候…`
      : "";
    confirm.disabled = on;
    numberInput.disabled = on;
    genderInput.disabled = on;
    ageInput.disabled = on;
    if (on) {
      exportButton.disabled = true;
      runButton.disabled = true;
    } else if (pendingSet && pendingParticipant) {
      exportButton.disabled = false;
      runButton.disabled = false;
    }
  };
  const resetDialog = () => {
    error.hidden = true;
    numberInput.value = "";
    genderInput.value = "";
    ageInput.value = "";
    numberInput.disabled = false;
    genderInput.disabled = false;
    ageInput.disabled = false;
    clearPending();
    setGenerating(false);
  };

  container.querySelector("#btn-start-exp2")?.addEventListener("click", () => {
    resetDialog();
    dialog.showModal();
    window.setTimeout(() => numberInput.focus(), 50);
  });
  container.querySelector("#btn-exp2-cancel-subject")?.addEventListener("click", () => {
    activeGenerationAbort?.abort();
    activeGenerationAbort = null;
    setGenerating(false);
    dialog.close();
  });

  const invalidateIfChanged = () => {
    if (!pendingParticipant) return;
    const current = readParticipant();
    if (
      !current ||
      current.subject_id !== pendingParticipant.subject_id ||
      current.gender_code !== pendingParticipant.gender_code ||
      current.age_years !== pendingParticipant.age_years
    ) {
      clearPending();
      clearExperimentSession(EXPERIMENT_ID);
      clearRecoverySnapshot(EXPERIMENT_ID);
    }
  };
  numberInput.addEventListener("input", () => {
    numberInput.value = numberInput.value.replace(/\D/g, "").slice(0, 4);
    invalidateIfChanged();
  });
  genderInput.addEventListener("change", invalidateIfChanged);
  ageInput.addEventListener("input", invalidateIfChanged);

  exportButton.addEventListener("click", () => {
    if (pendingSet && pendingParticipant) {
      experiment2Definition.downloadStimulusJson(pendingSet, pendingParticipant);
    }
  });
  runButton.addEventListener("click", () => {
    if (!pendingSet || !pendingParticipant) return;
    if (!beginRecoverySnapshot(pendingParticipant, pendingSet, EXPERIMENT_ID)) {
      error.textContent = "浏览器无法保存实验二恢复快照，已阻止实验开始。";
      error.hidden = false;
      return;
    }
    try {
      beginExperimentRunSessionForExperiment(
        EXPERIMENT_ID,
        pendingParticipant,
        pendingSet,
      );
    } catch {
      error.textContent = "浏览器无法写入实验二会话数据，已阻止实验开始。";
      error.hidden = false;
      return;
    }
    dialog.close();
    void primeExperimentAudioInUserGesture().then(() => {
      location.hash = "#/experiment-2/runner";
    });
  });

  container.querySelector("#form-exp2-subject")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const participant = readParticipant();
    if (!participant) return;
    activeGenerationAbort?.abort();
    const abort = new AbortController();
    activeGenerationAbort = abort;
    clearExperimentSession(EXPERIMENT_ID);
    clearRecoverySnapshot(EXPERIMENT_ID);
    clearPending();
    setGenerating(true);
    void (async () => {
      try {
        const set = await experiment2Definition.generateStimulusSet(participant, {
          signal: abort.signal,
          onProgress: (completed, total) => setGenerating(true, completed, total),
        });
        if (abort.signal.aborted) return;
        pendingSet = set;
        pendingParticipant = participant;
        if (!beginRecoverySnapshot(participant, set, EXPERIMENT_ID)) {
          throw new Error("浏览器无法保存实验二恢复快照。请检查存储设置。");
        }
        saveParticipantForExperiment(EXPERIMENT_ID, participant);
        saveStimulusSetForExperiment(EXPERIMENT_ID, set);
        setReady(participant);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        const message = caught instanceof Error ? caught.message : String(caught);
        error.textContent = `刺激集生成失败：${escapeText(message)}`;
        error.hidden = false;
        clearPending();
      } finally {
        if (activeGenerationAbort === abort) {
          activeGenerationAbort = null;
          setGenerating(false);
        }
      }
    })();
  });

  const recovery = loadRecoverySnapshot(EXPERIMENT_ID);
  let restoredGeneratedSet = false;
  if (
    recovery &&
    isExperiment2ParticipantInfo(recovery.participant) &&
    recovery.stimulus_set.schemaVersion === 1
  ) {
    const participant = recovery.participant;
    const set = recovery.stimulus_set as Experiment2StimulusSet;
    if (recovery.lifecycle === "exported") {
      recoveryPanel.hidden = false;
      newParticipantPanel.hidden = true;
      const exportStatus = recovery.experiment_status ?? "nf";
      recoveryDetail.textContent =
        `被试 ${participant.subject_id} 的实验二已结束（${exportStatus === "f" ? "完成" : "中断"}）。请确认两个文件已保存。`;
      container.querySelector("#btn-exp2-export-recovery")?.addEventListener("click", () => {
        experiment2Definition.exportCsv(recovery.rows, participant, exportStatus);
        experiment2Definition.downloadStimulusJson(set, participant);
      });
    } else if (recovery.cursor.phase === "generated" && recovery.rows.length === 0) {
      restoredGeneratedSet = true;
      pendingSet = set;
      pendingParticipant = participant;
      numberInput.value = parseExperiment2WithinGroupNumber(participant.subject_id) ?? "";
      genderInput.value = String(participant.gender_code);
      ageInput.value = String(participant.age_years);
      setReady(participant, "已恢复生成完成的实验二刺激集，可直接开始。");
    } else {
      recoveryPanel.hidden = false;
      newParticipantPanel.hidden = true;
      recoveryDetail.textContent =
        `被试 ${participant.subject_id}，最后保存于 ${new Date(recovery.updated_at).toLocaleString()}，阶段：${recovery.cursor.phase}。`;
      container.querySelector("#btn-exp2-export-recovery")?.addEventListener("click", () => {
        experiment2Definition.exportCsv(recovery.rows, participant, "nf");
        experiment2Definition.downloadStimulusJson(set, participant);
      });
    }
    container.querySelector("#btn-exp2-discard-recovery")?.addEventListener("click", () => {
      if (!window.confirm("确认已保存文件，并永久清除这份实验二记录吗？")) return;
      clearRecoverySnapshot(EXPERIMENT_ID);
      clearExperimentSession(EXPERIMENT_ID);
      recoveryPanel.hidden = true;
      newParticipantPanel.hidden = false;
      resetDialog();
    });
  }

  if (!restoredGeneratedSet) resetDialog();
  dialog.showModal();
  window.setTimeout(
    () => (restoredGeneratedSet ? runButton : numberInput).focus(),
    50,
  );
}
