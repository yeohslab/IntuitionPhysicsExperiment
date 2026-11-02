import { cryptoRandom, shuffleInPlace } from "../../experiment/stimulus/cryptoRandom";
import { newId } from "../../shared/ids";
import type {
  ExperimentTraining1StimulusSet,
  SpeedColorTrainingSegment,
  SpeedColorTrainingStimulusUnit,
  TopLevelSequenceItem,
  Trial,
} from "../../shared/experimentTypes";
import { EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import type { Training1ParticipantInfo } from "../../shared/participant";
import {
  training1AssessmentText,
  training1GuidedText,
  training1RemediationText,
  training1ReassessmentText,
  training1StructureText,
  training1WelcomeText,
} from "./instructions";
import {
  TRAINING_1_ASSESSMENT_TRIALS,
  TRAINING_1_FIXATION_MS,
  TRAINING_1_FIXATION_TEXT,
  TRAINING_1_GUIDED_ROUNDS,
  TRAINING_1_GUIDED_TRIALS,
  TRAINING_1_REMEDIATION_TRIALS,
  TRAINING_1_SEGMENT_IDS,
  TRAINING_1_SPEED_BIN_COUNT,
  TRAINING_1_TOTAL_RUNTIME_TRIALS,
} from "./protocol";
import {
  buildLinearTrainingUnit,
  trainingMotionStateAt,
} from "./trialPhysics";

export type GenerateTraining1RuntimeSetOptions = {
  rng?: () => number;
  onProgress?: (completed: number, total: number) => void;
};

function fixation() {
  return {
    id: newId(), type: "textDisplay" as const,
    text: TRAINING_1_FIXATION_TEXT, durationMs: TRAINING_1_FIXATION_MS,
  };
}

function control(id: string, text: string) {
  return { kind: "rest" as const, id, units: [
    { id: newId(), type: "textControl" as const, text, key: " " },
  ] };
}

function toUnit(
  fields: Omit<SpeedColorTrainingStimulusUnit, "id" | "type">,
): SpeedColorTrainingStimulusUnit {
  return { id: newId(), type: "speedColorTrainingStimulus", ...fields };
}

function makeTrial(unit: SpeedColorTrainingStimulusUnit, withFixation: boolean): Trial {
  return { id: newId(), units: withFixation ? [fixation(), unit] : [unit] };
}

function buildStratifiedRound(
  segment: SpeedColorTrainingSegment,
  mode: "guided" | "assessment",
  stageRoundIndex: number,
  assessmentAttempt: number | null,
  feedbackShown: boolean,
  useBinCenters: boolean,
  rng: () => number,
): SpeedColorTrainingStimulusUnit[] {
  const units = Array.from({ length: TRAINING_1_SPEED_BIN_COUNT }, (_, binIndex) => {
    const targetStripPosition = useBinCenters
      ? (binIndex + 0.5) / TRAINING_1_SPEED_BIN_COUNT
      : (binIndex + rng()) / TRAINING_1_SPEED_BIN_COUNT;
    return toUnit(buildLinearTrainingUnit(
      targetStripPosition,
      {
        mode,
        trainingSegment: segment,
        stageRoundIndex,
        targetBinIndex: binIndex,
        assessmentAttempt,
        feedbackShown,
      },
    ));
  });
  shuffleInPlace(units, rng);
  return units;
}

function buildAssessment(
  attempt: 1 | 2,
  rng: () => number,
): SpeedColorTrainingStimulusUnit[] {
  const segment = `assessment_${attempt}` as const;
  const units = Array.from({ length: TRAINING_1_ASSESSMENT_TRIALS }, (_, binIndex) =>
    toUnit(buildLinearTrainingUnit(
      (binIndex + rng()) / TRAINING_1_ASSESSMENT_TRIALS,
      {
        mode: "assessment",
        trainingSegment: segment,
        stageRoundIndex: 1,
        targetBinIndex: binIndex,
        assessmentAttempt: attempt,
        feedbackShown: false,
      },
    )),
  );
  shuffleInPlace(units, rng);
  return units;
}

function practice(
  id: string,
  units: SpeedColorTrainingStimulusUnit[],
  withFixation: boolean,
) {
  return {
    kind: "practice" as const,
    id,
    children: units.map((unit) => makeTrial(unit, withFixation)),
  };
}

export function generateTraining1RuntimeStimulusSet(
  _participant: Training1ParticipantInfo,
  options: GenerateTraining1RuntimeSetOptions = {},
): ExperimentTraining1StimulusSet {
  const rng = options.rng ?? cryptoRandom();
  let completed = 0;
  const report = (units: readonly SpeedColorTrainingStimulusUnit[]) => {
    for (const _unit of units) {
      completed += 1;
      options.onProgress?.(completed, TRAINING_1_TOTAL_RUNTIME_TRIALS);
    }
    return units;
  };

  const guidedRounds = Array.from({ length: TRAINING_1_GUIDED_ROUNDS }, (_, index) =>
    report(buildStratifiedRound(
      `guided_${index + 1}` as SpeedColorTrainingSegment,
      "guided",
      index + 1,
      null,
      true,
      index === 0,
      rng,
    )),
  );
  const assessment1 = report(buildAssessment(1, rng));
  const remediation = report(buildStratifiedRound(
    "remediation",
    "guided",
    1,
    null,
    true,
    true,
    rng,
  ));
  const assessment2 = report(buildAssessment(2, rng));

  const sequence: TopLevelSequenceItem[] = [
    control(newId(), training1WelcomeText()),
    control(newId(), training1StructureText()),
    control(newId(), training1GuidedText()),
    practice(TRAINING_1_SEGMENT_IDS.guided1, [...guidedRounds[0]!], true),
    practice(TRAINING_1_SEGMENT_IDS.guided2, [...guidedRounds[1]!], true),
    practice(TRAINING_1_SEGMENT_IDS.guided3, [...guidedRounds[2]!], true),
    control(newId(), training1AssessmentText()),
    practice(TRAINING_1_SEGMENT_IDS.assessment1, [...assessment1], true),
    control(TRAINING_1_SEGMENT_IDS.remediationIntro, training1RemediationText()),
    practice(TRAINING_1_SEGMENT_IDS.remediation, [...remediation], true),
    control(TRAINING_1_SEGMENT_IDS.assessment2Intro, training1ReassessmentText()),
    practice(TRAINING_1_SEGMENT_IDS.assessment2, [...assessment2], true),
    {
      kind: "rest", id: newId(),
      units: [{ id: newId(), type: "training1Summary", text: "" }],
    },
  ];
  const set: ExperimentTraining1StimulusSet = {
    schemaVersion: EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION,
    sequence,
  };
  assertTraining1RuntimeStimulusSet(set);
  return set;
}

function unitsForSegment(
  set: ExperimentTraining1StimulusSet,
  segment: SpeedColorTrainingSegment,
): SpeedColorTrainingStimulusUnit[] {
  return set.sequence
    .filter((item) => item.kind === "practice")
    .flatMap((item) => item.children)
    .flatMap((trial) => trial.units)
    .filter((unit): unit is SpeedColorTrainingStimulusUnit =>
      unit.type === "speedColorTrainingStimulus" && unit.trainingSegment === segment);
}

function assertCoveredRound(
  units: readonly SpeedColorTrainingStimulusUnit[],
  label: string,
): void {
  if (units.length !== TRAINING_1_SPEED_BIN_COUNT) {
    throw new Error(`${label} 应包含 ${TRAINING_1_SPEED_BIN_COUNT} 条`);
  }
  if (new Set(units.map((unit) => unit.targetBinIndex)).size !== TRAINING_1_SPEED_BIN_COUNT) {
    throw new Error(`${label} 未覆盖全部速度区间`);
  }
}

export function assertTraining1RuntimeStimulusSet(
  set: ExperimentTraining1StimulusSet,
): void {
  if (set.schemaVersion !== EXPERIMENT_TRAINING_1_STIMULUS_SET_SCHEMA_VERSION) {
    throw new Error("训练一刺激 schema 错误");
  }
  for (let roundIndex = 1; roundIndex <= TRAINING_1_GUIDED_ROUNDS; roundIndex += 1) {
    assertCoveredRound(unitsForSegment(
      set,
      `guided_${roundIndex}` as SpeedColorTrainingSegment,
    ), `有反馈练习第 ${roundIndex} 轮`);
  }
  assertCoveredRound(unitsForSegment(set, "remediation"), "补强练习");
  for (const attempt of [1, 2] as const) {
    const assessment = unitsForSegment(set, `assessment_${attempt}`);
    if (assessment.length !== TRAINING_1_ASSESSMENT_TRIALS) {
      throw new Error(`测验 ${attempt} 数量错误`);
    }
    if (new Set(assessment.map((unit) => unit.targetBinIndex)).size !==
        TRAINING_1_ASSESSMENT_TRIALS) {
      throw new Error(`测验 ${attempt} 未覆盖六个速度区间`);
    }
  }

  const allUnits = set.sequence
    .filter((item) => item.kind === "practice")
    .flatMap((item) => item.children)
    .flatMap((trial) => trial.units)
    .filter((unit): unit is SpeedColorTrainingStimulusUnit =>
      unit.type === "speedColorTrainingStimulus");
  if (allUnits.length !== TRAINING_1_TOTAL_RUNTIME_TRIALS ||
      guidedRoundsCount(allUnits) !== TRAINING_1_GUIDED_TRIALS ||
      unitsForSegment(set, "remediation").length !== TRAINING_1_REMEDIATION_TRIALS) {
    throw new Error("训练一总试次数错误");
  }
  for (const unit of allUnits) {
    if (unit.trackLeftXM !== -4 || unit.trackRightXM !== 4) {
      throw new Error("训练一固定轨道端点错误");
    }
    if (unit.linearSpeedMPerSec <= 1e-12) {
      if (unit.initialDirection !== "stationary" || unit.loopMode !== "stationary" ||
          unit.initialXM !== 0 || unit.firstTraversalDurationSec !== null) {
        throw new Error("训练一静止刺激字段错误");
      }
    } else {
      if (unit.initialDirection !== "rightward" || unit.loopMode !== "ping_pong" ||
          unit.initialXM !== unit.trackLeftXM || unit.firstTraversalDurationSec === null) {
        throw new Error("训练一往复运动字段错误");
      }
      const end = trainingMotionStateAt(unit, unit.firstTraversalDurationSec);
      if (Math.abs(end.xM - unit.trackRightXM) > 1e-9) {
        throw new Error("训练一首次横穿终点错误");
      }
    }
    if (unit.reportDelaySec !== 4) {
      throw new Error("训练一提问应在 4 秒后开放作答");
    }
  }
}

function guidedRoundsCount(units: readonly SpeedColorTrainingStimulusUnit[]): number {
  return units.filter((unit) =>
    unit.mode === "guided" && unit.trainingSegment.startsWith("guided_"),
  ).length;
}

export async function generateTraining1RuntimeStimulusSetAsync(
  participant: Training1ParticipantInfo,
  options: GenerateTraining1RuntimeSetOptions = {},
): Promise<ExperimentTraining1StimulusSet> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return generateTraining1RuntimeStimulusSet(participant, options);
}
