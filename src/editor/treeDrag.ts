import type { SortableEvent } from "sortablejs";
import type {
  BlockSegment,
  ExperimentStimulusSet,
  PracticeSegment,
  StimulusUnit,
  TopLevelSequenceItem,
} from "../types/experiment";

export type TreeDragSelection = {
  segmentId: string;
  blockChildId: string;
  unitId: string | null;
};

export type TreeDragHandlers = {
  getSet: () => ExperimentStimulusSet;
  getSegment: (id: string) => TopLevelSequenceItem | undefined;
  getTrialParentSegment: (id: string) => BlockSegment | PracticeSegment | undefined;
  reorderByIds: <T extends { id: string }>(items: T[], orderedIds: string[]) => void;
  onSelectionChange: (sel: TreeDragSelection) => void;
};

function listItemIds(ul: HTMLElement): string[] {
  return [...ul.children]
    .map((ch) => (ch as HTMLElement).dataset.itemId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

function resolveDropList(el: HTMLElement | null, zone: string): HTMLElement | null {
  if (!el) return null;
  if (el.dataset.dropZone === zone) return el;
  const found = el.closest(`[data-drop-zone="${zone}"]`);
  return found instanceof HTMLElement ? found : null;
}

function unitListForUl(
  handlers: TreeDragHandlers,
  ul: HTMLElement,
): StimulusUnit[] | null {
  const segmentId = ul.dataset.segmentId;
  if (!segmentId) return null;
  const seg = handlers.getSegment(segmentId);
  if (!seg) return null;
  if (seg.kind === "rest") return seg.units;
  if (seg.kind !== "block" && seg.kind !== "practice") return null;
  const childId = ul.dataset.blockChildId;
  if (!childId) return null;
  const child = seg.children.find((c) => c.id === childId);
  return child?.units ?? null;
}

export function applySequenceDrag(handlers: TreeDragHandlers, evt: SortableEvent): void {
  const ul = resolveDropList(evt.to as HTMLElement, "sequence");
  if (!ul) return;
  handlers.reorderByIds(handlers.getSet().sequence, listItemIds(ul));
}

const SEGMENT_CHILDREN_ZONE = "segment-children";

export function applySegmentChildrenDrag(handlers: TreeDragHandlers, evt: SortableEvent): void {
  const itemId = (evt.item as HTMLElement).dataset.itemId;
  if (!itemId) return;

  const fromUl = resolveDropList(evt.from as HTMLElement, SEGMENT_CHILDREN_ZONE);
  const toUl = resolveDropList(evt.to as HTMLElement, SEGMENT_CHILDREN_ZONE);
  if (!fromUl || !toUl) return;

  const fromSegId = fromUl.dataset.segmentId;
  const toSegId = toUl.dataset.segmentId;
  if (!fromSegId || !toSegId) return;

  const fromSeg = handlers.getTrialParentSegment(fromSegId);
  const toSeg = handlers.getTrialParentSegment(toSegId);
  if (!fromSeg || !toSeg) return;

  if (fromUl === toUl) {
    handlers.reorderByIds(fromSeg.children, listItemIds(toUl));
    handlers.onSelectionChange({
      segmentId: toSegId,
      blockChildId: itemId,
      unitId: fromSeg.children.find((c) => c.id === itemId)?.units[0]?.id ?? null,
    });
    return;
  }

  const idx = fromSeg.children.findIndex((c) => c.id === itemId);
  if (idx < 0) return;
  const [child] = fromSeg.children.splice(idx, 1);

  const toIds = listItemIds(toUl);
  const insertAt = toIds.indexOf(itemId);
  toSeg.children.splice(insertAt >= 0 ? insertAt : toSeg.children.length, 0, child);

  handlers.onSelectionChange({
    segmentId: toSegId,
    blockChildId: itemId,
    unitId: child.units[0]?.id ?? null,
  });
}

export function applyUnitsDrag(handlers: TreeDragHandlers, evt: SortableEvent): void {
  const unitId = (evt.item as HTMLElement).dataset.itemId;
  if (!unitId) return;

  const fromUl = resolveDropList(evt.from as HTMLElement, "units");
  const toUl = resolveDropList(evt.to as HTMLElement, "units");
  const toSegId = toUl?.dataset.segmentId;
  if (!fromUl || !toUl || !toSegId) return;

  const fromList = unitListForUl(handlers, fromUl);
  const toList = unitListForUl(handlers, toUl);
  if (!fromList || !toList) return;

  if (fromUl === toUl) {
    handlers.reorderByIds(fromList, listItemIds(toUl));
    handlers.onSelectionChange({
      segmentId: toSegId,
      blockChildId: toUl.dataset.blockChildId ?? "",
      unitId,
    });
    return;
  }

  const idx = fromList.findIndex((u) => u.id === unitId);
  if (idx < 0) return;
  const [unit] = fromList.splice(idx, 1);

  const toIds = listItemIds(toUl);
  const insertAt = toIds.indexOf(unitId);
  toList.splice(insertAt >= 0 ? insertAt : toList.length, 0, unit);

  handlers.onSelectionChange({
    segmentId: toSegId,
    blockChildId: toUl.dataset.blockChildId ?? "",
    unitId,
  });
}
