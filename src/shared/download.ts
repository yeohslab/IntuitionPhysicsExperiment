/** 同页多次下载同一文件名时递增 `(1)`、`(2)`…，与 Windows 资源管理器行为一致。 */
const downloadCounts = new Map<string, number>();

/**
 * 为重复下载的文件名追加 Windows 风格后缀。
 * 首次：`file.csv`；再次：`file (1).csv`、`file (2).csv`…
 */
export function disambiguateDownloadFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return filename;
  const used = downloadCounts.get(trimmed) ?? 0;
  downloadCounts.set(trimmed, used + 1);
  if (used === 0) return trimmed;
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0) return `${trimmed} (${used})`;
  return `${trimmed.slice(0, dot)} (${used})${trimmed.slice(dot)}`;
}

/** 仅用于验收测试重置计数。 */
export function resetDownloadFilenameDisambiguation(): void {
  downloadCounts.clear();
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const downloadName = disambiguateDownloadFilename(filename);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = downloadName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function triggerTextDownload(
  text: string,
  filename: string,
  mimeType: string,
): void {
  triggerBlobDownload(new Blob([text], { type: mimeType }), filename);
}
