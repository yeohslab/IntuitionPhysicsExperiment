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
  training1AnchorText,
  training1ReportText,
  training1StructureText,
  training1WelcomeText,
} from "./instructions";
import {
  TRAINING_1_ANCHOR_POSITIONS,
  TRAINING_1_BLOCK_SIZE,
  TRAINING_1_DEMO_TRIALS,
  TRAINING_1_FIXATION_MS,
  TRAINING_1_FIXATION_TEXT,
  TRAINING_1_MAX_BLOCKS,
  TRAINING_1_MAX_REPORT_TRIALS,
  TRAINING_1_TOTAL_RUNTIME_TRIALS,
  training1MasterySegmentId,
} from "./protocol";
import {
  buildContinuousTrainingUnit,
  pickContinuousTrainingEnergy,
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

function control(text: string) {
  return { id: newId(), type: "textControl" as const, text, key: " " };
}

function toUnit(
  fields: Omit<SpeedColorTrainingStimulusUnit, "id" | "type">,
): SpeedColorTrainingStimulusUnit {
  return { id: newId(), type: "speedColorTrainingStimulus", ...fields };
}

function makeTrial(unit: SpeedColorTrainingStimulusUnit, withFixation: boolean): Trial {
  return { id: newId(), units: withFixation ? [fixation(), unit] : [unit] };
}

function masterySegment(blockIndex: number): SpeedColorTrainingSegment {
  return `mastery_${blockIndex}` as SpeedColorTrainingSegment;
}

function buildAnchorUnits(rng: () => number): SpeedColorTrainingStimulusUnit[] {
  return TRAINING_1_ANCHOR_POSITIONS.map((position, index) =>
    toUnit(
      buildContinuousTrainingUnit(
        position,
        pickContinuousTrainingEnergy(position, rng),
        index % 2 === 0 ? "right" : "left",
        index % 2 === 0 ? "outward" : "inward",
        {
          mode: "demonstration",
          trainingSegment: "anchor_demo",
          blockIndex: 0,
          targetBinIndex: null,
        },
      ),
    ),
  );
}

function buildMasteryBlock(
  blockIndex: number,
  rng: () => number,
): SpeedColorTrainingStimulusUnit[] {
  const sides: Array<"left" | "right"> = [
    "left", "left", "left", "left", "right", "right", "right", "right",
  ];
  shuffleInPlace(sides, rng);
  const units = Array.from({ length: TRAINING_1_BLOCK_SIZE }, (_, binIndex) => {
    const position = (binIndex + rng()) / TRAINING_1_BLOCK_SIZE;
    return toUnit(
      buildContinuousTrainingUnit(
        position,
        pickContinuousTrainingEnergy(position, rng),
        sides[binIndex]!,
        rng() < 0.5 ? "inward" : "outward",
        {
          mode: "report",
          trainingSegment: masterySegment(blockIndex),
          blockIndex,
          targetBinIndex: binIndex,
        },
      ),
    );
  });
  shuffleInPlace(units, rng);
  return units;
}

export function generateTraining1RuntimeStimulusSet(
  _participant: Training1ParticipantInfo,
  options: GenerateTraining1RuntimeSetOptions = {},
): ExperimentTraining1StimulusSet {
  const rng = options.rng ?? cryptoRandom();
  let completed = 0;
  const report = () => options.onProgress?.(++completed, TRAINING_1_TOTAL_RUNTIME_TRIALS);
  const anchors = buildAnchorUnits(rng);
  anchors.forEach(report);
  const blocks = Array.from({ length: TRAINING_1_MAX_BLOCKS }, (_, offset) => {
    const block = buildMasteryBlock(offset + 1, rng);
    block.forEach(report);
    return block;
  });
  const sequence: TopLevelSequenceItem[] = [
    { kind: "rest", id: newId(), units: [control(training1WelcomeText())] },
    { kind: "rest", id: newId(), units: [control(training1StructureText())] },
    { kind: "rest", id: newId(), units: [control(training1AnchorText())] },
    {
      kind: "practice", id: "training-1-anchor-demo",
      children: anchors.map((unit) => makeTrial(unit, false)),
    },
    { kind: "rest", id: newId(), units: [control(training1ReportText())] },
    ...blocks.map((block, offset) => ({
      kind: "practice" as const,
      id: training1MasterySegmentId(offset + 1),
      children: block.map((unit) => makeTrial(unit, true)),
    })),
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

export function assertTraining1RuntimeStimulusSet(
  set: ExperimentTraining1StimulusSet,
): void {
  const practices = set.sequence.filter((item) => item.kind === "practice");
  if (practices.length !== 1 + TRAINING_1_MAX_BLOCKS) throw new Error("训练一阶段数量错误");
  if (practices[0]!.children.length !== TRAINING_1_DEMO_TRIALS) throw new Error("训练一锚点数量错误");
  const allUnits = practices.flatMap((segment) => segment.children).flatMap((trial) =>
    trial.units.filter((unit): unit is SpeedColorTrainingStimulusUnit =>
      unit.type === "speedColorTrainingStimulus"));
  const anchors = allUnits.filter((unit) => unit.mode === "demonstration");
  TRAINING_1_ANCHOR_POSITIONS.forEach((position, index) => {
    if (Math.abs(anchors[index]!.targetStripPosition - position) > 1e-9) {
      throw new Error(`训练一锚点 ${index} 错误`);
    }
  });
  for (let blockIndex = 1; blockIndex <= TRAINING_1_MAX_BLOCKS; blockIndex += 1) {
    const block = allUnits.filter((unit) => unit.blockIndex === blockIndex);
    if (block.length !== TRAINING_1_BLOCK_SIZE) throw new Error(`训练一 Block ${blockIndex} 数量错误`);
    const bins = new Set(block.map((unit) => unit.targetBinIndex));
    if (bins.size !== TRAINING_1_BLOCK_SIZE) throw new Error(`训练一 Block ${blockIndex} 区间覆盖错误`);
    for (const unit of block) {
      const bin = unit.targetBinIndex!;
      if (unit.targetStripPosition < bin / TRAINING_1_BLOCK_SIZE ||
          unit.targetStripPosition >= (bin + 1) / TRAINING_1_BLOCK_SIZE) {
        throw new Error(`训练一 Block ${blockIndex} 目标超出区间`);
      }
    }
  }
  if (allUnits.length !== TRAINING_1_DEMO_TRIALS + TRAINING_1_MAX_REPORT_TRIALS) {
    throw new Error("训练一总试次数错误");
  }
}

export async function generateTraining1RuntimeStimulusSetAsync(
  participant: Training1ParticipantInfo,
  options: GenerateTraining1RuntimeSetOptions = {},
): Promise<ExperimentTraining1StimulusSet> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return generateTraining1RuntimeStimulusSet(participant, options);
}
