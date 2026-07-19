import { defineConfig } from "vite";

/**
 * 使用相对路径 base，便于本地预览与 GitHub Pages 项目站
 * （仓库 / 项目文件夹：IntuitionPhysicsExperiment）。
 * 资源以 ./assets/... 解析，不依赖站点根绝对路径 /IntuitionPhysicsExperiment/。
 */
export default defineConfig({
  base: "./",
});
