# 四项精度与数据完整性审计报告

生成时间：2026-06-01T16:22:14.780Z


## 1. 已有 npm 校验（需单独执行）

- `npm run verify-physics` — 执行日已通过（往复能量、绕圈 Verlet、椭圆周期）

- `npm run verify-pendulum-display-energy` — 5 套刺激集能量/hide/终态角

- `npm run verify-pendulum-arc-score` — 角度折返与得分逻辑


## 1. 摆球绕圈：rAF 逐帧 vs simEnd 一步

- **PASS**: 刺激集无 rotation 单元；合成绕圈 rAF vs simEnd |Δθ|=1.14e-9 rad

## 2. 随机 Block 顺序

- **PASS**: 确定性复现：subject=0042 index=1 → 25 block 顺序稳定
- **PASS**: applySubjectBlockShuffle 与底层 shuffle 一致
- **PASS**: 打乱后 block 顺序与 JSON 原序不同
- **PASS**: 刺激集含 25 个 block
- **PASS**: Practice / 欢迎 Rest 等 prefix 顺序未变
- **PASS**: buildTimeline：空 subjectId（falsy）→ 不调用 applySubjectBlockShuffle
- **WARN**: applySubjectBlockShuffle('', idx) 仍会打乱；防护仅在 buildTimeline/RunnerView，勿直接以空串调用
- **PASS**: 奇数 formal 段 → 静默不打乱
- **WARN**: 编辑页「运行实验」不写入 subject_id；Runner 在 subjectId 为空时不调用 applySubjectBlockShuffle。正式被试须从首页「开始实验」入口。
- **PASS**: buildTimeline 条件：subjectId 非空且 stimulusSetIndex 有限时才打乱（与 RunnerView 一致）

## 3. 各阶段持续时间精度

- **PASS**: 扫描 780 个摆球单元：show1T∈[1,2]、hide1T=0.5s、fadeMs=150、totalTimeT 一致、buildTimePhases 分段正确
- **PASS**: totalTimeT 最大偏差 0.00e+0
- **WARN**: 运行时 rAF 墙钟：后台标签页可能延长真实等待，仿真 t 仍 cap 于 simEndSec（设计行为）

## 4. 角度记录精度

- **PASS**: pendulumAngleDegFromRad / degToRad 与 wrapAngleRad 一致（|Δ|<1e-10）
- **PASS**: pendulumAngleFromPointer 50 次随机 round-trip |Δθ|<1e-8
- **PASS**: 往复误差/导出：eDeg=5.7296° delta_csv=5.7296°（钳位逻辑可用）
- **WARN**: CSV 中 theta_*_rad 由折返后的度换算，转圈试次不保留圈数
- **PASS**: finishTrial 已写入 w_max_deg、unit_id、segment_id；全局 block_shuffle_seed / block_order_ids 由 RunnerView 写入

---
审计脚本全部通过。
