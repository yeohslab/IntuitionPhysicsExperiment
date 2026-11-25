import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzePendulum } from "../../src/experiment/physics/pendulum";
import { validateRunnableSet } from "../../src/shared/storage";
import { isExperiment2ParticipantInfo, isExperiment4ParticipantInfo, isExperiment5ParticipantInfo, isTraining1ParticipantInfo, type AnyParticipantInfo } from "../../src/shared/participant";
import { generateTraining1RuntimeStimulusSet } from "../../src/experiments/training-1/generateRuntimeSet";
import { generateExperiment2RuntimeStimulusSet } from "../../src/experiments/experiment-2/generateRuntimeSet";
import { generateExperiment4V2RuntimeStimulusSet } from "../../src/experiments/experiment-4-v2/generateRuntimeSet";
import { generateExperiment5V3RuntimeStimulusSet } from "../../src/experiments/experiment-5-v3/generateRuntimeSet";
import { collectTraining1TrialDescriptors } from "../../src/experiments/training-1/trialDescriptor";
import { collectExperiment2TrialDescriptors } from "../../src/experiments/experiment-2/trialDescriptor";
import { collectExperiment4V2TrialDescriptors } from "../../src/experiments/experiment-4-v2/trialDescriptor";
import { collectExperiment5V3TrialDescriptors } from "../../src/experiments/experiment-5-v3/trialDescriptor";
import * as training from "../../src/experiments/training-1/protocol";
import * as exp2 from "../../src/experiments/experiment-2/protocol";
import * as exp4v2 from "../../src/experiments/experiment-4-v2/protocol";
import * as exp5v3 from "../../src/experiments/experiment-5-v3/protocol";
import * as common from "../../src/experiments/protocol-2/common";
import { behaviorColumnsForVariant } from "./behaviorColumns";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const variants = ["training-1", "experiment-2", "experiment-4-v2", "experiment-5-v3"] as const;
export type Variant = typeof variants[number];
export type BuildSessionOptions = { experiment: Variant; participant: AnyParticipantInfo; seed: number };
function rngFromSeed(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function constants(module: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(module).filter(([key, value]) => /^[A-Z][A-Z0-9_]*$/.test(key) && typeof value !== "function"));
}
function finite(value: unknown, where = "session"): void {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Non-finite number at ${where}`);
  if (Array.isArray(value)) value.forEach((v, i) => finite(v, `${where}[${i}]`));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) finite(v, `${where}.${k}`);
}
function provenance(variant: Variant) {
  let revision: string | null = null, dirty: boolean | null = null;
  try { revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); dirty = !!execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(); } catch { /* source hashes remain available outside Git */ }
  const sourceFiles = (dir: string): string[] => readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const relative = `${dir}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(relative) : entry.isFile() && /\.(ts|tsx|css)$/.test(entry.name) ? [relative] : [];
  });
  const paths = [...sourceFiles("src"), `eye_movement_version/tools/exportSession.ts`, `eye_movement_version/tools/behaviorColumns.ts`].sort();
  const source_sha256 = Object.fromEntries(paths.map(p => [p, createHash("sha256").update(readFileSync(path.join(root, p))).digest("hex")]));
  return { git_revision: revision, git_dirty: dirty, source_sha256, rng_algorithm: "mulberry32", seed_scope: "stimulus random choices; generated UUIDs and session metadata are independent of seed" };
}
function physicsFor(sequence: any[]) {
  const result: any[] = [];
  const visit = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.type === "string" && ("theta0Deg" in value || value.type === "protocol2PendulumDemo")) {
      const demo = value.type === "protocol2PendulumDemo";
      const params = { theta0Rad: (demo ? value.amplitudeDeg : value.theta0Deg) * Math.PI / 180, omega0RadPerSec: demo ? 0 : value.omega0DegPerSec * Math.PI / 180, rodLengthM: value.rodLengthM, gravity: value.gravity };
      finite(params, `physics.${value.id}.params`);
      if (Object.values(params).some(v => typeof v !== "number") || params.rodLengthM <= 0 || params.gravity <= 0) throw new Error(`Invalid physics parameters for ${value.id}`);
      const analysis = analyzePendulum(params); finite(analysis, `physics.${value.id}.analysis`);
      result.push({ unit_id: value.id, unit_type: value.type, params, analysis });
    }
    for (const child of Object.values(value)) if (typeof child === "object") Array.isArray(child) ? child.forEach(visit) : visit(child);
  };
  sequence.forEach(visit); return result;
}
export function buildSession({ experiment, participant, seed }: BuildSessionOptions) {
  if (!variants.includes(experiment)) throw new Error(`Unknown experiment: ${experiment}`);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed must be an unsigned 32-bit integer");
  const valid = experiment === "training-1" ? isTraining1ParticipantInfo(participant) : experiment === "experiment-2" ? isExperiment2ParticipantInfo(participant) : experiment.startsWith("experiment-4") ? isExperiment4ParticipantInfo(participant) : isExperiment5ParticipantInfo(participant);
  if (!valid) throw new Error(`Invalid participant for ${experiment}`);
  const rng = rngFromSeed(seed);
  let stimulus_set: any, trial_descriptors: any[], module: Record<string, unknown>, version: string, experiment_id: string;
  switch (experiment) {
    case "training-1": stimulus_set = generateTraining1RuntimeStimulusSet(participant, {rng}); trial_descriptors = collectTraining1TrialDescriptors(stimulus_set); module = training; version = training.TRAINING_1_PROTOCOL_VERSION; experiment_id = experiment; break;
    case "experiment-2": stimulus_set = generateExperiment2RuntimeStimulusSet({subjectId: participant.subject_id, rng}); trial_descriptors = collectExperiment2TrialDescriptors(stimulus_set); module = exp2; version = exp2.EXPERIMENT_2_PROTOCOL_VERSION; experiment_id = experiment; break;
    case "experiment-4-v2": stimulus_set = generateExperiment4V2RuntimeStimulusSet(participant, {rng}); trial_descriptors = collectExperiment4V2TrialDescriptors(stimulus_set); module = exp4v2; version = exp4v2.EXPERIMENT_4_V2_PROTOCOL_VERSION; experiment_id = "experiment-4"; break;
    case "experiment-5-v3": stimulus_set = generateExperiment5V3RuntimeStimulusSet(participant, {rng}); trial_descriptors = collectExperiment5V3TrialDescriptors(stimulus_set); module = exp5v3; version = exp5v3.EXPERIMENT_5_V3_PROTOCOL_VERSION; experiment_id = "experiment-5"; break;
  }
  const error = validateRunnableSet(stimulus_set); if (error) throw new Error(`Invalid generated stimulus set: ${error}`);
  const physics = physicsFor(stimulus_set.sequence);
  const session = { eye_session_schema_version: 1, session_id: randomUUID(), created_at: new Date().toISOString(), runtime_variant_id: experiment, experiment_id, protocol_version: version, participant, rng_seed: seed, provenance: provenance(experiment), stimulus_set, trial_descriptors, physics, protocol_settings: { constants: constants(module), protocol_2_constants: constants(common), ...(experiment === "training-1" ? { retry_control: "Python runner evaluates mastery after each assessment and repeats remediation and reassessment templates until passed; trials in stimulus_set are finite templates.", feedback_phase_can_be_skipped: true } : {}) }, behavior_columns: behaviorColumnsForVariant(experiment), assets: { masked_hum: "assets/masked-hum.wav" } };
  finite(session); return session;
}
function main() {
  const args = process.argv.slice(2); const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) { const key = args[i]; if (!key?.startsWith("--") || !args[i+1] || !["--experiment","--subject","--gender","--age","--seed","--output"].includes(key) || key in parsed) throw new Error(`Invalid or duplicate argument: ${key}`); parsed[key] = args[i+1]!; }
  for (const key of ["--experiment","--subject","--gender","--age"]) if (!parsed[key]) throw new Error(`Missing ${key}`);
  const numeric = (s: string, label: string) => { if (!/^\d+$/.test(s)) throw new Error(`Invalid ${label}`); return Number(s); };
  const seed = parsed["--seed"] === undefined ? randomBytes(4).readUInt32LE() : numeric(parsed["--seed"], "seed");
  const session = buildSession({ experiment: parsed["--experiment"] as Variant, participant: { subject_id: parsed["--subject"]!, gender_code: numeric(parsed["--gender"]!, "gender") as 0|1, age_years: numeric(parsed["--age"]!, "age") }, seed });
  const destination = parsed["--output"] ? path.resolve(parsed["--output"]!) : path.join(root, "eye_movement_version", "sessions", `${session.runtime_variant_id}_${session.participant.subject_id}_${session.session_id}.json`);
  mkdirSync(path.dirname(destination), {recursive: true}); writeFileSync(destination, JSON.stringify(session, null, 2) + "\n", {flag: "wx"}); console.log(destination);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { main(); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; } }
