import {
  assertExperiment4RuntimeStimulusSet,
  generateExperiment4RuntimeStimulusSet,
} from "../../src/experiments/experiment-4/generateRuntimeSet.ts";
import {
  bobVisibilityAtTime,
  gratingPeriodM,
  queryableWindows,
  sampleQueryTimeSec,
  buildOcclusionTimeline,
  pendulumParamsForInitialState,
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
  EXPERIMENT_4_INITIAL_SIDE_SEQUENCE,
  EXPERIMENT_4_OMEGA_MAX_RAD_PER_SEC,
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
import { analyzePendulum, pendulumRegime } from "../../src/experiment/physics/pendulum.ts";
import {
  SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC,
  SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC,
  SPEED_STRIP_SCALE_ENERGY_J,
  speedStripPositionFromAbsOmegaRadPerSec,
} from "../../src/experiment/physics/speedStripScale.ts";
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
assert(set.schemaVersion === 4, "实验四刺激 schema 应为 4");
assert(parseExperiment4StimulusSet({ ...set, schemaVersion: 3 }) === null, "旧 schema 3 缓存应失效");
assert(SPEED_STRIP_SCALE_ENERGY_J === 11.48, "实验四色带应按 11.48 J 标定");
assert(
  Math.abs(SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC - Math.sqrt(2 * 11.48)) < 1e-12,
  "实验四色带最高线速度应为 11.48 J 在最低点的速度",
);
assert(
  SPEED_STRIP_OMEGA_SCALE_RAD_PER_SEC === EXPERIMENT_4_OMEGA_MAX_RAD_PER_SEC,
  "实验四最高角速度应与色带右端一致",
);

const descriptors = collectExperiment4TrialDescriptors(set);
assert(!JSON.stringify(set).includes("energy_level"), "实验四不得重新引入能量档位字段");
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

for (const d of descriptors) {
  assert(
    Math.abs(d.pendulum_E_J - EXPERIMENT_4_ENERGY_CENTER_J) < 1e-9,
    `能量应固定为区间中点 ${EXPERIMENT_4_ENERGY_CENTER_J} J: ${d.pendulum_E_J}`,
  );
}

for (const d of formal) {
  assert(d.duration_sec === 10 && d.query_time_sec <= 10, "询问时刻应不超过 10 s");
  assert(
    pendulumRegime(
      d.pendulum_E_J,
      EXPERIMENT_4_ROD_LENGTH_M,
      EXPERIMENT_4_GRAVITY,
    ) === "oscillation",
    "实验四不得包含转动试次",
  );
  assert(
    Math.abs(d.omega_0_rad_per_sec) > 1e-9,
    `初始角速度必须非零: ${d.trial_id}`,
  );
  assert(
    (d.initial_side === "left" && d.theta_0_deg < 0) ||
      (d.initial_side === "right" && d.theta_0_deg > 0),
    `初始角符号应与初始位置侧一致: ${d.trial_id}`,
  );
  assert(
    (d.initial_direction === "leftward" && d.omega_0_rad_per_sec < 0) ||
      (d.initial_direction === "rightward" && d.omega_0_rad_per_sec > 0),
    `初始角速度符号应与运动方向一致: ${d.trial_id}`,
  );
  const expectedOmegaMax = Math.sqrt(
    (2 * d.pendulum_E_J) /
      (EXPERIMENT_4_ROD_LENGTH_M * EXPERIMENT_4_ROD_LENGTH_M),
  );
  assert(
    Math.abs(d.omega_max_rad_per_sec - expectedOmegaMax) < 1e-9,
    `固定能量轨道的最低点最大角速度应正确: ${d.trial_id}`,
  );
  assert(
    d.linear_speed_q_m_per_sec <= SPEED_STRIP_LINEAR_V_SCALE_M_PER_SEC + 1e-9 &&
      speedStripPositionFromAbsOmegaRadPerSec(d.abs_omega_q_rad_per_sec) <= 1,
    `实验四真实速度不得超过色带右端: ${d.trial_id}`,
  );
  const params = {
    theta0Rad: d.theta_0_rad,
    omega0RadPerSec: d.omega_0_rad_per_sec,
    rodLengthM: d.rod_length_m,
    gravity: d.gravity_m_per_sec2,
  };
  assert(
    Math.abs(analyzePendulum(params).E - d.pendulum_E_J) < 1e-9,
    `随机初始状态必须保持目标机械能: ${d.trial_id}`,
  );
  assert(
    bobVisibilityAtTime(d.query_time_sec, params, d.gap_m) === "fully_occluded",
    `t_q 应遮挡 ${d.trial_id}`,
  );
  assert(
    d.query_grating_index ===
      Math.round(
        (d.rod_length_m * Math.sin(d.theta_q_rad)) / gratingPeriodM(d.gap_m),
      ),
    `询问光栅条编号应与真值位置一致: ${d.trial_id}`,
  );
}

assert(
  new Set(formal.map((d) => d.pendulum_E_J.toFixed(8))).size === 1,
  "正式试次能量应固定为同一值",
);
assert(
  new Set(formal.map((d) => d.theta_0_deg.toFixed(6))).size > 50,
  "正式试次初始位置应随随机相位连续变化",
);

assertGapGeometry(EXPERIMENT_4_GAP_LEVELS.small);
assertGapGeometry(EXPERIMENT_4_GAP_LEVELS.medium);
assertGapGeometry(EXPERIMENT_4_GAP_LEVELS.large);

assert(Math.abs(angleDegFromX(1.1) - 16.0) < 0.3, "中央遮挡外缘角度");
assert(Math.abs(angleDegFromX(1.55) - 22.8) < 0.3, "小档间隙内缘角度");
assert(Math.abs(angleDegFromX(3.75) - 69.6) < 0.3, "小档外侧角度");
assert(Math.abs(angleDegFromX(2.0) - 30.0) < 0.3, "中档间隙内缘角度");
assert(Math.abs(angleDegFromX(2.45) - 37.8) < 0.3, "大档间隙内缘角度");

const blockSides = new Map<string, { left: number; right: number }>();
for (const d of formal) {
  const key = d.gap_level;
  const entry = blockSides.get(key) ?? { left: 0, right: 0 };
  entry[d.initial_side] += 1;
  blockSides.set(key, entry);
}
for (const level of Object.keys(EXPERIMENT_4_GAP_LEVELS)) {
  const counts = blockSides.get(level);
  assert(counts && counts.left === 10 && counts.right === 10, `${level} 左右计数`);
}

assert(
  EXPERIMENT_4_INITIAL_SIDE_SEQUENCE.length === 20,
  "固定初始位置侧序列长度",
);

for (const blockIndex of [1, 2, 3]) {
  const rows = formal
    .filter((d) => d.block_index === blockIndex)
    .sort((a, b) => a.trial_index_in_block - b.trial_index_in_block);
  assert(rows.length === 20, `区组 ${blockIndex} 应有 20 条`);
  rows.forEach((d, i) => {
    assert(
      d.initial_side === EXPERIMENT_4_INITIAL_SIDE_SEQUENCE[i],
      `区组 ${blockIndex} 第 ${i + 1} 条应按固定左右序列呈现`,
    );
  });
  for (const side of ["left", "right"] as const) {
    const angleFirst = rows.filter(
      (d) => d.initial_side === side && d.response_order === "angle_first",
    ).length;
    assert(angleFirst === 5, `区组 ${blockIndex} ${side} 先报角度应为 5，实际 ${angleFirst}`);
    const leftward = rows.filter(
      (d) => d.initial_side === side && d.initial_direction === "leftward",
    ).length;
    assert(leftward === 5, `区组 ${blockIndex} ${side} 向左初速度应为 5，实际 ${leftward}`);
  }
}

// 按窗口时长抽样：3 倍长的遮挡窗口应占据 3 倍随机数测度。
const weightedWindows = [
  { tMinSec: 0, tMaxSec: 0.7, segmentIndex: 0, samplingWeightSec: 1 },
  { tMinSec: 2, tMaxSec: 4.7, segmentIndex: 1, samplingWeightSec: 3 },
];
assert(sampleQueryTimeSec(weightedWindows, () => 0.2).segmentIndex === 0, "短窗口权重");
assert(sampleQueryTimeSec(weightedWindows, () => 0.3).segmentIndex === 1, "长窗口权重");

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

for (const side of ["left", "right"] as const) {
  for (const direction of ["leftward", "rightward"] as const) {
    const params = pendulumParamsForInitialState(
      side,
      direction,
      EXPERIMENT_4_ENERGY_CENTER_J,
      () => 0.5,
    );
    assert(Math.abs(params.omega0RadPerSec) > 1e-9, "四种初始分支均应有非零速度");
    assert(Math.abs(analyzePendulum(params).E - EXPERIMENT_4_ENERGY_CENTER_J) < 1e-9, "初相位不得改变能量");
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
assert(csv.includes("initial_direction"), "CSV 应导出初始运动方向");
assert(csv.includes("query_grating_index"), "CSV 应导出询问光栅条编号");
assert(csv.includes("speed_scale_energy_j"), "CSV 应导出色带标定能量");
assert(csv.includes("speed_scale_linear_v_max_m_per_sec"), "CSV 应导出最高线速度");
assert(csv.includes("linear_speed_reported_m_per_sec"), "CSV 应导出报告线速度");
assert(csv.includes("delta_linear_speed_m_per_sec"), "CSV 应导出线速度误差");

console.log("verify-experiment-4: OK");
