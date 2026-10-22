import {
  assertExperiment4RuntimeStimulusSet,
  generateExperiment4RuntimeStimulusSet,
} from "../../src/experiments/experiment-4/generateRuntimeSet.ts";
import {
  bobVisibilityAtTime,
  gratingPeriodM,
  queryableWindows,
  buildOcclusionTimeline,
  pendulumParamsForRelease,
  firstFullyVisibleTimeSec,
} from "../../src/experiments/experiment-4/grating.ts";
import {
  EXPERIMENT_4_BAR_WIDTH_M,
  EXPERIMENT_4_BOB_RADIUS_M,
  EXPERIMENT_4_DURATION_SEC,
  EXPERIMENT_4_ENERGY_CENTER_J,
  EXPERIMENT_4_ENERGY_MAX_J,
  EXPERIMENT_4_ENERGY_MIN_J,
  EXPERIMENT_4_FORMAL_TRIALS,
  EXPERIMENT_4_GAP_LEVELS,
  EXPERIMENT_4_GRAVITY,
  EXPERIMENT_4_RELEASE_SIDE_SEQUENCE,
  EXPERIMENT_4_ROD_LENGTH_M,
} from "../../src/experiments/experiment-4/protocol.ts";
import {
  buildExperiment4StimulusTrialsCsv,
  classifyExperiment4Status,
  experiment4DataFilename,
} from "../../src/experiments/experiment-4/exportStimulusCsv.ts";
import { collectExperiment4TrialDescriptors } from "../../src/experiments/experiment-4/trialDescriptor.ts";
import {
  buildExperiment4SubjectId,
  isExperiment4ParticipantInfo,
} from "../../src/shared/participant.ts";
import { parseExperiment4StimulusSet } from "../../src/shared/storage.ts";
import { pendulumRegime } from "../../src/experiment/physics/pendulum.ts";
import {
  GRATING_CANVAS_LOGICAL_H,
  GRATING_CANVAS_LOGICAL_W,
  GRATING_EDGE_MARGIN_PX,
  gratingWorldLayout,
  pendulumLayoutFromGratingLayout,
  worldToCanvas,
} from "../../src/experiment/physics/render/gratingCanvas.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function classifyBobAtXExport(xM: number, gapM: number) {
  const r = EXPERIMENT_4_BOB_RADIUS_M;
  const halfBar = EXPERIMENT_4_BAR_WIDTH_M / 2;
  const period = gratingPeriodM(gapM);
  const n = Math.round(xM / period);
  const center = n * period;
  const d = Math.abs(xM - center);
  if (d <= halfBar - r) return "fully_occluded";
  if (d >= halfBar + r && d <= period - halfBar - r) return "fully_visible";
  return "partial";
}

// re-export for angle boundary checks
function classifyBobAtXLocal(x: number, gap: number) {
  return classifyBobAtXExport(x, gap);
}

function angleDegFromX(xM: number): number {
  return (Math.asin(xM / EXPERIMENT_4_ROD_LENGTH_M) * 180) / Math.PI;
}

function assertGapGeometry(gapM: number): void {
  const period = gratingPeriodM(gapM);
  assert(Math.abs(period - (EXPERIMENT_4_BAR_WIDTH_M + gapM)) < 1e-9, "周期");
  const halfBar = EXPERIMENT_4_BAR_WIDTH_M / 2;
  const gapInner = halfBar + EXPERIMENT_4_BOB_RADIUS_M + 0.05;
  const gapOuter = period - halfBar - EXPERIMENT_4_BOB_RADIUS_M - 0.05;
  const xMidGap = (gapInner + gapOuter) / 2;
  assert(classifyBobAtXLocal(xMidGap, gapM) === "fully_visible", "间隙中部应完全可见");
  assert(classifyBobAtXLocal(0, gapM) === "fully_occluded", "中心应遮挡");
}

const participant = {
  subject_id: buildExperiment4SubjectId("0001"),
  gender_code: 0 as const,
  age_years: 22,
};
assert(isExperiment4ParticipantInfo(participant));

const set = generateExperiment4RuntimeStimulusSet({ rng: mulberry32(42) });
assertExperiment4RuntimeStimulusSet(set);

const descriptors = collectExperiment4TrialDescriptors(set);
const formal = descriptors.filter((d) => d.segment_kind === "block");
assert(formal.length === EXPERIMENT_4_FORMAL_TRIALS, "正式描述符数量");
assert(EXPERIMENT_4_DURATION_SEC === 10, "实验四规划地平线应为 10 s");

const worldLayout = gratingWorldLayout();
const expectedPxPerM =
  (GRATING_CANVAS_LOGICAL_W - 2 * GRATING_EDGE_MARGIN_PX) /
  (2 * (EXPERIMENT_4_ROD_LENGTH_M + EXPERIMENT_4_BOB_RADIUS_M));
assert(GRATING_CANVAS_LOGICAL_W === 1000, "光栅画布宽度应为 1000");
assert(GRATING_CANVAS_LOGICAL_H === 560, "光栅画布高度应为 560");
assert(
  Math.abs(worldLayout.pxPerM - expectedPxPerM) < 1e-9,
  "下半圆画面应使用统一米制比例",
);
const reachM = EXPERIMENT_4_ROD_LENGTH_M + EXPERIMENT_4_BOB_RADIUS_M;
const leftEdge = worldToCanvas(worldLayout, -reachM, 0);
const rightEdge = worldToCanvas(worldLayout, reachM, 0);
const bottomEdge = worldToCanvas(worldLayout, 0, -reachM);
assert(
  Math.abs(leftEdge.x - GRATING_EDGE_MARGIN_PX) < 1e-9 &&
    Math.abs(rightEdge.x - (GRATING_CANVAS_LOGICAL_W - GRATING_EDGE_MARGIN_PX)) < 1e-9,
  "下半圆左右留白应对称",
);
assert(
  Math.abs(worldLayout.originY - (GRATING_CANVAS_LOGICAL_H - bottomEdge.y)) < 1e-9 &&
    worldLayout.originY >= GRATING_EDGE_MARGIN_PX,
  "下半圆上下留白应对称且不小于边距",
);
const pendulumLayout = pendulumLayoutFromGratingLayout(
  worldLayout,
  EXPERIMENT_4_ROD_LENGTH_M,
);
assert(
  pendulumLayout.anchorX === worldLayout.originX &&
    pendulumLayout.anchorY === worldLayout.originY &&
    Math.abs(
      pendulumLayout.rodPx - EXPERIMENT_4_ROD_LENGTH_M * worldLayout.pxPerM,
    ) < 1e-9,
  "刺激、作答与反馈应共用同一悬点与 4 m 比例",
);

for (const gapM of Object.values(EXPERIMENT_4_GAP_LEVELS)) {
  const periodM = gratingPeriodM(gapM);
  const barPx = EXPERIMENT_4_BAR_WIDTH_M * worldLayout.pxPerM;
  const gapPx = gapM * worldLayout.pxPerM;
  const periodPx = periodM * worldLayout.pxPerM;
  assert(Math.abs(barPx + gapPx - periodPx) < 1e-9, "光栅米制比例应一致");
  assert(
    Math.abs(barPx / periodPx - EXPERIMENT_4_BAR_WIDTH_M / periodM) < 1e-12,
    "光栅遮挡比例应与物理尺寸一致",
  );
}

for (const d of formal) {
  assert(
    d.pendulum_E_J >= EXPERIMENT_4_ENERGY_MIN_J - 1e-9 &&
      d.pendulum_E_J <= EXPERIMENT_4_ENERGY_MAX_J + 1e-9,
    `能量应在预注册区间内: ${d.pendulum_E_J}`,
  );
  assert(d.duration_sec === 10 && d.query_time_sec <= 10, "询问时刻应不超过 10 s");
  assert(
    pendulumRegime(
      d.pendulum_E_J,
      EXPERIMENT_4_ROD_LENGTH_M,
      EXPERIMENT_4_GRAVITY,
    ) === "oscillation",
    "实验四不得包含转动试次",
  );
  const expectedThetaAbsDeg =
    (Math.acos(
      1 -
        d.pendulum_E_J /
          (EXPERIMENT_4_GRAVITY * EXPERIMENT_4_ROD_LENGTH_M),
    ) *
      180) /
    Math.PI;
  assert(
    Math.abs(Math.abs(d.theta_0_deg) - expectedThetaAbsDeg) < 1e-9,
    `初始角应为能量对应的转折点: ${d.trial_id}`,
  );
  assert(
    (d.release_side === "left" && d.theta_0_deg < 0) ||
      (d.release_side === "right" && d.theta_0_deg > 0),
    `初始角符号应与释放侧一致: ${d.trial_id}`,
  );
  const expectedOmegaMax = Math.sqrt(
    (2 * d.pendulum_E_J) /
      (EXPERIMENT_4_ROD_LENGTH_M * EXPERIMENT_4_ROD_LENGTH_M),
  );
  assert(
    Math.abs(d.omega_max_rad_per_sec - expectedOmegaMax) < 1e-9,
    `速度色带上限应逐试次匹配能量: ${d.trial_id}`,
  );
  const params = pendulumParamsForRelease(d.release_side, d.pendulum_E_J);
  assert(
    bobVisibilityAtTime(d.query_time_sec, params, d.gap_m) === "fully_occluded",
    `t_q 应遮挡 ${d.trial_id}`,
  );
}

assert(
  new Set(formal.map((d) => d.pendulum_E_J.toFixed(8))).size > 50,
  "正式试次能量应逐试次连续变化",
);

assertGapGeometry(EXPERIMENT_4_GAP_LEVELS.small);
assertGapGeometry(EXPERIMENT_4_GAP_LEVELS.medium);
assertGapGeometry(EXPERIMENT_4_GAP_LEVELS.large);

assert(Math.abs(angleDegFromX(1.1) - 16.0) < 0.3, "中央遮挡外缘角度");
assert(Math.abs(angleDegFromX(1.55) - 22.8) < 0.3, "小档间隙内缘角度");
assert(Math.abs(angleDegFromX(3.75) - 69.6) < 0.3, "小档释放附近角度");
assert(Math.abs(angleDegFromX(2.0) - 30.0) < 0.3, "中档间隙内缘角度");
assert(Math.abs(angleDegFromX(2.45) - 37.8) < 0.3, "大档间隙内缘角度");

const blockSides = new Map<string, { left: number; right: number }>();
for (const d of formal) {
  const key = d.gap_level;
  const entry = blockSides.get(key) ?? { left: 0, right: 0 };
  entry[d.release_side] += 1;
  blockSides.set(key, entry);
}
for (const level of Object.keys(EXPERIMENT_4_GAP_LEVELS)) {
  const counts = blockSides.get(level);
  assert(counts && counts.left === 10 && counts.right === 10, `${level} 左右计数`);
}

assert(
  EXPERIMENT_4_RELEASE_SIDE_SEQUENCE.length === 20,
  "固定释放序列长度",
);

for (const blockIndex of [1, 2, 3]) {
  const rows = formal
    .filter((d) => d.block_index === blockIndex)
    .sort((a, b) => a.trial_index_in_block - b.trial_index_in_block);
  assert(rows.length === 20, `区组 ${blockIndex} 应有 20 条`);
  rows.forEach((d, i) => {
    assert(
      d.release_side === EXPERIMENT_4_RELEASE_SIDE_SEQUENCE[i],
      `区组 ${blockIndex} 第 ${i + 1} 条应按固定左右序列呈现`,
    );
  });
  for (const side of ["left", "right"] as const) {
    const angleFirst = rows.filter(
      (d) => d.release_side === side && d.response_order === "angle_first",
    ).length;
    assert(angleFirst === 5, `区组 ${blockIndex} ${side} 先报角度应为 5，实际 ${angleFirst}`);
  }
}

const practiceOrders = new Set(
  descriptors.filter((d) => d.segment_kind === "practice").map((d) => d.response_order),
);
assert(practiceOrders.size === 2, "练习中两种汇报顺序都应出现");

const orderPattern = (seed: number) =>
  collectExperiment4TrialDescriptors(
    generateExperiment4RuntimeStimulusSet({ rng: mulberry32(seed) }),
  )
    .filter((d) => d.segment_kind === "block")
    .map((d) => (d.response_order === "angle_first" ? "A" : "S"))
    .join("");
const patterns = new Set([1, 2, 3, 4, 5].map(orderPattern));
assert(patterns.size > 1, "不同随机源应产生不同的汇报顺序分配");

const blockOrderPattern = (seed: number) =>
  collectExperiment4TrialDescriptors(
    generateExperiment4RuntimeStimulusSet({ rng: mulberry32(seed) }),
  )
    .filter((d) => d.segment_kind === "block" && d.trial_index_in_block === 1)
    .map((d) => d.gap_level)
    .join(",");
assert(
  new Set([1, 2, 3, 4, 5].map(blockOrderPattern)).size > 1,
  "三种光栅 Block 顺序应随机化",
);

const legacyUnit = (() => {
  const raw = JSON.parse(JSON.stringify(set)) as {
    sequence: { units?: Record<string, unknown>[]; children?: { units: Record<string, unknown>[] }[] }[];
  };
  for (const item of raw.sequence) {
    for (const trial of item.children ?? []) {
      for (const unit of trial.units) delete unit.responseOrder;
    }
  }
  const parsed = parseExperiment4StimulusSet(raw);
  assert(parsed, "缺少 responseOrder 的旧刺激集应仍可解析");
  const block = parsed.sequence.find((s) => s.kind === "block");
  assert(block && block.kind === "block", "旧刺激集应含正式区组");
  return block.children[0]!.units.find((u) => u.type === "gratingPendulumStimulus");
})();
assert(
  legacyUnit?.type === "gratingPendulumStimulus" && legacyUnit.responseOrder === "angle_first",
  "旧刺激集缺省汇报顺序应按 angle_first 读入",
);

for (const gapM of Object.values(EXPERIMENT_4_GAP_LEVELS)) {
  for (const energyJ of [
    EXPERIMENT_4_ENERGY_MIN_J,
    EXPERIMENT_4_ENERGY_CENTER_J,
    EXPERIMENT_4_ENERGY_MAX_J,
  ]) {
    const params = pendulumParamsForRelease("left", energyJ);
    const timeline = buildOcclusionTimeline(params, gapM);
    const firstVis = firstFullyVisibleTimeSec(timeline);
    const windows = queryableWindows(timeline, EXPERIMENT_4_DURATION_SEC, firstVis);
    const total = windows.reduce((z, w) => z + (w.tMaxSec - w.tMinSec), 0);
    assert(total > 0.1, `gap ${gapM}, energy ${energyJ} 应有可询问窗口`);
  }
}

const fakeRow = {
  trial_type: "grating-pendulum-stimulus",
  segment_kind: "block",
  unit_type: "gratingPendulumStimulus",
  formal_trial_index: 1,
};
const completeRows = Array.from({ length: EXPERIMENT_4_FORMAL_TRIALS }, (_, i) => ({
  ...fakeRow,
  formal_trial_index: i + 1,
}));
assert(classifyExperiment4Status(completeRows, true) === "f");
assert(classifyExperiment4Status(completeRows.slice(0, 10), true) === "nf");
assert(
  experiment4DataFilename(participant.subject_id, "f") ===
    "experiment-4_v1.0_data_subjectE4-0001_f.csv",
  "文件名",
);
const csv = buildExperiment4StimulusTrialsCsv(completeRows, participant, "f");
assert(csv.includes("experiment-4"), "CSV 含 experiment_id");
assert(csv.includes("gap_level") || csv.includes("query_time_sec"), "CSV 列头");
assert(csv.includes("pendulum_E_J"), "CSV 应导出逐试次机械能");

console.log("verify-experiment-4: OK");
