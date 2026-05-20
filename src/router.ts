import { disposeEditor, mountEditor } from "./editor/EditorView";
import { disposeRunner, mountRunner } from "./runner/RunnerView";
import { disposeStart, mountStart } from "./start/StartView";

function route(): void {
  disposeEditor();
  disposeRunner();
  disposeStart();

  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";

  const raw = location.hash.replace(/^#/, "").split("?")[0].replace(/^\//, "");
  const path = raw === "" ? "/start" : `/${raw}`;

  if (path === "/runner") {
    mountRunner(app);
  } else if (path === "/editor") {
    mountEditor(app);
  } else {
    mountStart(app);
  }
}

export function initRouter(): void {
  window.addEventListener("hashchange", route);
  route();
}
