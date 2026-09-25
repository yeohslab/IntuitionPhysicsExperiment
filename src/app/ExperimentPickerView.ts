import { experimentDefinitions } from "../experiments/registry";
import { loadRecoverySnapshot } from "../shared/recovery";

export function mountExperimentPicker(container: HTMLElement): void {
  container.className = "start-view experiment-picker-view";
  const cards = Object.values(experimentDefinitions)
    .map((definition) => {
      const recovery = loadRecoverySnapshot(definition.id);
      const recoveryText = recovery
        ? `<p class="experiment-card__recovery">检测到记录：被试 ${recovery.participant.subject_id}（${recovery.lifecycle === "exported" ? "待确认保存" : "未完成"}）</p>`
        : `<p class="experiment-card__recovery experiment-card__recovery--empty">当前没有待处理记录</p>`;
      return `<article class="experiment-card">
        <h2>${definition.title}</h2>
        <p>${definition.summary}</p>
        <p class="hint muted">协议版本 ${definition.protocolVersion}</p>
        ${recoveryText}
        <a class="btn btn-primary btn-lg" href="${definition.startHash}">进入${definition.title}</a>
      </article>`;
    })
    .join("");
  container.innerHTML = `<main class="experiment-picker">
    <header class="experiment-picker__header">
      <h1>直觉物理实验</h1>
      <p>请选择本次需要运行的实验。三个实验的数据、恢复记录和刺激缓存相互独立。</p>
    </header>
    <section class="experiment-picker__cards">${cards}</section>
  </main>`;
}
