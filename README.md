# JsPsych 刺激编辑与运行（静态站）

基于 [Vite](https://vitejs.dev/) 与 [jsPsych 8](https://www.jspsych.org/) 的双界面应用：

- **刺激编写**（`#/editor`）：顶层为 **顺序列表**（`sequence`），可穿插 **Block**、**Rest**、**Practice**；Block / Practice 内为 Trial → 单元，**Rest** 段只有单元、无 Trial；支持拖拽排序、导入/导出 JSON、本地草稿、「运行实验」与「开发者模式运行」（hide 时段遮挡半透明，便于调试）。
- **实验首页**（`#/start` 或根路径）：输入**纯数字**被试编号（1–9999，存为四位前导零如 `0001`），按 **编号数值 mod 5** 从 5 份 `stimulate/stimulus-*.json` 中选一份加载并运行（构建时由 Vite 打包为资源，**不删除**仓库内 `stimulate/` 源文件）。加载后会对其中 **25 个正式 Block** 即时随机打乱顺序（欢迎/练习/任务说明 Rest 不变，Block 内 Trial 参数不变；Block 前进度 Rest 随 Block 成对移动并重编号为 1…25）；**每次点击开始**顺序可能不同。编辑页「运行实验」不打乱，保持设计顺序。
- **运行**（`#/runner`）：从会话中读取当前设计并执行；仿真全程推进物理运动，hide 时段仅叠加不透明遮挡（被试不可见摆球/弹簧）；结束后自动下载 `experiment_data.csv`，**仅含** `physics-stimulus` 试次（摆球/弹簧**点估计**，`response_mode: estimate_point`），不含指导语等 html 试次，也不含 `unitId` / `segmentId` 等编排元数据列（详见 `src/runner/exportStimulusCsv.ts`）。

## 环境要求

- [Node.js](https://nodejs.org/) 18+（含 `npm`）

## 命令

```bash
npm install
npm run dev
```

浏览器打开终端提示的本地地址（一般为 `http://localhost:5173/`），默认进入 **实验首页**（`#/start`）；可直接打开 `#/editor` 编写刺激。

```bash
npm run build
```

产物在 `dist/`，可部署到任意静态托管（GitHub Pages、Nginx 等）。使用 **Hash 路由**（`#/editor`、`#/runner`），无需服务端 rewrite。

```bash
npm run verify-physics
```

可选：粗略校验摆球周期数值（小角度极限），需联网拉取 `tsx`（见 `package.json` 中 `npx --yes tsx`）。

```bash
npm run generate-stimulate
```

在 `stimulate/` 下写入 5 份预生成摆球刺激集 JSON（固定种子，可重复生成）。

### GitHub Pages

本仓库为 Vite 项目，**不能把 `main` 根目录的源码直接当站点**（浏览器无法运行 `.ts`，且 `index.html` 里 `/src/main.ts` 在 Pages 子路径下会 404，表现为白屏）。

推荐做法（仓库已含 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)）：

1. 将工作流推送到 `main`。
2. 打开仓库 **Settings → Pages**。
3. **Build and deployment → Source** 选 **GitHub Actions**（不要选 “Deploy from a branch” 的 `/(root)`）。
4. 等待 **Actions** 里 “Deploy to GitHub Pages” 跑绿后，访问 `https://<用户名>.github.io/<仓库名>/`（例如 `#/start`）。

在 **GitHub Actions** 构建时，`vite.config.ts` 会读取环境变量 `GITHUB_REPOSITORY`，将 `base` 设为 `/<仓库名>/`，避免在无末尾斜杠的入口地址下相对资源路径被解析到 `github.io` 根目录而 404 白屏。本地构建未设置该变量时仍使用 `./`。

```bash
npm run preview
```

预览构建结果。

## 刺激集 JSON

根字段（当前为 **schemaVersion 5**）：

- `schemaVersion`：`5`
- `sequence`：顶层顺序数组，元素为以下之一：
  - **Block**：`{ "kind": "block", "id": "...", "children": [ { "id": "...", "units": [ ... ] } ] }`（`children` 仅含 Trial）
  - **Practice 段**：`{ "kind": "practice", "id": "...", "children": [ { "id": "...", "units": [ ... ] } ] }`（与 Block 同级；子级为 Trial，再挂刺激单元）
  - **休息**：`{ "kind": "rest", "id": "...", "units": [ ... ] }`（无 Trial 层，直接挂单元）

仅支持 **`schemaVersion: 5`** 的 JSON；旧版（v1–v4）需重新运行 `npm run generate-stimulate` 后再导入。

预置示例刺激集见 [`stimulate/`](stimulate/)（`npm run generate-stimulate` 可重新生成并覆盖）。

每个 `trial`：`{ id, units[] }`

- 单元类型：
  - `textDisplay`：`text`（基础 Markdown，运行页解析）, `durationMs`
  - `textControl`：`text`（基础 Markdown）, `key`
  - `imageDisplay`：`imageDataUrl`（PNG/JPEG/GIF/WebP 的 Base64 data URL）, `durationMs`（呈现时间，毫秒）
  - `imageControl`：`imageDataUrl`, `key`（结束按键，默认空格 `" "`）
  - **物理直觉（摆球 / 弹簧）**（Canvas + 自定义 jsPsych 插件，详见 [TODO.md](TODO.md)）：
    - `pendulumDisplay`：`theta0Deg`, `omega0DegPerSec`, `rodLengthM`, `gravity`；`displayTimeT` 为显示时长的 **T 倍数**（默认 2）；全程可见、无作答
    - `pendulumStimulus` / `springStimulus`：上述物理参 + `show1T`/`show2T`（**×T**）、`hide1T`/`hide2T`（**秒**）、`totalTimeT`（自动同步）；运行端为**点击+拖动点估计**，确认后反馈仅显示蓝色真值
    - `springPractice`：`massKg`, `stiffness`, `x0M`, `v0Mps`；`displayTimeT` 为 **T 倍数**
    - 物理单元的 **能量 E、周期 T** 由参数即时算出，**不写入 JSON**；运行 CSV 含 `theta_*_deg` / `x_*_m`、`abs_delta_*`、`rt_estimate_sec` 等（`response_mode: estimate_point`；区间/得分列保留但为空）

文本类单元在 **运行页** 由 Markdown 转为 HTML 后展示；输出经白名单消毒，**链接仅保留 `http`/`https`**；引用、表格、图片等标签会被剥离（不建议在内容中依赖这些语法）。

## 说明

- 「运行实验」会将当前刺激集写入 `sessionStorage` 后跳转到 `#/runner`。
- 编辑内容会 debounce 写入 `localStorage` 草稿键 `jspsych-stimulus-draft`。
- 若直接打开 `#/runner` 而未先运行，将提示返回编写页。

## 多个独立小项目（各自一份 `node_modules`）

若你还要在同一仓库里放**别的 JsPsych 实验**，每个实验用**独立子文件夹**，并在该文件夹内单独执行 `npm install`（依赖只装在该目录的 `node_modules`，互不共用）。

1. 在仓库根目录打开 PowerShell，执行：

   ```powershell
   .\scripts\new-jspsych-project.ps1 -Name "你的项目名"
   ```

2. 再进入新目录安装并运行：

   ```powershell
   cd .\projects\你的项目名
   npm install
   npm run dev
   ```

更详细的说明见 [projects/README.md](projects/README.md)。
