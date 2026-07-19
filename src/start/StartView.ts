import { generateRuntimeStimulusSet } from "../stimulate";
import type { MotionGroup } from "../subjectStimulus";
import {
  normalizeMotionGroup,
  normalizeSubjectId,
  SUBJECT_ID_NUM_MAX,
  SUBJECT_ID_NUM_MIN,
} from "../subjectStimulus";
import type { ExperimentStimulusSet } from "../types/experiment";
import {
  saveStimulusSetToSession,
  SESSION_MOTION_GROUP_KEY,
  SESSION_SUBJECT_ID_KEY,
} from "../shared/storage";
import { downloadStimulusSetJson } from "../shared/exportStimulusSetJson";
import { primeExperimentAudioInUserGesture } from "../shared/playEstimateCue";

export function disposeStart(): void {}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type SubjectForm = { group: MotionGroup; subjectId: string };

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
        <label class="start-dialog__label" for="input-group">组别编号（1=摆动，2=旋转）</label>
        <input type="text" id="input-group" class="start-dialog__input" inputmode="numeric" pattern="[12]" autocomplete="off" maxlength="1" required placeholder="1 或 2" aria-label="组别编号" />
        <label class="start-dialog__label" for="input-subject-id">组内被试编号</label>
        <input type="text" id="input-subject-id" class="start-dialog__input" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="4" required placeholder="例如 0001" aria-label="组内被试编号" />
        <p class="hint muted" id="start-dialog-status" hidden></p>
        <div class="start-dialog__buttons">
          <button type="button" class="btn btn-secondary" id="btn-export-stimulus" disabled>导出刺激集</button>
          <button type="submit" class="btn btn-primary" id="btn-confirm-subject">确认</button>
          <button type="button" class="btn btn-primary" id="btn-run-subject" disabled>开始</button>
          <button type="button" class="btn btn-ghost" id="btn-cancel-subject">取消</button>
        </div>
        <p class="hint muted" id="start-generating" hidden>正在随机生成刺激集，请稍候…</p>
      </form>
    </dialog>
  `;

  const dialog = container.querySelector("#dialog-subject") as HTMLDialogElement;
  const groupInput = container.querySelector("#input-group") as HTMLInputElement;
  const input = container.querySelector("#input-subject-id") as HTMLInputElement;
  const errEl = container.querySelector("#start-error") as HTMLElement;
  const statusEl = container.querySelector("#start-dialog-status") as HTMLElement;
  const generatingEl = container.querySelector("#start-generating") as HTMLElement;
  const confirmBtn = container.querySelector("#btn-confirm-subject") as HTMLButtonElement;
  const exportBtn = container.querySelector("#btn-export-stimulus") as HTMLButtonElement;
  const runBtn = container.querySelector("#btn-run-subject") as HTMLButtonElement;

  let pendingSet: ExperimentStimulusSet | null = null;
  let pendingForm: SubjectForm | null = null;

  const readSubjectForm = (): SubjectForm | null => {
    const group = normalizeMotionGroup(groupInput.value);
    if (!group) {
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
    return { group, subjectId };
  };

  const clearPending = () => {
    pendingSet = null;
    pendingForm = null;
    exportBtn.disabled = true;
    runBtn.disabled = true;
    statusEl.hidden = true;
    statusEl.textContent = "";
  };

  const setReady = (form: SubjectForm) => {
    exportBtn.disabled = false;
    runBtn.disabled = false;
    statusEl.textContent = "刺激集已生成，可导出 JSON 或开始实验。";
    statusEl.hidden = false;
    pendingForm = form;
  };

  const setGenerating = (on: boolean) => {
    generatingEl.hidden = !on;
    confirmBtn.disabled = on;
    groupInput.disabled = on;
    input.disabled = on;
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
    if (!group || !subjectId || !pendingForm) {
      if (pendingSet) clearPending();
      return;
    }
    if (pendingForm.group !== group || pendingForm.subjectId !== subjectId) {
      pendingSet = null;
      clearPending();
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

  container.querySelector("#btn-cancel-subject")?.addEventListener("click", () => {
    dialog.close();
  });

  exportBtn.addEventListener("click", () => {
    if (!pendingSet || !pendingForm) return;
    downloadStimulusSetJson(pendingSet, pendingForm.group, pendingForm.subjectId);
  });

  runBtn.addEventListener("click", () => {
    if (!pendingSet || !pendingForm) return;
    sessionStorage.setItem(SESSION_SUBJECT_ID_KEY, pendingForm.subjectId);
    sessionStorage.setItem(SESSION_MOTION_GROUP_KEY, String(pendingForm.group));
    saveStimulusSetToSession(pendingSet);
    dialog.close();
    void primeExperimentAudioInUserGesture().then(() => {
      location.hash = "#/runner";
    });
  });

  container.querySelector("#form-subject")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = readSubjectForm();
    if (!form) return;

    setGenerating(true);
    clearPending();

    void (async () => {
      try {
        const set = await generateWithYield(form);
        pendingSet = set;
        setReady(form);
      } catch (ex) {
        const msg = ex instanceof Error ? ex.message : String(ex);
        errEl.textContent = `刺激集生成失败：${escapeAttr(msg)}`;
        errEl.hidden = false;
        pendingSet = null;
        clearPending();
      } finally {
        setGenerating(false);
      }
    })();
  });

  // 进入首页即打开被试信息填写（刷新后亦从此开始）
  resetDialog();
  dialog.showModal();
  window.setTimeout(() => groupInput.focus(), 50);
}

/** 让出主线程以便显示「生成中」提示 */
async function generateWithYield(opts: SubjectForm) {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
  return generateRuntimeStimulusSet(opts);
}
