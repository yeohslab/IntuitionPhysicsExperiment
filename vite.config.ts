import { defineConfig } from "vite";

/**
 * 使用相对路径 base，便于本地预览与 GitHub Pages 项目站
 * （仓库 / 项目文件夹：IntuitionPhysicsExperiment）。
 * 资源以 ./assets/... 解析，不依赖站点根绝对路径 /IntuitionPhysicsExperiment/。
 */
export default defineConfig({
  base: "./",
  server: {
    watch: {
      // 数据收集中的 PDF、眼动实验和验证脚本的临时目录可能被占用，Windows 监视会抛 EBUSY。
      ignored: [
        "**/数据收集/**",
        "**/eye_movement_version/**",
        "**/*.tmpdir/**",
        "**/.*.tmpdir/**",
      ],
    },
  },
});
