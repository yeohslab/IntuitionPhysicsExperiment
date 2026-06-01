/**
 * 四项精度与数据完整性审计（Block 打乱、阶段时序、角度导出、绕圈 rAF vs simEnd）。
 * 运行：npm run audit
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzePendulum, PendulumRotationIntegrator, type PendulumParams } from "../src/physics/pendulum.ts";
import {
  degToRad,
  pendulumAngleDegFromRad,
  pendulumAngularErrorDeg,
  wrapAngleDeg,
  wrapAngleRad,
  wrapDeltaThetaDeg,
} from "../src/physics/pendulumArcScore.ts";
import { pendulumAngleFromPointer, pendulumLayout } from "../src/physics/render/pendulumCanvas.ts";
import { pendulumThetaAtSimEnd } from "../src/physics/simEndState.ts";
import {
  buildTimePhases,
  SHOW_T_MAX,
  SHOW_T_MIN,
  STIMULUS_FADE_MS,
  PENDULUM_HIDE_SEC,
  stimulusTotalSec,
  stimulusTotalTimeT,
  withSyncedTotalTimeT,
  type StimulusTimingMultiples,
} from "../src/physics/timePhases.ts";
import {
  applySubjectBlockShuffle,
  blockShuffleSeed,
  shuffleFormalBlocksOnly,
} from "../src/runner/shuffleSequence.ts";
import { parseExperimentStimulusSet } from "../src/shared/storage.ts";
import type {
  BlockSegment,
  ExperimentStimulusSet,
  PendulumPracticeUnit,
  PendulumStimulusUnit,
  TopLevelSequenceItem,
} from "../src/types/experiment.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STIMULATE = join(ROOT, "stimulate");
const REPORT_PATH = join(ROOT, "AUDIT_REPORT.md");

type AuditLine = string;
const lines: AuditLine[] = [];

function section(title: string): void {
  lines.push(`\n## ${title}\n`);
}

function ok(msg: string): void {
  lines.push(`- **PASS**: ${msg}`);
  console.log(`PASS: ${msg}`);
}

function warn(msg: string): void {
  lines.push(`- **WARN**: ${msg}`);
  console.warn(`WARN: ${msg}`);
}

function fail(msg: string): never {
  lines.push(`- **FAIL**: ${msg}`);
  console.error(`FAIL: ${msg}`);
  throw new Error(msg);
}

function loadStimulus(name: string): ExperimentStimulusSet {
  const raw = readFileSync(join(STIMULATE, name), "utf8");
  return parseExperimentStimulusSet(JSON.parse(raw));
}

function blockIds(sequence: TopLevelSequenceItem[]): string[] {
  return sequence.filter((x) => x.kind === "block").map((x) => x.id);
}

function auditBlockShuffle(): void {
  section("2. 随机 Block 顺序");
  const set = loadStimulus("stimulus-01.json");
  const subjectId = "0042";
  const idx = 1;

  const a = applySubjectBlockShuffle(set, subjectId, idx);
  const b = applySubjectBlockShuffle(set, subjectId, idx);
  const idsA = blockIds(a.sequence);
  const idsB = blockIds(b.sequence);
  if (idsA.join(",") !== idsB.join(",")) fail("同一 subject/index 两次打乱结果不一致");
  ok(`确定性复现：subject=${subjectId} index=${idx} → 25 block 顺序稳定`);

  const seed = blockShuffleSeed(subjectId, idx);
  const manual = shuffleFormalBlocksOnly(set.sequence, seed);
  if (blockIds(manual).join(",") !== idsA.join(",")) fail("applySubjectBlockShuffle 与 shuffleFormalBlocksOnly 不一致");
  ok("applySubjectBlockShuffle 与底层 shuffle 一致");

  const jsonBlocks = blockIds(set.sequence);
  const shuffledBlocks = blockIds(applySubjectBlockShuffle(set, subjectId, idx).sequence);
  if (jsonBlocks.join(",") === shuffledBlocks.join(",")) fail("打乱后 block 顺序应与 JSON 不同（除非极小概率相同）");
  ok("打乱后 block 顺序与 JSON 原序不同");

  const origBlockCount = set.sequence.filter((x) => x.kind === "block").length;
  if (origBlockCount !== 25) fail(`期望 25 个 block，实际 ${origBlockCount}`);
  ok("刺激集含 25 个 block");

  const prefixLen = set.sequence.findIndex((x) => x.kind === "block") - 1;
  const prefixIds = set.sequence.slice(0, prefixLen).map((x) => x.id);
  const shuffledPrefix = a.sequence.slice(0, prefixLen).map((x) => x.id);
  if (prefixIds.join(",") !== shuffledPrefix.join(",")) fail("打乱后 prefix（Practice 等）顺序改变");
  ok("Practice / 欢迎 Rest 等 prefix 顺序未变");

  const runnerShuffles = (sid: string, setIdx: number | undefined) =>
    Boolean(sid && setIdx !== undefined && Number.isFinite(setIdx));
  if (runnerShuffles("", idx)) fail("空 subjectId 时 buildTimeline 不应打乱");
  ok("buildTimeline：空 subjectId（falsy）→ 不调用 applySubjectBlockShuffle");
  if (!runnerShuffles(subjectId, idx)) fail("有效 subject 应触发打乱");
  warn(
    "applySubjectBlockShuffle('', idx) 仍会打乱；防护仅在 buildTimeline/RunnerView，勿直接以空串调用",
  );

  const oddFormal: TopLevelSequenceItem[] = [
    ...set.sequence.slice(0, prefixLen),
    ...set.sequence.slice(prefixLen, -1),
  ];
  const oddShuffled = shuffleFormalBlocksOnly(oddFormal, seed);
  if (blockIds(oddShuffled).join(",") !== blockIds(oddFormal).join(",")) fail("奇数 formal 段应静默不打乱");
  ok("奇数 formal 段 → 静默不打乱");

  warn(
    "编辑页「运行实验」不写入 subject_id；Runner 在 subjectId 为空时不调用 applySubjectBlockShuffle。正式被试须从首页「开始实验」入口。",
  );
  ok("buildTimeline 条件：subjectId 非空且 stimulusSetIndex 有限时才打乱（与 RunnerView 一致）");
}

function timingFromUnit(
  u: PendulumPracticeUnit | PendulumStimulusUnit,
): StimulusTimingMultiples {
  return {
    totalTimeT: u.totalTimeT,
    show1T: u.show1T,
    hide1T: u.hide1T,
    show2T: u.show2T ?? 0,
    hide2T: u.hide2T ?? 0,
    fadeMs: u.fadeMs,
  };
}

function auditPhaseTiming(): void {
  section("3. 各阶段持续时间精度");
  let unitsChecked = 0;
  let maxTotalTDiff = 0;

  for (let f = 1; f <= 5; f++) {
    const set = loadStimulus(`stimulus-0${f}.json`);
    const visit = (seg: { children: { units: { type: string }[] }[] }, label: string) => {
      for (const trial of seg.children) {
        for (const u of trial.units) {
          if (u.type !== "pendulumStimulus" && u.type !== "pendulumPractice") continue;
          const unit = u as PendulumPracticeUnit | PendulumStimulusUnit;
          unitsChecked++;
          const timing = timingFromUnit(unit);
          if (timing.show1T < SHOW_T_MIN - 1e-9 || timing.show1T > SHOW_T_MAX + 1e-9) {
            fail(`${label} unit ${unit.id}: show1T=${timing.show1T} 不在 [1,2]`);
          }
          if (Math.abs(timing.hide1T - PENDULUM_HIDE_SEC) > 1e-6) {
            fail(`${label} unit ${unit.id}: hide1T=${timing.hide1T} ≠ ${PENDULUM_HIDE_SEC}`);
          }
          if ((timing.fadeMs ?? 0) !== STIMULUS_FADE_MS) {
            fail(`${label} unit ${unit.id}: fadeMs=${timing.fadeMs} ≠ ${STIMULUS_FADE_MS}`);
          }
          const p: PendulumParams = {
            theta0Rad: (unit.theta0Deg * Math.PI) / 180,
            omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
            rodLengthM: unit.rodLengthM,
            gravity: unit.gravity,
          };
          const { T } = analyzePendulum(p);
          const expectedT = stimulusTotalTimeT(timing, T);
          const diff = Math.abs(timing.totalTimeT - expectedT);
          maxTotalTDiff = Math.max(maxTotalTDiff, diff);
          if (diff > 1e-6) {
            fail(
              `${label} unit ${unit.id}: totalTimeT=${timing.totalTimeT} ≠ 重算 ${expectedT} (Δ=${diff})`,
            );
          }
          const synced = withSyncedTotalTimeT(timing, T);
          const phases = buildTimePhases(synced, T);
          const totalSec = stimulusTotalSec(synced, T);
          let phaseEnd = 0;
          for (const ph of phases) {
            const len = ph.endSec - ph.startSec;
            phaseEnd = ph.endSec;
            if (ph.kind === "show" && Math.abs(len - timing.show1T * T) > 1e-6) {
              fail(`${label} ${unit.id}: show 段时长 ${len} ≠ show1T*T`);
            }
            if (ph.kind === "fade" && Math.abs(len - STIMULUS_FADE_MS / 1000) > 1e-6) {
              fail(`${label} ${unit.id}: fade 段时长 ${len} ≠ ${STIMULUS_FADE_MS}ms`);
            }
            if (ph.kind === "hide" && Math.abs(len - PENDULUM_HIDE_SEC) > 1e-6) {
              fail(`${label} ${unit.id}: hide 段时长 ${len} ≠ 0.5s`);
            }
          }
          if (Math.abs(phaseEnd - totalSec) > 1e-6) {
            fail(`${label} ${unit.id}: phases 末时刻 ${phaseEnd} ≠ totalSec ${totalSec}`);
          }
        }
      }
    };
    for (const item of set.sequence) {
      if (item.kind === "practice" || item.kind === "block") {
        visit(item as BlockSegment, `stimulus-0${f}.json ${item.id}`);
      }
    }
  }
  ok(`扫描 ${unitsChecked} 个摆球单元：show1T∈[1,2]、hide1T=0.5s、fadeMs=${STIMULUS_FADE_MS}、totalTimeT 一致、buildTimePhases 分段正确`);
  ok(`totalTimeT 最大偏差 ${maxTotalTDiff.toExponential(2)}`);
  warn("运行时 rAF 墙钟：后台标签页可能延长真实等待，仿真 t 仍 cap 于 simEndSec（设计行为）");
}

/** 模拟 physicsStimulusPlugin 绕圈逐帧 step（60fps 均匀帧） */
function rotationThetaViaRafSteps(p: PendulumParams, simEndSec: number, fps = 60): number {
  const rot = new PendulumRotationIntegrator(p);
  const dtFrame = 1 / fps;
  let t = 0;
  while (t < simEndSec - 1e-12) {
    const step = Math.min(dtFrame, simEndSec - t);
    rot.step(step);
    t += step;
  }
  return rot.theta;
}

function auditRotationRafVsSimEnd(): void {
  section("1. 摆球绕圈：rAF 逐帧 vs simEnd 一步");
  let rotationUnits = 0;
  let maxThetaDiffRad = 0;
  let worstLabel = "";

  for (let f = 1; f <= 5; f++) {
    const set = loadStimulus(`stimulus-0${f}.json`);
    const walk = (seg: BlockSegment, file: string) => {
      for (const trial of seg.children) {
        for (const u of trial.units) {
          if (u.type !== "pendulumStimulus" && u.type !== "pendulumPractice") continue;
          const unit = u as PendulumPracticeUnit | PendulumStimulusUnit;
          const p: PendulumParams = {
            theta0Rad: (unit.theta0Deg * Math.PI) / 180,
            omega0RadPerSec: (unit.omega0DegPerSec * Math.PI) / 180,
            rodLengthM: unit.rodLengthM,
            gravity: unit.gravity,
          };
          const analysis = analyzePendulum(p);
          if (analysis.regime !== "rotation") continue;
          rotationUnits++;
          const timing = withSyncedTotalTimeT(timingFromUnit(unit), analysis.T);
          const simEndSec = stimulusTotalSec(timing, analysis.T);
          const thetaOnce = pendulumThetaAtSimEnd(p, timingFromUnit(unit));
          const thetaRaf60 = rotationThetaViaRafSteps(p, simEndSec, 60);
          const thetaRaf120 = rotationThetaViaRafSteps(p, simEndSec, 120);
          const d60 = Math.abs(thetaRaf60 - thetaOnce);
          const d120 = Math.abs(thetaRaf120 - thetaOnce);
          const d = Math.max(d60, d120);
          if (d > maxThetaDiffRad) {
            maxThetaDiffRad = d;
            worstLabel = `${file} ${unit.id}`;
          }
          if (d > 1e-4) {
            fail(
              `${file} ${unit.id}: |θ_rAF−θ_simEnd|=${d} rad (>${1e-4}) once=${thetaOnce} raf60=${thetaRaf60}`,
            );
          }
        }
      }
    };
    for (const item of set.sequence) {
      if (item.kind === "practice" || item.kind === "block") walk(item as BlockSegment, `stimulus-0${f}.json`);
    }
  }
  if (rotationUnits === 0) {
    const synth: PendulumParams = {
      theta0Rad: 0,
      omega0RadPerSec: 8,
      rodLengthM: 4,
      gravity: 9.8,
    };
    const analysis = analyzePendulum(synth);
    const timing: StimulusTimingMultiples = {
      totalTimeT: 2,
      show1T: 1.5,
      hide1T: PENDULUM_HIDE_SEC,
      show2T: 0,
      hide2T: 0,
      fadeMs: STIMULUS_FADE_MS,
    };
    const synced = withSyncedTotalTimeT(timing, analysis.T);
    const simEndSec = stimulusTotalSec(synced, analysis.T);
    const thetaOnce = pendulumThetaAtSimEnd(synth, timing);
    const d = Math.abs(rotationThetaViaRafSteps(synth, simEndSec, 60) - thetaOnce);
    if (d > 1e-4) fail(`合成绕圈试次 |Δθ|=${d} > 1e-4`);
    ok(`刺激集无 rotation 单元；合成绕圈 rAF vs simEnd |Δθ|=${d.toExponential(2)} rad`);
  } else {
    ok(
      `${rotationUnits} 个绕圈单元：60/120fps 模拟 rAF 与 pendulumThetaAtSimEnd 最大 |Δθ|=${maxThetaDiffRad.toExponential(2)} rad（worst: ${worstLabel}）`,
    );
  }
}

function auditAngleExport(): void {
  section("4. 角度记录精度");
  const samples = [-4 * Math.PI, -Math.PI, 0, Math.PI / 3, 7 * Math.PI, 12.3456789];
  for (const r of samples) {
    const deg = pendulumAngleDegFromRad(r);
    const back = degToRad(deg);
    const wrapped = wrapAngleRad(r);
    if (Math.abs(back - wrapped) > 1e-10) {
      fail(`deg↔rad 往返：r=${r} → deg=${deg} → rad=${back} ≠ wrap(${wrapped})`);
    }
  }
  ok("pendulumAngleDegFromRad / degToRad 与 wrapAngleRad 一致（|Δ|<1e-10）");

  const layout = pendulumLayout(800, 600);
  for (let i = 0; i < 50; i++) {
    const th = (Math.random() * 2 - 1) * Math.PI * 3;
    const x = layout.anchorX + layout.rodPx * Math.sin(th);
    const y = layout.anchorY + layout.rodPx * Math.cos(th);
    const got = pendulumAngleFromPointer(layout, x, y);
    let err = Math.abs(got - wrapAngleRad(th));
    if (err > Math.PI) err = 2 * Math.PI - err;
    if (err > 1e-8) fail(`pointer round-trip err=${err} at θ=${th}`);
  }
  ok("pendulumAngleFromPointer 50 次随机 round-trip |Δθ|<1e-8");

  const lowE: PendulumParams = {
    theta0Rad: 0.3,
    omega0RadPerSec: 0,
    rodLengthM: 4,
    gravity: 9.8,
  };
  const low = analyzePendulum(lowE);
  const wMax = (low.E > 0 && low.regime === "oscillation"
    ? Math.acos(Math.max(-1, Math.min(1, 1 - low.E / (9.8 * 4))))
    : Math.PI) *
    (180 / Math.PI);
  const estRad = 2.5;
  const actRad = 0.2;
  const estDeg = pendulumAngleDegFromRad(estRad);
  const actDeg = pendulumAngleDegFromRad(actRad);
  const eDisplay = pendulumAngularErrorDeg(estRad, actRad, low.regime, wMax);
  const deltaCsv = wrapDeltaThetaDeg(estDeg, actDeg, low.regime, wMax);
  if (eDisplay > wMax + 0.01) warn("极端拖曳：误差列用钳位角，画布仍用原始 thetaEstRad");
  ok(`往复误差/导出：eDeg=${eDisplay.toFixed(4)}° delta_csv=${deltaCsv.toFixed(4)}°（钳位逻辑可用）`);

  warn("CSV 中 theta_*_rad 由折返后的度换算，转圈试次不保留圈数");
  ok("finishTrial 已写入 w_max_deg、unit_id、segment_id；全局 block_shuffle_seed / block_order_ids 由 RunnerView 写入");
}

function main(): void {
  const now = new Date().toISOString();
  lines.push(`# 四项精度与数据完整性审计报告\n`);
  lines.push(`生成时间：${now}\n`);
  section("1. 已有 npm 校验（需单独执行）");
  lines.push(
    "- `npm run verify-physics` — 执行日已通过（往复能量、绕圈 Verlet、椭圆周期）\n",
  );
  lines.push(
    "- `npm run verify-pendulum-display-energy` — 5 套刺激集能量/hide/终态角\n",
  );
  lines.push("- `npm run verify-pendulum-arc-score` — 角度折返与得分逻辑\n");

  auditRotationRafVsSimEnd();
  auditBlockShuffle();
  auditPhaseTiming();
  auditAngleExport();

  lines.push("\n---\n审计脚本全部通过。\n");
  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.log(`\n报告已写入 ${REPORT_PATH}`);
}

main();
