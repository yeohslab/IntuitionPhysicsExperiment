/**
 * 校验导出的刺激集 JSON 是否满足运行时随机逻辑约束。
 * 用法：npx tsx scripts/verify-exported-stimulus-sets.ts <json...>
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
  assertRuntimeStimulusSet,
  allTimingCombos,
} from "../src/stimulate/generateRuntimeSet.ts";
import {
  buildKeptEnergySegmentsForGroup,
  practiceEnergyForGroup,
  type MotionGroup,
} from "../src/physics/energySegments.ts";
import { pendulumEnergy, pendulumRegime } from "../src/physics/pendulum.ts";
import { pendulumThetaMaxRad } from "../src/physics/pendulumUnitFit.ts";
import { pendulumThetaAtSimEnd } from "../src/physics/simEndState.ts";
import { STIMULUS_FADE_MS } from "../src/physics/timePhases.ts";
import type {
  ExperimentStimulusSet,
  PendulumStimulusUnit,
  RestSegment,
} from "../src/types/experiment.ts";
import type { StimulusSetExportPayload } from "../src/shared/exportStimulusSetJson.ts";

type CheckResult = {
  file: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: Record<string, unknown>;
};

function comboKey(show1T: number, hide1T: number): string {
  return `${show1T}|${hide1T}`;
}

function nearestEmid(E: number, group: MotionGroup): { Emid: number; err: number } {
  const segs = buildKeptEnergySegmentsForGroup(group);
  let best = segs[0]!;
  let bestErr = Math.abs(E - best.Emid);
  for (const s of segs) {
    const err = Math.abs(E - s.Emid);
    if (err < bestErr) {
      best = s;
      bestErr = err;
    }
  }
  return { Emid: best.Emid, err: bestErr };
}

function paramsFromUnit(u: PendulumStimulusUnit) {
  return {
    theta0Rad: (u.theta0Deg * Math.PI) / 180,
    omega0RadPerSec: (u.omega0DegPerSec * Math.PI) / 180,
    rodLengthM: u.rodLengthM,
    gravity: u.gravity,
  };
}

function collectFormalStimuli(set: ExperimentStimulusSet): PendulumStimulusUnit[] {
  const out: PendulumStimulusUnit[] = [];
  for (const item of set.sequence) {
    if (item.kind !== "block") continue;
    for (const trial of item.children) {
      for (const u of trial.units) {
        if (u.type === "pendulumStimulus") out.push(u);
      }
    }
  }
  return out;
}

function blockEnergyOrder(set: ExperimentStimulusSet, group: MotionGroup): number[] {
  const order: number[] = [];
  for (const item of set.sequence) {
    if (item.kind !== "block") continue;
    const stim = item.children[0]?.units.find((u) => u.type === "pendulumStimulus");
    if (!stim || stim.type !== "pendulumStimulus") continue;
    const E = pendulumEnergy(paramsFromUnit(stim));
    order.push(nearestEmid(E, group).Emid);
  }
  return order;
}

function timingOrders(set: ExperimentStimulusSet): string[] {
  const out: string[] = [];
  for (const item of set.sequence) {
    if (item.kind !== "block") continue;
    const keys: string[] = [];
    for (const trial of item.children) {
      const stim = trial.units.find((u) => u.type === "pendulumStimulus");
      if (stim && stim.type === "pendulumStimulus") {
        keys.push(comboKey(stim.show1T, stim.hide1T));
      }
    }
    out.push(keys.join(","));
  }
  return out;
}

function kolmogorovSmirnovUniformity(samples: number[]): number {
  // samples in [-1,1]; return D statistic vs Uniform(-1,1)
  const n = samples.length;
  if (n === 0) return 1;
  const sorted = [...samples].sort((a, b) => a - b);
  let d = 0;
  for (let i = 0; i < n; i++) {
    const x = sorted[i]!;
    const F = (x + 1) / 2;
    const empLow = i / n;
    const empHigh = (i + 1) / n;
    d = Math.max(d, Math.abs(empLow - F), Math.abs(empHigh - F));
  }
  return d;
}

function restProgressLabels(set: ExperimentStimulusSet): string[] {
  const labels: string[] = [];
  for (const item of set.sequence) {
    if (item.kind !== "rest") continue;
    const text = (item as RestSegment).units.find((u) => u.type === "textControl");
    if (!text || text.type !== "textControl") continue;
    const m = text.text.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) labels.push(`${m[1]}/${m[2]}`);
  }
  return labels;
}

function verifyOne(path: string): CheckResult {
  const file = basename(path);
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = JSON.parse(readFileSync(path, "utf8")) as StimulusSetExportPayload;
  const group = raw.motionGroup as MotionGroup;
  const set = raw.stimulusSet;

  if (raw.exportSchemaVersion !== 1) {
    errors.push(`exportSchemaVersion=${raw.exportSchemaVersion}，期望 1`);
  }
  if (![1, 2].includes(group)) {
    errors.push(`motionGroup=${group} 非法`);
  }

  const expectedName = `stimulus_set_group${group}_subject${raw.subjectId}.json`;
  if (file !== expectedName) {
    warnings.push(`文件名 ${file} 与载荷 group/subject 不一致（期望 ${expectedName}）`);
  }

  try {
    assertRuntimeStimulusSet(set, group);
  } catch (e) {
    errors.push(`assertRuntimeStimulusSet: ${(e as Error).message}`);
  }

  const rests = set.sequence.filter((x) => x.kind === "rest");
  const blocks = set.sequence.filter((x) => x.kind === "block");
  if (set.sequence.length !== 3 + 15 * 2) {
    errors.push(`顶层 sequence 长度应为 33（3 指导 + 15×(rest+block)），实际 ${set.sequence.length}`);
  }
  if (rests.length !== 18) {
    errors.push(`rest 段应为 18（欢迎+结构+练习+15 进度），实际 ${rests.length}`);
  }
  if (blocks.length !== 15) {
    errors.push(`正式 block 应为 15，实际 ${blocks.length}`);
  }

  // Rest 进度文案应为 1/15 … 15/15 固定顺序
  const progress = restProgressLabels(set);
  const expectedProgress = Array.from({ length: 15 }, (_, i) => `${i + 1}/15`);
  if (JSON.stringify(progress) !== JSON.stringify(expectedProgress)) {
    errors.push(`Block 进度 Rest 文案顺序异常：${JSON.stringify(progress)}`);
  }

  // 能量：15 个不同 Emid，各对应一个 kept segment
  const expectedEmids = new Set(buildKeptEnergySegmentsForGroup(group).map((s) => s.Emid));
  const usedEmids = new Set<number>();
  const energyTol = 1e-6;
  for (const block of blocks) {
    if (block.kind !== "block") continue;
    const energies: number[] = [];
    for (const trial of block.children) {
      const stim = trial.units.find((u) => u.type === "pendulumStimulus");
      if (!stim || stim.type !== "pendulumStimulus") {
        errors.push(`Block ${block.id} 缺 pendulumStimulus`);
        continue;
      }
      energies.push(pendulumEnergy(paramsFromUnit(stim)));
    }
    if (energies.length === 0) continue;
    const meanE = energies.reduce((a, b) => a + b, 0) / energies.length;
    const spread = Math.max(...energies) - Math.min(...energies);
    if (spread > 1e-4) {
      errors.push(`Block ${block.id} 试次能量不一致：spread=${spread}`);
    }
    const { Emid, err } = nearestEmid(meanE, group);
    if (err > energyTol * Math.max(1, Emid) && err > 0.05) {
      errors.push(`Block ${block.id} 能量 ${meanE.toFixed(4)} 偏离最近 Emid ${Emid.toFixed(4)}（Δ=${err.toFixed(4)}）`);
    }
    if (usedEmids.has(Emid)) {
      errors.push(`能量中点 ${Emid.toFixed(4)} 被多个 Block 使用`);
    }
    usedEmids.add(Emid);
  }
  if (usedEmids.size !== expectedEmids.size) {
    errors.push(`能量覆盖 ${usedEmids.size}/${expectedEmids.size} 个 kept Emid`);
  } else {
    for (const e of expectedEmids) {
      let found = false;
      for (const u of usedEmids) {
        if (Math.abs(u - e) < 1e-9) found = true;
      }
      if (!found) errors.push(`缺少能量中点 ${e}`);
    }
  }

  // ω₀ 符号、终点位置均匀性、regime
  const stimuli = collectFormalStimuli(set);
  let pos = 0;
  let neg = 0;
  const uEnds: number[] = [];
  for (const u of stimuli) {
    const p = paramsFromUnit(u);
    const E = pendulumEnergy(p);
    const regime = pendulumRegime(E, u.rodLengthM, u.gravity);
    const expectedRegime = group === 1 ? "oscillation" : "rotation";
    if (regime !== expectedRegime && regime !== "critical") {
      errors.push(`试次 ${u.id} regime=${regime}，期望 ${expectedRegime}`);
    }
    if (u.omega0DegPerSec > 0) pos++;
    else if (u.omega0DegPerSec < 0) neg++;
    const timing = {
      show1T: u.show1T,
      hide1T: u.hide1T,
      show2T: u.show2T,
      hide2T: u.hide2T,
      fadeMs: u.fadeMs ?? STIMULUS_FADE_MS,
      totalTimeT: u.totalTimeT,
    };
    let thetaEnd = pendulumThetaAtSimEnd(p, timing);
    const thetaMax = pendulumThetaMaxRad(E, u.rodLengthM, u.gravity);
    if (regime === "rotation") {
      // 拟合按圆周 wrap 匹配；导出刺激无 target 字段，用 (-π,π] 上的物理位置检验均匀性
      while (thetaEnd > Math.PI) thetaEnd -= 2 * Math.PI;
      while (thetaEnd <= -Math.PI) thetaEnd += 2 * Math.PI;
      uEnds.push(Math.max(-1, Math.min(1, thetaEnd / Math.PI)));
    } else {
      uEnds.push(Math.max(-1, Math.min(1, thetaEnd / thetaMax)));
    }
  }
  const signRatio = Math.min(pos, neg) / Math.max(pos, neg, 1);
  if (signRatio < 0.35) {
    errors.push(`ω₀ 符号失衡：正=${pos} 负=${neg} ratio=${signRatio.toFixed(3)}`);
  } else if (signRatio < 0.55) {
    warnings.push(`ω₀ 符号偏斜：正=${pos} 负=${neg} ratio=${signRatio.toFixed(3)}`);
  }

  const ksD = kolmogorovSmirnovUniformity(uEnds);
  // 临界值约 1.36/sqrt(n) @ α=0.05；n=135 → ~0.117
  const ksCrit = 1.36 / Math.sqrt(Math.max(1, uEnds.length));
  if (ksD > ksCrit * 1.5) {
    errors.push(`终点位置 u=θ_end/θ_max 偏离 U(-1,1)：KS-D=${ksD.toFixed(3)} > ${(ksCrit * 1.5).toFixed(3)}`);
  } else if (ksD > ksCrit) {
    warnings.push(`终点位置均匀性边缘：KS-D=${ksD.toFixed(3)}（临界≈${ksCrit.toFixed(3)}）`);
  }

  // practice energy 文案里不一定有刺激；若有 practice block 再查
  const practiceBlocks = set.sequence.filter((x) => x.kind === "practice");
  const expectedPracticeE = practiceEnergyForGroup(group);
  for (const pb of practiceBlocks) {
    if (pb.kind !== "practice") continue;
    for (const trial of pb.children) {
      for (const u of trial.units) {
        if (u.type !== "pendulumStimulus") continue;
        const E = pendulumEnergy(paramsFromUnit(u));
        if (Math.abs(E - expectedPracticeE) > 0.5) {
          warnings.push(`练习试次能量 ${E.toFixed(2)} 偏离期望 ${expectedPracticeE.toFixed(2)}`);
        }
      }
    }
  }

  // timing 组合完整性已由 assertRuntimeStimulusSet 覆盖；再报告 shuffle 指纹
  const allCombos = allTimingCombos(group).map((c) => comboKey(c.show1T, c.hide1T)).sort();

  return {
    file,
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      motionGroup: group,
      subjectId: raw.subjectId,
      exportedAt: raw.exportedAt,
      formalTrials: stimuli.length,
      omegaPos: pos,
      omegaNeg: neg,
      omegaSignRatio: Number(signRatio.toFixed(3)),
      endPosMean: Number((uEnds.reduce((a, b) => a + b, 0) / uEnds.length).toFixed(4)),
      endPosKSD: Number(ksD.toFixed(4)),
      endPosKsCrit05: Number(ksCrit.toFixed(4)),
      energyOrder: blockEnergyOrder(set, group).map((e) => Number(e.toFixed(2))),
      timingOrderFingerprint: timingOrders(set).join(" || "),
      expectedCombos: allCombos,
    },
  };
}

function main(): void {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error("用法: npx tsx scripts/verify-exported-stimulus-sets.ts <json...>");
    process.exit(2);
  }

  const results = paths.map(verifyOne);
  const byGroup = new Map<number, CheckResult[]>();
  for (const r of results) {
    const g = r.stats.motionGroup as number;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(r);
  }

  // 同组被试间：Block 能量顺序 / timing 顺序不应完全相同
  for (const [g, list] of byGroup) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (JSON.stringify(a.stats.energyOrder) === JSON.stringify(b.stats.energyOrder)) {
          a.warnings.push(`与 ${b.file} 的 Block 能量顺序完全相同（小样本下可能巧合）`);
          b.warnings.push(`与 ${a.file} 的 Block 能量顺序完全相同（小样本下可能巧合）`);
        }
        if (a.stats.timingOrderFingerprint === b.stats.timingOrderFingerprint) {
          a.errors.push(`与 ${b.file} 的全部 Block timing 顺序指纹完全相同（高度可疑，非独立随机）`);
          b.errors.push(`与 ${a.file} 的全部 Block timing 顺序指纹完全相同（高度可疑，非独立随机）`);
          a.ok = false;
          b.ok = false;
        }
      }
    }
    console.log(`\n=== 组 ${g} 被试间差异 ===`);
    for (const r of list) {
      console.log(`  ${r.file}: energyOrder=${JSON.stringify(r.stats.energyOrder)}`);
      console.log(`           ω±=${r.stats.omegaPos}/${r.stats.omegaNeg} KS-D=${r.stats.endPosKSD}`);
    }
  }

  let failed = 0;
  for (const r of results) {
    console.log(`\n--- ${r.file} ---`);
    console.log(
      `group=${r.stats.motionGroup} subject=${r.stats.subjectId} trials=${r.stats.formalTrials} ` +
        `ω+/ω-=${r.stats.omegaPos}/${r.stats.omegaNeg} endMean=${r.stats.endPosMean} KS-D=${r.stats.endPosKSD}`,
    );
    if (r.errors.length) {
      failed++;
      for (const e of r.errors) console.log(`  ERROR: ${e}`);
    } else {
      console.log("  OK: 结构 / timing 组合 / regime / hide 无转向 / 能量覆盖 均通过");
    }
    for (const w of r.warnings) console.log(`  WARN: ${w}`);
  }

  console.log(`\n汇总: ${results.length - failed}/${results.length} 通过`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
