import { markdownToSafeHtml } from "./markdown";

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** 文本类刺激：运行时用 Markdown → 安全 HTML */
export function wrapStimulus(text: string): string {
  return `<div class="stimulus-wrap stimulus-markdown">${markdownToSafeHtml(text)}</div>`;
}

/** 仅允许常见 raster 图片的 data URL，避免 XSS（如 SVG/script） */
export function sanitizeImageDataUrl(url: string): string | null {
  if (typeof url !== "string" || url.length === 0 || url.length > 20_000_000) return null;
  const idx = url.indexOf("base64,");
  if (idx === -1) return null;
  const prefix = url.slice(0, idx + 7);
  if (!/^data:image\/(png|jpeg|jpg|gif|webp);base64,$/i.test(prefix)) return null;
  const body = url.slice(idx + 7).replace(/\s/g, "");
  if (body.length === 0 || !/^[A-Za-z0-9+/=]+$/.test(body)) return null;
  return prefix + body;
}

export function wrapImageStimulus(dataUrl: string): string {
  const safe = sanitizeImageDataUrl(dataUrl);
  if (!safe) {
    return '<div class="stimulus-image-wrap stimulus-missing"><p>（图片无效或缺失）</p></div>';
  }
  return `<div class="stimulus-image-wrap"><img src="${safe}" alt="" /></div>`;
}
