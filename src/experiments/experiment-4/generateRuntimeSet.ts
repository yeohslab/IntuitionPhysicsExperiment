import { cryptoRandom, shuffleInPlace } from "../../experiment/stimulus/cryptoRandom";
import { EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION } from "../../shared/experimentTypes";
import type {
  BlockSegment,
  Experiment4StimulusSet,
  GratingPendulumStimulusUnit,
  PracticeSegment,
  RestSegment,
  TextControlUnit,
  TextDisplayUnit,
  TopLevelSequenceItem,
  Trial,
} from "../../shared/experimentTypes";
import { newId } from "../../shared/ids";
import { analyzePendulum, pendulumThetaOmegaAt } from "../../experiment/physics/pendulum";
import { radToDeg } from "../../experiment/physics/pendulumArcScore";
import {
  bobVisibilityAtTime,
  fullyVisibleIntervalsBetween,
  gratingBarIndexAtX,
  gratingGeometryForVisibleWindowCount,
  pendulumParamsForRelease,
  planTrialQuery,
} from "./grating";
import {
  experiment4BlockRestText,
  experiment4PracticeText,
  experiment4InitialCueText,
  experiment4StructureText,
  experiment4WelcomeText,
  EXPERIMENT_4_FIXATION_TEXT,
} from "./instructions";
import {
  EXPERIMENT_4_BOB_RADIUS_M,
  EXPERIMENT_4_DURATION_SEC,
  EXPERIMENT_4_ENERGY_CENTER_J,
  EXPERIMENT_4_FIXATION_MS,
  EXPERIMENT_4_INITIAL_CUE_MS,
  EXPERIMENT_4_FORMAL_BLOCKS,
  EXPERIMENT_4_FORMAL_TRIALS_PER_BLOCK,
  EXPERIMENT_4_VISIBLE_WINDOW_COUNT_ORDER,
  EXPERIMENT_4_PRACTICE_TRIALS,
  EXPERIMENT_4_INITIAL_SIDE_SEQUENCE,
  EXPERIMENT_4_TOTAL_RUNTIME_TRIALS,
  type Experiment4InitialDirection,
  type Experiment4ResponseOrder,
  type Experiment4VisibleWindowCount,
} from "./protocol";

export type GenerateExperiment4RuntimeSetOptions = {
  onProgress?: (completedTrials: number, totalTrials: number) => void;
  rng?: () => number;
};

function makeTextControl(text: string): TextControlUnit {
  return { id: newId(), type: "textControl", text, key: " " };
}

function makeFixation(): TextDisplayUnit {
  return {
    id: newId(),
    type: "textDisplay",
    text: EXPERIMENT_4_FIXATION_TEXT,
    durationMs: EXPERIMENT_4_FIXATION_MS,
  };
}

function makeInitialCue(
  side: "left" | "right",
  direction: Experiment4InitialDirection,
): TextDisplayUnit {
  return {
    id: newId(),
    type: "textDisplay",
    text: experiment4InitialCueText(side, direction),
    durationMs: EXPERIMENT_4_INITIAL_CUE_MS,
  };
}

function makeRest(text: string): RestSegment {
  return { kind: "rest", id: newId(), units: [makeTextControl(text)] };
}

function buildGratingUnit(
  side: "left" | "right",
  direction: Experiment4InitialDirection,
  visibleWindowCount: Experiment4VisibleWindowCount,
  responseOrder: Experiment4ResponseOrder,
  rng: () => number,
): GratingPendulumStimulusUnit {
  const planned = planTrialQuery(side, direction, visibleWindowCount, rng);
  const {
    params, energyJ, geometry, tQuerySec, occlusionSegmentIndex,
    timeline, firstVisibleSec, queryBarIndex,
  } = planned;
  return {
    id: newId(),
    type: "gratingPendulumStimulus",
    theta0Deg: radToDeg(params.theta0Rad),
    omega0DegPerSec: radToDeg(params.omega0RadPerSec),
    rodLengthM: params.rodLengthM,
    gravity: params.gravity,
    energyJ,
    durationSec: EXPERIMENT_4_DURATION_SEC,
    queryTimeSec: tQuerySec,
    visibleWindowCount,
    gapM: geometry.gapM,
    barWidthM: geometry.barWidthM,
    gratingPeriodM: geometry.periodM,
    gratingOffsetM: geometry.offsetM,
    bobRadiusM: EXPERIMENT_4_BOB_RADIUS_M,
    initialSide: side,
    initialDirection: direction,
    responseOrder,
    occlusionSegmentIndex,
    queryBarIndex,
    occlusionTimeline: timeline.map((s) => ({
      kind: s.kind,
      tStartSec: s.tStartSec,
      tEndSec: s.tEndSec,
    })),
    firstVisibleSec,
  };
}

function makeTrial(
  side: "left" | "right",
  direction: Experiment4InitialDirection,
  visibleWindowCount: Experiment4VisibleWindowCount,
  responseOrder: Experiment4ResponseOrder,
  rng: () => number,
): Trial {
  return {
    id: newId(),
    units: [
      makeInitialCue(side, direction),
      makeFixation(),
      buildGratingUnit(side, direction, visibleWindowCount, responseOrder, rng),
    ],
  };
}

/** 每个初始位置侧内，向左/向右各占一半，并随机落到具体试次。 */
function balancedInitialDirectionsBySide(
  sides: readonly ("left" | "right")[],
  rng: () => number,
): Experiment4InitialDirection[] {
  const directions: Experiment4InitialDirection[] = new Array(sides.length);
  for (const side of ["left", "right"] as const) {
    const indices = sides.flatMap((s, i) => (s === side ? [i] : []));
    const pool = indices.map((_, k): Experiment4InitialDirection =>
      k < indices.length / 2 ? "leftward" : "rightward",
    );
    shuffleInPlace(pool, rng);
    indices.forEach((trialIndex, k) => {
      directions[trialIndex] = pool[k]!;
    });
  }
  return directions;
}

/** 与初始位置侧交叉平衡：每侧 10 条中两种汇报顺序各 5 条，随机分配到具体试次。 */
function balancedResponseOrdersBySide(
  sides: readonly ("left" | "right")[],
  rng: () => number,
): Experiment4ResponseOrder[] {
  const orders: Experiment4ResponseOrder[] = new Array(sides.length);
  for (const side of ["left", "right"] as const) {
    const indices = sides.flatMap((s, i) => (s === side ? [i] : []));
    if (indices.length % 2 !== 0) {
      throw new Error(`${side} 初始位置试次数 ${indices.length} 不能平分两种汇报顺序`);
    }
    const pool: Experiment4ResponseOrder[] = indices.map((_, k) =>
      k < indices.length / 2 ? "angle_first" : "speed_first",
    );
    shuffleInPlace(pool, rng);
    indices.forEach((trialIndex, k) => {
      orders[trialIndex] = pool[k]!;
    });
  }
  return orders;
}

function makeFormalBlock(
  visibleWindowCount: Experiment4VisibleWindowCount,
  rng: () => number,
  onTrial?: () => void,
): BlockSegment {
  const orders = balancedResponseOrdersBySide(EXPERIMENT_4_INITIAL_SIDE_SEQUENCE, rng);
  const directions = balancedInitialDirectionsBySide(EXPERIMENT_4_INITIAL_SIDE_SEQUENCE, rng);
  const children = EXPERIMENT_4_INITIAL_SIDE_SEQUENCE.map((side, index) => {
    const trial = makeTrial(side, directions[index]!, visibleWindowCount, orders[index]!, rng);
    onTrial?.();
    return trial;
  });
  return { kind: "block", id: newId(), children };
}

function makePracticeBlock(rng: () => number, onTrial?: () => void): PracticeSegment {
  const conditions = [...EXPERIMENT_4_VISIBLE_WINDOW_COUNT_ORDER];
  shuffleInPlace(conditions, rng);
  const orders: Experiment4ResponseOrder[] = [
    "angle_first",
    "speed_first",
    rng() < 0.5 ? "angle_first" : "speed_first",
  ];
  shuffleInPlace(orders, rng);
  const children = conditions.map((visibleWindowCount, index) => {
    const side: "left" | "right" = rng() < 0.5 ? "left" : "right";
    const direction: Experiment4InitialDirection = rng() < 0.5 ? "leftward" : "rightward";
    const trial = makeTrial(side, direction, visibleWindowCount, orders[index]!, rng);
    onTrial?.();
    return trial;
  });
  return { kind: "practice", id: newId(), children };
}

function stimulusFromTrial(trial: Trial): GratingPendulumStimulusUnit {
  const unit = trial.units.find(
    (u): u is GratingPendulumStimulusUnit => u.type === "gratingPendulumStimulus",
  );
  if (!unit) throw new Error(`Trial ${trial.id} 缺少 gratingPendulumStimulus`);
  return unit;
}

export function assertExperiment4RuntimeStimulusSet(set: Experiment4StimulusSet): void {
  if (set.schemaVersion !== EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION) {
    throw new Error(
      `实验四刺激集 schema 应为 ${EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION}`,
    );
  }
  const practices = set.sequence.filter((s) => s.kind === "practice");
  const blocks = set.sequence.filter((s) => s.kind === "block");
  if (practices.length !== 1) {
    throw new Error(`练习 Block 应为 1，实际 ${practices.length}`);
  }
  if (practices[0]!.children.length !== EXPERIMENT_4_PRACTICE_TRIALS) {
    throw new Error(`练习试次应为 ${EXPERIMENT_4_PRACTICE_TRIALS}`);
  }
  const practiceOrders = new Set(
    practices[0]!.children.map((trial) => stimulusFromTrial(trial).responseOrder),
  );
  if (practiceOrders.size !== 2) {
    throw new Error("练习中两种汇报顺序都应出现");
  }
  if (blocks.length !== EXPERIMENT_4_FORMAL_BLOCKS) {
    throw new Error(`正式 Block 应为 ${EXPERIMENT_4_FORMAL_BLOCKS}`);
  }
  const visibleWindowCountsSeen = new Set<Experiment4VisibleWindowCount>();
  for (const block of blocks) {
    if (block.children.length !== EXPERIMENT_4_FORMAL_TRIALS_PER_BLOCK) {
      throw new Error("正式 Block 试次数错误");
    }
    const sides = { left: 0, right: 0 };
    const angleFirstBySide = { left: 0, right: 0 };
    const leftwardBySide = { left: 0, right: 0 };
    let visibleWindowCount: Experiment4VisibleWindowCount | null = null;
    for (const [index, trial] of block.children.entries()) {
      const unit = stimulusFromTrial(trial);
      visibleWindowCount = visibleWindowCount ?? unit.visibleWindowCount;
      if (unit.visibleWindowCount !== visibleWindowCount) {
        throw new Error("同一 Block 内可见窗口数条件应一致");
      }
      const expectedGeometry = gratingGeometryForVisibleWindowCount(
        unit.visibleWindowCount,
      );
      if (
        Math.abs(unit.gapM - expectedGeometry.gapM) > 1e-9 ||
        Math.abs(unit.barWidthM - expectedGeometry.barWidthM) > 1e-9 ||
        Math.abs(unit.gratingPeriodM - expectedGeometry.periodM) > 1e-9 ||
        Math.abs(unit.gratingOffsetM - expectedGeometry.offsetM) > 1e-9
      ) {
        throw new Error("实验四光栅几何与可见窗口数条件不一致");
      }
      if (unit.initialSide !== EXPERIMENT_4_INITIAL_SIDE_SEQUENCE[index]) {
        throw new Error(`Block 内第 ${index + 1} 条初始位置侧不符合固定序列`);
      }
      sides[unit.initialSide] += 1;
      if (unit.responseOrder === "angle_first") angleFirstBySide[unit.initialSide] += 1;
      if (unit.initialDirection === "leftward") leftwardBySide[unit.initialSide] += 1;
      const params = {
        theta0Rad: (unit.theta0Deg * Math.PI) / 180,
        omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
        rodLengthM: unit.rodLengthM,
        gravity: unit.gravity,
      };
      const analysis = analyzePendulum(params);
      const actualEnergyJ = analysis.E;
      if (analysis.regime !== "oscillation") {
        throw new Error(`实验四仅允许摆动，实际运动类型为 ${analysis.regime}`);
      }
      if (Math.abs(unit.energyJ - EXPERIMENT_4_ENERGY_CENTER_J) > 1e-9) {
        throw new Error(
          `试次能量 ${unit.energyJ} J 应为固定值 ${EXPERIMENT_4_ENERGY_CENTER_J} J`,
        );
      }
      if (Math.abs(actualEnergyJ - unit.energyJ) > 1e-9) {
        throw new Error(
          `初始状态能量 ${actualEnergyJ} J 与目标 ${unit.energyJ} J 不一致`,
        );
      }
      if (Math.abs(params.omega0RadPerSec) <= 1e-9) {
        throw new Error("实验四初始角速度必须非零");
      }
      if (
        (unit.initialDirection === "leftward" && params.omega0RadPerSec >= 0) ||
        (unit.initialDirection === "rightward" && params.omega0RadPerSec <= 0)
      ) {
        throw new Error("初始运动方向与角速度符号不一致");
      }
      const vis = bobVisibilityAtTime(unit.queryTimeSec, params, expectedGeometry);
      if (vis !== "fully_occluded") {
        throw new Error(`t_q=${unit.queryTimeSec} 非完全遮挡`);
      }
      const queryState = pendulumThetaOmegaAt(unit.queryTimeSec, params, analysis);
      const expectedBarIndex = gratingBarIndexAtX(
        unit.rodLengthM * Math.sin(queryState.theta),
        expectedGeometry,
      );
      if (unit.queryBarIndex !== expectedBarIndex) {
        throw new Error(`询问光栅条编号不一致：${unit.queryBarIndex} / ${expectedBarIndex}`);
      }
    }
    if (sides.left !== 10 || sides.right !== 10) {
      throw new Error(`左右初始位置应为 10/10，实际 ${sides.left}/${sides.right}`);
    }
    if (angleFirstBySide.left !== 5 || angleFirstBySide.right !== 5) {
      throw new Error(
        `每侧先报角度应为 5 条，实际 左 ${angleFirstBySide.left} / 右 ${angleFirstBySide.right}`,
      );
    }
    if (leftwardBySide.left !== 5 || leftwardBySide.right !== 5) {
      throw new Error(
        `每侧向左初速度应为 5 条，实际 左 ${leftwardBySide.left} / 右 ${leftwardBySide.right}`,
      );
    }
    visibleWindowCountsSeen.add(visibleWindowCount!);
  }
  if (visibleWindowCountsSeen.size !== EXPERIMENT_4_VISIBLE_WINDOW_COUNT_ORDER.length) {
    throw new Error("应覆盖 N=2/3/4 三档可见窗口数");
  }
  const release = pendulumParamsForRelease("right", EXPERIMENT_4_ENERGY_CENTER_J);
  const xMaxM = release.rodLengthM * Math.sin(Math.abs(release.theta0Rad));
  for (const count of EXPERIMENT_4_VISIBLE_WINDOW_COUNT_ORDER) {
    const geometry = gratingGeometryForVisibleWindowCount(count);
    const intervals = fullyVisibleIntervalsBetween(-xMaxM, xMaxM, geometry);
    if (intervals.length !== count) {
      throw new Error(`N=${count} 实际完整可见窗口数为 ${intervals.length}`);
    }
    for (const interval of intervals) {
      if (Math.abs(
        interval.xEndM - interval.xStartM -
        (geometry.gapM - 2 * EXPERIMENT_4_BOB_RADIUS_M)
      ) > 1e-9) {
        throw new Error(`N=${count} 完整可见窗口宽度错误`);
      }
    }
  }
}

export function generateExperiment4RuntimeStimulusSet(
  options: GenerateExperiment4RuntimeSetOptions = {},
): Experiment4StimulusSet {
  const rng = options.rng ?? cryptoRandom();
  let completed = 0;
  const report = () => {
    completed += 1;
    options.onProgress?.(completed, EXPERIMENT_4_TOTAL_RUNTIME_TRIALS);
  };
  const formalBlocks = EXPERIMENT_4_VISIBLE_WINDOW_COUNT_ORDER.map((count) =>
    makeFormalBlock(count, rng, report),
  );
  shuffleInPlace(formalBlocks, rng);
  const sequence: TopLevelSequenceItem[] = [
    makeRest(experiment4WelcomeText()),
    makeRest(experiment4StructureText()),
    makeRest(experiment4PracticeText()),
    makePracticeBlock(rng, report),
  ];
  formalBlocks.forEach((block, index) => {
    sequence.push(
      makeRest(experiment4BlockRestText(index + 1, EXPERIMENT_4_FORMAL_BLOCKS)),
      block,
    );
  });
  const set: Experiment4StimulusSet = {
    schemaVersion: EXPERIMENT_4_STIMULUS_SET_SCHEMA_VERSION,
    sequence,
  };
  assertExperiment4RuntimeStimulusSet(set);
  return set;
}

export async function generateExperiment4RuntimeStimulusSetAsync(
  options: GenerateExperiment4RuntimeSetOptions = {},
): Promise<Experiment4StimulusSet> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  return generateExperiment4RuntimeStimulusSet(options);
}
