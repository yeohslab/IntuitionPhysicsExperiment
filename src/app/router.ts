import { disposeRunner, mountRunner } from "./RunnerView";
import { disposeStart, mountStart } from "./StartView";
import {
  disposeExperiment2Start,
  disposeExperiment3Start,
  mountExperiment2Start,
  mountExperiment3Start,
} from "./Experiment2StartView";
import { mountExperimentPicker } from "./ExperimentPickerView";
import type { ExperimentId } from "../experiments/types";
import {
  hasActiveExperimentRunSession,
  migrateLegacyExperiment1Session,
} from "../shared/storage";
import { migrateLegacyExperiment1Recovery } from "../shared/recovery";

function pathFromHash(): string {
  const raw = location.hash.replace(/^#/, "").split("?")[0].replace(/^\//, "");
  return raw === "" ? "/" : `/${raw}`;
}

function replaceHash(hash: string): void {
  const base = `${location.pathname}${location.search}`;
  location.replace(`${base}${hash}`);
}

function runnerExperiment(path: string): ExperimentId | null {
  if (path === "/experiment-1/runner") return "experiment-1";
  if (path === "/experiment-2/runner") return "experiment-2";
  if (path === "/experiment-3/runner") return "experiment-3";
  return null;
}

function route(): void {
  disposeRunner();
  disposeStart();
  disposeExperiment2Start();
  disposeExperiment3Start();
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";
  const path = pathFromHash();

  if (path === "/runner") {
    replaceHash(
      hasActiveExperimentRunSession("experiment-1")
        ? "#/experiment-1/runner"
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
  if (path === "/experiment-1/start") {
    mountStart(app);
    return;
  }
  if (path === "/experiment-2/start") {
    mountExperiment2Start(app);
    return;
  }
  if (path === "/experiment-3/start") {
    mountExperiment3Start(app);
    return;
  }
  if (path === "/" || path === "/start") {
    mountExperimentPicker(app);
    return;
  }
  replaceHash("#/");
}

export function initRouter(): void {
  migrateLegacyExperiment1Session();
  migrateLegacyExperiment1Recovery();
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
