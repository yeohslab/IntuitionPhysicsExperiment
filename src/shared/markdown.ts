import DOMPurify from "dompurify";
import { marked } from "marked";

marked.use({
  gfm: true,
  breaks: true,
});

/** 运行页允许的 HTML 子集：不含引用、表格、图片、表单等 */
const ALLOWED_TAGS = [
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

/**
 * 将实验者编写的基础 Markdown 转为可安全插入 innerHTML 的 HTML。
 * 经白名单过滤后，引用/表格等标签会被剥离。
 */
export function markdownToSafeHtml(markdown: string): string {
  ensureHrefHook();
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "title", "class"],
  });
}
