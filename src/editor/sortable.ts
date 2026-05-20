import Sortable, { type SortableEvent } from "sortablejs";

export interface SortableListOptions {
  /** 同名 group 的列表之间可互相拖入 */
  group: string;
  /** Sortable 仅支持以 > 开头的子选择器，如 ">li" */
  draggable?: string;
  onSort: (evt: SortableEvent) => void;
}

export function bindSortableList(el: HTMLElement, options: SortableListOptions): Sortable {
  return Sortable.create(el, {
    animation: 150,
    handle: ".drag-handle",
    group: { name: options.group, pull: true, put: true },
    ...(options.draggable ? { draggable: options.draggable } : {}),
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    onEnd: options.onSort,
  });
}
