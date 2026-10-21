# 直觉物理实验

基于 jsPsych 8 的浏览器直觉物理实验。站点入口 `#/` 可选择 **实验二**（协议 2.0.0）或 **实验四**（协议 1.0.0，光栅遮挡单摆；报告角度与速度大小，先后顺序随机平衡）。

## 运行与构建

需要 Node.js 20 或更新版本。

```bash
npm ci
npm run dev
npm run verify-all
npm run build
```

生产文件输出到 `dist/`。GitHub Pages 流水线仍发布一个构建产物，因此现有站点地址无需改变。

## 协议概览

| 项目 | 实验二 | 实验四 |
|---|---|---|
| 被试编号 | `E2-xxxx` | `E4-xxxx` |
| 正式结构 | 3×50 | 3×20（小/中/大间隙） |
| 任务 | 遮挡结束摆杆方向 | $t_q$ 角度 + 速度色带 |
| 协议 | `2.0.0` | `1.0.0` |

刺激集在独立 Web Worker 中真随机生成并验证，被试编号不作为随机种子。实验运行中刷新或中断不会续做已部分观看的 Trial，但可从实验首页导出已保存的未完成数据。

## 导出文件

- 实验二：`experiment-2_v2.0_data_subjectE2-0001_f.csv`、对应 stimulus JSON
- 实验四：`experiment-4_v1.0_data_subjectE4-0001_f.csv`、对应 stimulus JSON

中断或不完整运行使用 `_nf.csv`。CSV 只包含已确认的正式响应；刺激 JSON 包含练习和正式刺激的完整物理描述，不包含作答。

## 目录

| 路径 | 内容 |
|---|---|
| `src/experiments/experiment-2/` | 实验二生成、指导语、描述符与导出 |
| `src/experiments/experiment-4/` | 实验四光栅、刺激生成与导出 |
| `src/experiments/within-subject/` | 练习试次数与注视点等共用常量 |
| `src/experiment/physics/` | 单摆物理、拟合与渲染核心 |
| `src/runtime/` | jsPsych 时间线、运行插件和速度提示组件 |
| `src/shared/` | 会话、恢复、协议基础类型与通用工具 |
| `tests/verification/` | 生成、物理、导出和恢复验收 |
| `docs/experiment-2/` | 实验二设计、schema 和验证文档 |
| `docs/experiment-4/` | 实验四设计、数据字典 |

详细文档：

- [实验二设计](docs/experiment-2/experiment-design.md)
- [实验二数据字典](docs/experiment-2/data-dictionary.md)
- [实验四设计](docs/experiment-4/experiment-design.md)
- [实验四协议 V1.0](数据收集/主试准备/实验四伦理/实验四设计V1.0.md)
- [后续改进 TODO](TODO.md)
