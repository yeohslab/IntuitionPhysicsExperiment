/** 组内序号数值下限（含） */
export const SUBJECT_ID_NUM_MIN = 1;
/** 组内序号数值上限（含），对应四位显示 9999 */
export const SUBJECT_ID_NUM_MAX = 9999;

/** 描述物理试次时区分摆动/旋转能量段，不是被试分组。 */
export type MotionGroup = 1 | 2;
export type GenderCode = 0 | 1;

export interface Experiment2ParticipantInfo {
  /** 实验二单组编号：E2- + 四位组内序号，如 E2-0001。 */
  subject_id: string;
  gender_code: GenderCode;
  age_years: number;
}

export interface Experiment4ParticipantInfo {
  /** 实验四单组编号：E4- + 四位组内序号，如 E4-0001。 */
  subject_id: string;
  gender_code: GenderCode;
  age_years: number;
}

export type AnyParticipantInfo =
  | Experiment2ParticipantInfo
  | Experiment4ParticipantInfo;

/**
 * 校验并规范组内序号为四位前导零字符串（如 1 → "0001"）。
 * 仅接受非空纯数字，且数值在 [SUBJECT_ID_NUM_MIN, SUBJECT_ID_NUM_MAX]。
 */
export function normalizeWithinGroupNumber(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < SUBJECT_ID_NUM_MIN || n > SUBJECT_ID_NUM_MAX) return null;
  return String(n).padStart(4, "0");
}

export function buildExperiment2SubjectId(withinGroupNumber: string): string {
  return `E2-${withinGroupNumber}`;
}

export function buildExperiment4SubjectId(withinGroupNumber: string): string {
  return `E4-${withinGroupNumber}`;
}

function isValidPrefixedSubjectId(prefix: "E2" | "E4", subjectId: string): boolean {
  const match = new RegExp(`^${prefix}-(\\d{4})$`).exec(subjectId);
  if (!match) return false;
  const within = Number(match[1]);
  return Number.isInteger(within) && within >= SUBJECT_ID_NUM_MIN && within <= SUBJECT_ID_NUM_MAX;
}

export function isValidExperiment2SubjectId(subjectId: string): boolean {
  return isValidPrefixedSubjectId("E2", subjectId);
}

export function isValidExperiment4SubjectId(subjectId: string): boolean {
  return isValidPrefixedSubjectId("E4", subjectId);
}

export function parseExperiment2WithinGroupNumber(subjectId: string): string | null {
  return isValidExperiment2SubjectId(subjectId) ? subjectId.slice(3) : null;
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

function isParticipantInfoWithPrefix(
  value: unknown,
  _prefix: "E2" | "E4",
  validateId: (id: string) => boolean,
): boolean {
  if (typeof value !== "object" || value === null) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.subject_id === "string" &&
    validateId(raw.subject_id) &&
    (raw.gender_code === 0 || raw.gender_code === 1) &&
    typeof raw.age_years === "number" &&
    Number.isSafeInteger(raw.age_years) &&
    raw.age_years >= 1 &&
    raw.age_years <= 120
  );
}

export function isExperiment2ParticipantInfo(
  value: unknown,
): value is Experiment2ParticipantInfo {
  return isParticipantInfoWithPrefix(value, "E2", isValidExperiment2SubjectId);
}

export function isExperiment4ParticipantInfo(
  value: unknown,
): value is Experiment4ParticipantInfo {
  return isParticipantInfoWithPrefix(value, "E4", isValidExperiment4SubjectId);
}

export function parseExperiment4WithinGroupNumber(subjectId: string): string | null {
  return isValidExperiment4SubjectId(subjectId) ? subjectId.slice(3) : null;
}
