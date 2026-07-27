import { disposeRunner, mountRunner } from "./RunnerView";
import { disposeStart, mountStart } from "./StartView";

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

/** 整页刷新统一回首页，由恢复快照决定恢复待开始状态或导出中断数据。 */
export function initRouter(): void {
  window.addEventListener("hashchange", route);

  const path = pathFromHash();
  if (path !== "/start") {
    // replace 避免刷新后 history 仍停在 runner
    location.replace("#/start");
    return;
  }
  route();
}
