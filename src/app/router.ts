import { disposeRunner, mountRunner } from "./RunnerView";
import { disposeStart, mountStart } from "./StartView";
import { hasActiveExperimentRunSession } from "../shared/storage";

function pathFromHash(): string {
  const raw = location.hash.replace(/^#/, "").split("?")[0].replace(/^\//, "");
  return raw === "" ? "/start" : `/${raw}`;
}

function redirectToStart(): void {
  const base = `${location.pathname}${location.search}`;
  if (pathFromHash() === "/start") {
    route();
    return;
  }
  location.replace(`${base}#/start`);
}

function route(): void {
  disposeRunner();
  disposeStart();

  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";

  const path = pathFromHash();

  if (path === "/runner") {
    if (!hasActiveExperimentRunSession()) {
      redirectToStart();
      return;
    }
    mountRunner(app);
    return;
  }

  mountStart(app);
}

/** 整页刷新统一回首页，由恢复快照决定恢复待开始状态或导出中断数据。 */
export function initRouter(): void {
  window.addEventListener("hashchange", route);

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    if (pathFromHash() === "/runner" && !hasActiveExperimentRunSession()) {
      redirectToStart();
    }
  });

  const path = pathFromHash();
  if (path !== "/start") {
    if (path === "/runner" && !hasActiveExperimentRunSession()) {
      redirectToStart();
      return;
    }
    if (path !== "/runner") {
      location.replace("#/start");
      return;
    }
  }
  route();
}
