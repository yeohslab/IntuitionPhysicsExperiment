import {
  STIMULUS_SET_SCHEMA_VERSION,
  type BlockSegment,
  type ExperimentStimulusSet,
  type PracticeSegment,
  type RestSegment,
  type StimulusUnit,
  type TopLevelSequenceItem,
  type Trial,
} from "../types/experiment";
import { newId } from "./ids";
import { sanitizeImageDataUrl } from "./html";
import { analyzePendulum, pendulumRegime, pendulumCriticalEnergy, pendulumEnergy } from "../physics/pendulum";
import type { PendulumParams } from "../physics/pendulum";
import { springAnalysis } from "../physics/spring";
import { withSyncedTotalTimeT } from "../physics/timePhases";
import type { PendulumStimulusUnit, SpringStimulusUnit } from "../types/experiment";

export const SESSION_STIMULUS_KEY = "jspsych-stimulus-set-for-run";
export const SESSION_SUBJECT_ID_KEY = "jspsych-subject-id";
/** 0..4，对应 stimulate/stimulus-01 … stimulus-05 */
export const SESSION_STIMULUS_FILE_INDEX_KEY = "jspsych-stimulus-file-index";
/** 编辑页「开发者模式运行」：hide 遮挡半透明 */
export const SESSION_DEVELOPER_MODE_KEY = "jspsych-developer-mode";
export const LOCAL_DRAFT_KEY = "jspsych-stimulus-draft";

export function setDeveloperModeForRun(on: boolean): void {
  sessionStorage.setItem(SESSION_DEVELOPER_MODE_KEY, on ? "1" : "0");
}

export function isDeveloperModeRun(): boolean {
  return sessionStorage.getItem(SESSION_DEVELOPER_MODE_KEY) === "1";
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function resyncStimulusTiming(unit: PendulumStimulusUnit | SpringStimulusUnit): void {
  if (unit.type === "pendulumStimulus") {
    const T = analyzePendulum({
      theta0Rad: (unit.theta0Deg * Math.PI) / 180,
      omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
      rodLengthM: unit.rodLengthM,
      gravity: unit.gravity,
    }).T;
    Object.assign(unit, withSyncedTotalTimeT(unit, T));
    return;
  }
  const T = springAnalysis({
    massKg: unit.massKg,
    stiffness: unit.stiffness,
    x0M: unit.x0M,
    v0Mps: unit.v0Mps,
  }).T;
  Object.assign(unit, withSyncedTotalTimeT(unit, T));
}

function readFloat(raw: Record<string, unknown>, key: string, fallback: number): number {
  const v = raw[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

function parseUnit(raw: unknown): StimulusUnit | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : newId();
  const type = raw.type;
  if (type === "textDisplay") {
    const text = typeof raw.text === "string" ? raw.text : "";
    const durationMs =
      typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs)
        ? Math.round(raw.durationMs)
        : 1000;
    return { id, type: "textDisplay", text, durationMs };
  }
  if (type === "textControl") {
    const text = typeof raw.text === "string" ? raw.text : "";
    const key = typeof raw.key === "string" ? raw.key : " ";
    return { id, type: "textControl", text, key };
  }
  if (type === "imageDisplay") {
    const rawUrl = typeof raw.imageDataUrl === "string" ? raw.imageDataUrl : "";
    const imageDataUrl = sanitizeImageDataUrl(rawUrl) ?? "";
    const durationMs =
      typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs)
        ? Math.round(raw.durationMs)
        : 1000;
    return { id, type: "imageDisplay", imageDataUrl, durationMs };
  }
  if (type === "imageControl") {
    const rawUrl = typeof raw.imageDataUrl === "string" ? raw.imageDataUrl : "";
    const imageDataUrl = sanitizeImageDataUrl(rawUrl) ?? "";
    const key = typeof raw.key === "string" ? raw.key : " ";
    return { id, type: "imageControl", imageDataUrl, key };
  }
  if (type === "pendulumPractice") {
    return {
      id,
      type: "pendulumPractice",
      theta0Deg: readFloat(raw, "theta0Deg", 45),
      omega0DegPerSec: readFloat(raw, "omega0DegPerSec", 0),
      rodLengthM: readFloat(raw, "rodLengthM", 4),
      gravity: readFloat(raw, "gravity", 9.8),
      displayTimeT: readFloat(raw, "displayTimeT", 4),
    };
  }
  if (type === "pendulumStimulus") {
    const unit = withSyncedTotalTimeT({
      id,
      type: "pendulumStimulus" as const,
      theta0Deg: readFloat(raw, "theta0Deg", 45),
      omega0DegPerSec: readFloat(raw, "omega0DegPerSec", 0),
      rodLengthM: readFloat(raw, "rodLengthM", 4),
      gravity: readFloat(raw, "gravity", 9.8),
      show1T: readFloat(raw, "show1T", 1),
      hide1T: readFloat(raw, "hide1T", 0.75),
      show2T: readFloat(raw, "show2T", 1),
      hide2T: readFloat(raw, "hide2T", 0.75),
      totalTimeT: readFloat(raw, "totalTimeT", 0),
    });
    resyncStimulusTiming(unit);
    return unit;
  }
  if (type === "springPractice") {
    return {
      id,
      type: "springPractice",
      massKg: readFloat(raw, "massKg", 1),
      stiffness: readFloat(raw, "stiffness", 4),
      x0M: readFloat(raw, "x0M", 0.5),
      v0Mps: readFloat(raw, "v0Mps", 0),
      displayTimeT: readFloat(raw, "displayTimeT", 4),
    };
  }
  if (type === "springStimulus") {
    const unit = withSyncedTotalTimeT({
      id,
      type: "springStimulus" as const,
      massKg: readFloat(raw, "massKg", 1),
      stiffness: readFloat(raw, "stiffness", 4),
      x0M: readFloat(raw, "x0M", 0.5),
      v0Mps: readFloat(raw, "v0Mps", 0),
      show1T: readFloat(raw, "show1T", 1),
      hide1T: readFloat(raw, "hide1T", 0.75),
      show2T: readFloat(raw, "show2T", 1),
      hide2T: readFloat(raw, "hide2T", 0.75),
      totalTimeT: readFloat(raw, "totalTimeT", 0),
    });
    resyncStimulusTiming(unit);
    return unit;
  }
  return null;
}

function parseTrial(raw: unknown): Trial | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "practice") return null;
  const id = typeof raw.id === "string" ? raw.id : newId();
  if (!Array.isArray(raw.units)) return null;
  const units: StimulusUnit[] = [];
  for (const u of raw.units) {
    const parsed = parseUnit(u);
    if (parsed) units.push(parsed);
  }
  return { id, units };
}

function parseBlockSegmentV3(raw: unknown): BlockSegment | null {
  if (!isRecord(raw) || raw.kind !== "block") return null;
  const id = typeof raw.id === "string" ? raw.id : newId();
  if (Array.isArray(raw.children)) {
    const children: Trial[] = [];
    for (const c of raw.children) {
      const parsed = parseTrial(c);
      if (parsed) children.push(parsed);
    }
    return { kind: "block", id, children };
  }
  if (Array.isArray(raw.trials)) {
    const children: Trial[] = [];
    for (const t of raw.trials) {
      const parsed = parseTrial(t);
      if (parsed) children.push(parsed);
    }
    return { kind: "block", id, children };
  }
  return null;
}

function parsePracticeSegment(raw: unknown): PracticeSegment | null {
  if (!isRecord(raw) || raw.kind !== "practice") return null;
  const id = typeof raw.id === "string" ? raw.id : newId();
  if (!Array.isArray(raw.children)) return null;
  const children: Trial[] = [];
  for (const c of raw.children) {
    const parsed = parseTrial(c);
    if (parsed) children.push(parsed);
  }
  return { kind: "practice", id, children };
}

function parseRestSegment(raw: unknown): RestSegment | null {
  if (!isRecord(raw)) return null;
  if (raw.kind !== "rest") return null;
  const id = typeof raw.id === "string" ? raw.id : newId();
  if (!Array.isArray(raw.units)) return null;
  const units: StimulusUnit[] = [];
  for (const u of raw.units) {
    const parsed = parseUnit(u);
    if (parsed) units.push(parsed);
  }
  return { kind: "rest", id, units };
}

function parseSequenceItemV3(raw: unknown): TopLevelSequenceItem | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "rest") return parseRestSegment(raw);
  if (raw.kind === "block") return parseBlockSegmentV3(raw);
  if (raw.kind === "practice") return parsePracticeSegment(raw);
  if (raw.kind === undefined && Array.isArray((raw as { trials?: unknown }).trials)) {
    return parseBlockSegmentV3({ ...raw, kind: "block" });
  }
  return null;
}

export function parseExperimentStimulusSet(raw: unknown): ExperimentStimulusSet | null {
  if (!isRecord(raw)) return null;

  if (raw.schemaVersion !== STIMULUS_SET_SCHEMA_VERSION) return null;
  if (!Array.isArray(raw.sequence)) return null;

  const sequence: TopLevelSequenceItem[] = [];
  for (const item of raw.sequence) {
    const parsed = parseSequenceItemV3(item);
    if (parsed) sequence.push(parsed);
  }
  if (sequence.length === 0) return null;
  return { schemaVersion: STIMULUS_SET_SCHEMA_VERSION, sequence };
}

export function saveStimulusSetToSession(set: ExperimentStimulusSet): void {
  sessionStorage.setItem(SESSION_STIMULUS_KEY, JSON.stringify(set));
}

export function loadStimulusSetFromSession(): ExperimentStimulusSet | null {
  const s = sessionStorage.getItem(SESSION_STIMULUS_KEY);
  if (!s) return null;
  try {
    return parseExperimentStimulusSet(JSON.parse(s) as unknown);
  } catch {
    return null;
  }
}

export function loadDraftFromLocal(): ExperimentStimulusSet | null {
  const s = localStorage.getItem(LOCAL_DRAFT_KEY);
  if (!s) return null;
  try {
    return parseExperimentStimulusSet(JSON.parse(s) as unknown);
  } catch {
    return null;
  }
}

export function saveDraftToLocal(set: ExperimentStimulusSet): void {
  localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(set));
}

function segmentLabel(item: TopLevelSequenceItem, sequence: TopLevelSequenceItem[]): string {
  if (item.kind === "block") {
    let n = 0;
    for (const s of sequence) {
      if (s.kind === "block") {
        n += 1;
        if (s.id === item.id) return `Block ${n}`;
      }
    }
    return "Block";
  }
  if (item.kind === "practice") {
    let n = 0;
    for (const s of sequence) {
      if (s.kind === "practice") {
        n += 1;
        if (s.id === item.id) return `Practice ${n}`;
      }
    }
    return "Practice";
  }
  let n = 0;
  for (const s of sequence) {
    if (s.kind === "rest") {
      n += 1;
      if (s.id === item.id) return `Rest ${n}`;
    }
  }
  return "Rest";
}

export function validateRunnableSet(set: ExperimentStimulusSet): string | null {
  if (set.sequence.length === 0) return "请至少添加一段结构（Block、Rest 或 Practice）。";
  for (let si = 0; si < set.sequence.length; si++) {
    const item = set.sequence[si];
    const lab = segmentLabel(item, set.sequence);
    if (item.kind === "block" || item.kind === "practice") {
      if (item.children.length === 0) return `${lab} 中没有任何 Trial。`;
      for (let ci = 0; ci < item.children.length; ci++) {
        const t = item.children[ci]!;
        if (t.units.length === 0) return `${lab} 的 Trial ${ci + 1} 没有任何刺激单元。`;
      }
    } else {
      if (item.units.length === 0) return `${lab} 中没有任何刺激单元。`;
    }
  }
  return null;
}

export function validateDesignWarnings(set: ExperimentStimulusSet): string[] {
  const warnings: string[] = [];
  set.sequence.forEach((item) => {
    const lab = segmentLabel(item, set.sequence);
    if (item.kind === "block" || item.kind === "practice") {
      item.children.forEach((t, ci) => {
        t.units.forEach((u, ui) => {
          const loc = `${lab} Trial ${ci + 1} 单元 ${ui + 1}`;
          pushUnitWarnings(warnings, loc, u);
        });
      });
    } else {
      item.units.forEach((u, ui) => {
        const loc = `${lab} 单元 ${ui + 1}`;
        pushUnitWarnings(warnings, loc, u);
      });
    }
  });
  return warnings;
}

function pushUnitWarnings(warnings: string[], loc: string, u: StimulusUnit): void {
  if (u.type === "textDisplay" || u.type === "textControl") {
    if (!u.text.trim()) {
      warnings.push(`${loc}：文本为空。`);
    }
  }
  if (u.type === "textDisplay" && u.durationMs <= 0) {
    warnings.push(`${loc}：显示时间应大于 0 ms。`);
  }
  if (u.type === "imageDisplay" && u.durationMs <= 0) {
    warnings.push(`${loc}：呈现时间应大于 0 ms。`);
  }
  if (u.type === "imageDisplay" || u.type === "imageControl") {
    if (!sanitizeImageDataUrl(u.imageDataUrl)) {
      warnings.push(`${loc}：请上传有效图片（PNG / JPEG / GIF / WebP）。`);
    }
  }
  if (u.type === "pendulumPractice" || u.type === "pendulumStimulus") {
    if (u.rodLengthM <= 0 || u.gravity <= 0) {
      warnings.push(`${loc}：杆长与重力加速度须为正值。`);
    }
    const p: PendulumParams = {
      theta0Rad: (u.theta0Deg * Math.PI) / 180,
      omega0RadPerSec: (u.omega0DegPerSec * Math.PI) / 180,
      rodLengthM: u.rodLengthM,
      gravity: u.gravity,
    };
    const E = pendulumEnergy(p);
    const Ec = pendulumCriticalEnergy(u.rodLengthM, u.gravity);
    if (pendulumRegime(E, u.rodLengthM, u.gravity) === "critical") {
      warnings.push(`${loc}：能量接近分离点（E≈2mgl），周期数值可能极不稳定。`);
    }
    if (Math.abs(E - Ec) / Math.max(Ec, 1e-9) < 0.02) {
      warnings.push(`${loc}：能量接近临界值，动力学处于分界附近。`);
    }
  }
  if (u.type === "springPractice" || u.type === "springStimulus") {
    if (u.massKg <= 0 || u.stiffness <= 0) {
      warnings.push(`${loc}：质量与劲度系数须为正值。`);
    }
  }
  if (u.type === "pendulumPractice" && u.displayTimeT <= 0) {
    warnings.push(`${loc}：显示时长（T 倍数）应大于 0。`);
  }
  if (u.type === "springPractice" && u.displayTimeT <= 0) {
    warnings.push(`${loc}：显示时长（T 倍数）应大于 0。`);
  }
  if (u.type === "pendulumStimulus" || u.type === "springStimulus") {
    if (u.show1T <= 0 || u.show2T <= 0) {
      warnings.push(`${loc}：显示段（×T）应大于 0。`);
    }
    if (u.hide1T <= 0 || u.hide2T <= 0) {
      warnings.push(`${loc}：隐藏段（秒）应大于 0。`);
    }
  }
}
