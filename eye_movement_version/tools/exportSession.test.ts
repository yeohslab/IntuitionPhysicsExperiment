import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildSession, type Variant } from "./exportSession";
import { createHash } from "node:crypto";
import { training1WelcomeText } from "../../src/experiments/training-1/instructions";
import { experiment2WelcomeText } from "../../src/experiments/experiment-2/instructions";
import { experiment4V2WelcomeText } from "../../src/experiments/experiment-4-v2/instructions";
import { experiment5V3WelcomeText } from "../../src/experiments/experiment-5-v3/instructions";

const welcomeText: Record<Variant, () => string> = {
  "training-1": training1WelcomeText,
  "experiment-2": experiment2WelcomeText,
  "experiment-4-v2": experiment4V2WelcomeText,
  "experiment-5-v3": experiment5V3WelcomeText,
};

const configs: { variant: Variant; subject: string; total: number; formal: number; physics: number }[] = [
  {variant:"training-1",subject:"T1-0001",total:44,formal:0,physics:0},
  {variant:"experiment-2",subject:"E2-0001",total:159,formal:150,physics:159},
  {variant:"experiment-4-v2",subject:"E4-0001",total:108,formal:96,physics:108},
  {variant:"experiment-5-v3",subject:"E5-0001",total:40,formal:36,physics:40},
];
function stable(value: unknown) {
  const ids = new Map<string,string>();
  return JSON.stringify(value, (_key, v) => typeof v === "string" ? v.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, id => { if (!ids.has(id)) ids.set(id, `UUID${ids.size}`); return ids.get(id)!; }) : v);
}
for (const c of configs) test(`${c.variant} generates valid deterministic stimuli`, () => {
  const options = { experiment:c.variant, participant:{subject_id:c.subject,gender_code:0 as const,age_years:20}, seed:123 };
  const a = buildSession(options), b = buildSession(options);
  assert.equal(stable(a.stimulus_set.sequence), stable(b.stimulus_set.sequence));
  assert.ok(JSON.stringify(a.stimulus_set.sequence).includes(JSON.stringify(welcomeText[c.variant]())),
    "EyeLink session must include the current browser welcome text verbatim");
  const instructionsSource = `src/experiments/${c.variant}/instructions.ts`;
  assert.equal(a.provenance.source_sha256[instructionsSource],
    createHash("sha256").update(readFileSync(instructionsSource)).digest("hex"));
  const pluginSource = "src/runtime/plugins/bellReachabilityV3Plugin.ts";
  assert.equal(a.provenance.source_sha256[pluginSource],
    createHash("sha256").update(readFileSync(pluginSource)).digest("hex"));
  assert.equal(a.protocol_version, c.variant === "training-1" ? "1.0.0" : c.variant === "experiment-5-v3" ? "3.0.0" : "2.0.0");
  assert.equal(a.trial_descriptors.length,c.total);
  assert.equal(a.trial_descriptors.filter((x: any) => x.segment_kind === "block").length,c.formal);
  assert.equal(a.physics.length,c.physics);
  for (const x of a.physics) for (const v of Object.values(x.analysis)) if (typeof v === "number") assert.ok(Number.isFinite(v));
  assert.equal(a.assets.masked_hum,"assets/masked-hum.wav");
  assert.deepEqual(readFileSync(path.resolve("eye_movement_version",a.assets.masked_hum)), readFileSync(path.resolve("public/audio/masked-hum.wav")));
});
test("unsupported variants, participant and seed are rejected", () => {
  const participant = { subject_id:"E2-0001",gender_code:0 as const,age_years:20 };
  assert.throws(() => buildSession({ experiment:"experiment-4" as Variant,participant,seed:0 }));
  assert.throws(() => buildSession({ experiment:"experiment-2",participant:{...participant,subject_id:"E2-0000"},seed:0 }));
  assert.throws(() => buildSession({ experiment:"experiment-2",participant,seed:-1 }));
});
test("CLI does not overwrite existing output", () => {
  const dir = mkdtempSync(path.join(tmpdir(),"eye-export-")), out = path.join(dir,"session.json");
  try {
    writeFileSync(out,"existing");
    const cli = spawnSync(process.execPath,["--import","tsx","eye_movement_version/tools/exportSession.ts","--experiment","training-1","--subject","T1-0001","--gender","0","--age","20","--seed","1","--output",out],{encoding:"utf8"});
    assert.notEqual(cli.status,0,cli.stderr); assert.equal(readFileSync(out,"utf8"),"existing");
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
