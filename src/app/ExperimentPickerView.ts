import { experimentDefinitions } from "../experiments/registry";
import { loadRecoverySnapshot } from "../shared/recovery";

export function mountExperimentPicker(container: HTMLElement): void {
  container.className = "start-view experiment-picker-view";
  const groups = [
    [experimentDefinitions["training-1"]],
    [experimentDefinitions["experiment-2"]],
    [experimentDefinitions["experiment-4"], experimentDefinitions["experiment-4-v2"]],
    [experimentDefinitions["experiment-5"], experimentDefinitions["experiment-5-v2"]],
  ] as const;
  const cards = groups.map((definitions) => {
    const first = definitions[0];
    const versions = definitions.map((definition) => {
      const recovery = loadRecoverySnapshot(definition.id);
      const recoveryText = recovery
        ? `检测到被试 ${recovery.participant.subject_id} 的记录（${recovery.lifecycle === "exported" ? "待确认保存" : "未完成"}）`
        : "当前没有待处理记录";
      return `<div class="experiment-card__version">
        <p><strong>协议 ${definition.protocolVersion}</strong></p>
        <p>${definition.summary.replace(/^协议 [^：]+：/, "")}</p>
        <p class="experiment-card__recovery ${recovery ? "" : "experiment-card__recovery--empty"}">${recoveryText}</p>
        <a class="btn btn-primary" href="${definition.startHash}">进入协议 ${definition.protocolVersion}</a>
      </div>`;
    }).join("");
    return `<article class="experiment-card">
      <h2>${first.title}</h2>
      <div class="experiment-card__versions">${versions}</div>
    </article>`;
  }).join("");
  container.innerHTML = `<main class="experiment-picker">
    <header class="experiment-picker__header">
      <h1>直觉物理实验</h1>
      <p>选择实验。被试信息、恢复记录和刺激缓存保存在各实验自己的存储里。</p>
    </header>
    <section class="experiment-picker__cards">${cards}</section>
  </main>`;
}
