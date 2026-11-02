/** 实验二运行时刺激集版本。 */
export const EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION = 3 as const;
/** 实验四运行时刺激集版本。 */
export const EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION = 4 as const;
/** 实验五运行时刺激集版本。 */
export const EXPERIMENT_5_STIMULUS_SET_SCHEMA_VERSION = 1 as const;
/** 训练一运行时刺激集版本。 */
export const EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION = 6 as const;

export type StimulusUnitType =
  | "textDisplay"
  | "textControl"
  | "pendulumStimulus"
  | "gratingPendulumStimulus"
  | "reachabilityPendulumStimulus"
  | "speedColorTrainingStimulus"
  | "training1Summary";

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

export type GratingOcclusionSegmentRecord = {
  kind: "fully_occluded" | "fully_visible" | "partial";
  tStartSec: number;
  tEndSec: number;
};

export interface GratingPendulumStimulusUnit {
  id: string;
  type: "gratingPendulumStimulus";
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  /** 本试次的目标机械能（J）。 */
  energyJ: number;
  durationSec: number;
  queryTimeSec: number;
  gapLevel: "small" | "medium" | "large";
  gapM: number;
  barWidthM: number;
  bobRadiusM: number;
  initialSide: "left" | "right";
  initialDirection: "leftward" | "rightward";
  /** 先报角度还是先报速度；旧刺激集缺省时按 angle_first 读入。 */
  responseOrder: "angle_first" | "speed_first";
  occlusionSegmentIndex: number;
  queryBarIndex: number;
  occlusionTimeline: GratingOcclusionSegmentRecord[];
  firstVisibleSec: number | null;
}

export type ReachabilityRelation = "reachable" | "unreachable";

export type SpeedColorTrainingMode = "guided" | "assessment";
export type SpeedColorTrainingSegment =
  | "guided_1"
  | "guided_2"
  | "guided_3"
  | "assessment_1"
  | "remediation"
  | "assessment_2";

export type SpeedColorTrainingDirection =
  | "rightward"
  | "stationary";

export type SpeedColorTrainingLoopMode = "ping_pong" | "stationary";

export interface SpeedColorTrainingStimulusUnit {
  id: string;
  type: "speedColorTrainingStimulus";
  mode: SpeedColorTrainingMode;
  trainingSegment: SpeedColorTrainingSegment;
  stageRoundIndex: number;
  targetBinIndex: number | null;
  assessmentAttempt: number | null;
  feedbackShown: boolean;
  initialDirection: SpeedColorTrainingDirection;
  loopMode: SpeedColorTrainingLoopMode;
  targetStripPosition: number;
  linearSpeedMPerSec: number;
  trackLeftXM: number;
  trackRightXM: number;
  initialXM: number;
  reportDelaySec: number | null;
  firstTraversalDurationSec: number | null;
}

export interface Training1SummaryUnit {
  id: string;
  type: "training1Summary";
  text: string;
}

export interface ReachabilityPendulumStimulusUnit {
  id: string;
  type: "reachabilityPendulumStimulus";
  theta0Deg: number;
  omega0DegPerSec: number;
  disappearanceThetaDeg: number;
  disappearanceOmegaDegPerSec: number;
  rodLengthM: number;
  gravity: number;
  bobRadiusM: number;
  energyJ: number;
  amplitudeDeg: number;
  targetAngleDeg: number;
  boundaryGapDeg: number;
  judgmentDistanceM: number;
  judgmentTimeSec: number;
  visibleDurationSec: number;
  responseDeadlineSec: number;
  side: "left" | "right";
  relation: ReachabilityRelation;
  correctResponse: ReachabilityRelation;
  yesKey: "f" | "j";
  noKey: "f" | "j";
}

export type StimulusUnit =
  | TextDisplayUnit
  | TextControlUnit
  | PendulumStimulusUnit
  | GratingPendulumStimulusUnit
  | ReachabilityPendulumStimulusUnit
  | SpeedColorTrainingStimulusUnit
  | Training1SummaryUnit;

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

export interface RuntimeStimulusSet {
  schemaVersion: number;
  sequence: TopLevelSequenceItem[];
}

/** 实验二运行时刺激集。 */
export interface Experiment2StimulusSet extends RuntimeStimulusSet {
  schemaVersion: typeof EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION;
}

/** 实验四运行时刺激集。 */
export interface Experiment4StimulusSet extends RuntimeStimulusSet {
  schemaVersion: typeof EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION;
}

/** 实验五运行时刺激集。 */
export interface Experiment5StimulusSet extends RuntimeStimulusSet {
  schemaVersion: typeof EXPERIMENT_5_STIMULUS_SET_SCHEMA_VERSION;
}

/** 训练一运行时刺激集。 */
export interface ExperimentTraining1StimulusSet extends RuntimeStimulusSet {
  schemaVersion: typeof EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION;
}
