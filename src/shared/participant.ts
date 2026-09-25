/** 组内序号数值下限（含） */
export const SUBJECT_ID_NUM_MIN = 1;
/** 组内序号数值上限（含），对应四位显示 9999 */
export const SUBJECT_ID_NUM_MAX = 9999;

export type MotionGroup = 1 | 2;
export type GenderCode = 0 | 1;

export interface ParticipantInfo {
  /** 被试编号：组别 + 四位组内序号，如 10001、20015 */
  subject_id: string;
  motion_group: MotionGroup;
  gender_code: GenderCode;
  age_years: number;
}

export interface Experiment2ParticipantInfo {
  /** 实验二单组编号：E2- + 四位组内序号，如 E2-0001。 */
  subject_id: string;
  gender_code: GenderCode;
  age_years: number;
}

export interface Experiment3ParticipantInfo {
  /** 实验三单组编号：E3- + 四位组内序号，如 E3-0001。 */
  subject_id: string;
  gender_code: GenderCode;
  age_years: number;
}

export type AnyParticipantInfo =
  | ParticipantInfo
  | Experiment2ParticipantInfo
  | Experiment3ParticipantInfo;

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

/** 由组别与组内序号生成被试编号（组别 + 四位序号）。 */
export function buildSubjectId(
  motionGroup: MotionGroup,
  withinGroupNumber: string,
): string {
  return `${motionGroup}${withinGroupNumber}`;
}

export function buildExperiment2SubjectId(withinGroupNumber: string): string {
  return `E2-${withinGroupNumber}`;
}

export function buildExperiment3SubjectId(withinGroupNumber: string): string {
  return `E3-${withinGroupNumber}`;
}

export function isValidExperiment2SubjectId(subjectId: string): boolean {
  const match = /^E2-(\d{4})$/.exec(subjectId);
  if (!match) return false;
  const within = Number(match[1]);
  return Number.isInteger(within) && within >= SUBJECT_ID_NUM_MIN && within <= SUBJECT_ID_NUM_MAX;
}

export function parseExperiment2WithinGroupNumber(subjectId: string): string | null {
  return isValidExperiment2SubjectId(subjectId) ? subjectId.slice(3) : null;
}

export function isValidExperiment3SubjectId(subjectId: string): boolean {
  const match = /^E3-(\d{4})$/.exec(subjectId);
  if (!match) return false;
  const within = Number(match[1]);
  return Number.isInteger(within) && within >= SUBJECT_ID_NUM_MIN && within <= SUBJECT_ID_NUM_MAX;
}

export function parseExperiment3WithinGroupNumber(subjectId: string): string | null {
  return isValidExperiment3SubjectId(subjectId) ? subjectId.slice(3) : null;
}

/** 被试编号格式：首位为组别 1/2，后四位为组内序号。 */
export function isValidSubjectId(subjectId: string): boolean {
  if (!/^[12]\d{4}$/.test(subjectId)) return false;
  const within = parseInt(subjectId.slice(1), 10);
  return within >= SUBJECT_ID_NUM_MIN && within <= SUBJECT_ID_NUM_MAX;
}

/** 从被试编号解析组内序号；若与 motionGroup 不匹配则返回 null。 */
export function parseWithinGroupNumber(
  subjectId: string,
  motionGroup: MotionGroup,
): string | null {
  if (!isValidSubjectId(subjectId)) return null;
  if (Number(subjectId[0]) !== motionGroup) return null;
  return subjectId.slice(1);
}

/** @deprecated 使用 normalizeWithinGroupNumber；保留别名供旧引用迁移。 */
export const normalizeSubjectId = normalizeWithinGroupNumber;

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
  const motionGroup = raw.motion_group;
  if (motionGroup !== 1 && motionGroup !== 2) return false;
  if (typeof raw.subject_id !== "string" || !isValidSubjectId(raw.subject_id)) return false;
  if (Number(raw.subject_id[0]) !== motionGroup) return false;
  return (
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
  if (typeof value !== "object" || value === null) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.subject_id === "string" &&
    isValidExperiment2SubjectId(raw.subject_id) &&
    (raw.gender_code === 0 || raw.gender_code === 1) &&
    typeof raw.age_years === "number" &&
    Number.isSafeInteger(raw.age_years) &&
    raw.age_years >= 1 &&
    raw.age_years <= 120
  );
}

export function isExperiment3ParticipantInfo(
  value: unknown,
): value is Experiment3ParticipantInfo {
  if (typeof value !== "object" || value === null) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.subject_id === "string" &&
    isValidExperiment3SubjectId(raw.subject_id) &&
    (raw.gender_code === 0 || raw.gender_code === 1) &&
    typeof raw.age_years === "number" &&
    Number.isSafeInteger(raw.age_years) &&
    raw.age_years >= 1 &&
    raw.age_years <= 120
  );
}
