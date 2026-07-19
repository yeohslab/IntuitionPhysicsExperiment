/** 当前刺激集内存/会话格式版本（运行时 generateRuntimeStimulusSet 产出） */
export const STIMULUS_SET_SCHEMA_VERSION = 5 as const;

export type StimulusUnitType =
  | "textDisplay"
  | "textControl"
  | "imageDisplay"
  | "imageControl"
  | "pendulumDisplay"
  | "pendulumStimulus"
  | "pendulumPractice";

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

/** 摆球显示：角度制；时长为 T 的倍数；质量固定为 1 kg（不入模） */
export interface PendulumDisplayUnit {
  id: string;
  type: "pendulumDisplay";
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
  /** show→hide 淡出（ms），不计入 hide1T */
  fadeMs?: number;
}

/** 摆球练习（遗留 JSON 兼容）：与摆球刺激相同时序与作答 */
export interface PendulumPracticeUnit {
  id: string;
  type: "pendulumPractice";
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  totalTimeT: number;
  show1T: number;
  hide1T: number;
  show2T: number;
  hide2T: number;
  fadeMs?: number;
}

export type StimulusUnit =
  | TextDisplayUnit
  | TextControlUnit
  | ImageDisplayUnit
  | ImageControlUnit
  | PendulumDisplayUnit
  | PendulumStimulusUnit
  | PendulumPracticeUnit;

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
