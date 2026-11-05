import { analyzePendulum, pendulumEnergy, pendulumThetaOmegaAt } from "../../src/experiment/physics/pendulum.ts";
import { gratingWorldLayout, GRATING_CANVAS_LOGICAL_H, GRATING_CANVAS_LOGICAL_W } from "../../src/experiment/physics/render/gratingCanvas.ts";
import { buildExperiment5Csv, classifyExperiment5Status, experiment5DataFilename } from "../../src/experiments/experiment-5/exportStimulusCsv.ts";
import { buildExperiment5StimulusSetPayload, experiment5StimulusSetFilename } from "../../src/experiments/experiment-5/exportStimulusSetJson.ts";
import { assertExperiment5RuntimeStimulusSet, buildExperiment5Unit, generateExperiment5RuntimeStimulusSet } from "../../src/experiments/experiment-5/generateRuntimeSet.ts";
import { EXPERIMENT_5_BOUNDARY_GAPS_DEG, EXPERIMENT_5_ENERGY_MAX_J, EXPERIMENT_5_ENERGY_MIN_J, EXPERIMENT_5_FORMAL_TRIALS, EXPERIMENT_5_GRATING_CONDITIONS, EXPERIMENT_5_JUDGMENT_DISTANCES_M, EXPERIMENT_5_VISIBLE_WINDOW_COUNT_ORDER, experiment5KeyMapping } from "../../src/experiments/experiment-5/protocol.ts";
import { collectExperiment5TrialDescriptors } from "../../src/experiments/experiment-5/trialDescriptor.ts";
import type { ReachabilityPendulumStimulusUnit } from "../../src/shared/experimentTypes.ts";
import { buildExperiment5SubjectId, isExperiment5ParticipantInfo } from "../../src/shared/participant.ts";
import { parseExperiment5StimulusSet } from "../../src/shared/storage.ts";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function mulberry32(seed: number): () => number { let state = seed >>> 0; return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const odd = { subject_id: buildExperiment5SubjectId("0001"), gender_code: 0 as const, age_years: 22 };
const even = { ...odd, subject_id: buildExperiment5SubjectId("0002") };
assert(isExperiment5ParticipantInfo(odd) && isExperiment5ParticipantInfo(even), "E5 被试编号应有效");
assert(experiment5KeyMapping(odd.subject_id).yesKey === "f" && experiment5KeyMapping(even.subject_id).yesKey === "j", "编号奇偶按键映射");

const set = generateExperiment5RuntimeStimulusSet(odd, { rng: mulberry32(20261026) });
assertExperiment5RuntimeStimulusSet(set);
assert(parseExperiment5StimulusSet(JSON.parse(JSON.stringify(set))) !== null, "实验五刺激集应可存储恢复");
const oldSchemaSet = JSON.parse(JSON.stringify(set));
oldSchemaSet.schemaVersion = 2;
assert(parseExperiment5StimulusSet(oldSchemaSet) === null, "旧 schema 2 缓存应被拒绝");
const descriptors = collectExperiment5TrialDescriptors(set);
const formal = descriptors.filter((x) => x.segment_kind === "block");
assert(formal.length === EXPERIMENT_5_FORMAL_TRIALS, "实验五正式试次应为48条");
assert(new Set(formal.map((x) => x.energy_J.toFixed(10))).size === 48, "能量应逐试次独立连续生成");
assert(formal.every((x) => x.energy_J >= EXPERIMENT_5_ENERGY_MIN_J && x.energy_J <= EXPERIMENT_5_ENERGY_MAX_J), "能量应在 [8.48,14.48] J");
assert(!JSON.stringify(set).includes("energy_level"), "实验五不得输出能量档位字段");
assert(Math.min(...formal.map((x) => Math.abs(x.target_angle_deg))) >= 32.39 && Math.max(...formal.map((x) => Math.abs(x.target_angle_deg))) <= 56.91, "目标角范围");

for (const count of EXPERIMENT_5_VISIBLE_WINDOW_COUNT_ORDER) {
  const geometry = EXPERIMENT_5_GRATING_CONDITIONS[count];
  assert(geometry.gapM === 0.45, `N=${count} 透明观察宽度应固定为0.45m`);
  assert(Math.abs(geometry.periodM - geometry.barWidthM - geometry.gapM) < 1e-9, `N=${count} 应满足P=B+G`);
  const matching = formal.filter((d) => d.visible_window_count === count);
  assert(matching.length === 16, `正式阶段N=${count}应有16条`);
  assert(matching.every((d) =>
    d.gap_m === geometry.gapM && d.bar_width_m === geometry.barWidthM &&
    d.grating_period_m === geometry.periodM && d.grating_offset_m === geometry.offsetM
  ), `N=${count} 参数必须与实验四一致`);
}
const formalBlocks = set.sequence.filter((item) => item.kind === "block");
for (const block of formalBlocks) {
  const blockUnits = block.children.flatMap((trial) => trial.units).filter((u): u is ReachabilityPendulumStimulusUnit => u.type === "reachabilityPendulumStimulus");
  for (const count of EXPERIMENT_5_VISIBLE_WINDOW_COUNT_ORDER) {
    assert(blockUnits.filter((u) => u.visibleWindowCount === count).length === 4, `每个Block的N=${count}应有4条`);
  }
}
const practiceUnits = set.sequence.filter((item) => item.kind === "practice").flatMap((item) => item.children).flatMap((trial) => trial.units).filter((u): u is ReachabilityPendulumStimulusUnit => u.type === "reachabilityPendulumStimulus");
for (const count of EXPERIMENT_5_VISIBLE_WINDOW_COUNT_ORDER) assert(practiceUnits.filter((u) => u.visibleWindowCount === count).length === 2, `练习N=${count}应有2条`);

for (const d of formal) {
  const params = { theta0Rad: d.theta_0_deg * Math.PI / 180, omega0RadPerSec: d.omega_0_deg_per_sec * Math.PI / 180, rodLengthM: d.rod_length_m, gravity: d.gravity_m_per_sec2 };
  const analysis = analyzePendulum(params);
  const end = pendulumThetaOmegaAt(d.visible_duration_sec, params, analysis);
  assert(analysis.regime === "oscillation", "实验五只允许摆动");
  assert(Math.abs(pendulumEnergy(params) - d.energy_J) < 1e-8, "初态机械能一致");
  assert(params.theta0Rad * params.omega0RadPerSec > 0 && end.theta * end.omega > 0, "可见阶段应同侧外摆且不折返");
  assert(Math.abs(end.theta * 180 / Math.PI - d.disappearance_theta_deg) < 1e-7, "消失位置一致");
  assert(d.judgment_time_sec > 0 && d.judgment_time_sec < 0.5, "判定时间范围");
  assert((d.reachability === "reachable") === (Math.abs(d.target_angle_deg) < d.amplitude_deg), "正确答案来自目标与最大摆角关系");
}

for (const energyRng of [() => 0, () => 1 - Number.EPSILON]) {
  for (const gap of EXPERIMENT_5_BOUNDARY_GAPS_DEG) for (const distance of EXPERIMENT_5_JUDGMENT_DISTANCES_M) for (const relation of ["reachable", "unreachable"] as const) {
    const unit = buildExperiment5Unit({ relation, gap, distance, side: "right", visibleWindowCount: 3 }, odd, energyRng);
    assert(unit.theta0Deg > 0 && unit.omega0DegPerSec > 0, "极值笛卡尔组合的初态合法");
  }
}

const world = gratingWorldLayout(GRATING_CANVAS_LOGICAL_W, GRATING_CANVAS_LOGICAL_H, 4);
assert(GRATING_CANVAS_LOGICAL_W === 1000 && GRATING_CANVAS_LOGICAL_H === 560 && world.pxPerM > 116, "复用1000×560下半圆米制画面");
const payload = buildExperiment5StimulusSetPayload(set, odd);
assert(payload.schema_version === 2 && payload.trials.length === 54 && !JSON.stringify(payload).includes("energy_level"), "JSON导出应使用schema 2、含54条且无能量档位");
assert(payload.trials.every((trial) => "visible_window_count" in trial && "grating_offset_m" in trial), "JSON应导出完整光栅字段");
assert(experiment5StimulusSetFilename(odd) === "experiment-5_v1.0_stimulus_set_subjectE5-0001.json", "刺激文件名");
assert(experiment5DataFilename(odd.subject_id, "f") === "experiment-5_v1.0_data_subjectE5-0001_f.csv", "数据文件名");

const fakeRows = formal.map((d) => ({ ...d, trial_type: "reachability-pendulum-stimulus", response_judgment: d.correct_response, response_key: d.yes_key, correct: true, rt_sec: 0.5, timed_out: false }));
assert(classifyExperiment5Status(fakeRows, true) === "f", "完整48条应标记完成");
const csv = buildExperiment5Csv(fakeRows, odd, "f");
assert(csv.split("\r\n").length === 50 && !csv.includes("energy_level") && csv.includes("visible_window_count") && csv.includes("grating_period_m") && csv.includes("grating_offset_m"), "CSV行数与光栅字段");

const invalidGeometrySet = JSON.parse(JSON.stringify(set));
const invalidUnit = invalidGeometrySet.sequence.find((item: { kind: string }) => item.kind === "block").children[0].units.find((unit: { type: string }) => unit.type === "reachabilityPendulumStimulus");
invalidUnit.gratingOffsetM += 0.001;
assert(parseExperiment5StimulusSet(invalidGeometrySet) === null, "不匹配实验四的光栅几何缓存应被拒绝");

const units = set.sequence.flatMap((s) => s.kind === "block" ? s.children : []).flatMap((t) => t.units).filter((u): u is ReachabilityPendulumStimulusUnit => u.type === "reachabilityPendulumStimulus");
assert(units.every((u) => u.yesKey === "f" && u.noKey === "j"), "奇数被试整套按键映射一致");

console.log("Experiment 5 verification passed.");
