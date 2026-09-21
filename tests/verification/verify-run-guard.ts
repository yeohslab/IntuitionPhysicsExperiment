/**
 * 验证 #/runner 进入条件（run token + session 人口学/刺激集）及 finalize 后不可重跑。
 * 运行：npm run verify-run-guard
 */
import { generateRuntimeStimulusSet } from "../../src/experiment/stimulus/generateRuntimeSet.ts";
import {
  beginExperimentRunSession,
  clearExperimentSession,
  hasActiveExperimentRunSession,
  loadParticipantFromSession,
  loadStimulusSetFromSession,
  markExperimentRunActive,
  saveParticipantToSession,
  saveStimulusSetToSession,
  SESSION_RUN_TOKEN_KEY,
} from "../../src/shared/storage.ts";
import type { ParticipantInfo } from "../../src/shared/participant.ts";

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

const participant: ParticipantInfo = {
  subject_id: "10001",
  motion_group: 1,
  gender_code: 0,
  age_years: 20,
};

const set = generateRuntimeStimulusSet({
  group: 1,
  subjectId: participant.subject_id,
  rng: () => 0.271828,
});

assert(!hasActiveExperimentRunSession(), "初始状态不应允许进入 runner");

beginExperimentRunSession(participant, set);
assert(hasActiveExperimentRunSession(), "开跑后应允许进入 runner");

clearExperimentSession();
assert(!hasActiveExperimentRunSession(), "finalize/clear 后不应再进入 runner（模拟后退重跑防护）");

markExperimentRunActive();
assert(!hasActiveExperimentRunSession(), "仅有 run token、无人口学/刺激集时不应放行");
assert(sessionStorage.getItem(SESSION_RUN_TOKEN_KEY) === "1", "run token 应已写入");

saveParticipantToSession(participant);
assert(!hasActiveExperimentRunSession(), "仅有 token + 人口学、无刺激集时不应放行");

saveStimulusSetToSession(set);
assert(hasActiveExperimentRunSession(), "token + 人口学 + 刺激集齐全时应放行");

clearExperimentSession();
assert(!loadParticipantFromSession(), "clear 后人口学应清除");
assert(!loadStimulusSetFromSession(), "clear 后刺激集应清除");

console.log("verify-run-guard: OK");
