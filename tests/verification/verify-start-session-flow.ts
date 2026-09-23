/**
 * 验证首页流程：确认生成的 pendingSet 与写入 session 后再读取的内容一致。
 * 运行：npm run verify-session
 */
import { generateRuntimeStimulusSet } from "../../src/experiments/experiment-1/generateRuntimeSet.ts";
import {
  beginExperimentRunSession,
  beginExperimentRunSessionForExperiment,
  clearExperimentSession,
  hasActiveExperimentRunSession,
  LEGACY_SESSION_PARTICIPANT_KEY,
  LEGACY_SESSION_RUN_TOKEN_KEY,
  LEGACY_SESSION_STIMULUS_KEY,
  loadParticipantFromSession,
  loadParticipantForExperiment,
  loadStimulusSetFromSession,
  loadStimulusSetForExperiment,
  migrateLegacyExperiment1Session,
  parseExperiment2StimulusSet,
  parseExperimentStimulusSet,
} from "../../src/shared/storage.ts";
import type {
  Experiment2StimulusSet,
  ExperimentStimulusSet,
  PendulumStimulusUnit,
} from "../../src/shared/experimentTypes.ts";
import type {
  Experiment2ParticipantInfo,
  ParticipantInfo,
} from "../../src/shared/participant.ts";

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

function fingerprint(set: ExperimentStimulusSet): string {
  const parts: string[] = [];
  for (const item of set.sequence) {
    parts.push(`${item.kind}:${item.id}`);
    if (item.kind !== "block" && item.kind !== "practice") continue;
    for (const trial of item.children) {
      const stim = trial.units.find((u) => u.type === "pendulumStimulus");
      if (stim?.type === "pendulumStimulus") {
        const s = stim as PendulumStimulusUnit;
        parts.push([s.id, s.theta0Deg, s.omega0DegPerSec, s.show1T, s.hide1T].join(","));
      }
    }
  }
  return parts.join("|");
}

// 1. 确认：生成一次
const pendingSet = generateRuntimeStimulusSet({
  group: 1,
  subjectId: "0042",
  rng: mulberry32(42099),
});
const fpPending = fingerprint(pendingSet);

// 2. 导出：同一对象引用
const fpExport = fingerprint(pendingSet);

// 3. 开始：JSON 写入 session 再 parse（与 saveStimulusSetToSession / loadStimulusSetFromSession 相同）
const loaded = parseExperimentStimulusSet(JSON.parse(JSON.stringify(pendingSet)) as unknown);
if (!loaded) throw new Error("session 解析失败");
const legacySchema6 = {
  ...JSON.parse(JSON.stringify(pendingSet)),
  schemaVersion: 6,
};
if (parseExperimentStimulusSet(legacySchema6) !== null) {
  throw new Error("旧 schema v6 刺激缓存应失效");
}
const fpSession = fingerprint(loaded);

if (fpPending !== fpExport) {
  throw new Error("导出对象与 pendingSet 指纹不一致");
}
if (fpPending !== fpSession) {
  throw new Error("session 往返后与 pendingSet 指纹不一致");
}

beginExperimentRunSession(participant, pendingSet);
if (!hasActiveExperimentRunSession()) {
  throw new Error("beginExperimentRunSession 后应有有效 run session");
}
if (!loadParticipantFromSession() || !loadStimulusSetFromSession()) {
  throw new Error("run session 应包含人口学与刺激集");
}

clearExperimentSession();
if (hasActiveExperimentRunSession()) {
  throw new Error("clearExperimentSession 后不应再允许进入 runner");
}
if (loadParticipantFromSession() || loadStimulusSetFromSession()) {
  throw new Error("clearExperimentSession 应清除 session 数据");
}

sessionStorage.setItem(LEGACY_SESSION_PARTICIPANT_KEY, JSON.stringify(participant));
sessionStorage.setItem(LEGACY_SESSION_STIMULUS_KEY, JSON.stringify(pendingSet));
sessionStorage.setItem(LEGACY_SESSION_RUN_TOKEN_KEY, "1");
if (!migrateLegacyExperiment1Session()) {
  throw new Error("旧实验一 session 应迁移到命名空间");
}
if (!hasActiveExperimentRunSession("experiment-1")) {
  throw new Error("迁移后实验一 run session 应有效");
}
if (
  sessionStorage.getItem(LEGACY_SESSION_PARTICIPANT_KEY) ||
  sessionStorage.getItem(LEGACY_SESSION_STIMULUS_KEY) ||
  sessionStorage.getItem(LEGACY_SESSION_RUN_TOKEN_KEY)
) {
  throw new Error("成功迁移后应删除旧 session 键");
}
clearExperimentSession("experiment-1");

const experiment2Participant: Experiment2ParticipantInfo = {
  subject_id: "E2-0001",
  gender_code: 1,
  age_years: 21,
};
const experiment2Set: Experiment2StimulusSet = {
  schemaVersion: 1,
  sequence: [
    {
      kind: "rest",
      id: "exp2-rest",
      units: [{ id: "exp2-text", type: "textControl", text: "test", key: " " }],
    },
  ],
};
if (!parseExperiment2StimulusSet(experiment2Set)) {
  throw new Error("实验二 schema v1 应可解析");
}
beginExperimentRunSessionForExperiment(
  "experiment-2",
  experiment2Participant,
  experiment2Set,
);
if (!hasActiveExperimentRunSession("experiment-2")) {
  throw new Error("实验二 run session 应有效");
}
if (hasActiveExperimentRunSession("experiment-1")) {
  throw new Error("实验二 session 不得激活实验一");
}
clearExperimentSession("experiment-1");
if (
  !loadParticipantForExperiment("experiment-2") ||
  !loadStimulusSetForExperiment("experiment-2")
) {
  throw new Error("清除实验一不得影响实验二 session");
}
clearExperimentSession("experiment-2");

const blocks = pendingSet.sequence.filter((x) => x.kind === "block").length;
const trialsPerBlock = pendingSet.sequence.find((x) => x.kind === "block")?.children.length ?? 0;
console.log(
  `verify-start-session-flow: OK（${blocks} Block × ${trialsPerBlock} Trial，指纹一致）`,
);
