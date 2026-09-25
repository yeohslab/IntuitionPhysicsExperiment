import { generateRuntimeStimulusSet } from "../../src/experiments/experiment-1/generateRuntimeSet.ts";
import {
  beginRecoverySnapshot,
  clearRecoverySnapshot,
  EXPERIMENT_1_RECOVERY_KEY,
  LEGACY_RECOVERY_KEY,
  loadRecoverySnapshot,
  markRecoveryExported,
  migrateLegacyExperiment1Recovery,
  updateRecoveryCursor,
  updateRecoveryRows,
  type RecoveryPhase,
} from "../../src/shared/recovery.ts";
import type {
  Experiment2ParticipantInfo,
  Experiment3ParticipantInfo,
  ParticipantInfo,
} from "../../src/shared/participant.ts";
import {
  EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  type Experiment2StimulusSet,
  type Experiment3StimulusSet,
} from "../../src/shared/experimentTypes.ts";

class MemoryStorage {
  private values = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("simulated quota/security failure");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
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
  rng: mulberry32(31_415),
});

assert(beginRecoverySnapshot(participant, set), "首次恢复快照应成功");
const phases: RecoveryPhase[] = [
  "generated",
  "timeline_unit",
  "fixation",
  "show",
  "fade",
  "hide",
  "estimate",
  "feedback",
  "between_trials",
];
for (const phase of phases) {
  assert(updateRecoveryCursor({ phase }), `阶段 ${phase} 快照应成功`);
  assert(loadRecoverySnapshot()?.cursor.phase === phase, `阶段 ${phase} 应可恢复`);
}
assert(
  updateRecoveryRows([
    {
      trial_type: "physics-stimulus",
      segment_kind: "block",
      unit_type: "pendulumStimulus",
      formal_trial_index: 1,
    },
  ]),
  "响应快照应成功",
);
assert(loadRecoverySnapshot()?.rows.length === 1, "恢复后应保留已完成响应");

assert(
  markRecoveryExported(
    [
      {
        trial_type: "physics-stimulus",
        segment_kind: "block",
        unit_type: "pendulumStimulus",
        formal_trial_index: 1,
      },
    ],
    "f",
  ),
  "结束导出后应保留 exported 快照",
);
const exported = loadRecoverySnapshot();
assert(exported?.lifecycle === "exported", "lifecycle 应为 exported");
assert(exported?.experiment_status === "f", "应保留完成状态");
assert(
  !updateRecoveryRows([{ trial_type: "physics-stimulus" }]),
  "exported 快照不应再被 running 更新覆盖",
);

clearRecoverySnapshot();
storage.setItem(
  LEGACY_RECOVERY_KEY,
  JSON.stringify({
    version: 1,
    lifecycle: "running",
    participant,
    stimulus_set: set,
    rows: [],
    cursor: { phase: "generated" },
    updated_at: new Date().toISOString(),
  }),
);
assert(migrateLegacyExperiment1Recovery(), "旧恢复快照应迁移到实验一命名空间");
assert(loadRecoverySnapshot()?.participant.subject_id === participant.subject_id, "迁移后的恢复快照应可读");
assert(storage.getItem(LEGACY_RECOVERY_KEY) === null, "迁移成功后应删除旧恢复键");
assert(storage.getItem(EXPERIMENT_1_RECOVERY_KEY) !== null, "迁移后应写入实验一恢复键");
clearRecoverySnapshot();
const experiment2Participant: Experiment2ParticipantInfo = {
  subject_id: "E2-0001",
  gender_code: 1,
  age_years: 21,
};
const experiment2Set: Experiment2StimulusSet = {
  schemaVersion: EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  sequence: [
    {
      kind: "rest",
      id: "exp2-rest",
      units: [{ id: "exp2-text", type: "textControl", text: "test", key: " " }],
    },
  ],
};
assert(
  beginRecoverySnapshot(experiment2Participant, experiment2Set, "experiment-2"),
  "实验二恢复快照应可独立保存",
);
assert(loadRecoverySnapshot("experiment-1") === null, "实验二恢复不得激活实验一");
clearRecoverySnapshot("experiment-1");
assert(loadRecoverySnapshot("experiment-2") !== null, "清除实验一不得影响实验二恢复快照");
const experiment3Participant: Experiment3ParticipantInfo = {
  subject_id: "E3-0001",
  gender_code: 0,
  age_years: 22,
};
const experiment3Set: Experiment3StimulusSet = {
  schemaVersion: 1,
  sequence: [
    {
      kind: "rest",
      id: "exp3-rest",
      units: [{ id: "exp3-text", type: "textControl", text: "test", key: " " }],
    },
  ],
};
assert(
  beginRecoverySnapshot(experiment3Participant, experiment3Set, "experiment-3"),
  "实验三恢复快照应可独立保存",
);
assert(loadRecoverySnapshot("experiment-2") !== null, "实验三恢复不得覆盖实验二");
clearRecoverySnapshot("experiment-2");
assert(loadRecoverySnapshot("experiment-3") !== null, "清除实验二不得影响实验三恢复快照");
clearRecoverySnapshot("experiment-3");
storage.setItem(
  "intuition-physics:experiment-2:recovery-v1",
  JSON.stringify({
    version: 1,
    lifecycle: "running",
    participant: experiment2Participant,
    stimulus_set: { ...experiment2Set, schemaVersion: 2 },
    rows: [],
    cursor: { phase: "generated" },
    updated_at: new Date().toISOString(),
  }),
);
assert(
  loadRecoverySnapshot("experiment-2") === null,
  "实验二旧运行时schema v2恢复快照应被拒绝",
);
clearRecoverySnapshot("experiment-2");
storage.failWrites = true;
const originalConsoleError = console.error;
try {
  console.error = () => {};
  assert(
    !beginRecoverySnapshot(participant, set),
    "首次 localStorage 写入失败时必须阻止开始",
  );
} finally {
  console.error = originalConsoleError;
}

console.log("verify-recovery: 全部通过");
