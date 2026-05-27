/** 当前刺激集格式版本（仅支持本版本导入） */
export const STIMULUS_SET_SCHEMA_VERSION = 5 as const;

export type StimulusUnitType =
  | "textDisplay"
  | "textControl"
  | "imageDisplay"
  | "imageControl"
  | "pendulumPractice"
  | "pendulumStimulus"
  | "springPractice"
  | "springStimulus";

export interface TextDisplayUnit {
  id: string;
  type: "textDisplay";
  /** 基础 Markdown（运行页解析） */
  text: string;
  durationMs: number;
}

export interface TextControlUnit {
  id: string;
  type: "textControl";
  /** 基础 Markdown（运行页解析） */
  text: string;
  /** jsPsych 键盘码，如空格为 `" "` */
  key: string;
}

/** 使用 data URL（Base64）嵌入 JSON，便于导入导出与离线运行 */
export interface ImageDisplayUnit {
  id: string;
  type: "imageDisplay";
  imageDataUrl: string;
  /** 呈现时间（毫秒） */
  durationMs: number;
}

export interface ImageControlUnit {
  id: string;
  type: "imageControl";
  imageDataUrl: string;
  /** 结束按键，默认空格 */
  key: string;
}

/** 摆球：角度制；时长为 T 的倍数；质量固定为 1 kg（不入模） */
export interface PendulumPracticeUnit {
  id: string;
  type: "pendulumPractice";
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  displayTimeT: number;
}

export interface PendulumStimulusUnit {
  id: string;
  type: "pendulumStimulus";
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  totalTimeT: number;
  /** 第一显示段（× 周期 T） */
  show1T: number;
  /** 第一隐藏段（秒） */
  hide1T: number;
  show2T: number;
  hide2T: number;
}

export interface SpringPracticeUnit {
  id: string;
  type: "springPractice";
  massKg: number;
  stiffness: number;
  x0M: number;
  v0Mps: number;
  displayTimeT: number;
}

export interface SpringStimulusUnit {
  id: string;
  type: "springStimulus";
  massKg: number;
  stiffness: number;
  x0M: number;
  v0Mps: number;
  totalTimeT: number;
  /** 第一显示段（× 周期 T） */
  show1T: number;
  /** 第一隐藏段（秒） */
  hide1T: number;
  show2T: number;
  hide2T: number;
}

export type StimulusUnit =
  | TextDisplayUnit
  | TextControlUnit
  | ImageDisplayUnit
  | ImageControlUnit
  | PendulumPracticeUnit
  | PendulumStimulusUnit
  | SpringPracticeUnit
  | SpringStimulusUnit;

export interface Trial {
  id: string;
  units: StimulusUnit[];
}

/** 顶层：Block，仅含 Trial → 单元 */
export interface BlockSegment {
  kind: "block";
  id: string;
  children: Trial[];
}

/** 顶层：Practice 段，与 Block/Rest 同级；子级为 Trial → 单元 */
export interface PracticeSegment {
  kind: "practice";
  id: string;
  children: Trial[];
}

/** 顶层：Rest，无 Trial，仅单元列表 */
export interface RestSegment {
  kind: "rest";
  id: string;
  units: StimulusUnit[];
}

export type TopLevelSequenceItem = BlockSegment | RestSegment | PracticeSegment;

export interface ExperimentStimulusSet {
  schemaVersion: typeof STIMULUS_SET_SCHEMA_VERSION;
  /** 顶层顺序：Block、Rest、Practice 可任意穿插 */
  sequence: TopLevelSequenceItem[];
}
