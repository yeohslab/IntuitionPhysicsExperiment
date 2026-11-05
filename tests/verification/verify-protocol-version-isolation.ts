import {
  beginExperimentRunSessionForExperiment,
  clearExperimentSession,
  hasActiveExperimentRunSession,
} from "../../src/shared/storage.ts";
import {
  EXPERIMENT_4_V2_STIMULUS_SET_SCHEMA_VERSION,
  EXPERIMENT_5_V2_STIMULUS_SET_SCHEMA_VERSION,
  type Experiment4V2StimulusSet,
  type Experiment5V2StimulusSet,
} from "../../src/shared/experimentTypes.ts";
import { readFileSync } from "node:fs";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
const participant4 = { subject_id: "E4-0001", gender_code: 0 as const, age_years: 20 };
const participant5 = { subject_id: "E5-0001", gender_code: 1 as const, age_years: 21 };
const demo = {
  kind: "rest" as const,
  id: "rest",
  units: [{
    id: "demo", type: "protocol2PendulumDemo" as const, amplitudeDeg: 50,
    rodLengthM: 4, gravity: 9.8, bobRadiusM: 0.08,
  }],
};
const set4: Experiment4V2StimulusSet = {
  schemaVersion: EXPERIMENT_4_V2_STIMULUS_SET_SCHEMA_VERSION,
  sequence: [demo],
};
const set5: Experiment5V2StimulusSet = {
  schemaVersion: EXPERIMENT_5_V2_STIMULUS_SET_SCHEMA_VERSION,
  sequence: [{ ...demo, id: "rest-5" }],
};
beginExperimentRunSessionForExperiment("experiment-4-v2", participant4, set4);
assert(hasActiveExperimentRunSession("experiment-4-v2"), "实验四V2会话应有效");
assert(!hasActiveExperimentRunSession("experiment-4"), "实验四V1不应读取V2会话");
beginExperimentRunSessionForExperiment("experiment-5-v2", participant5, set5);
assert(hasActiveExperimentRunSession("experiment-5-v2"), "实验五V2会话应有效");
assert(!hasActiveExperimentRunSession("experiment-5"), "实验五V1不应读取V2会话");
assert(storage.values.has("intuition-physics:experiment-4-v2:stimulus-set"), "实验四V2键错误");
assert(storage.values.has("intuition-physics:experiment-5-v2:stimulus-set"), "实验五V2键错误");
const routerSource = readFileSync(new URL("../../src/app/router.ts", import.meta.url), "utf8");
assert(routerSource.includes('"/experiment-4/v2/start"'), "实验四V2开始路由错误");
assert(routerSource.includes('"/experiment-5/v2/runner"'), "实验五V2运行路由错误");
clearExperimentSession("experiment-4-v2");
clearExperimentSession("experiment-5-v2");

console.log("verify-protocol-version-isolation: OK");
