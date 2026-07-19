import { disposeRunner, mountRunner } from "./runner/RunnerView";
import { disposeStart, mountStart } from "./start/StartView";
import { clearExperimentSession } from "./shared/storage";

function pathFromHash(): string {
  const raw = location.hash.replace(/^#/, "").split("?")[0].replace(/^\//, "");
  return raw === "" ? "/start" : `/${raw}`;
}

function route(): void {
  disposeRunner();
  disposeStart();

  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";

  const path = pathFromHash();

  if (path === "/runner") {
    mountRunner(app);
  } else {
    mountStart(app);
  }
}

/**
 * 整页加载（含刷新）：清 session，并强制回到被试信息填写页。
 * 仅 hash 跳转（开始实验→runner）不经过此处，会话保留。
 */
export function initRouter(): void {
  clearExperimentSession();
  window.addEventListener("hashchange", route);

  const path = pathFromHash();
  if (path !== "/start") {
    // replace 避免刷新后 history 仍停在 runner
    location.replace("#/start");
    return;
  }
  route();
}
