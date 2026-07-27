import DOMPurify from "dompurify";

/** 运行页指导语允许的 HTML 子集 */
const INSTRUCTION_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "del",
  "s",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "hr",
  "div",
];

let hrefHookInstalled = false;

function ensureHrefHook(): void {
  if (hrefHookInstalled) return;
  hrefHookInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "href") {
      const v = (data.attrValue || "").trim();
      const lower = v.toLowerCase();
      if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
        data.keepAttr = false;
      }
    }
  });
}

/** 将指导语 HTML 消毒为可安全插入 innerHTML 的字符串 */
export function sanitizeInstructionHtml(html: string): string {
  ensureHrefHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: INSTRUCTION_ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "title", "class"],
  });
}

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** 指导语 HTML 包装（不经 Markdown 解析） */
export function wrapInstructionHtml(html: string): string {
  return `<div class="stimulus-wrap stimulus-instruction">${sanitizeInstructionHtml(html)}</div>`;
}

/** 注视点：屏幕居中加号 */
export function wrapFixationStimulus(symbol = "+"): string {
  return `<div class="stimulus-wrap stimulus-fixation" aria-hidden="true"><span class="fixation-cross">${escapeHtml(symbol)}</span></div>`;
}
