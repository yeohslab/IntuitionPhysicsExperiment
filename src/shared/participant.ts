/** 被试编号数值下限（含） */
export const SUBJECT_ID_NUM_MIN = 1;
/** 被试编号数值上限（含），对应四位显示 9999 */
export const SUBJECT_ID_NUM_MAX = 9999;

export type MotionGroup = 1 | 2;
export type GenderCode = 0 | 1;

export interface ParticipantInfo {
  subject_id: string;
  motion_group: MotionGroup;
  gender_code: GenderCode;
  age_years: number;
}

/**
 * 校验并规范为四位前导零字符串（如 1 → "0001"，12 → "0012"）。
 * 仅接受非空纯数字，且数值在 [SUBJECT_ID_NUM_MIN, SUBJECT_ID_NUM_MAX]。
 */
export function normalizeSubjectId(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < SUBJECT_ID_NUM_MIN || n > SUBJECT_ID_NUM_MAX) return null;
  return String(n).padStart(4, "0");
}

/** 校验组别编号：1=摆动，2=旋转 */
export function normalizeMotionGroup(raw: unknown): MotionGroup | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (s === "1") return 1;
  if (s === "2") return 2;
  return null;
}

export function normalizeGenderCode(raw: unknown): GenderCode | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (s === "0") return 0;
  if (s === "1") return 1;
  return null;
}

export function normalizeAgeYears(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const age = Number(s);
  if (!Number.isSafeInteger(age) || age < 1 || age > 120) return null;
  return age;
}

export function isParticipantInfo(value: unknown): value is ParticipantInfo {
  if (typeof value !== "object" || value === null) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.subject_id === "string" &&
    normalizeSubjectId(raw.subject_id) === raw.subject_id &&
    (raw.motion_group === 1 || raw.motion_group === 2) &&
    (raw.gender_code === 0 || raw.gender_code === 1) &&
    typeof raw.age_years === "number" &&
    Number.isSafeInteger(raw.age_years) &&
    raw.age_years >= 1 &&
    raw.age_years <= 120
  );
}
