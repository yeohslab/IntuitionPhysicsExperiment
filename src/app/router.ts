import { disposeRunner, mountRunner } from "./RunnerView";
import {
  disposeExperiment2Start,
  mountExperiment2Start,
} from "./Experiment2StartView";
import {
  disposeExperiment4Start,
  mountExperiment4Start,
} from "./Experiment4StartView";
import { mountExperimentPicker } from "./ExperimentPickerView";
import { disposeExperiment5Start, mountExperiment5Start } from "./Experiment5StartView";
import { disposeTraining1Start, mountTraining1Start } from "./Training1StartView";
import type { ExperimentId } from "../experiments/types";
import { hasActiveExperimentRunSession } from "../shared/storage";

function pathFromHash(): string {
  const raw = location.hash.replace(/^#/, "").split("?")[0].replace(/^\//, "");
  return raw === "" ? "/" : `/${raw}`;
}

function replaceHash(hash: string): void {
  const base = `${location.pathname}${location.search}`;
  location.replace(`${base}${hash}`);
}

function runnerExperiment(path: string): ExperimentId | null {
  if (path === "/experiment-2/runner") return "experiment-2";
  if (path === "/experiment-4/runner") return "experiment-4";
  if (path === "/experiment-5/runner") return "experiment-5";
  if (path === "/training-1/runner") return "training-1";
  return null;
}

function route(): void {
  disposeRunner();
  disposeExperiment2Start();
  disposeExperiment4Start();
  disposeExperiment5Start();
  disposeTraining1Start();
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";
  const path = pathFromHash();

  if (path === "/runner") {
    replaceHash(
      hasActiveExperimentRunSession("experiment-2")
        ? "#/experiment-2/runner"
        : "#/",
    );
    return;
  }
  const runnerId = runnerExperiment(path);
  if (runnerId) {
    if (!hasActiveExperimentRunSession(runnerId)) {
      replaceHash(`#/${runnerId}/start`);
      return;
    }
    mountRunner(app, runnerId);
    return;
  }
  if (path === "/experiment-2/start") {
    mountExperiment2Start(app);
    return;
  }
  if (path === "/experiment-4/start") {
    mountExperiment4Start(app);
    return;
  }
  if (path === "/experiment-5/start") {
    mountExperiment5Start(app);
    return;
  }
  if (path === "/training-1/start") {
    mountTraining1Start(app);
    return;
  }
  if (path === "/" || path === "/start") {
    mountExperimentPicker(app);
    return;
  }
  replaceHash("#/");
}

export function initRouter(): void {
  window.addEventListener("hashchange", route);
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    const experimentId = runnerExperiment(pathFromHash());
    if (experimentId && !hasActiveExperimentRunSession(experimentId)) {
      replaceHash(`#/${experimentId}/start`);
    }
  });
  route();
}
