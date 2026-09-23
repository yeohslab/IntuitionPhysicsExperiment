# 实验二：验证与复现

执行：

```bash
npm run verify-experiment-2
npm run verify-all
npm run build
```

自动验证包括：

- 1个9 Trial混合练习 Block，以及20×9=180条正式 Trial；
- 15个摆动能量与固定的最低5个旋转能量；
- 每个正式Block完整覆盖对应运动类型的3×3时序；
- 练习运动类型4/5分配及show/hide边缘近似平衡；
- 摆动正式转向配额和旋转零转向；
- 统一颜色标尺、绿—黄—红端点与越界钳制；
- schema v1 JSON/CSV、180条完成判定与文件命名；
- 与实验一独立的sessionStorage、恢复快照和路由。

生产生成使用浏览器真随机源；验证使用固定随机源以复现完整刺激集。
