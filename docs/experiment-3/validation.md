# 实验三：验证

`npm run verify-experiment-3` 验证以下契约：

- `E3-` 被试编号与实验一、实验二互不兼容；
- 1个9 Trial混合练习 Block和20个正式 Block；
- 135条摆动与45条旋转正式 Trial；
- 15个摆动能量和5个低能量旋转能量；
- 混合练习4/5分配、3×3时序与摆动转向配额；
- 所有 Trial 均导出统一的左右高度条量程；
- 180个唯一正式响应才可标记完成；
- CSV、刺激 JSON和文件名符合实验三独立协议。

完整回归使用 `npm run verify-all`，生产构建使用 `npm run build`。
