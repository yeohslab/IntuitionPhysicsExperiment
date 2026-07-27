# 直觉物理实验

基于 jsPsych 8 的浏览器单摆状态估计实验。被试观察一段摆动或旋转运动，在运动淡出并隐藏后继续进行心理模拟，最后点击报告隐藏结束时的摆杆方向。

## 运行与构建

需要 Node.js 20 或更新版本。

```bash
npm ci
npm run dev
npm run verify-all
npm run build
```

开发服务器入口为 `#/start`，生产文件输出到 `dist/`。GitHub Pages 流水线固定执行 `npm ci → npm run verify-all → npm run build`。

## 实验流程

首页采集四位 `subject_id`、组别、性别编码和年龄。程序在独立 Web Worker 中随机生成并验证该被试的完整刺激集，页面会显示已完成的 Trial 数，不会因长时间物理拟合阻塞主线程：

- 练习：1 Block × 9 Trial；
- 正式：15 Block × 9 Trial，共 135 Trial；
- 每个 Block 完整包含 3 个可视时长 × `0.8 / 1.0 / 1.2 s` 遮挡时长；
- 组 1 为摆动，组 2 为旋转。

速度条显示绝对线速度 `l × |ω|`。同组所有 Trial 共用一个正式实验上限，不做单 Trial 归一化：

- 组 1：`11.9359750335 m/s`；
- 组 2：`17.5698605572 m/s`。

## 导出与中断

自然完成并得到 135 个唯一正式响应时输出：

- `experiment_data_subjectXXXX_f.csv`
- `stimulus_set_groupX_subjectXXXX.json`

其他结束路径均输出 `_nf.csv`。CSV 只含已确认的正式响应；刺激 JSON 固定含 9 个练习和 135 个正式 Trial，不含指导语、注视点、休息页、图片或响应。

刺激集生成完成后会立即写入 `localStorage` 恢复快照；若此时刷新或渲染进程意外退出，重新打开首页会恢复人口学信息、原刺激集和“开始”按钮，无需重新生成。实验进行中发生刷新、崩溃或关闭时，不会从中断 Trial 续做；下次打开首页可导出未完成数据。显式点击“中断并导出”会立即保存、导出并进入可重复下载的结束页。纯静态网站无法在设备损坏、浏览器数据被清除或被试不再打开页面时远程回收记录。

## 目录

| 路径 | 内容 |
|---|---|
| `src/app/` | 首页、运行页与路由 |
| `src/experiment/physics/` | 单摆解析解、旋转积分、拟合与渲染 |
| `src/experiment/stimulus/` | 运行时刺激生成与指导语 |
| `src/runtime/` | jsPsych 时间线、插件、组件与 CSV 导出 |
| `src/shared/` | 协议类型、恢复、序列化与通用工具 |
| `tests/verification/` | 物理、生成器、导出和恢复验收 |
| `docs/` | 当前实验设计与数据协议 |
| `analysis/` | 兼容新旧 CSV 的 Python 分析代码 |
| `research/` | 与线上实验隔离的研究代码 |
| `archive/` | 旧协议、旧设计、刺激导出和论文资料 |

详细说明：

- [实验设计](docs/experiment-design.md)
- [CSV 数据字典](docs/data-dictionary.md)
- [刺激集 schema v2](docs/stimulus-schema.md)
- [验证与浏览器限制](docs/validation.md)
- [后续改进 TODO](TODO.md)
