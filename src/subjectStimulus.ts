/** 被试编号数值下限（含） */
export const SUBJECT_ID_NUM_MIN = 1;
/** 被试编号数值上限（含），对应四位显示 9999 */
export const SUBJECT_ID_NUM_MAX = 9999;

export type MotionGroup = 1 | 2;

/**
 * 校验并规范为四位前导零字符串（如 1 → "0001"，12 → "0012"）。
 * 仅接受非空纯数字，且数值在 [SUBJECT_ID_NUM_MIN, SUBJECT_ID_NUM_MAX]。
 */
export function normalizeSubjectId(raw: string): string | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < SUBJECT_ID_NUM_MIN || n > SUBJECT_ID_NUM_MAX) return null;
  return String(n).padStart(4, "0");
}

/** 校验组别编号：1=摆动，2=旋转 */
export function normalizeMotionGroup(raw: string): MotionGroup | null {
  const s = raw.trim();
  if (s === "1") return 1;
  if (s === "2") return 2;
  return null;
}
