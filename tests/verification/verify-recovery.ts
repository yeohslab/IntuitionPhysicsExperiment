import {
  beginRecoverySnapshot,
  clearRecoverySnapshot,
  loadRecoverySnapshot,
  markRecoveryExported,
  updateRecoveryCursor,
  updateRecoveryRows,
  type RecoveryPhase,
} from "../../src/shared/recovery.ts";
import type { Experiment2ParticipantInfo } from "../../src/shared/participant.ts";
import {
  EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  type Experiment2StimulusSet,
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

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

const participant: Experiment2ParticipantInfo = {
  subject_id: "E2-0001",
  gender_code: 1,
  age_years: 21,
};
const set: Experiment2StimulusSet = {
  schemaVersion: EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  sequence: [
    {
      kind: "rest",
      id: "exp2-rest",
      units: [{ id: "exp2-text", type: "textControl", text: "test", key: " " }],
    },
  ],
};

assert(beginRecoverySnapshot(participant, set, "experiment-2"), "首次恢复快照应成功");
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
  assert(updateRecoveryCursor({ phase }, "experiment-2"), `阶段 ${phase} 快照应成功`);
  assert(
    loadRecoverySnapshot("experiment-2")?.cursor.phase === phase,
    `阶段 ${phase} 应可恢复`,
  );
}
assert(
  updateRecoveryRows(
    [
      {
        trial_type: "physics-stimulus",
        segment_kind: "block",
        unit_type: "pendulumStimulus",
        formal_trial_index: 1,
      },
    ],
    "experiment-2",
  ),
  "响应快照应成功",
);
assert(loadRecoverySnapshot("experiment-2")?.rows.length === 1, "恢复后应保留已完成响应");

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
    "experiment-2",
  ),
  "结束导出后应保留 exported 快照",
);
const exported = loadRecoverySnapshot("experiment-2");
assert(exported?.lifecycle === "exported", "lifecycle 应为 exported");
assert(exported?.experiment_status === "f", "应保留完成状态");
assert(
  !updateRecoveryRows([{ trial_type: "physics-stimulus" }], "experiment-2"),
  "exported 快照不应再被 running 更新覆盖",
);

clearRecoverySnapshot("experiment-2");
storage.setItem(
  "intuition-physics:experiment-2:recovery-v1",
  JSON.stringify({
    version: 1,
    lifecycle: "running",
    participant,
    stimulus_set: { ...set, schemaVersion: 2 },
    rows: [],
    cursor: { phase: "generated" },
    updated_at: new Date().toISOString(),
  }),
);
assert(
  loadRecoverySnapshot("experiment-2") === null,
  "实验二旧运行时 schema v2 恢复快照应被拒绝",
);
clearRecoverySnapshot("experiment-2");
storage.failWrites = true;
const originalConsoleError = console.error;
try {
  console.error = () => {};
  assert(
    !beginRecoverySnapshot(participant, set, "experiment-2"),
    "首次 localStorage 写入失败时必须阻止开始",
  );
} finally {
  console.error = originalConsoleError;
}

console.log("verify-recovery: 全部通过");
