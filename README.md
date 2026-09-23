# 直觉物理实验

基于 jsPsych 8 的浏览器单摆状态估计实验。同一 GitHub Pages 站点提供两个相互隔离的实验协议：

- **实验一**：摆动/旋转组间设计，左右高度速度条；
- **实验二**：单组完成摆动与旋转 Block，上下颜色速度条。

网站根入口与 `#/start` 均为实验选择页；具体入口为 `#/experiment-1/start` 和 `#/experiment-2/start`。两个实验的 sessionStorage、恢复快照、刺激版本和导出协议相互独立。

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

| 项目 | 实验一 | 实验二 |
|---|---|---|
| 被试编号 | `10001` / `20001` | `E2-0001` |
| 正式结构 | 15 Block × 9 Trial = 135 | 20 Block × 9 Trial = 180 |
| 运动类型 | 每名被试只做摆动或旋转 | 15摆动Block + 5低能量旋转Block |
| 练习 | 9条单一运动类型 | 9条摆动/旋转混合练习 |
| 速度提示 | 左右高度条 | 上下绿—黄—红动态色块 |
| CSV/JSON schema | v3 | v1 |

两个实验都在独立 Web Worker 中真随机生成并验证完整刺激集，被试编号不作为随机种子。实验运行中刷新或中断不会续做已部分观看的 Trial，但可从对应实验首页导出已保存的未完成数据。

## 导出文件

实验一：

- `experiment-1_data_subject10001_f.csv`
- `experiment-1_stimulus_set_subject10001.json`

实验二：

- `experiment-2_data_subjectE2-0001_f.csv`
- `experiment-2_stimulus_set_subjectE2-0001.json`

中断或不完整运行使用 `_nf.csv`。CSV只包含已确认的正式响应；刺激JSON包含练习和正式刺激的完整物理描述，不包含作答。

## 目录

| 路径 | 内容 |
|---|---|
| `src/experiments/experiment-1/` | 实验一稳定协议入口与定义 |
| `src/experiments/experiment-2/` | 实验二生成、指导语、描述符与导出 |
| `src/experiment/physics/` | 两个实验共用的单摆物理、拟合与渲染核心 |
| `src/runtime/` | 共用jsPsych时间线、运行插件和速度提示组件 |
| `src/shared/` | 会话、恢复、协议基础类型与通用工具 |
| `tests/verification/` | 两个实验的生成、物理、导出和恢复验收 |
| `docs/experiment-1/` | 实验一设计、schema和验证文档 |
| `docs/experiment-2/` | 实验二设计、schema和验证文档 |

详细文档：

- [实验一设计](docs/experiment-1/experiment-design.md)
- [实验一数据字典](docs/experiment-1/data-dictionary.md)
- [实验二设计](docs/experiment-2/experiment-design.md)
- [实验二数据字典](docs/experiment-2/data-dictionary.md)
- [后续改进 TODO](TODO.md)
