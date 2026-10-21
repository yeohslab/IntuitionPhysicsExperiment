/**
 * 验证实验 runner 进入条件（run token + session 人口学/刺激集）及 finalize 后不可重跑。
 * 运行：npm run verify-run-guard
 */
import {
  beginExperimentRunSessionForExperiment,
  clearExperimentSession,
  hasActiveExperimentRunSession,
  loadParticipantForExperiment,
  loadStimulusSetForExperiment,
  markExperimentRunActiveForExperiment,
  saveParticipantForExperiment,
  saveStimulusSetForExperiment,
  SESSION_RUN_TOKEN_KEY,
} from "../../src/shared/storage.ts";
import type { Experiment2ParticipantInfo } from "../../src/shared/participant.ts";
import {
  EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  type Experiment2StimulusSet,
} from "../../src/shared/experimentTypes.ts";

class MemorySessionStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sessionStorage = new MemorySessionStorage();
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: sessionStorage,
});

const participant: Experiment2ParticipantInfo = {
  subject_id: "E2-0001",
  gender_code: 0,
  age_years: 20,
};
const set: Experiment2StimulusSet = {
  schemaVersion: EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  sequence: [
    {
      kind: "rest",
      id: "rest",
      units: [{ id: "text", type: "textControl", text: "ready", key: " " }],
    },
  ],
};

assert(!hasActiveExperimentRunSession("experiment-2"), "初始状态不应允许进入 runner");

beginExperimentRunSessionForExperiment("experiment-2", participant, set);
assert(hasActiveExperimentRunSession("experiment-2"), "开跑后应允许进入 runner");

clearExperimentSession("experiment-2");
assert(!hasActiveExperimentRunSession("experiment-2"), "finalize/clear 后不应再进入 runner");

markExperimentRunActiveForExperiment("experiment-2");
assert(!hasActiveExperimentRunSession("experiment-2"), "仅有 run token、无人口学/刺激集时不应放行");
assert(sessionStorage.getItem(SESSION_RUN_TOKEN_KEY) === "1", "run token 应已写入");

saveParticipantForExperiment("experiment-2", participant);
assert(!hasActiveExperimentRunSession("experiment-2"), "仅有 token + 人口学、无刺激集时不应放行");

saveStimulusSetForExperiment("experiment-2", set);
assert(hasActiveExperimentRunSession("experiment-2"), "token + 人口学 + 刺激集齐全时应放行");

clearExperimentSession("experiment-2");
assert(!loadParticipantForExperiment("experiment-2"), "clear 后人口学应清除");
assert(!loadStimulusSetForExperiment("experiment-2"), "clear 后刺激集应清除");

console.log("verify-run-guard: OK");
