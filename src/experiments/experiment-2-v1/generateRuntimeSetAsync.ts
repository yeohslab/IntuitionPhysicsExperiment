import type { Experiment2StimulusSet } from "../../shared/experimentTypes";
import type { Experiment2GenerateWorkerResponse } from "./generateWorker";

export type GenerateExperiment2RuntimeSetAsyncOptions = {
  subjectId: string;
  signal?: AbortSignal;
  onProgress?: (completedTrials: number, totalTrials: number) => void;
};

export function generateExperiment2RuntimeStimulusSetAsync(
  options: GenerateExperiment2RuntimeSetAsyncOptions,
): Promise<Experiment2StimulusSet> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./generateWorker.ts", import.meta.url), {
      type: "module",
    });
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      complete();
    };
    const onAbort = () => {
      finish(() => reject(new DOMException("刺激集生成已取消", "AbortError")));
    };
    worker.addEventListener(
      "message",
      (event: MessageEvent<Experiment2GenerateWorkerResponse>) => {
        const message = event.data;
        if (message.type === "progress") {
          options.onProgress?.(message.completedTrials, message.totalTrials);
          return;
        }
        if (message.type === "success") {
          finish(() => resolve(message.stimulusSet));
          return;
        }
        finish(() => reject(new Error(message.message)));
      },
    );
    worker.addEventListener("error", (event) => {
      finish(() => reject(new Error(event.message || "实验二刺激生成线程异常退出")));
    });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({ subjectId: options.subjectId });
  });
}
