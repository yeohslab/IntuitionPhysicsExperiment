/**
 * 验证首页流程：确认生成的刺激集写入 session 后再读取的内容一致。
 * 运行：npm run verify-session
 */
import {
  beginExperimentRunSessionForExperiment,
  clearExperimentSession,
  hasActiveExperimentRunSession,
  loadParticipantForExperiment,
  loadStimulusSetForExperiment,
  parseExperiment2StimulusSet,
} from "../../src/shared/storage.ts";
import {
  EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  type Experiment2StimulusSet,
  type PendulumStimulusUnit,
} from "../../src/shared/experimentTypes.ts";
import {
  buildExperiment2SubjectId,
  isValidExperiment2SubjectId,
  normalizeAgeYears,
  normalizeGenderCode,
  normalizeWithinGroupNumber,
  type Experiment2ParticipantInfo,
} from "../../src/shared/participant.ts";
import {
  disambiguateDownloadFilename,
  resetDownloadFilenameDisambiguation,
} from "../../src/shared/download.ts";

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(normalizeGenderCode("0") === 0, "gender_code=0 应合法");
assert(normalizeGenderCode(1) === 1, "gender_code=1 应合法");
assert(normalizeGenderCode("male") === null, "非法 gender_code 应拒绝");
assert(normalizeAgeYears(1) === 1, "年龄下界 1 应合法");
assert(normalizeAgeYears("120") === 120, "年龄上界 120 应合法");
assert(normalizeAgeYears(121) === null, "非法年龄应拒绝");
assert(normalizeWithinGroupNumber("1") === "0001", "组内序号应格式化为四位");
assert(buildExperiment2SubjectId("0001") === "E2-0001", "实验二编号应为 E2- 加四位");
assert(isValidExperiment2SubjectId("E2-0001"), "E2-0001 应合法");
assert(!isValidExperiment2SubjectId("10001"), "组别编号不能冒充实验二编号");

resetDownloadFilenameDisambiguation();
assert(
  disambiguateDownloadFilename("experiment-2_v2.0_data_subjectE2-0001_f.csv") ===
    "experiment-2_v2.0_data_subjectE2-0001_f.csv",
  "首次下载应使用原文件名",
);
assert(
  disambiguateDownloadFilename("experiment-2_v2.0_data_subjectE2-0001_f.csv") ===
    "experiment-2_v2.0_data_subjectE2-0001_f (1).csv",
  "第二次下载应加 (1)",
);
resetDownloadFilenameDisambiguation();

const participant: Experiment2ParticipantInfo = {
  subject_id: "E2-0001",
  gender_code: 1,
  age_years: 21,
};
const pendingSet: Experiment2StimulusSet = {
  schemaVersion: EXPERIMENT_2_STIMULUS_SET_SCHEMA_VERSION,
  sequence: [
    {
      kind: "practice",
      id: "practice",
      children: [
        {
          id: "trial-1",
          units: [
            {
              id: "stim-1",
              type: "pendulumStimulus",
              theta0Deg: 10,
              omega0DegPerSec: 0,
              rodLengthM: 4,
              gravity: 9.8,
              totalTimeT: 1,
              show1T: 1.2,
              hide1T: 0.7,
              fadeMs: 200,
            },
          ],
        },
      ],
    },
  ],
};

function fingerprint(set: Experiment2StimulusSet): string {
  const parts: string[] = [];
  for (const item of set.sequence) {
    parts.push(`${item.kind}:${item.id}`);
    if (item.kind !== "block" && item.kind !== "practice") continue;
    for (const trial of item.children) {
      const stim = trial.units.find((unit) => unit.type === "pendulumStimulus");
      if (stim?.type === "pendulumStimulus") {
        const pendulum = stim as PendulumStimulusUnit;
        parts.push(
          [pendulum.id, pendulum.theta0Deg, pendulum.omega0DegPerSec, pendulum.show1T, pendulum.hide1T].join(","),
        );
      }
    }
  }
  return parts.join("|");
}

const loaded = parseExperiment2StimulusSet(JSON.parse(JSON.stringify(pendingSet)) as unknown);
if (!loaded) throw new Error("session 解析失败");
if (parseExperiment2StimulusSet({ ...pendingSet, schemaVersion: 2 })) {
  throw new Error("实验二旧运行时 schema v2 应被拒绝");
}
if (fingerprint(pendingSet) !== fingerprint(loaded)) {
  throw new Error("session 往返后与 pendingSet 指纹不一致");
}

beginExperimentRunSessionForExperiment("experiment-2", participant, pendingSet);
assert(hasActiveExperimentRunSession("experiment-2"), "实验二 run session 应有效");
assert(
  loadParticipantForExperiment("experiment-2") !== null &&
    loadStimulusSetForExperiment("experiment-2") !== null,
  "run session 应包含人口学与刺激集",
);

clearExperimentSession("experiment-2");
assert(!hasActiveExperimentRunSession("experiment-2"), "clear 后不应再允许进入 runner");
assert(loadParticipantForExperiment("experiment-2") === null, "clear 后人口学应清除");
assert(loadStimulusSetForExperiment("experiment-2") === null, "clear 后刺激集应清除");

console.log("verify-start-session-flow: OK");
