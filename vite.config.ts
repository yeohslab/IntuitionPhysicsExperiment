import { defineConfig } from "vite";

/**
 * GitHub Pages 项目站 URL 形如 https://<user>.github.io/<仓库名>/
 * 在 CI 中 GITHUB_REPOSITORY 为 "owner/repo"，必须将 base 设为 "/<仓库名>/"
 * 否则在「无末尾斜杠」的入口地址下，相对路径 ./assets/... 会错解析到 github.io 根下而 404 白屏。
 */
function pagesBase(): string {
  const full = process.env.GITHUB_REPOSITORY;
  if (!full) return "./";
  const name = full.split("/")[1];
  return name ? `/${name}/` : "./";
}

export default defineConfig({
  base: pagesBase(),
});
