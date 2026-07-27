# rAR-HMM (Recurrent Autoregressive HMM) — 单摆动力学拟合

依据 Linderman, Miller, Adams, Blei, Paninski, Johnson (2016)
*"Recurrent Switching Linear Dynamical Systems"* 复刻 **rAR-HMM (recurrence-only)** 子类，
应用于本仓库 [docs/pendulum-dataset-spec.md](../docs/pendulum-dataset-spec.md) 定义的单摆数据集。

观测维度直接取 $x_t = (\theta_t,\ \omega_t/\omega_0)\in\mathbb R^2$（可配置为 3 维 $(\sin\theta,\cos\theta,\omega/\omega_0)$）。
没有连续 latent，是 §3 的 **rAR-HMM** 特例（Fig. 2b）。

详细模型说明、所有超参数清单、训练流程，见 [docs/model_spec.md](docs/model_spec.md)。

## 目录

```
rarhmm/
├── docs/model_spec.md          # 完整模型规范（必读）
├── rarhmm/                     # 包
│   ├── config.py               # 所有超参数（dataclass）
│   ├── data.py                 # 加载 spec §7 的 JSON / NPZ
│   ├── distributions.py        # Polya-Gamma 采样 + MNIW 共轭后验
│   ├── stick_breaking.py       # stick-breaking link + PG 增广
│   ├── model.py                # RecurrentARHMM 参数容器与 log-prob
│   ├── inference.py            # HMM 前后向 + Gibbs 单步 + 决策列表初始化
│   ├── train.py                # 训练循环（含 burn-in / thinning）
│   └── predict.py              # 给定前缀的后验预测 rollout
├── scripts/
│   ├── train_pendulum.py       # 入口：读取数据 → 训练 → 落盘 chain
│   ├── viz_dynamics.py         # 论文 Fig.1 风格：每个隐状态的向量场 + 切分图
│   ├── viz_trajectory.py       # 真值/推断向量场对照 + 状态着色轨迹
│   └── viz_rollout_gif.py      # GIF：前缀 + 真值续写 + 模型续写
└── tests/test_smoke.py         # 合成小数据冒烟测试，无需真实数据
```

## 快速命令（数据就绪后）

```powershell
# 安装可选依赖（PG 精确采样需要）
& "C:\Users\tonyj\anaconda3\python.exe" -m pip install polyagamma

# 训练（默认 K=5，rSLDS(ro) 模式）
& "C:\Users\tonyj\anaconda3\python.exe" -m scripts.train_pendulum `
    --data-root ..\data\pendulum --K 5 --n-iter 1000 --out runs\K5

# 可视化
& "C:\Users\tonyj\anaconda3\python.exe" -m scripts.viz_dynamics    --run runs\K5
& "C:\Users\tonyj\anaconda3\python.exe" -m scripts.viz_trajectory  --run runs\K5 --traj-id traj_000123
& "C:\Users\tonyj\anaconda3\python.exe" -m scripts.viz_rollout_gif --run runs\K5 --traj-id traj_000123 --prefix 200 --horizon 600
```

## 依赖

- numpy, scipy, scikit-learn（必需；后者用于 k-means / 决策列表初始化）
- matplotlib, pillow（可视化与 GIF）
- polyagamma（可选，精确 PG 采样；缺失时退化到 Devroye 截断近似）
- tqdm（可选，进度条）

```powershell
& "C:\Users\tonyj\anaconda3\python.exe" -m pip install numpy scipy scikit-learn matplotlib pillow
& "C:\Users\tonyj\anaconda3\python.exe" -m pip install polyagamma   # 可选
```
