/** 下拉选项：value 为传给 jsPsych 的键 */
export const KEY_CHOICE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: " ", label: "空格" },
  { value: "Enter", label: "Enter" },
  { value: "Escape", label: "Escape" },
  { value: "Tab", label: "Tab" },
  { value: "ArrowLeft", label: "左方向键" },
  { value: "ArrowRight", label: "右方向键" },
  { value: "ArrowUp", label: "上方向键" },
  { value: "ArrowDown", label: "下方向键" },
];

export function normalizeKeyForJsPsych(key: string): string {
  const t = key.trim();
  if (t.length === 0) return " ";
  if (t.length === 1) return t.toLowerCase();
  return t;
}

export function labelForKey(key: string): string {
  const found = KEY_CHOICE_OPTIONS.find((o) => o.value === key);
  return found ? found.label : key;
}
