/** 实验二运行时刺激集版本。 */
export const EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION = 3 as const;
/** 实验四运行时刺激集版本。 */
export const EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION = 6 as const;
/** 实验五运行时刺激集版本。 */
export const EXPERIMENT_5_STIMULUS_SET_SCHEMA_VERSION = 3 as const;
/** 实验四协议 2.0 运行时刺激集版本。4：练习 6 条，角度与速度汇报各半。 */
export const EXPERIMENT_4_V2_STIMULUS_SET_SCHEMA_VERSION = 4 as const;
/** 实验五协议 2.0 运行时刺激集版本。7：铃铛只放在消失时摆球正朝向的一侧。 */
export const EXPERIMENT_5_V2_STIMULUS_SET_SCHEMA_VERSION = 7 as const;
/** 训练一运行时刺激集版本。7：色带右端改为 60° 静止释放的最低点速度。 */
export const EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION = 7 as const;

export type StimulusUnitType =
  | "textDisplay"
  | "textControl"
  | "pendulumStimulus"
  | "gratingPendulumStimulus"
  | "reachabilityPendulumStimulus"
  | "protocol2PendulumDemo"
  | "trackingPendulumV2Stimulus"
  | "bellReachabilityV2Stimulus"
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
  visibleWindowCount: 2 | 3 | 4;
  gapM: number;
  barWidthM: number;
  gratingPeriodM: number;
  gratingOffsetM: number;
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
  /** 与实验四一致、按 11.48 J 完整横穿标定的光栅条件。 */
  visibleWindowCount: 2 | 3 | 4;
  gapM: number;
  barWidthM: number;
  gratingPeriodM: number;
  gratingOffsetM: number;
  side: "left" | "right";
  relation: ReachabilityRelation;
  correctResponse: ReachabilityRelation;
  yesKey: "f" | "j";
  noKey: "f" | "j";
}

export type Protocol2GratingCondition = "G1" | "G2" | "G3";

export type Protocol2VisibleSegment = {
  /** Relative to motion playback start. */
  tStartSec: number;
  /** Relative to motion playback start. */
  tEndSec: number;
  truncatedByBlank: boolean;
};

export interface Protocol2PendulumDemoUnit {
  id: string;
  type: "protocol2PendulumDemo";
  amplitudeDeg: number;
  rodLengthM: number;
  gravity: number;
  bobRadiusM: number;
}

interface Protocol2OccludedMotionUnit {
  theta0Deg: number;
  omega0DegPerSec: number;
  rodLengthM: number;
  gravity: number;
  bobRadiusM: number;
  energyJ: number;
  amplitudeDeg: number;
  queryThetaDeg: number;
  queryOmegaRadPerSec: number;
  queryTimeSec: number;
  blankStartSec: number;
  blankDurationSec: number;
  visibleSegments: Protocol2VisibleSegment[];
  gratingCondition: Protocol2GratingCondition;
  gapM: number;
  barWidthM: number;
  gratingPeriodM: number;
  gratingOffsetM: number;
  stateSiteId: string;
  modelDtSec: number;
}

export interface TrackingPendulumV2StimulusUnit
  extends Protocol2OccludedMotionUnit {
  id: string;
  type: "trackingPendulumV2Stimulus";
  trackingCondition: "no_hidden_reversal" | "hidden_reversal";
  initialSide: "left" | "right";
  initialDirection: "leftward" | "rightward";
  cueDurationMs: number;
  reversalTimeSec: number | null;
  speedScaleLinearMPerSec: number;
  /** 本试次只收集这一项汇报。 */
  reportTarget: "angle" | "speed";
}

export interface BellReachabilityV2StimulusUnit
  extends Protocol2OccludedMotionUnit {
  id: string;
  type: "bellReachabilityV2Stimulus";
  deltaHM: number;
  bellContactHeightM: number;
  bellThetaDeg: number;
  bellSide: "left" | "right";
  correctResponse: ReachabilityRelation;
  yesKey: "f" | "j";
  noKey: "f" | "j";
  plannedVisibleTurn: boolean;
  plannedVisibleTurnTimeSec: number | null;
  plannedVisibleContact: boolean;
  plannedVisibleContactTimeSec: number | null;
}

export type StimulusUnit =
  | TextDisplayUnit
  | TextControlUnit
  | PendulumStimulusUnit
  | GratingPendulumStimulusUnit
  | ReachabilityPendulumStimulusUnit
  | Protocol2PendulumDemoUnit
  | TrackingPendulumV2StimulusUnit
  | BellReachabilityV2StimulusUnit
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

/** 实验四协议 2.0 运行时刺激集。 */
export interface Experiment4V2StimulusSet extends RuntimeStimulusSet {
  schemaVersion: typeof EXPERIMENT_4_V2_STIMULUS_SET_SCHEMA_VERSION;
}

/** 实验五协议 2.0 运行时刺激集。 */
export interface Experiment5V2StimulusSet extends RuntimeStimulusSet {
  schemaVersion: typeof EXPERIMENT_5_V2_STIMULUS_SET_SCHEMA_VERSION;
}

/** 训练一运行时刺激集。 */
export interface ExperimentTraining1StimulusSet extends RuntimeStimulusSet {
  schemaVersion: typeof EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION;
}
