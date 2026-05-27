import { cloneStimulusSet, STIMULUS_SETS } from "../stimulate";
import {
  normalizeSubjectId,
  stimulusIndexForNormalizedSubjectId,
  SUBJECT_ID_NUM_MAX,
  SUBJECT_ID_NUM_MIN,
} from "../subjectStimulus";
import {
  saveStimulusSetToSession,
  SESSION_STIMULUS_FILE_INDEX_KEY,
  SESSION_SUBJECT_ID_KEY,
  setDeveloperModeForRun,
} from "../shared/storage";

export function disposeStart(): void {}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountStart(container: HTMLElement): void {
  container.innerHTML = "";
  container.className = "start-view";

  container.innerHTML = `
    <div class="start-panel">
      <h1 class="start-panel__title">直觉物理实验</h1>
      <p class="muted start-panel__intro">点击下方按钮开始；须输入<strong>纯数字被试编号</strong>（${SUBJECT_ID_NUM_MIN}–${SUBJECT_ID_NUM_MAX}，四位前导零如 0001）。系统按<strong>编号 ÷ 5 的余数</strong>在 5 份预置刺激集中分配，同一数值编号始终同一份。</p>
      <div class="start-panel__actions">
        <button type="button" class="btn btn-primary btn-lg" id="btn-start-exp">开始实验</button>
        <a class="btn btn-secondary btn-lg" href="#/editor">刺激编写</a>
      </div>
      <p class="hint muted" id="start-error" hidden></p>
    </div>
    <dialog class="start-dialog" id="dialog-subject">
      <form class="start-dialog__form" id="form-subject">
        <h2>输入被试编号</h2>
        <p class="muted">请输入<strong>纯数字</strong>（${SUBJECT_ID_NUM_MIN}–${SUBJECT_ID_NUM_MAX}）。提交后存为<strong>四位前导零</strong>（如 1 → 0001，12 → 0012）；刺激集按<strong>编号数值 ÷ 5 的余数</strong>分配。</p>
        <label class="start-dialog__label" for="input-subject-id">被试编号（数字）</label>
        <input type="text" id="input-subject-id" class="start-dialog__input" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="4" required placeholder="例如 0001" />
        <div class="start-dialog__buttons">
          <button type="submit" class="btn btn-primary" id="btn-confirm-subject">确定并开始</button>
          <button type="button" class="btn btn-ghost" id="btn-cancel-subject">取消</button>
        </div>
      </form>
    </dialog>
  `;

  const dialog = container.querySelector("#dialog-subject") as HTMLDialogElement;
  const input = container.querySelector("#input-subject-id") as HTMLInputElement;
  const errEl = container.querySelector("#start-error") as HTMLElement;

  container.querySelector("#btn-start-exp")?.addEventListener("click", () => {
    errEl.hidden = true;
    input.value = "";
    dialog.showModal();
    window.setTimeout(() => input.focus(), 50);
  });

  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 4);
  });

  container.querySelector("#btn-cancel-subject")?.addEventListener("click", () => {
    dialog.close();
  });

  container.querySelector("#form-subject")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const normalized = normalizeSubjectId(input.value);
    if (!normalized) {
      errEl.textContent = `被试编号须为纯数字，且数值在 ${SUBJECT_ID_NUM_MIN}–${SUBJECT_ID_NUM_MAX} 之间（将格式化为四位前导零，如 0001）。`;
      errEl.hidden = false;
      return;
    }

    const idx = stimulusIndexForNormalizedSubjectId(normalized);
    const template = STIMULUS_SETS[idx];
    if (!template) {
      errEl.textContent = "内部错误：找不到刺激集。";
      errEl.hidden = false;
      return;
    }

    try {
      const set = cloneStimulusSet(template);

      sessionStorage.setItem(SESSION_SUBJECT_ID_KEY, normalized);
      sessionStorage.setItem(SESSION_STIMULUS_FILE_INDEX_KEY, String(idx));
      setDeveloperModeForRun(false);
      saveStimulusSetToSession(set);
      dialog.close();
      location.hash = "#/runner";
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      errEl.textContent = `加载失败：${escapeAttr(msg)}`;
      errEl.hidden = false;
      dialog.close();
    }
  });
}
