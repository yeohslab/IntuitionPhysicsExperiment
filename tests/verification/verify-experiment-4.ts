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
  EXPERIMENT_4_FORMAL_TRIALS,
  EXPERIMENT_4_GAP_LEVELS,
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

for (const d of formal) {
  const params = pendulumParamsForRelease(d.release_side);
  assert(
    bobVisibilityAtTime(d.query_time_sec, params, d.gap_m) === "fully_occluded",
    `t_q 应遮挡 ${d.trial_id}`,
  );
}

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

for (const gapM of Object.values(EXPERIMENT_4_GAP_LEVELS)) {
  const params = pendulumParamsForRelease("left");
  const timeline = buildOcclusionTimeline(params, gapM);
  const firstVis = firstFullyVisibleTimeSec(timeline);
  const windows = queryableWindows(timeline, EXPERIMENT_4_DURATION_SEC, firstVis);
  const total = windows.reduce((z, w) => z + (w.tMaxSec - w.tMinSec), 0);
  assert(total > 0.1, `gap ${gapM} 应有可询问窗口`);
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

console.log("verify-experiment-4: OK");
