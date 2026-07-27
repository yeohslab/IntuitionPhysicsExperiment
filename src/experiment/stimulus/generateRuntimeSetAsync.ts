import type { MotionGroup } from "../physics/energySegments";
import type { ExperimentStimulusSet } from "../../shared/experimentTypes";
import type { GenerateWorkerResponse } from "./generateWorker";

export type GenerateRuntimeSetAsyncOptions = {
  group: MotionGroup;
  subjectId: string;
  signal?: AbortSignal;
  onProgress?: (completedTrials: number, totalTrials: number) => void;
};

/** 在独立线程生成完整刺激集，避免长时间占用页面主线程。 */
export function generateRuntimeStimulusSetAsync(
  opts: GenerateRuntimeSetAsyncOptions,
): Promise<ExperimentStimulusSet> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./generateWorker.ts", import.meta.url),
      { type: "module" },
    );
    let settled = false;

    const finish = (
      complete: () => void,
    ) => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      complete();
    };

    const onAbort = () => {
      finish(() => reject(new DOMException("刺激集生成已取消", "AbortError")));
    };

    worker.addEventListener("message", (event: MessageEvent<GenerateWorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        opts.onProgress?.(message.completedTrials, message.totalTrials);
        return;
      }
      if (message.type === "success") {
        finish(() => resolve(message.stimulusSet));
        return;
      }
      finish(() => reject(new Error(message.message)));
    });

    worker.addEventListener("error", (event) => {
      finish(() => reject(new Error(event.message || "刺激集生成线程异常退出")));
    });

    if (opts.signal?.aborted) {
      onAbort();
      return;
    }
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({
      group: opts.group,
      subjectId: opts.subjectId,
    });
  });
}
