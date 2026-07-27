import { generateRuntimeStimulusSet } from "../../src/experiment/stimulus/generateRuntimeSet.ts";
import {
  beginRecoverySnapshot,
  clearRecoverySnapshot,
  loadRecoverySnapshot,
  updateRecoveryCursor,
  updateRecoveryRows,
  type RecoveryPhase,
} from "../../src/shared/recovery.ts";
import type { ParticipantInfo } from "../../src/shared/participant.ts";

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

const participant: ParticipantInfo = {
  subject_id: "0001",
  motion_group: 1,
  gender_code: 0,
  age_years: 20,
};
const set = generateRuntimeStimulusSet({
  group: 1,
  subjectId: participant.subject_id,
  rng: () => 0.314159265,
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

clearRecoverySnapshot();
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
