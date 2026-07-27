import { generateRuntimeStimulusSetAsync } from "../experiment/stimulus";
import {
  normalizeAgeYears,
  normalizeGenderCode,
  normalizeMotionGroup,
  normalizeSubjectId,
  SUBJECT_ID_NUM_MAX,
  SUBJECT_ID_NUM_MIN,
  type ParticipantInfo,
} from "../shared/participant";
import type { ExperimentStimulusSet } from "../shared/experimentTypes";
import {
  clearExperimentSession,
  saveStimulusSetToSession,
  saveParticipantToSession,
} from "../shared/storage";
import { downloadStimulusSetJson } from "../shared/exportStimulusSetJson";
import { primeExperimentAudioInUserGesture } from "../shared/playEstimateCue";
import {
  beginRecoverySnapshot,
  clearRecoverySnapshot,
  loadRecoverySnapshot,
} from "../shared/recovery";
import { exportStimulusTrialsCsv } from "../runtime/export/exportStimulusCsv";

let activeGenerationAbort: AbortController | null = null;

export function disposeStart(): void {
  activeGenerationAbort?.abort();
  activeGenerationAbort = null;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type SubjectForm = ParticipantInfo;

export function mountStart(container: HTMLElement): void {
  container.innerHTML = "";
  container.className = "start-view";

  container.innerHTML = `
    <div class="start-panel">
      <h1 class="start-panel__title">直觉物理实验</h1>
      <div class="start-panel__actions">
        <button type="button" class="btn btn-primary btn-lg" id="btn-start-exp">开始实验</button>
      </div>
      <p class="hint muted" id="start-error" hidden></p>
    </div>
    <dialog class="start-dialog" id="dialog-subject">
      <form class="start-dialog__form" id="form-subject">
        <h2>输入被试信息</h2>
        <div class="start-recovery" id="start-recovery" hidden>
          <p><strong>检测到未完成的实验记录。</strong></p>
          <p class="hint muted" id="start-recovery-detail"></p>
          <div class="start-dialog__buttons">
            <button type="button" class="btn btn-primary" id="btn-export-recovery">导出未完成数据</button>
            <button type="button" class="btn btn-danger" id="btn-discard-recovery">丢弃记录</button>
          </div>
        </div>
        <div id="start-new-participant">
        <label class="start-dialog__label" for="input-group">组别编号（1=摆动，2=旋转）</label>
        <input type="text" id="input-group" class="start-dialog__input" inputmode="numeric" pattern="[12]" autocomplete="off" maxlength="1" required placeholder="1 或 2" aria-label="组别编号" />
        <label class="start-dialog__label" for="input-subject-id">组内被试编号</label>
        <input type="text" id="input-subject-id" class="start-dialog__input" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="4" required placeholder="例如 0001" aria-label="组内被试编号" />
        <label class="start-dialog__label" for="input-gender">性别编码</label>
        <select id="input-gender" class="start-dialog__input" required aria-label="性别编码">
          <option value="">请选择</option>
          <option value="0">0（男）</option>
          <option value="1">1（女）</option>
        </select>
        <label class="start-dialog__label" for="input-age">年龄（岁）</label>
        <input type="number" id="input-age" class="start-dialog__input" inputmode="numeric" min="1" max="120" step="1" autocomplete="off" required placeholder="1–120" aria-label="年龄" />
        <p class="hint muted" id="start-dialog-status" hidden></p>
        <div class="start-dialog__buttons">
          <button type="button" class="btn btn-secondary" id="btn-export-stimulus" disabled>导出刺激集</button>
          <button type="submit" class="btn btn-primary" id="btn-confirm-subject">确认</button>
          <button type="button" class="btn btn-primary" id="btn-run-subject" disabled>开始</button>
          <button type="button" class="btn btn-ghost" id="btn-cancel-subject">取消</button>
        </div>
        <p class="hint muted" id="start-generating" hidden>正在随机生成刺激集，请稍候…</p>
        </div>
      </form>
    </dialog>
  `;

  const dialog = container.querySelector("#dialog-subject") as HTMLDialogElement;
  const groupInput = container.querySelector("#input-group") as HTMLInputElement;
  const input = container.querySelector("#input-subject-id") as HTMLInputElement;
  const genderInput = container.querySelector("#input-gender") as HTMLSelectElement;
  const ageInput = container.querySelector("#input-age") as HTMLInputElement;
  const errEl = container.querySelector("#start-error") as HTMLElement;
  const statusEl = container.querySelector("#start-dialog-status") as HTMLElement;
  const generatingEl = container.querySelector("#start-generating") as HTMLElement;
  const confirmBtn = container.querySelector("#btn-confirm-subject") as HTMLButtonElement;
  const exportBtn = container.querySelector("#btn-export-stimulus") as HTMLButtonElement;
  const runBtn = container.querySelector("#btn-run-subject") as HTMLButtonElement;
  const recoveryPanel = container.querySelector("#start-recovery") as HTMLElement;
  const recoveryDetail = container.querySelector("#start-recovery-detail") as HTMLElement;
  const newParticipantPanel = container.querySelector("#start-new-participant") as HTMLElement;

  let pendingSet: ExperimentStimulusSet | null = null;
  let pendingForm: SubjectForm | null = null;

  const readSubjectForm = (): SubjectForm | null => {
    const motionGroup = normalizeMotionGroup(groupInput.value);
    if (!motionGroup) {
      errEl.textContent = "组别编号须为 1（摆动）或 2（旋转）。";
      errEl.hidden = false;
      return null;
    }
    const subjectId = normalizeSubjectId(input.value);
    if (!subjectId) {
      errEl.textContent = `组内被试编号须为纯数字，且数值在 ${SUBJECT_ID_NUM_MIN}–${SUBJECT_ID_NUM_MAX} 之间（将格式化为四位前导零，如 0001）。`;
      errEl.hidden = false;
      return null;
    }
    errEl.hidden = true;
    const genderCode = normalizeGenderCode(genderInput.value);
    if (genderCode === null) {
      errEl.textContent = "请选择性别编码：0（男）或 1（女）。";
      errEl.hidden = false;
      return null;
    }
    const ageYears = normalizeAgeYears(ageInput.value);
    if (ageYears === null) {
      errEl.textContent = "年龄须为 1–120 之间的整数。";
      errEl.hidden = false;
      return null;
    }
    return {
      subject_id: subjectId,
      motion_group: motionGroup,
      gender_code: genderCode,
      age_years: ageYears,
    };
  };

  const clearPending = () => {
    pendingSet = null;
    pendingForm = null;
    exportBtn.disabled = true;
    runBtn.disabled = true;
    statusEl.hidden = true;
    statusEl.textContent = "";
  };

  const setReady = (
    form: SubjectForm,
    message = "刺激集已生成，可导出 JSON 或开始实验。",
  ) => {
    exportBtn.disabled = false;
    runBtn.disabled = false;
    statusEl.textContent = message;
    statusEl.hidden = false;
    pendingForm = form;
  };

  const setGenerating = (
    on: boolean,
    completedTrials = 0,
    totalTrials = 144,
  ) => {
    generatingEl.hidden = !on;
    generatingEl.textContent = on
      ? `正在后台生成刺激集：${completedTrials} / ${totalTrials} Trial。页面可以保持响应，请稍候…`
      : "";
    confirmBtn.disabled = on;
    groupInput.disabled = on;
    input.disabled = on;
    genderInput.disabled = on;
    ageInput.disabled = on;
    if (on) {
      exportBtn.disabled = true;
      runBtn.disabled = true;
    } else if (pendingSet && pendingForm) {
      exportBtn.disabled = false;
      runBtn.disabled = false;
    }
  };

  const resetDialog = () => {
    errEl.hidden = true;
    groupInput.value = "";
    input.value = "";
    genderInput.value = "";
    ageInput.value = "";
    groupInput.disabled = false;
    input.disabled = false;
    clearPending();
    setGenerating(false);
  };

  container.querySelector("#btn-start-exp")?.addEventListener("click", () => {
    resetDialog();
    dialog.showModal();
    window.setTimeout(() => groupInput.focus(), 50);
  });

  const invalidateIfFormChanged = () => {
    const group = normalizeMotionGroup(groupInput.value);
    const subjectId = normalizeSubjectId(input.value);
    const genderCode = normalizeGenderCode(genderInput.value);
    const ageYears = normalizeAgeYears(ageInput.value);
    if (!group || !subjectId || genderCode === null || ageYears === null || !pendingForm) {
      if (pendingSet) {
        clearPending();
        clearExperimentSession();
        clearRecoverySnapshot();
      }
      return;
    }
    if (
      pendingForm.motion_group !== group ||
      pendingForm.subject_id !== subjectId ||
      pendingForm.gender_code !== genderCode ||
      pendingForm.age_years !== ageYears
    ) {
      clearPending();
      clearExperimentSession();
      clearRecoverySnapshot();
    }
  };

  groupInput.addEventListener("input", () => {
    groupInput.value = groupInput.value.replace(/[^12]/g, "").slice(0, 1);
    invalidateIfFormChanged();
  });

  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 4);
    invalidateIfFormChanged();
  });
  genderInput.addEventListener("change", invalidateIfFormChanged);
  ageInput.addEventListener("input", invalidateIfFormChanged);

  container.querySelector("#btn-cancel-subject")?.addEventListener("click", () => {
    activeGenerationAbort?.abort();
    activeGenerationAbort = null;
    setGenerating(false);
    dialog.close();
  });

  exportBtn.addEventListener("click", () => {
    if (!pendingSet || !pendingForm) return;
    downloadStimulusSetJson(pendingSet, pendingForm);
  });

  runBtn.addEventListener("click", () => {
    if (!pendingSet || !pendingForm) return;
    if (!beginRecoverySnapshot(pendingForm, pendingSet)) {
      errEl.textContent =
        "浏览器无法保存实验恢复快照，已阻止实验开始。请检查隐私模式或存储设置。";
      errEl.hidden = false;
      return;
    }
    try {
      saveParticipantToSession(pendingForm);
      saveStimulusSetToSession(pendingSet);
    } catch {
      errEl.textContent =
        "浏览器无法写入本次会话数据，已阻止实验开始。恢复快照仍保留，可在首页导出。";
      errEl.hidden = false;
      return;
    }
    dialog.close();
    void primeExperimentAudioInUserGesture().then(() => {
      location.hash = "#/runner";
    });
  });

  container.querySelector("#form-subject")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = readSubjectForm();
    if (!form) return;

    activeGenerationAbort?.abort();
    const generationAbort = new AbortController();
    activeGenerationAbort = generationAbort;
    clearExperimentSession();
    clearRecoverySnapshot();
    setGenerating(true);
    clearPending();

    void (async () => {
      try {
        const set = await generateRuntimeStimulusSetAsync({
          group: form.motion_group,
          subjectId: form.subject_id,
          signal: generationAbort.signal,
          onProgress: (completedTrials, totalTrials) => {
            setGenerating(true, completedTrials, totalTrials);
          },
        });
        if (generationAbort.signal.aborted) return;
        pendingSet = set;
        pendingForm = form;
        if (!beginRecoverySnapshot(form, set)) {
          throw new Error(
            "浏览器无法保存实验恢复快照。请检查隐私模式或存储设置。",
          );
        }
        saveParticipantToSession(form);
        saveStimulusSetToSession(set);
        setReady(form);
      } catch (ex) {
        if (ex instanceof DOMException && ex.name === "AbortError") return;
        const msg = ex instanceof Error ? ex.message : String(ex);
        errEl.textContent = `刺激集生成失败：${escapeAttr(msg)}`;
        errEl.hidden = false;
        pendingSet = null;
        clearPending();
      } finally {
        if (activeGenerationAbort === generationAbort) {
          activeGenerationAbort = null;
          setGenerating(false);
        }
      }
    })();
  });

  const recovery = loadRecoverySnapshot();
  let restoredGeneratedSet = false;
  if (recovery) {
    if (recovery.cursor.phase === "generated" && recovery.rows.length === 0) {
      restoredGeneratedSet = true;
      pendingSet = recovery.stimulus_set;
      pendingForm = recovery.participant;
      groupInput.value = String(recovery.participant.motion_group);
      input.value = recovery.participant.subject_id;
      genderInput.value = String(recovery.participant.gender_code);
      ageInput.value = String(recovery.participant.age_years);
      setReady(
        recovery.participant,
        "已恢复生成完成的刺激集，可直接导出或开始实验。",
      );
    } else {
      recoveryPanel.hidden = false;
      newParticipantPanel.hidden = true;
      recoveryDetail.textContent =
        `被试 ${recovery.participant.subject_id}，组 ${recovery.participant.motion_group}，` +
        `最后保存于 ${new Date(recovery.updated_at).toLocaleString()}，` +
        `阶段：${recovery.cursor.phase}。`;
      container.querySelector("#btn-export-recovery")?.addEventListener("click", () => {
        exportStimulusTrialsCsv(recovery.rows, recovery.participant, "nf");
        downloadStimulusSetJson(recovery.stimulus_set, recovery.participant);
        recoveryDetail.textContent =
          "已尝试下载两个文件；记录仍保留，可重复导出。确认文件已保存后请点击“丢弃记录”。";
      });
      container.querySelector("#btn-discard-recovery")?.addEventListener("click", () => {
        if (!window.confirm("确定永久丢弃这份未完成记录吗？")) return;
        clearRecoverySnapshot();
        clearExperimentSession();
        recoveryPanel.hidden = true;
        newParticipantPanel.hidden = false;
        resetDialog();
      });
    }
  }

  // 进入首页即打开被试信息填写（刷新后亦从此开始）
  if (!restoredGeneratedSet) resetDialog();
  dialog.showModal();
  window.setTimeout(
    () => (restoredGeneratedSet ? runBtn : groupInput).focus(),
    50,
  );
}
