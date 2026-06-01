import type {
  BlockSegment,
  ExperimentStimulusSet,
  PracticeSegment,
  RestSegment,
  StimulusUnit,
  TopLevelSequenceItem,
  Trial,
} from "../types/experiment";
import { sanitizeImageDataUrl } from "../shared/html";
import { newId } from "../shared/ids";
import { KEY_CHOICE_OPTIONS } from "../shared/keys";
import { cloneStimulusSet, DEFAULT_STIMULUS_SET } from "../stimulate";
import {
  loadDraftFromLocal,
  parseExperimentStimulusSet,
  saveDraftToLocal,
  saveStimulusSetToSession,
  setDeveloperModeForRun,
  validateDesignWarnings,
  validateRunnableSet,
} from "../shared/storage";
import { analyzePendulum } from "../physics/pendulum";
import { springAnalysis } from "../physics/spring";
import {
  PENDULUM_HIDE_SEC,
  randomPendulumStimulusTiming,
  randomStimulusTiming,
  STIMULUS_FADE_MS,
  stimulusTotalSec,
  stimulusTotalTimeT,
  withSyncedTotalTimeT,
} from "../physics/timePhases";
import type {
  PendulumPracticeUnit,
  PendulumStimulusUnit,
  SpringStimulusUnit,
} from "../types/experiment";
import type { SortableEvent } from "sortablejs";
import { bindSortableList, type SortableListOptions } from "./sortable";
import {
  applySegmentChildrenDrag,
  applySequenceDrag,
  applyUnitsDrag,
  type TreeDragHandlers,
} from "./treeDrag";
import { physicsReadonlyBlock, refreshPhysicsReadonly, type PhysicsEditableUnit } from "./physicsReadonly";
import { primeExperimentAudioInUserGesture } from "../shared/playEstimateCue";

interface EditorState {
  set: ExperimentStimulusSet;
  selectedSegmentId: string;
  selectedBlockChildId: string;
  selectedUnitId: string | null;
  banner: string | null;
  /** 折叠的 Block / Rest / Practice 段 / Trial 节点 id */
  collapsedIds: Set<string>;
}

let state: EditorState;
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let sortables: Array<ReturnType<typeof bindSortableList>> = [];
let pendingSortables: Array<{ el: HTMLElement; options: SortableListOptions }> = [];
let dragHandlers: TreeDragHandlers;

function queueSortable(el: HTMLElement, options: SortableListOptions): void {
  pendingSortables.push({ el, options });
}

function flushSortables(): void {
  for (const { el, options } of pendingSortables) {
    sortables.push(bindSortableList(el, options));
  }
  pendingSortables = [];
}

function afterTreeDrag(evt: SortableEvent): void {
  if (evt.oldIndex === evt.newIndex && evt.from === evt.to) return;
  scheduleDraftSave();
  refreshTreeAndEditor();
}

function expandAncestorsForSelection(): void {
  const seg = getSegment(state.selectedSegmentId);
  if (!seg) return;
  state.collapsedIds.delete(seg.id);
  if ((seg.kind === "block" || seg.kind === "practice") && state.selectedBlockChildId) {
    state.collapsedIds.delete(state.selectedBlockChildId);
  }
}

function treeFoldButton(nodeId: string, hasChildren: boolean): string {
  if (!hasChildren) {
    return '<span class="tree-fold-spacer" aria-hidden="true"></span>';
  }
  const collapsed = state.collapsedIds.has(nodeId);
  return `<button type="button" class="tree-fold" data-action="toggle-fold" data-fold-id="${escapeHtml(nodeId)}" aria-expanded="${!collapsed}" aria-label="${collapsed ? "展开子项" : "折叠子项"}">${collapsed ? "▶" : "▼"}</button>`;
}

function initDragHandlers(): void {
  dragHandlers = {
    getSet: () => state.set,
    getSegment,
    getTrialParentSegment,
    reorderByIds,
    onSelectionChange: (sel) => {
      state.selectedSegmentId = sel.segmentId;
      state.selectedBlockChildId = sel.blockChildId;
      state.selectedUnitId = sel.unitId;
      state.banner = null;
    },
  };
}

function scheduleDraftSave(): void {
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    saveDraftToLocal(state.set);
    draftTimer = undefined;
  }, 400);
}

function getSegment(id: string): TopLevelSequenceItem | undefined {
  return state.set.sequence.find((s) => s.id === id);
}

function getTrialParentSegment(id: string): BlockSegment | PracticeSegment | undefined {
  const s = getSegment(id);
  return s?.kind === "block" || s?.kind === "practice" ? s : undefined;
}

function getTrialInSegment(seg: BlockSegment | PracticeSegment, childId: string): Trial | undefined {
  return seg.children.find((c) => c.id === childId);
}

function trialLabel(trial: Trial, siblings: Trial[]): string {
  const index = siblings.findIndex((c) => c.id === trial.id);
  return `Trial ${index + 1}`;
}

function countTrialsInSegment(seg: BlockSegment | PracticeSegment): string {
  const n = seg.children.length;
  return `${n} Trial`;
}

function ensureSelection(): void {
  if (state.set.sequence.length === 0) return;
  let seg = getSegment(state.selectedSegmentId);
  if (!seg) {
    seg = state.set.sequence[0]!;
    state.selectedSegmentId = seg.id;
  }
  if (seg.kind === "block" || seg.kind === "practice") {
    let child = getTrialInSegment(seg, state.selectedBlockChildId);
    if (!child) {
      child = seg.children[0];
      state.selectedBlockChildId = child?.id ?? "";
    }
    if (!child) {
      state.selectedBlockChildId = "";
      state.selectedUnitId = null;
      return;
    }
    if (state.selectedUnitId && !child.units.some((u) => u.id === state.selectedUnitId)) {
      state.selectedUnitId = child.units[0]?.id ?? null;
    }
  } else {
    state.selectedBlockChildId = "";
    if (!state.selectedUnitId || !seg.units.some((u) => u.id === state.selectedUnitId)) {
      state.selectedUnitId = seg.units[0]?.id ?? null;
    }
  }
}

function reorderByIds<T extends { id: string }>(items: T[], orderedIds: string[]): void {
  const map = new Map(items.map((x) => [x.id, x]));
  const next: T[] = [];
  for (const id of orderedIds) {
    const x = map.get(id);
    if (x) next.push(x);
  }
  for (const x of items) {
    if (!orderedIds.includes(x.id)) next.push(x);
  }
  items.length = 0;
  items.push(...next);
}

function renderStructureTree(container: HTMLElement): void {
  initDragHandlers();
  pendingSortables = [];
  container.innerHTML = "";
  const ulSeq = document.createElement("ul");
  ulSeq.id = "tree-list-sequence";
  ulSeq.className = "tree-list tree-list--sequence";
  ulSeq.dataset.dropZone = "sequence";

  let blockNum = 0;
  let restNum = 0;
  let practiceNum = 0;
  state.set.sequence.forEach((item) => {
    if (item.kind === "block") {
      blockNum += 1;
      appendTrialsSegmentBranch(ulSeq, item, "block", blockNum);
    } else if (item.kind === "rest") {
      restNum += 1;
      appendRestBranch(ulSeq, item, restNum);
    } else {
      practiceNum += 1;
      appendTrialsSegmentBranch(ulSeq, item, "practice", practiceNum);
    }
  });

  queueSortable(ulSeq, {
    group: "editor-sequence",
    onSort: (evt) => {
      applySequenceDrag(dragHandlers, evt);
      afterTreeDrag(evt);
    },
  });

  container.appendChild(ulSeq);
  flushSortables();
}

function appendTrialsSegmentBranch(
  ulSeq: HTMLElement,
  seg: BlockSegment | PracticeSegment,
  variant: "block" | "practice",
  segmentIndex: number,
): void {
  const liB = document.createElement("li");
  liB.className = variant === "block" ? "tree-li tree-li--block" : "tree-li tree-li--practice-segment";
  liB.dataset.itemId = seg.id;

  const rowB = document.createElement("div");
  const segSelected = seg.id === state.selectedSegmentId;
  const rowBase = variant === "block" ? "tree-row tree-row--block" : "tree-row tree-row--practice";
  rowB.className = `${rowBase}${segSelected ? " is-selected" : ""}`;
  const title = variant === "block" ? `Block ${segmentIndex}` : `Practice ${segmentIndex}`;
  const icon = variant === "block" ? "▣" : "◆";
  rowB.innerHTML = `
      ${treeFoldButton(seg.id, seg.children.length > 0)}
      <span class="drag-handle" title="拖动排序">⠿</span>
      <span class="tree-row__main"><span class="tree-ico" aria-hidden="true">${icon}</span> ${title}</span>
      <span class="muted tree-row__count">${countTrialsInSegment(seg)}</span>
      <span class="tree-row__actions">
        <button type="button" class="btn btn-sm" data-action="add-trial" data-segment-id="${seg.id}">＋ Trial</button>
        <button type="button" class="btn btn-icon btn-danger" data-action="del-segment" data-id="${seg.id}" title="删除本段">✕</button>
      </span>`;
  rowB.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    state.selectedSegmentId = seg.id;
    state.selectedBlockChildId = seg.children[0]?.id ?? "";
    state.selectedUnitId = seg.children[0]?.units[0]?.id ?? null;
    state.banner = null;
    refreshTreeAndEditor();
  });
  liB.appendChild(rowB);

  const ulT = document.createElement("ul");
  const blockKidsHidden = state.collapsedIds.has(seg.id);
  ulT.className = `tree-list tree-list--trials tree-list--segment-children${blockKidsHidden ? " tree-children--collapsed" : ""}`;
  ulT.dataset.segmentId = seg.id;
  ulT.dataset.dropZone = "segment-children";

  seg.children.forEach((child) => {
    const liT = document.createElement("li");
    liT.className = "tree-li tree-li--trial";
    liT.dataset.itemId = child.id;

    const rowT = document.createElement("div");
    const childSelected = segSelected && child.id === state.selectedBlockChildId;
    rowT.className = `tree-row tree-row--trial${childSelected ? " is-selected" : ""}`;
    rowT.innerHTML = `
        ${treeFoldButton(child.id, child.units.length > 0)}
        <span class="drag-handle" title="拖动排序">⠿</span>
        <span class="tree-row__main"><span class="tree-ico" aria-hidden="true">◇</span> ${trialLabel(child, seg.children)}</span>
        <span class="muted tree-row__count">${child.units.length} 单元</span>
        <span class="tree-row__actions">
          <button type="button" class="btn btn-icon btn-danger" data-action="del-trial" data-segment-id="${seg.id}" data-block-child-id="${child.id}" title="删除 Trial">✕</button>
        </span>`;
    rowT.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      state.selectedSegmentId = seg.id;
      state.selectedBlockChildId = child.id;
      state.selectedUnitId = child.units[0]?.id ?? null;
      state.banner = null;
      refreshTreeAndEditor();
    });
    liT.appendChild(rowT);

    const ulU = document.createElement("ul");
    const unitsHidden = state.collapsedIds.has(child.id);
    ulU.className = `tree-list tree-list--units${unitsHidden ? " tree-children--collapsed" : ""}`;
    ulU.dataset.segmentId = seg.id;
    ulU.dataset.blockChildId = child.id;
    ulU.dataset.dropZone = "units";

    child.units.forEach((u) => {
      const liU = document.createElement("li");
      liU.className = "tree-li tree-li--unit";
      liU.dataset.itemId = u.id;

      const rowU = document.createElement("div");
      const unitSelected = segSelected && childSelected && u.id === state.selectedUnitId;
      rowU.className = `tree-row tree-row--unit${unitSelected ? " is-selected" : ""}`;
      rowU.innerHTML = `
          <span class="drag-handle" title="拖动排序">⠿</span>
          <span class="tree-row__main"><span class="tree-ico" aria-hidden="true">·</span> ${unitTypeLabel(u)}</span>
          <span class="muted tree-row__preview">${escapeHtml(unitListPreview(u))}</span>
          <span class="tree-row__actions">
            <button type="button" class="btn btn-icon btn-danger" data-action="del-unit" data-segment-id="${seg.id}" data-block-child-id="${child.id}" data-id="${u.id}" title="删除单元">✕</button>
          </span>`;
      rowU.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        state.selectedSegmentId = seg.id;
        state.selectedBlockChildId = child.id;
        state.selectedUnitId = u.id;
        state.banner = null;
        refreshTreeAndEditor();
      });
      liU.appendChild(rowU);
      ulU.appendChild(liU);
    });

    liT.appendChild(ulU);
    ulT.appendChild(liT);

    queueSortable(ulU, {
      group: "editor-units",
      onSort: (evt) => {
        applyUnitsDrag(dragHandlers, evt);
        afterTreeDrag(evt);
      },
    });
  });

  liB.appendChild(ulT);
  ulSeq.appendChild(liB);

  queueSortable(ulT, {
    group: "editor-segment-children",
    onSort: (evt) => {
      applySegmentChildrenDrag(dragHandlers, evt);
      afterTreeDrag(evt);
    },
  });
}

function appendRestBranch(ulSeq: HTMLElement, r: RestSegment, restIndex: number): void {
  const liR = document.createElement("li");
  liR.className = "tree-li tree-li--rest";
  liR.dataset.itemId = r.id;

  const rowR = document.createElement("div");
  const segSelected = r.id === state.selectedSegmentId;
  rowR.className = `tree-row tree-row--rest${segSelected ? " is-selected" : ""}`;
  rowR.innerHTML = `
      ${treeFoldButton(r.id, r.units.length > 0)}
      <span class="drag-handle" title="拖动排序">⠿</span>
      <span class="tree-row__main"><span class="tree-ico" aria-hidden="true">☕</span> Rest ${restIndex}</span>
      <span class="muted tree-row__count">${r.units.length} 单元</span>
      <span class="tree-row__actions">
        <button type="button" class="btn btn-icon btn-danger" data-action="del-segment" data-id="${r.id}" title="删除本段">✕</button>
      </span>`;
  rowR.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    state.selectedSegmentId = r.id;
    state.selectedBlockChildId = "";
    state.selectedUnitId = r.units[0]?.id ?? null;
    state.banner = null;
    refreshTreeAndEditor();
  });
  liR.appendChild(rowR);

  const ulU = document.createElement("ul");
  const restUnitsHidden = state.collapsedIds.has(r.id);
  ulU.className = `tree-list tree-list--units${restUnitsHidden ? " tree-children--collapsed" : ""}`;
  ulU.dataset.segmentId = r.id;
  ulU.dataset.dropZone = "units";

  r.units.forEach((u) => {
    const liU = document.createElement("li");
    liU.className = "tree-li tree-li--unit";
    liU.dataset.itemId = u.id;

    const rowU = document.createElement("div");
    const unitSelected = segSelected && u.id === state.selectedUnitId;
    rowU.className = `tree-row tree-row--unit${unitSelected ? " is-selected" : ""}`;
    rowU.innerHTML = `
        <span class="drag-handle" title="拖动排序">⠿</span>
        <span class="tree-row__main"><span class="tree-ico" aria-hidden="true">·</span> ${unitTypeLabel(u)}</span>
        <span class="muted tree-row__preview">${escapeHtml(unitListPreview(u))}</span>
        <span class="tree-row__actions">
          <button type="button" class="btn btn-icon btn-danger" data-action="del-unit" data-segment-id="${r.id}" data-id="${u.id}" title="删除单元">✕</button>
        </span>`;
    rowU.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      state.selectedSegmentId = r.id;
      state.selectedBlockChildId = "";
      state.selectedUnitId = u.id;
      state.banner = null;
      refreshTreeAndEditor();
    });
    liU.appendChild(rowU);
    ulU.appendChild(liU);
  });

  liR.appendChild(ulU);
  ulSeq.appendChild(liR);

  queueSortable(ulU, {
    group: "editor-units",
    onSort: (evt) => {
      applyUnitsDrag(dragHandlers, evt);
      afterTreeDrag(evt);
    },
  });
}

function wireTreePanel(treeRoot: HTMLElement): void {
  if (treeRoot.dataset.wiredFold === "1") return;
  treeRoot.dataset.wiredFold = "1";
  treeRoot.addEventListener("click", (e) => {
    const fold = (e.target as HTMLElement).closest("[data-action='toggle-fold']");
    if (!fold) return;
    e.stopPropagation();
    const id = (fold as HTMLElement).dataset.foldId;
    if (!id) return;
    if (state.collapsedIds.has(id)) state.collapsedIds.delete(id);
    else state.collapsedIds.add(id);
    refreshTreeAndEditor();
  });
}

function updateUnitEditorPanel(root: HTMLElement, unitList: StimulusUnit[] | undefined): void {
  const unitEditor = root.querySelector("#unit-editor") as HTMLElement;
  if (!unitEditor) return;
  if (unitList) {
    const sel = unitList.find((u) => u.id === state.selectedUnitId);
    if (sel) {
      unitEditor.innerHTML = renderUnitForm(sel);
      wireUnitForm(unitEditor, unitList, sel);
    } else {
      unitEditor.innerHTML = `<p class="muted">当前位置下还没有刺激单元，请使用上方「＋」按钮添加。</p>`;
    }
  } else {
    unitEditor.innerHTML = `<p class="muted">请先在左侧选择 Block 或 Practice 下的 Trial（或选择一段 Rest）。</p>`;
  }
}

function updateAddUnitButtons(
  root: HTMLElement,
  trial: Trial | undefined,
  rest: RestSegment | undefined,
): void {
  const enabled = Boolean(trial || rest);
  root
    .querySelectorAll(
      "#btn-add-display, #btn-add-control, #btn-add-image-display, #btn-add-image-control, #btn-add-pendulum-display, #btn-add-pendulum-stimulus, #btn-add-pendulum-practice, #btn-add-spring-practice, #btn-add-spring-stimulus",
    )
    .forEach((btn) => {
      (btn as HTMLButtonElement).disabled = !enabled;
    });
}

/** 仅刷新结构树与右侧单元面板，保留树区域滚动位置 */
function refreshTreeAndEditor(): void {
  sortables.forEach((s) => s.destroy());
  sortables = [];

  const root = document.getElementById("editor-root");
  if (!root) return;

  const treeRoot = root.querySelector("#tree-root") as HTMLElement | null;
  if (!treeRoot) {
    render();
    return;
  }

  const scrollTop = treeRoot.scrollTop;

  ensureSelection();
  expandAncestorsForSelection();

  const seg = getSegment(state.selectedSegmentId);
  const trialParent = seg?.kind === "block" || seg?.kind === "practice" ? seg : undefined;
  const rest = seg?.kind === "rest" ? seg : undefined;
  const trial =
    trialParent && state.selectedBlockChildId
      ? getTrialInSegment(trialParent, state.selectedBlockChildId)
      : undefined;
  const unitList: StimulusUnit[] | undefined = trial?.units ?? rest?.units;

  renderStructureTree(treeRoot);
  treeRoot.scrollTop = scrollTop;
  wireTreePanel(treeRoot);

  updateUnitEditorPanel(root, unitList);
  updateAddUnitButtons(root, trial, rest);
  wireTreeAddTrial(root);
  wireDeleteButtons(root);
}

function addTrialToSegment(seg: BlockSegment | PracticeSegment, unit: StimulusUnit): void {
  const child: Trial = { id: newId(), units: [unit] };
  seg.children.push(child);
  state.selectedSegmentId = seg.id;
  state.selectedBlockChildId = child.id;
  state.selectedUnitId = unit.id;
  scheduleDraftSave();
  refreshTreeAndEditor();
}

function wireTreeAddTrial(root: HTMLElement): void {
  root.querySelectorAll('[data-action="add-trial"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sid = (btn as HTMLElement).dataset.segmentId;
      const seg = sid ? getSegment(sid) : undefined;
      if (!seg || (seg.kind !== "block" && seg.kind !== "practice")) return;
      addTrialToSegment(seg, {
        id: newId(),
        type: "textDisplay",
        text: "新文本显示",
        durationMs: 1000,
      });
    });
  });
}

function render(): void {
  sortables.forEach((s) => s.destroy());
  sortables = [];

  const root = document.getElementById("editor-root");
  if (!root) return;

  const prevTreeScroll = root.querySelector("#tree-root")?.scrollTop ?? 0;

  ensureSelection();
  expandAncestorsForSelection();
  const seg = getSegment(state.selectedSegmentId);
  const trialParent = seg?.kind === "block" || seg?.kind === "practice" ? seg : undefined;
  const rest = seg?.kind === "rest" ? seg : undefined;
  const trial =
    trialParent && state.selectedBlockChildId
      ? getTrialInSegment(trialParent, state.selectedBlockChildId)
      : undefined;
  const unitList: StimulusUnit[] | undefined = trial?.units ?? rest?.units;

  root.innerHTML = `
    <header class="editor-header">
      <div class="editor-header__title">
        <h1>刺激编写</h1>
        <p class="muted">左侧树：Block、Rest、Practice 可穿插；行首 ▼ 可折叠子项；Trial 与单元可在 Block 与 Practice 段之间跨段拖动。</p>
      </div>
      <div class="editor-header__actions">
        <a class="btn btn-ghost" href="#/start">实验首页</a>
        <a class="btn btn-ghost" href="#/runner">运行页</a>
        <button type="button" class="btn btn-primary" id="btn-run">运行实验</button>
        <button type="button" class="btn btn-secondary" id="btn-run-dev">开发者模式运行</button>
        <button type="button" class="btn btn-secondary" id="btn-export">导出 JSON</button>
        <button type="button" class="btn btn-secondary" id="btn-import">导入 JSON</button>
        <input type="file" id="input-import" accept=".json,application/json" hidden />
      </div>
    </header>
    <div id="editor-banner" class="banner ${state.banner ? "banner--visible" : ""}" role="status">
      ${state.banner ? escapeHtml(state.banner) : ""}
    </div>
    <div class="editor-body">
      <aside class="panel panel-tree">
        <div class="panel__head">
          <h2>实验结构</h2>
          <button type="button" class="btn btn-sm" id="btn-add-block">添加 Block</button>
          <button type="button" class="btn btn-sm" id="btn-add-practice">添加 Practice</button>
          <button type="button" class="btn btn-sm" id="btn-add-rest">添加 Rest</button>
        </div>
        <div id="tree-root" class="tree-root"></div>
      </aside>
      <section class="panel panel-editor">
        <div class="panel__head">
          <h2>单元属性</h2>
          <div class="panel__head-actions panel__head-actions--wrap">
            <button type="button" class="btn btn-sm" id="btn-add-display" ${trial || rest ? "" : "disabled"}>＋ 文本显示</button>
            <button type="button" class="btn btn-sm" id="btn-add-control" ${trial || rest ? "" : "disabled"}>＋ 文本控制</button>
            <button type="button" class="btn btn-sm" id="btn-add-image-display" ${trial || rest ? "" : "disabled"}>＋ 图像显示</button>
            <button type="button" class="btn btn-sm" id="btn-add-image-control" ${trial || rest ? "" : "disabled"}>＋ 图像控制</button>
            <button type="button" class="btn btn-sm" id="btn-add-pendulum-display" ${trial || rest ? "" : "disabled"}>＋ 摆球显示</button>
            <button type="button" class="btn btn-sm" id="btn-add-pendulum-stimulus" ${trial || rest ? "" : "disabled"}>＋ 摆球刺激</button>
            <button type="button" class="btn btn-sm" id="btn-add-pendulum-practice" ${trial || rest ? "" : "disabled"}>＋ 摆球练习</button>
            <button type="button" class="btn btn-sm" id="btn-add-spring-practice" ${trial || rest ? "" : "disabled"}>＋ 弹簧练习</button>
            <button type="button" class="btn btn-sm" id="btn-add-spring-stimulus" ${trial || rest ? "" : "disabled"}>＋ 弹簧刺激</button>
          </div>
        </div>
        <div id="unit-editor" class="unit-editor"></div>
      </section>
    </div>
  `;

  const treeRoot = root.querySelector("#tree-root") as HTMLElement;
  renderStructureTree(treeRoot);
  treeRoot.scrollTop = prevTreeScroll;
  wireTreePanel(treeRoot);

  updateUnitEditorPanel(root, unitList);
  updateAddUnitButtons(root, trial, rest);

  wireHeader(root);
  wireTreeAddTrial(root);
  wireDeleteButtons(root);
}

function previewText(s: string, max = 36): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t || "（空）";
  return `${t.slice(0, max)}…`;
}

function unitTypeLabel(u: StimulusUnit): string {
  switch (u.type) {
    case "textDisplay":
      return "文本显示";
    case "textControl":
      return "文本控制";
    case "imageDisplay":
      return "图像显示";
    case "imageControl":
      return "图像控制";
    case "pendulumDisplay":
      return "摆球显示";
    case "pendulumStimulus":
      return "摆球刺激";
    case "pendulumPractice":
      return "摆球练习";
    case "springPractice":
      return "弹簧练习";
    case "springStimulus":
      return "弹簧刺激";
  }
}

function unitListPreview(u: StimulusUnit): string {
  if (u.type === "textDisplay" || u.type === "textControl") {
    return previewText(u.text);
  }
  if (u.type === "imageDisplay" || u.type === "imageControl") {
    return u.imageDataUrl ? "已上传图片" : "未上传图片";
  }
  if (u.type === "pendulumDisplay") {
    return `θ₀=${u.theta0Deg}° l=${u.rodLengthM}m`;
  }
  if (u.type === "pendulumStimulus" || u.type === "pendulumPractice") {
    return `θ₀=${u.theta0Deg}° · 连续估计`;
  }
  if (u.type === "springPractice") {
    return `m=${u.massKg} k=${u.stiffness} x₀=${u.x0M}m`;
  }
  if (u.type === "springStimulus") {
    return `x₀=${u.x0M}m · 连续估计`;
  }
  return "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pendulumAnalysis(u: { theta0Deg: number; omega0DegPerSec: number; rodLengthM: number; gravity: number }) {
  return analyzePendulum({
    theta0Rad: (u.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (u.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: u.rodLengthM,
    gravity: u.gravity,
  });
}

function pendulumPeriodSec(u: { theta0Deg: number; omega0DegPerSec: number; rodLengthM: number; gravity: number }): number {
  return pendulumAnalysis(u).T;
}

function pendulumHideFieldLabel(): string {
  return `遮挡（固定 ${PENDULUM_HIDE_SEC} s）`;
}

function springPeriodSec(u: { massKg: number; stiffness: number; x0M: number; v0Mps: number }): number {
  return springAnalysis({
    massKg: u.massKg,
    stiffness: u.stiffness,
    x0M: u.x0M,
    v0Mps: u.v0Mps,
  }).T;
}

function stimulusTotalLabel(
  u: { show1T: number; hide1T: number; show2T: number; hide2T: number; fadeMs?: number },
  periodSec: number,
): string {
  const sec = stimulusTotalSec(u, periodSec);
  const tMult = stimulusTotalTimeT(u, periodSec);
  return `${sec.toFixed(2)} s（${tMult.toFixed(2)} T）`;
}

function renderUnitForm(u: StimulusUnit): string {
  if (u.type === "textDisplay") {
    return `
      <h3>编辑：文本显示</h3>
      <div class="unit-form">
        <div class="unit-form__block">
          <label class="unit-form__label" for="f-text">文本内容（Markdown）</label>
          <p class="hint muted unit-form__hint">运行页解析渲染。支持标题、**粗体**、*斜体*、列表、行内代码、链接（仅 http/https）等；引用与表格等会被忽略。</p>
          <textarea id="f-text" class="unit-form__textarea" rows="7">${escapeHtml(u.text)}</textarea>
        </div>
        <div class="unit-form__row">
          <label class="unit-form__row-label" for="f-duration">显示时间 (ms)</label>
          <input type="number" id="f-duration" class="unit-form__number" min="1" step="1" value="${u.durationMs}" />
        </div>
      </div>
      <button type="button" class="btn btn-danger" id="f-del-unit">删除此单元</button>
    `;
  }
  if (u.type === "textControl") {
    const keyOptions = KEY_CHOICE_OPTIONS.map(
      (o) =>
        `<option value="${escapeHtml(o.value)}" ${u.key === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`,
    ).join("");
    const customSelected = !KEY_CHOICE_OPTIONS.some((o) => o.value === u.key) ? "selected" : "";
    return `
      <h3>编辑：文本控制</h3>
      <div class="unit-form">
        <div class="unit-form__block">
          <label class="unit-form__label" for="f-text">文本内容（Markdown）</label>
          <p class="hint muted unit-form__hint">运行页解析渲染；语法与「文本显示」单元相同。</p>
          <textarea id="f-text" class="unit-form__textarea" rows="7">${escapeHtml(u.text)}</textarea>
        </div>
        <div class="unit-form__block unit-form__block--tight">
          <label class="unit-form__label" for="f-key-preset">结束按键</label>
          <div class="key-row">
            <select id="f-key-preset">
              ${keyOptions}
              <option value="__custom__" ${customSelected}>自定义…</option>
            </select>
            <input type="text" id="f-key-custom" maxlength="20" placeholder="单键或如 ArrowLeft" class="${customSelected ? "" : "is-hidden"}" value="${customSelected ? escapeHtml(u.key) : ""}" />
          </div>
          <p class="hint muted unit-form__hint">默认空格：预设中选「空格」，或在自定义中输入一个空格字符。</p>
        </div>
      </div>
      <button type="button" class="btn btn-danger" id="f-del-unit">删除此单元</button>
    `;
  }
  if (u.type === "pendulumDisplay") {
    return `
      <h3>编辑：摆球显示</h3>
      <div class="unit-form unit-form--physics">
        <div class="form-grid">
          <label for="f-th0">初始角度 θ₀（°）</label>
          <input type="number" id="f-th0" step="0.1" value="${u.theta0Deg}" />
          <label for="f-w0">初始角速度 ω₀（°/s）</label>
          <input type="number" id="f-w0" step="0.1" value="${u.omega0DegPerSec}" />
          <label for="f-len">杆长 l（m）</label>
          <input type="number" id="f-len" step="0.01" min="0.01" value="${u.rodLengthM}" />
          <label for="f-g">重力加速度 g（m/s²）</label>
          <input type="number" id="f-g" step="0.01" min="0.01" value="${u.gravity}" />
          <label for="f-dt">显示时长（T 的倍数）</label>
          <input type="number" id="f-dt" step="0.1" min="0.01" value="${u.displayTimeT}" />
        </div>
        ${physicsReadonlyBlock(u)}
      </div>
      <button type="button" class="btn btn-danger" id="f-del-unit">删除此单元</button>
    `;
  }
  if (u.type === "pendulumStimulus" || u.type === "pendulumPractice") {
    const pT = pendulumPeriodSec(u);
    const title = u.type === "pendulumPractice" ? "摆球练习" : "摆球刺激";
    return `
      <h3>编辑：${title}</h3>
      <div class="unit-form unit-form--physics">
        <div class="form-grid">
          <label for="f-th0">初始角度 θ₀（°）</label>
          <input type="number" id="f-th0" step="0.1" value="${u.theta0Deg}" />
          <label for="f-w0">初始角速度 ω₀（°/s）</label>
          <input type="number" id="f-w0" step="0.1" value="${u.omega0DegPerSec}" />
          <label for="f-len">杆长 l（m）</label>
          <input type="number" id="f-len" step="0.01" min="0.01" value="${u.rodLengthM}" />
          <label for="f-g">重力加速度 g（m/s²）</label>
          <input type="number" id="f-g" step="0.01" min="0.01" value="${u.gravity}" />
          <label for="f-tt">总时长（自动）</label>
          <input type="text" id="f-tt" readonly class="input-readonly" value="${stimulusTotalLabel(u, pT)}" />
          <label for="f-s1">可见时长（×T，1–2）</label>
          <input type="number" id="f-s1" step="0.01" min="0.01" value="${u.show1T}" />
          <label for="f-fade">淡出（ms，固定 ${STIMULUS_FADE_MS}，不计入遮挡）</label>
          <input type="number" id="f-fade" step="1" min="0" value="${u.fadeMs ?? STIMULUS_FADE_MS}" />
          <label for="f-h1">${pendulumHideFieldLabel()}</label>
          <input type="number" id="f-h1" step="0.01" min="0.01" value="${u.hide1T}" />
        </div>
        ${physicsReadonlyBlock(u)}
      </div>
      <button type="button" class="btn btn-danger" id="f-del-unit">删除此单元</button>
    `;
  }
  if (u.type === "springPractice") {
    return `
      <h3>编辑：弹簧练习</h3>
      <div class="unit-form unit-form--physics">
        <div class="form-grid">
          <label for="f-m">小球质量 m（kg）</label>
          <input type="number" id="f-m" step="0.01" min="0.01" value="${u.massKg}" />
          <label for="f-k">劲度系数 k（N/m）</label>
          <input type="number" id="f-k" step="0.01" min="0.01" value="${u.stiffness}" />
          <label for="f-x0">初始位移 x₀（m）</label>
          <input type="number" id="f-x0" step="0.001" value="${u.x0M}" />
          <label for="f-v0">初始速度 v₀（m/s）</label>
          <input type="number" id="f-v0" step="0.001" value="${u.v0Mps}" />
          <label for="f-dt">显示时长（T 的倍数）</label>
          <input type="number" id="f-dt" step="0.1" min="0.01" value="${u.displayTimeT}" />
        </div>
        ${physicsReadonlyBlock(u)}
      </div>
      <button type="button" class="btn btn-danger" id="f-del-unit">删除此单元</button>
    `;
  }
  if (u.type === "springStimulus") {
    const sT = springPeriodSec(u);
    return `
      <h3>编辑：弹簧刺激</h3>
      <div class="unit-form unit-form--physics">
        <div class="form-grid">
          <label for="f-m">小球质量 m（kg）</label>
          <input type="number" id="f-m" step="0.01" min="0.01" value="${u.massKg}" />
          <label for="f-k">劲度系数 k（N/m）</label>
          <input type="number" id="f-k" step="0.01" min="0.01" value="${u.stiffness}" />
          <label for="f-x0">初始位移 x₀（m）</label>
          <input type="number" id="f-x0" step="0.001" value="${u.x0M}" />
          <label for="f-v0">初始速度 v₀（m/s）</label>
          <input type="number" id="f-v0" step="0.001" value="${u.v0Mps}" />
          <label for="f-tt">总时长（自动）</label>
          <input type="text" id="f-tt" readonly class="input-readonly" value="${stimulusTotalLabel(u, sT)}" />
          <label for="f-s1">可见时长（×T，1–2）</label>
          <input type="number" id="f-s1" step="0.01" min="0.01" value="${u.show1T}" />
          <label for="f-fade">淡出（ms，固定 ${STIMULUS_FADE_MS}，不计入遮挡）</label>
          <input type="number" id="f-fade" step="1" min="0" value="${u.fadeMs ?? STIMULUS_FADE_MS}" />
          <label for="f-h1">遮挡（秒，1–1.5）</label>
          <input type="number" id="f-h1" step="0.01" min="0.01" value="${u.hide1T}" />
        </div>
        ${physicsReadonlyBlock(u)}
      </div>
      <button type="button" class="btn btn-danger" id="f-del-unit">删除此单元</button>
    `;
  }
  if (u.type === "imageDisplay") {
    const hasImg = Boolean(u.imageDataUrl);
    const srcAttr = hasImg ? ` src="${escapeHtml(u.imageDataUrl)}"` : "";
    return `
      <h3>编辑：图像显示</h3>
      <div class="form-grid">
        <label>图片</label>
        <div class="image-field">
          <input type="file" id="f-image-file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp" />
          <p class="hint muted">支持 PNG / JPEG / GIF / WebP，建议单张小于 6MB（将嵌入 JSON）。</p>
          <img id="f-image-preview" class="unit-image-preview" alt="预览"${hasImg ? srcAttr : " hidden"} />
        </div>
        <label>呈现时间 (ms)</label>
        <input type="number" id="f-duration" min="1" step="1" value="${u.durationMs}" />
      </div>
      <button type="button" class="btn btn-danger" id="f-del-unit">删除此单元</button>
    `;
  }
  if (u.type === "imageControl") {
    const keyOptions = KEY_CHOICE_OPTIONS.map(
      (o) =>
        `<option value="${escapeHtml(o.value)}" ${u.key === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`,
    ).join("");
    const customSelected = !KEY_CHOICE_OPTIONS.some((o) => o.value === u.key) ? "selected" : "";
    const hasImg = Boolean(u.imageDataUrl);
    const srcAttr = hasImg ? ` src="${escapeHtml(u.imageDataUrl)}"` : "";
    return `
    <h3>编辑：图像控制</h3>
    <div class="form-grid">
      <label>图片</label>
      <div class="image-field">
        <input type="file" id="f-image-file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp" />
        <p class="hint muted">呈现图片直到按下结束键；默认空格结束。</p>
        <img id="f-image-preview" class="unit-image-preview" alt="预览"${hasImg ? srcAttr : " hidden"} />
      </div>
      <label>结束按键</label>
      <div class="key-row">
        <select id="f-key-preset">
          ${keyOptions}
          <option value="__custom__" ${customSelected}>自定义…</option>
        </select>
        <input type="text" id="f-key-custom" maxlength="20" placeholder="单键或如 ArrowLeft" class="${customSelected ? "" : "is-hidden"}" value="${customSelected ? escapeHtml(u.key) : ""}" />
      </div>
    </div>
    <button type="button" class="btn btn-danger" id="f-del-unit">删除此单元</button>
  `;
  }
  const _never: never = u;
  return _never;
}

const IMAGE_MAX_FILE_BYTES = 6 * 1024 * 1024;

function wireUnitForm(container: HTMLElement, unitList: StimulusUnit[], u: StimulusUnit): void {
  const delBtn = container.querySelector("#f-del-unit");
  delBtn?.addEventListener("click", () => {
    if (!confirm("确定删除该刺激单元？")) return;
    const next = unitList.filter((x) => x.id !== u.id);
    unitList.length = 0;
    unitList.push(...next);
    state.selectedUnitId = unitList[0]?.id ?? null;
    scheduleDraftSave();
    refreshTreeAndEditor();
  });

  if (u.type === "textDisplay") {
    const textEl = container.querySelector("#f-text") as HTMLTextAreaElement;
    const apply = () => {
      u.text = textEl.value;
      const d = container.querySelector("#f-duration") as HTMLInputElement;
      const dm = Number(d.value);
      u.durationMs = Number.isFinite(dm) ? Math.round(dm) : 1000;
      scheduleDraftSave();
    };
    textEl.addEventListener("input", apply);
    container.querySelector("#f-duration")?.addEventListener("input", apply);
    return;
  }

  if (u.type === "textControl") {
    const textEl = container.querySelector("#f-text") as HTMLTextAreaElement;
    const preset = container.querySelector("#f-key-preset") as HTMLSelectElement;
    const custom = container.querySelector("#f-key-custom") as HTMLInputElement;
    const apply = () => {
      u.text = textEl.value;
      if (preset.value === "__custom__") {
        u.key = custom.value || " ";
      } else {
        u.key = preset.value ?? " ";
      }
      scheduleDraftSave();
    };
    textEl.addEventListener("input", apply);
    preset.addEventListener("change", () => {
      if (preset.value === "__custom__") {
        custom.classList.remove("is-hidden");
      } else {
        custom.classList.add("is-hidden");
      }
      apply();
    });
    custom.addEventListener("input", apply);
    return;
  }

  if (u.type === "pendulumDisplay") {
    const pu = u;
    const apply = () => {
      pu.theta0Deg = Number((container.querySelector("#f-th0") as HTMLInputElement).value) || 0;
      pu.omega0DegPerSec = Number((container.querySelector("#f-w0") as HTMLInputElement).value) || 0;
      pu.rodLengthM = Math.max(1e-6, Number((container.querySelector("#f-len") as HTMLInputElement).value) || 4);
      pu.gravity = Math.max(1e-6, Number((container.querySelector("#f-g") as HTMLInputElement).value) || 9.8);
      pu.displayTimeT = Math.max(1e-6, Number((container.querySelector("#f-dt") as HTMLInputElement).value) || 2);
      refreshPhysicsReadonly(container, pu as PhysicsEditableUnit);
      scheduleDraftSave();
    };
    container.querySelectorAll("#f-th0, #f-w0, #f-len, #f-g, #f-dt").forEach((el) => el.addEventListener("input", apply));
    return;
  }

  if (u.type === "pendulumStimulus" || u.type === "pendulumPractice") {
    const pu = u;
    const apply = () => {
      pu.theta0Deg = Number((container.querySelector("#f-th0") as HTMLInputElement).value) || 0;
      pu.omega0DegPerSec = Number((container.querySelector("#f-w0") as HTMLInputElement).value) || 0;
      pu.rodLengthM = Math.max(1e-6, Number((container.querySelector("#f-len") as HTMLInputElement).value) || 4);
      pu.gravity = Math.max(1e-6, Number((container.querySelector("#f-g") as HTMLInputElement).value) || 9.8);
      pu.show1T = Number((container.querySelector("#f-s1") as HTMLInputElement).value) || 0;
      pu.hide1T = Number((container.querySelector("#f-h1") as HTMLInputElement).value) || 0;
      pu.fadeMs = Number((container.querySelector("#f-fade") as HTMLInputElement).value) || 0;
      pu.show2T = 0;
      pu.hide2T = 0;
      const pT = pendulumPeriodSec(pu);
      Object.assign(pu, withSyncedTotalTimeT(pu, pT));
      const ttEl = container.querySelector("#f-tt") as HTMLInputElement | null;
      if (ttEl) ttEl.value = stimulusTotalLabel(pu, pT);
      refreshPhysicsReadonly(container, pu as PhysicsEditableUnit);
      refreshTreeAndEditor();
      scheduleDraftSave();
    };
    container
      .querySelectorAll("#f-th0, #f-w0, #f-len, #f-g, #f-s1, #f-fade, #f-h1")
      .forEach((el) => el.addEventListener("input", apply));
    return;
  }

  if (u.type === "springPractice") {
    const su = u;
    const apply = () => {
      su.massKg = Math.max(1e-6, Number((container.querySelector("#f-m") as HTMLInputElement).value) || 1);
      su.stiffness = Math.max(1e-6, Number((container.querySelector("#f-k") as HTMLInputElement).value) || 4);
      su.x0M = Number((container.querySelector("#f-x0") as HTMLInputElement).value) || 0;
      su.v0Mps = Number((container.querySelector("#f-v0") as HTMLInputElement).value) || 0;
      su.displayTimeT = Math.max(1e-6, Number((container.querySelector("#f-dt") as HTMLInputElement).value) || 4);
      refreshPhysicsReadonly(container, su as PhysicsEditableUnit);
      scheduleDraftSave();
    };
    container.querySelectorAll("#f-m, #f-k, #f-x0, #f-v0, #f-dt").forEach((el) => el.addEventListener("input", apply));
    return;
  }

  if (u.type === "springStimulus") {
    const su = u;
    const apply = () => {
      su.massKg = Math.max(1e-6, Number((container.querySelector("#f-m") as HTMLInputElement).value) || 1);
      su.stiffness = Math.max(1e-6, Number((container.querySelector("#f-k") as HTMLInputElement).value) || 4);
      su.x0M = Number((container.querySelector("#f-x0") as HTMLInputElement).value) || 0;
      su.v0Mps = Number((container.querySelector("#f-v0") as HTMLInputElement).value) || 0;
      su.show1T = Number((container.querySelector("#f-s1") as HTMLInputElement).value) || 0;
      su.hide1T = Number((container.querySelector("#f-h1") as HTMLInputElement).value) || 0;
      su.fadeMs = Number((container.querySelector("#f-fade") as HTMLInputElement).value) || 0;
      su.show2T = 0;
      su.hide2T = 0;
      const sT = springPeriodSec(su);
      Object.assign(su, withSyncedTotalTimeT(su, sT));
      const ttEl = container.querySelector("#f-tt") as HTMLInputElement | null;
      if (ttEl) ttEl.value = stimulusTotalLabel(su, sT);
      refreshPhysicsReadonly(container, su as PhysicsEditableUnit);
      refreshTreeAndEditor();
      scheduleDraftSave();
    };
    container
      .querySelectorAll("#f-m, #f-k, #f-x0, #f-v0, #f-s1, #f-fade, #f-h1")
      .forEach((el) => el.addEventListener("input", apply));
    return;
  }

  const fileInput = container.querySelector("#f-image-file") as HTMLInputElement | null;
  const preview = container.querySelector("#f-image-preview") as HTMLImageElement | null;
  fileInput?.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    if (f.size > IMAGE_MAX_FILE_BYTES) {
      alert("图片文件过大，请选择小于 6 MB 的图片。");
      fileInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const safe = sanitizeImageDataUrl(url);
      if (!safe) {
        alert("无法使用该图片，请使用 PNG、JPEG、GIF 或 WebP。");
        fileInput.value = "";
        return;
      }
      u.imageDataUrl = safe;
      if (preview) {
        preview.src = safe;
        preview.hidden = false;
      }
      scheduleDraftSave();
      refreshTreeAndEditor();
    };
    reader.readAsDataURL(f);
  });

  if (u.type === "imageDisplay") {
    const applyDuration = () => {
      const d = container.querySelector("#f-duration") as HTMLInputElement;
      const dm = Number(d.value);
      u.durationMs = Number.isFinite(dm) ? Math.round(dm) : 1000;
      scheduleDraftSave();
    };
    container.querySelector("#f-duration")?.addEventListener("input", applyDuration);
    return;
  }

  const preset = container.querySelector("#f-key-preset") as HTMLSelectElement;
  const custom = container.querySelector("#f-key-custom") as HTMLInputElement;
  const applyKey = () => {
    if (preset.value === "__custom__") {
      u.key = custom.value || " ";
    } else {
      u.key = preset.value ?? " ";
    }
    scheduleDraftSave();
  };
  preset.addEventListener("change", () => {
    if (preset.value === "__custom__") {
      custom.classList.remove("is-hidden");
    } else {
      custom.classList.add("is-hidden");
    }
    applyKey();
  });
  custom.addEventListener("input", applyKey);
}

function pushNewUnitToSelection(unit: StimulusUnit): void {
  const seg = getSegment(state.selectedSegmentId);
  if (seg?.kind === "block" || seg?.kind === "practice") {
    const child = getTrialInSegment(seg, state.selectedBlockChildId);
    if (!child) return;
    child.units.push(unit);
  } else if (seg?.kind === "rest") {
    seg.units.push(unit);
  } else {
    return;
  }
  state.selectedUnitId = unit.id;
  scheduleDraftSave();
  refreshTreeAndEditor();
}

function applyFirstSelectionFromSet(set: ExperimentStimulusSet): void {
  const s0 = set.sequence[0];
  if (!s0) {
    state.selectedSegmentId = "";
    state.selectedBlockChildId = "";
    state.selectedUnitId = null;
    return;
  }
  state.selectedSegmentId = s0.id;
  if (s0.kind === "block" || s0.kind === "practice") {
    state.selectedBlockChildId = s0.children[0]?.id ?? "";
    state.selectedUnitId = s0.children[0]?.units[0]?.id ?? null;
  } else {
    state.selectedBlockChildId = "";
    state.selectedUnitId = s0.units[0]?.id ?? null;
  }
}

function tryRunFromEditor(developerMode: boolean): void {
  const runErr = validateRunnableSet(state.set);
  if (runErr) {
    state.banner = runErr;
    render();
    return;
  }
  const warns = validateDesignWarnings(state.set);
  if (warns.length > 0) {
    const ok = confirm(`${warns.join("\n")}\n\n仍要继续运行吗？`);
    if (!ok) return;
  }
  void (async () => {
    setDeveloperModeForRun(developerMode);
    saveStimulusSetToSession(state.set);
    state.banner = null;
    await primeExperimentAudioInUserGesture();
    location.hash = "#/runner";
  })();
}

function wireHeader(root: HTMLElement): void {
  root.querySelector("#btn-run")?.addEventListener("click", () => tryRunFromEditor(false));
  root.querySelector("#btn-run-dev")?.addEventListener("click", () => tryRunFromEditor(true));

  root.querySelector("#btn-export")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.set, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "experiment-stimulus.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const fileInput = root.querySelector("#input-import") as HTMLInputElement;
  root.querySelector("#btn-import")?.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });
  fileInput?.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseExperimentStimulusSet(JSON.parse(String(reader.result)) as unknown);
        if (!parsed) {
          alert("无法导入：JSON 无效、或 schemaVersion 不为 5、或 sequence 为空。");
          return;
        }
        if (!confirm("导入将覆盖当前设计（含草稿）。确定继续？")) return;
        state.set = parsed;
        applyFirstSelectionFromSet(parsed);
        state.banner = null;
        saveDraftToLocal(state.set);
        render();
      } catch {
        alert("JSON 解析失败。");
      }
    };
    reader.readAsText(f, "UTF-8");
  });

  root.querySelector("#btn-add-block")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "textDisplay",
      text: "新文本显示",
      durationMs: 1000,
    };
    const trial: Trial = { id: newId(), units: [unit] };
    const block: BlockSegment = { kind: "block", id: newId(), children: [trial] };
    state.set.sequence.push(block);
    state.selectedSegmentId = block.id;
    state.selectedBlockChildId = trial.id;
    state.selectedUnitId = unit.id;
    scheduleDraftSave();
    refreshTreeAndEditor();
  });

  root.querySelector("#btn-add-rest")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "textDisplay",
      text: "Rest…",
      durationMs: 1000,
    };
    const rest: RestSegment = { kind: "rest", id: newId(), units: [unit] };
    state.set.sequence.push(rest);
    state.selectedSegmentId = rest.id;
    state.selectedBlockChildId = "";
    state.selectedUnitId = unit.id;
    scheduleDraftSave();
    refreshTreeAndEditor();
  });

  root.querySelector("#btn-add-practice")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "textDisplay",
      text: "新文本显示",
      durationMs: 1000,
    };
    const trial: Trial = { id: newId(), units: [unit] };
    const practice: PracticeSegment = { kind: "practice", id: newId(), children: [trial] };
    state.set.sequence.push(practice);
    state.selectedSegmentId = practice.id;
    state.selectedBlockChildId = trial.id;
    state.selectedUnitId = unit.id;
    scheduleDraftSave();
    refreshTreeAndEditor();
  });

  root.querySelector("#btn-add-display")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "textDisplay",
      text: "新文本显示",
      durationMs: 1000,
    };
    pushNewUnitToSelection(unit);
  });

  root.querySelector("#btn-add-control")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "textControl",
      text: "请按指定键继续",
      key: " ",
    };
    pushNewUnitToSelection(unit);
  });

  root.querySelector("#btn-add-image-display")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "imageDisplay",
      imageDataUrl: "",
      durationMs: 1000,
    };
    pushNewUnitToSelection(unit);
  });

  root.querySelector("#btn-add-image-control")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "imageControl",
      imageDataUrl: "",
      key: " ",
    };
    pushNewUnitToSelection(unit);
  });

  root.querySelector("#btn-add-pendulum-display")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "pendulumDisplay",
      theta0Deg: 0,
      omega0DegPerSec: 0,
      rodLengthM: 4,
      gravity: 9.8,
      displayTimeT: 2,
    };
    pushNewUnitToSelection(unit);
  });

  root.querySelector("#btn-add-pendulum-stimulus")?.addEventListener("click", () => {
    const base = {
      id: newId(),
      type: "pendulumStimulus" as const,
      theta0Deg: 45,
      omega0DegPerSec: 0,
      rodLengthM: 4,
      gravity: 9.8,
      totalTimeT: 0,
    };
    const a = pendulumAnalysis(base);
    const unit = withSyncedTotalTimeT(
      { ...base, ...randomPendulumStimulusTiming(a.regime, a.T) },
      a.T,
    ) as PendulumStimulusUnit;
    pushNewUnitToSelection(unit);
  });

  root.querySelector("#btn-add-pendulum-practice")?.addEventListener("click", () => {
    const base = {
      id: newId(),
      type: "pendulumPractice" as const,
      theta0Deg: 45,
      omega0DegPerSec: 0,
      rodLengthM: 4,
      gravity: 9.8,
      totalTimeT: 0,
    };
    const a = pendulumAnalysis(base);
    const unit = withSyncedTotalTimeT(
      { ...base, ...randomPendulumStimulusTiming(a.regime, a.T) },
      a.T,
    ) as PendulumPracticeUnit;
    pushNewUnitToSelection(unit);
  });

  root.querySelector("#btn-add-spring-practice")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "springPractice",
      massKg: 1,
      stiffness: 4,
      x0M: 0.5,
      v0Mps: 0,
      displayTimeT: 4,
    };
    pushNewUnitToSelection(unit);
  });

  root.querySelector("#btn-add-spring-stimulus")?.addEventListener("click", () => {
    const base = {
      id: newId(),
      type: "springStimulus" as const,
      massKg: 1,
      stiffness: 4,
      x0M: 0.5,
      v0Mps: 0,
      totalTimeT: 0,
      ...randomStimulusTiming(),
    };
    const unit = withSyncedTotalTimeT(base, springPeriodSec(base)) as SpringStimulusUnit;
    pushNewUnitToSelection(unit);
  });
}

function wireDeleteButtons(root: HTMLElement): void {
  root.querySelectorAll("[data-action='del-segment']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id;
      if (!id) return;
      if (state.set.sequence.length <= 1) {
        alert("至少保留一段结构（Block、Rest 或 Practice）。");
        return;
      }
      if (!confirm("确定删除该段及其全部内容？")) return;
      state.set.sequence = state.set.sequence.filter((s) => s.id !== id);
      ensureSelection();
      scheduleDraftSave();
      refreshTreeAndEditor();
    });
  });
  root.querySelectorAll("[data-action='del-trial']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const el = btn as HTMLElement;
      const segmentId = el.dataset.segmentId;
      const childId = el.dataset.blockChildId;
      const seg = segmentId ? getSegment(segmentId) : undefined;
      if (!seg || (seg.kind !== "block" && seg.kind !== "practice") || !childId) return;
      if (!confirm("确定删除该 Trial？")) return;
      seg.children = seg.children.filter((c) => c.id !== childId);
      ensureSelection();
      scheduleDraftSave();
      refreshTreeAndEditor();
    });
  });
  root.querySelectorAll("[data-action='del-unit']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const segmentId = (btn as HTMLElement).dataset.segmentId;
      const childId = (btn as HTMLElement).dataset.blockChildId;
      const unitId = (btn as HTMLElement).dataset.id;
      const seg = segmentId ? getSegment(segmentId) : undefined;
      if (!seg || !unitId) return;
      if (!confirm("确定删除该单元？")) return;
      if (seg.kind === "rest") {
        seg.units = seg.units.filter((u) => u.id !== unitId);
        state.selectedSegmentId = seg.id;
        state.selectedBlockChildId = "";
        state.selectedUnitId = seg.units[0]?.id ?? null;
      } else if (seg.kind === "block" || seg.kind === "practice") {
        const child = childId ? getTrialInSegment(seg, childId) : undefined;
        if (!child) return;
        child.units = child.units.filter((u) => u.id !== unitId);
        state.selectedSegmentId = seg.id;
        state.selectedBlockChildId = child.id;
        state.selectedUnitId = child.units[0]?.id ?? null;
      }
      scheduleDraftSave();
      refreshTreeAndEditor();
    });
  });
}

export function disposeEditor(): void {
  sortables.forEach((s) => s.destroy());
  sortables = [];
  window.clearTimeout(draftTimer);
  draftTimer = undefined;
}

export function mountEditor(container: HTMLElement): void {
  disposeEditor();

  const initial = loadDraftFromLocal() ?? cloneStimulusSet(DEFAULT_STIMULUS_SET);
  state = {
    set: initial,
    selectedSegmentId: "",
    selectedBlockChildId: "",
    selectedUnitId: null,
    banner: null,
    collapsedIds: new Set(),
  };
  applyFirstSelectionFromSet(initial);

  container.className = "editor-view";
  container.innerHTML = `<div id="editor-root"></div>`;
  render();
}
