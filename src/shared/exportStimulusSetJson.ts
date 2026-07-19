import { STIMULUS_SET_SCHEMA_VERSION, type ExperimentStimulusSet } from "../types/experiment";
import type { MotionGroup } from "../subjectStimulus";

export type StimulusSetExportPayload = {
  exportSchemaVersion: 1;
  stimulusSetSchemaVersion: typeof STIMULUS_SET_SCHEMA_VERSION;
  exportedAt: string;
  motionGroup: MotionGroup;
  subjectId: string;
  stimulusSet: ExperimentStimulusSet;
};

export function stimulusSetExportFilename(motionGroup: MotionGroup, subjectId: string): string {
  return `stimulus_set_group${motionGroup}_subject${subjectId}.json`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadStimulusSetJson(
  set: ExperimentStimulusSet,
  motionGroup: MotionGroup,
  subjectId: string,
): void {
  const payload: StimulusSetExportPayload = {
    exportSchemaVersion: 1,
    stimulusSetSchemaVersion: STIMULUS_SET_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    motionGroup,
    subjectId,
    stimulusSet: set,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  triggerDownload(blob, stimulusSetExportFilename(motionGroup, subjectId));
}
