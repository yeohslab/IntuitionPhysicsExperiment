/** 当前刺激集内存/会话格式版本（运行时 generateRuntimeStimulusSet 产出）。 */
export const STIMULUS_SET_SCHEMA_VERSION = 6 as const;

export type StimulusUnitType =
  | "textDisplay"
  | "textControl"
  | "pendulumStimulus";

export interface TextDisplayUnit {
  id: string;
  type: "textDisplay";
  text: string;
  durationMs: number;
}

export interface TextControlUnit {
  id: string;
  type: "textControl";
  text: string;
  key: string;
}

export interface PendulumStimulusUnit {
  id: string;
  type: "pendulumStimulus";
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  totalTimeT: number;
  /** 显示时长（×T）。 */
  show1T: number;
  /** 遮挡时长（秒）。 */
  hide1T: number;
  /** show→hide 淡出（ms），不计入 hide1T。 */
  fadeMs: number;
}

export type StimulusUnit =
  | TextDisplayUnit
  | TextControlUnit
  | PendulumStimulusUnit;

export interface Trial {
  id: string;
  units: StimulusUnit[];
}

export interface BlockSegment {
  kind: "block";
  id: string;
  children: Trial[];
}

export interface PracticeSegment {
  kind: "practice";
  id: string;
  children: Trial[];
}

export interface RestSegment {
  kind: "rest";
  id: string;
  units: StimulusUnit[];
}

export type TopLevelSequenceItem =
  | BlockSegment
  | RestSegment
  | PracticeSegment;

export interface ExperimentStimulusSet {
  schemaVersion: typeof STIMULUS_SET_SCHEMA_VERSION;
  sequence: TopLevelSequenceItem[];
}
