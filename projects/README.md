# 多个独立小实验（各自一份依赖）

本目录用来放**彼此独立**的 JsPsych / Vite 小项目：每个子文件夹里都有自己的 `package.json`，在自己的目录执行 `npm install` 后，会生成**只属于该项目**的 `node_modules`，与仓库根目录、与兄弟文件夹互不干扰。

## 新建一个子项目（推荐）

在仓库**根目录**打开 PowerShell，执行（将 `MyStudy` 换成你的项目名，建议英文或数字）：

```powershell
.\scripts\new-jspsych-project.ps1 -Name "MyStudy"
```

然后进入新目录安装并启动：

```powershell
cd .\projects\MyStudy
npm install
npm run dev
```

## 手动复制

也可以把整个模板根目录（不含 `node_modules`、`dist`、`.git`）复制到 `projects\你的项目名\`，再在新目录里执行 `npm install`。

## 注意

- **不要在仓库根目录用一套 `node_modules` 同时跑多个不同入口**，除非你改成 monorepo 工作区；独立小项目请用**独立子文件夹 + 各自 `npm install`**。
- 子项目里的 `package.json` 的 `name` 会在脚本里改成 `study-你的项目名`（仅作标识，可再手改）。
