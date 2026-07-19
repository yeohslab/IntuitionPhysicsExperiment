/**
 * 从 stimulate/ 下导出的刺激集 JSON 计算正式 Block 终点角，
 * 写出 CSV 并调用 Python 绘制两组直方图。
 *
 * 用法：npx tsx scripts/plot-stimulate-end-theta-hist.ts
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pendulumAngleDegFromRad } from "../src/physics/pendulumArcScore.ts";
import { pendulumThetaAtSimEnd } from "../src/physics/simEndState.ts";
import { STIMULUS_FADE_MS } from "../src/physics/timePhases.ts";
import type { StimulusSetExportPayload } from "../src/shared/exportStimulusSetJson.ts";
import type { ExperimentStimulusSet, PendulumStimulusUnit } from "../src/types/experiment.ts";

const ROOT = join(import.meta.dirname, "..");
const STIMULATE_DIR = join(ROOT, "stimulate");
const CSV_PATH = join(STIMULATE_DIR, "end_theta_by_group.csv");
const PLOT_SCRIPT = join(STIMULATE_DIR, "plot_end_theta_hist.py");

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

function main(): void {
  const files = readdirSync(STIMULATE_DIR)
    .filter((f) => /^stimulus_set_group[12]_subject\d+\.json$/.test(f))
    .sort();
  if (files.length === 0) {
    throw new Error(`未在 ${STIMULATE_DIR} 找到 stimulus_set_group*_subject*.json`);
  }

  const rows: string[] = ["group,subject_id,source_file,theta_end_deg"];
  const counts = { 1: 0, 2: 0 } as Record<1 | 2, number>;

  for (const file of files) {
    const path = join(STIMULATE_DIR, file);
    const payload = JSON.parse(readFileSync(path, "utf-8")) as StimulusSetExportPayload;
    const group = payload.motionGroup;
    if (group !== 1 && group !== 2) {
      throw new Error(`${file}: motionGroup 无效 (${String(group)})`);
    }
    const stimuli = collectFormalStimuli(payload.stimulusSet);
    for (const u of stimuli) {
      const timing = {
        show1T: u.show1T,
        hide1T: u.hide1T,
        show2T: u.show2T,
        hide2T: u.hide2T,
        fadeMs: u.fadeMs ?? STIMULUS_FADE_MS,
        totalTimeT: u.totalTimeT,
      };
      const thetaEndDeg = pendulumAngleDegFromRad(pendulumThetaAtSimEnd(paramsFromUnit(u), timing));
      rows.push(`${group},${payload.subjectId},${basename(file)},${thetaEndDeg}`);
      counts[group] += 1;
    }
  }

  writeFileSync(CSV_PATH, `${rows.join("\n")}\n`, "utf-8");
  console.log(`Wrote ${CSV_PATH} (group1=${counts[1]}, group2=${counts[2]})`);

  const py = spawnSync("uv", ["run", "python", PLOT_SCRIPT, CSV_PATH, STIMULATE_DIR], {
    cwd: ROOT,
    encoding: "utf-8",
  });
  if (py.stdout) process.stdout.write(py.stdout);
  if (py.stderr) process.stderr.write(py.stderr);
  if (py.status !== 0) {
    throw new Error(`plot_end_theta_hist.py failed (exit ${py.status ?? "null"})`);
  }
}

main();
