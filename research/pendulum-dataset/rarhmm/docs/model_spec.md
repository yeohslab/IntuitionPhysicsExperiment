# rAR-HMM (Recurrent Autoregressive HMM) — 单摆动力学版完整规范

> 参考文献：Linderman, Miller, Adams, Blei, Paninski, Johnson.
> *"Recurrent Switching Linear Dynamical Systems"*, arXiv:1610.08466 (2016).
>
> 本项目实现该论文 §3 中的 **rAR-HMM** 子模型（观测 $x$ 直接可见，没有 latent 连续状态 $\to$ 即论文 Fig. 2(b)），
> 采用 Gibbs / FFBS + Pólya-Gamma 增广 完整复刻论文的训练流程，并搭配 3 套可视化脚本与
> 一个针对 [docs/pendulum-dataset-spec.md](../../docs/pendulum-dataset-spec.md) 数据集的端到端管线。

---

## 1. 模型定义

### 1.1 观测

对每条轨迹 $i$，长度 $T_i$，时间步 $\Delta t = 0.05$ s。模型的**观测**是
$$
x_t^{(i)} \in \mathbb R^{M},\qquad M=2\ \text{(默认)}\ \text{或}\ 3.
$$

| `obs_repr`          | $x_t$                                | $M$ |
| ------------------- | ------------------------------------ | --- |
| `"theta_omega"`    | $(\theta_t,\ \omega_t/\omega_0)$     | 2   |
| `"sincos_omega"`   | $(\sin\theta_t,\cos\theta_t,\omega_t/\omega_0)$ | 3 |

其中 $\omega_0=\sqrt{g/L}$ 是小角度自然频率，用作归一化。

### 1.2 隐藏离散状态

$z_t\in\{0,1,\dots,K-1\}$，先验由初始分布 $\pi_0$ 与 *recurrent* 转移核给出
（见 §1.4）。$K$ 是用户指定的主超参数，所有其他超参数列在 §5。

### 1.3 条件线性自回归动力学

给定 $z_t = k$ 与 AR 阶数 $P$（论文及默认值 $P=1$），
$$
x_t = A_k\,\tilde x_{t-1} + e_t,\qquad e_t\sim\mathcal N(0, Q_k),
$$
其中 $\tilde x_{t-1} = [x_{t-1};\ x_{t-2};\ \dots;\ x_{t-P};\ 1]\in\mathbb R^{MP+1}$，
$A_k\in\mathbb R^{M\times(MP+1)}$ 的最后一列承担偏置项 $b_k$，$Q_k\in\mathbb R^{M\times M}$ 对称正定。

### 1.4 Recurrent 转移核（stick-breaking 逻辑回归）

定义 logits 向量
$$
\nu_{t+1} = R_{z_t}\,x_t + r_{z_t} \in \mathbb R^{K-1}.
$$
通过 stick-breaking link 转成概率
$$
\pi_{\text{SB}}^{(k)}(\nu)=
\begin{cases}
\sigma(\nu_0)\!\!\!\!\!\!&,k=0\\[2pt]
\sigma(\nu_k)\prod_{j<k}\sigma(-\nu_j)\!\!\!\!\!\!&,1\le k\le K-2\\[2pt]
\prod_{j<K-1}\sigma(-\nu_j)\!\!\!\!\!\!&,k=K-1
\end{cases}
$$
其中 $\sigma$ 是 sigmoid。 $z_{t+1}\mid z_t,x_t\sim\text{Cat}(\pi_{\text{SB}}(\nu_{t+1}))$。

根据 `recurrence_mode`：

| 取值 | 含义 | 参数共享 |
| ---- | ----- | -------- |
| `"full"`   | 完整 rAR-HMM (每个 $z_t$ 各自的 $R_k, r_k$) | $\{(R_k,r_k)\}_{k=1}^K$ |
| `"shared"` | 共享 $R$，但偏置 $r_k$ 与 $z_t$ 有关 | $R$ + $\{r_k\}$ |
| `"ro"`     | 论文 Fig. 1 的 *recurrence-only* (rSLDS(ro))，最具可解释性 | 单个 $(R, r)$ |

> **默认**：`"ro"`。它复刻了论文 Fig. 1 中那种"按 $x_t$ 切平面"的可解释结构，对单摆的能量带划分天然有效。

### 1.5 联合密度

$$
p(x_{1:T},z_{1:T}\mid\Theta)
= \pi_0(z_1)\,\prod_{t=2}^{T} \pi_{\text{SB}}^{(z_t)}\!\bigl(R_{z_{t-1}}x_{t-1}+r_{z_{t-1}}\bigr)
\,\prod_{t=P+1}^{T} \mathcal N\!\bigl(x_t\mid A_{z_t}\tilde x_{t-1},Q_{z_t}\bigr),
$$
$\Theta = \{\pi_0, (A_k, Q_k)_{k=1}^K, (R_k, r_k)_{k=1}^K\}$。

---

## 2. 共轭先验（论文 §A.1 / Bishop ch.10）

* **AR 动力学**：$(A_k, Q_k)\sim\text{MNIW}(M_{\text{dyn}}, V_{\text{dyn}}, \Psi_{\text{dyn}}, \nu_{\text{dyn}})$
  ‑ 标准 Matrix-Normal Inverse-Wishart。先验默认各向同性，$M_{\text{dyn}} = [\alpha I, 0]$ 让 $A_k$ 在初始化时偏向收缩谱 $\alpha\approx0.95$。
* **Recurrence**：$(R_k, r_k)\sim\text{MNIW}(M_{\text{rec}}, V_{\text{rec}}, \Psi_{\text{rec}}, \nu_{\text{rec}})$
  ‑ 在 Pólya-Gamma 增广后，每个 stick 维度 $j$ 都退化为一维 Bayesian linear regression，可独立闭式更新。
* **初始分布**：$\pi_0 \sim \text{Dirichlet}(1, \dots, 1)$（弱先验，事后看作经验加 1 平滑）。

完整超参数清单见 §5。

---

## 3. 推断算法（Gibbs sweep）

对每条轨迹，每次 Gibbs sweep 顺序执行：

### 3.1 采样 $z_{1:T}\mid x_{1:T},\omega,\Theta$
HMM forward-filter backward-sample（FFBS，论文 §A.3 / Scott 2002）。 *log-space* 实现见
[rarhmm/inference.py::ffbs_single](../rarhmm/inference.py#L23)。
- 观测势：$\log\mathcal N(x_t\mid A_{z_t}\tilde x_{t-1}, Q_{z_t})$
- 转移势：$\log\pi_{\text{SB}}^{(z_{t+1})}(R_{z_t}x_t+r_{z_t})$（不依赖 PG 增广，PG 只在采样 $R,r$ 时介入）

### 3.2 采样 PG 辅助变量 $\omega\mid z, \Theta$（论文 §3.1 / Polson-Scott-Windle 2013）

对每对 $(z_t, z_{t+1})$ 和每个 stick $j=0,\dots,K-2$
$$
\omega_{t,j}\sim\text{PG}\!\bigl(b_{t,j},\ \nu_{t+1,j}\bigr),
\qquad b_{t,j}=\mathbb 1[z_{t+1}\ge j].
$$
当 $b_{t,j}=0$（即 $j>z_{t+1}$，stick 已被分掉了）则 $\omega_{t,j}=0$，似然对 $\nu_{t+1,j}$ 是常数。

定义 $\kappa_{t,j}=\mathbb 1[z_{t+1}=j]-\tfrac12\mathbb 1[z_{t+1}\ge j]$，则条件似然变成 *Gaussian* in $\nu$。

### 3.3 采样 $(R_{k}, r_{k})\mid \omega, \kappa, x$

每个 stick $j$ 退化为加权 Bayes 线性回归
$$
\frac{\kappa_{t,j}}{\omega_{t,j}} = R_{j,:}\,x_t + r_j + \mathcal N(0,\omega_{t,j}^{-1}),
$$
共轭后验解析解写在 `MNIW.posterior` 内。`mode="ro"` 时只解一次（共享 $R,r$），
`mode="shared"` 时 $R$ 解一次、$r_k$ 逐 $z_t$ 解，`mode="full"` 时按 $z_t$ 分组逐次解。

### 3.4 采样 $(A_k, Q_k)\mid z, x$

将所有 $z_t=k$ 的 $(x_{t-P..t-1}, x_t)$ 对收集起来做加权 MNIW 后验更新，对每个 $k$ 独立。

### 3.5 重估 $\pi_0$

经验 + Dirichlet(1) 平滑：$\pi_{0,k}\propto N_k + 1$。

> 一次完整 sweep 的复杂度：$\mathcal O\!\bigl(T \cdot K^2\bigr)$ 的 FFBS + $\mathcal O\!\bigl(T(K-1)\bigr)$ 的 PG 采样 + $\mathcal O\!\bigl(K\cdot(MP+1)^3\bigr)$ 的 MNIW 解线性。
> 对 1.6 M 时间点、$K\!\le\!10$、$M=2$、$P=1$ 的设定，单核 numpy 每个 sweep 在数秒到数十秒量级。

---

## 4. 初始化（论文 §4.4，去掉 pPCA 步）

由于 rAR-HMM 中 $x$ 完全可观测，不需要论文里的 pPCA/FA 步骤。我们保留剩下两步并增加一步 k-means warm-start：

1. **k-means warm-start**：对特征 $[x_t,\ x_{t+1}-x_t]$ 做 $K$-means，$K$-类标签作为初始 $z_t$。
2. **AR-HMM 硬 EM**：固定离散标签下解 ridge 回归得 $(A_k, Q_k)$；用 $\arg\max_k \mathcal N(x_t\mid A_kx_{t-1},Q_k)$ 重赋 $z_t$，重复 `init_arhmm_em_iter` 轮。
3. **决策列表置换**（`init_decision_list=True`）：贪心找一个状态置换 $\sigma$，使第 $j$ 个 stick 用一维 logistic 回归 $p_j(x)=\sigma(r_j^\top x)$ 把 $\sigma(j)$ 从其余状态尽可能分干净。所得 logistic 系数作为 $R, r$ 的暖起点，并用 $\sigma^{-1}$ 重新排列状态标签和 $A_k,Q_k$。

完整实现：[rarhmm/inference.py::initialize](../rarhmm/inference.py#L189)。

---

## 5. 超参数完整清单（除 $K$ 外）

字段名以 `rarhmm/config.py` 的 `Config` dataclass 为准。

### 5.1 结构 / 表示

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `obs_repr` | `"theta_omega"` | 观测维度选择 ($M=2$ 或 $3$)。 |
| `ar_lag` ($P$) | `1` | AR 阶数；与论文一致。 |
| `recurrence_mode` | `"ro"` | `full`/`shared`/`ro`，控制 $R,r$ 的共享方式。 |
| `include_lagged_z_in_recurrence` | `False` | 是否在 $\nu$ 中加入 one-hot $z_t$；仅 `full` 之外需要时开启。 |

### 5.2 物理常数（与数据集一致，不应改）

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `g` | `9.8` | 重力加速度 $\mathrm{m/s^2}$。 |
| `L` | `1.0` | 摆长 $\mathrm{m}$。 |
| `dt` | `0.05` | 数据采样步长 $\mathrm{s}$。 |

### 5.3 MNIW 先验 — 动力学 $(A_k, Q_k)$

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `nu_dyn` | $M+2$ | Inverse-Wishart 自由度，下限即非奇异。 |
| `psi_dyn_scale` | `1e-2` | $\Psi_{\text{dyn}}=\psi\cdot I_M$ 的对角尺度。 |
| `M_dyn_bias_init` | `0.0` | 矩阵正态先验均值中的偏置项。 |
| `K_dyn_eye_scale` | `1.0` | 列协方差 $V_{\text{dyn}}=v\cdot I$ 的对角尺度。 |
| `spectral_radius_target` | `0.95` | 初始 $A_k$ 谱半径目标，防爆。 |

### 5.4 MNIW 先验 — Recurrence $(R_k, r_k)$

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `nu_rec` | $\max(K-1,1)+2$ | IW 自由度（在 PG 增广下每 stick 维度退化为 1-D 回归，参与 dof 计算）。 |
| `psi_rec_scale` | `1.0` | 对应 $\Psi_{\text{rec}}$。 |
| `M_rec_bias_init` | `0.0` | 偏置 $r$ 的先验中心。 |
| `K_rec_eye_scale` | `1e-4` | 列协方差（取小值等价官方 `sigmasq_A=10000`，给 $R$ 几乎无信息先验）。 |
| `stickiness_kappa` | `0.0` | 自粘性强度：镜像官方 `StickyInputHMMTransitions` 的 $\kappa$，对偏置 $r[k,k]$ 注入 $\mathcal{N}(\kappa,\sigma^2_\kappa)$ 先验把状态拉向自循环。设为 `0` 关闭。 |
| `sigmasq_stickiness` | `1.0` | 上述粘性先验的方差。 |

### 5.5 Pólya-Gamma 采样

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `pg_backend` | `"auto"` | `"polyagamma"` 精确（需第三方包）/ `"devroye"` 截断回退 / `"auto"` 自动检测。 |
| `pg_truncation` | `200` | Devroye 回退的级数截断项数。 |

### 5.6 初始化

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `init_kmeans_n_init` | `10` | sklearn KMeans 的多起点次数。 |
| `init_arhmm_em_iter` | `30` | AR-HMM 硬 EM 轮数。 |
| `init_decision_list` | `True` | 是否做决策列表置换 + 暖启 $R, r$。 |
| `init_seed` | `20260518` | 全局随机种子。 |
| `use_empirical_priors` | `True` | 是否用全局岭回归估计 $M_0, \Psi_0$ 作为 dyn-MNIW 先验（镜像 `pyslds.util.get_empirical_ar_params`）。 |

### 5.7 Gibbs 采样

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `n_iter` | `1000` | 总 sweep 数。 |
| `n_burnin` | `300` | 丢弃前若干 sweep。 |
| `n_thin` | `2` | 之后每隔 `n_thin` 保留一个样本（沿用官方默认偏好保留更多后验样本）。 |
| `n_chains` | `1` | 并行链数（脚本目前跑单链；多链需循环外层）。 |
| `log_every` | `25` | 控制台打印步距。 |
| `n_warmup_dyn` | `100` | 主循环前只重采 $(A_k,Q_k)$ 的预热轮数（镜像官方 `nascar.py`）。 |
| `n_warmup_trans` | `100` | 主循环前只重采 $(R,r,\omega)$ 的预热轮数。 |

### 5.8 数值稳定

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `Q_jitter` | `1e-6` | 每次采 $Q_k$ 后加在对角的抖动。 |
| `pg_clip_nu_abs` | `50.0` | PG 采样前对 $|\nu|$ 做的硬裁剪。 |

### 5.9 后验预测 (rollout)

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `rollout_horizon` | `600` | 默认预测步长。 |
| `rollout_n_samples` | `32` | 每条轨迹的预测样本数。 |

### 5.10 IO

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `out_dir` | `"runs/default"` | checkpoint 写入目录。 |

> **总计：除 $K$ 之外共 28 个可调超参数**，按上表分组管理；脚本入口
> [scripts/train_pendulum.py](../scripts/train_pendulum.py) 只显式暴露最常调的子集。

---

## 6. 输入 / 输出端口

### 6.1 数据输入 — `rarhmm.data.load_split`

支持两种磁盘布局，均符合 [docs/pendulum-dataset-spec.md §7](../../docs/pendulum-dataset-spec.md)：

* **(a) 推荐：manifest + 单轨迹 JSON**
  ```
  <data_root>/
      manifest.json        {"splits":{"train":["traj_xxxx.json", ...], "val":[...], ...}}
      traj_000000.json     {"id":"traj_000000","regime":"libration_small","E_bar":0.025,
                            "theta":[...],"omega":[...],"dt":0.05,...}
      ...
  ```
* **(b) 速度优化：单 NPZ**
  ```
  <data_root>/train.npz   keys: theta(object[]), omega(object[]), id, regime, E_bar
  ```

`load_split` 返回 `List[Trajectory]`，其中每个 `Trajectory` 暴露字段：

| 字段     | 类型           | 说明 |
| -------- | -------------- | ---- |
| `id`     | `str`         | 轨迹 ID，与可视化脚本对接。 |
| `regime` | `str`         | `"libration_small"/"libration_large"/"rotation"`。 |
| `E_bar`  | `float`       | 该轨迹的能量 bin 中点。 |
| `theta`  | `np.ndarray (T,)` | 原始角度（弧度）。 |
| `omega`  | `np.ndarray (T,)` | 原始角速度（rad/s）。 |
| `x`      | `np.ndarray (T, M)` | 已按 `obs_repr` 转好的模型输入。 |
| `split`  | `str`         | 数据划分名。 |

### 6.2 训练入口 — `rarhmm.train.fit(cfg, trajs)`

返回 dict（同时写入 `cfg.out_dir/chain.pkl`）：

| 键 | 内容 |
| --- | --- |
| `cfg` | `Config` 对象的深拷贝 |
| `samples` | `List[ModelParams]`，长度 ≈ `(n_iter-n_burnin)/n_thin` |
| `z_last` | `List[np.ndarray]`，最后一 sweep 的离散状态 |
| `log_init` | `np.ndarray (K,)`，最后估计的 $\log\pi_0$ |
| `loglik_history` | `np.ndarray (n_iter,)`，每 sweep 的 log-lik 代理值 |

每个 `ModelParams` 含 `A:(K,M,MP+1), Q:(K,M,M), R:(K,K-1,D_in_rec), r:(K,K-1)` 与 `mode`。

### 6.3 预测端口 — `rarhmm.predict.rollout_posterior`

输入 prefix $x_{1:T_0}$ 与 horizon $H$，输出 `X:(n_draws, H, M)`、`Z:(n_draws, H)`，
每个 draw 都先用 FFBS 从 prefix 后验里采一个 $z_{T_0}$，再按 §1.3-1.4 forward-simulate。

### 6.4 可视化产物

| 脚本 | 输出文件 | 内容 |
| --- | --- | --- |
| `viz_dynamics.py` | `viz_dynamics.png` | 每个状态的 streamplot 向量场 + 用 stick-breaking 概率 argmax 染色的分区底图（论文 Fig. 1 风格）。 |
| `viz_trajectory.py` | `viz_trajectory_<id>.png` | (a) 训练曲线 (b) 真值 vs 推断向量场 K 个状态并排 (c) 一条轨迹在 $(\theta,\omega/\omega_0)$ 平面被推断状态着色（复刻你给的 3 张截图）。 |
| `viz_rollout_gif.py` | `rollout_<id>_T0=*_H=*.gif` | 三联动画：左侧摆杆同时显示真值（黑色实线）与一条模型样本（红色虚线）；中右两幅 $\theta(t),\omega(t)$ 曲线显示 prefix（灰）、真值（黑）、$N$ 条后验预测（淡红），并有跟随时间推进的 "now" 竖线。 |

---

## 7. 训练流程总览

```
                       docs/pendulum-dataset-spec.md
                                  │
                                  ▼
                  rarhmm.data.load_split(data_root, "train")
                                  │
                                  ▼  List[Trajectory]
        ┌──────────────────────  rarhmm.train.fit  ──────────────────────┐
        │                                                                  │
        │  ① initialize:                                                  │
        │     k-means warm-start  →  AR-HMM hard EM (×n_iter_em)          │
        │     →  decision-list greedy permutation + logistic-reg warmstart │
        │                                                                  │
        │  ② Gibbs sweep ×n_iter:                                          │
        │     (a) FFBS  z|x,Θ                                              │
        │     (b) PG  ω|z,Θ                                                │
        │     (c) MNIW  (R,r) | ω,κ,x         (recurrence)                 │
        │     (d) MNIW  (A,Q) | z,x           (dynamics)                   │
        │     (e) refresh π0                                               │
        │                                                                  │
        │     保留 burn-in 之后每 n_thin 个 sweep 的参数样本                │
        └──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  runs/<out_dir>/chain.pkl
                          可视化 + rollout 预测
```

---

## 8. 已知限制 / 后续可拓展

* 当前 PG 回退实现使用截断级数，精度依赖 `pg_truncation`；生产环境建议 `pip install polyagamma`。
* 多链并行（`n_chains>1`）只暴露字段，未在 `train.py` 中展开，可手动循环调用 `fit` 改写。
* 仅实现 Gibbs，没有论文 §B 提到的 SVI；对 1.6 M 时间点是足够的。
* 决策列表初始化中的 logistic 回归用的是 sklearn `liblinear`，不带 PG 增广 — 仅作为 *初始化* 而非主推断步骤。
* `log_obs` 中 $t<P$ 的部分被设成 0；如果将来切换到更大 $P$，请把初始联合先验也补上。

---

## 9. 与论文符号的对照

| 论文 | 本仓库 |
| ---- | ------ |
| $x_t$ (latent continuous in rSLDS) | 在 rAR-HMM 特例中 **= 观测 $x_t$**，由本仓库 `Trajectory.x` 提供。 |
| $z_t$ | `z_state[i][t]`，取值 $\{0,\dots,K-1\}$。 |
| $A_k, b_k$ | 合并写在 `ModelParams.A[k]` 的最后一列。 |
| $Q_k$ | `ModelParams.Q[k]`。 |
| $R_k, r_k$ | `ModelParams.R[k], ModelParams.r[k]`。 |
| $\omega_{t,j}$ (PG aux) | 在 `gibbs_step` 内的局部变量 `omega`。 |
| stick-breaking link | `rarhmm/stick_breaking.py`。 |
| FFBS | `rarhmm/inference.py::ffbs_single`。 |

---

## 10. 复现实验入口（数据就绪后）

```powershell
# 1) 训练（默认 K=5, ro 模式）
& "C:\Users\tonyj\anaconda3\python.exe" -m scripts.train_pendulum `
    --data-root ..\data\pendulum --K 5 --n-iter 1000 --out runs\K5

# 2) 论文 Fig.1 风格向量场 + 分区图
& "C:\Users\tonyj\anaconda3\python.exe" -m scripts.viz_dynamics --run runs\K5

# 3) 一张轨迹的完整诊断图（log-lik 曲线 + true vs inferred 向量场 + 着色轨迹）
& "C:\Users\tonyj\anaconda3\python.exe" -m scripts.viz_trajectory `
    --run runs\K5 --data-root ..\data\pendulum --traj-id traj_000123

# 4) 后验预测 GIF：前 200 步 prefix + 400 步预测，12 条样本
& "C:\Users\tonyj\anaconda3\python.exe" -m scripts.viz_rollout_gif `
    --run runs\K5 --data-root ..\data\pendulum `
    --traj-id traj_000123 --prefix 200 --horizon 400 --n-samples 12
```
