---
title: FSRS — 让 Anki 知道每张卡什么时候快被你忘掉
来源: 'Ye et al., "A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling", KDD Workshop 2022'
日期: 2026-05-29
分类: 学习与认知
难度: 中级
---

## 是什么

FSRS（Free Spaced Repetition Scheduler）是一套**让软件自己算出"哪张卡什么时候该让你再看一次"**的算法。日常类比：像私人健身教练——他不会让你天天练所有部位，他记得你哪块肌肉昨天练过、哪块快"松了"，按需安排今天练哪一组。

当你在 Anki 里点一下 Good，FSRS 会更新这张卡的两个数（D 难度，S 稳定性），再反算出"过 88 天再来"——不是固定 1 / 7 / 14 天，而是因卡因人而定。

这是 Anki 23.10+（2023 年 10 月起）**内置的可选调度器**——需在牌组选项里手动开启；未开启时仍走老的 SM-2。开启后有大量牌组在跑。

## 为什么重要

不理解 FSRS，下面这些事都没法解释：

- 为什么"背单词"已经做了 30 年，2023 年才有人把"算法 + 个人训练参数"做对——之前的 SuperMemo SM-2 用 6 个手调常数管所有人
- 为什么"什么时候复习"这种看似主观的事，能用 17 个浮点数 + L-BFGS 训练 10 秒拟合出来
- 为什么 R = 0.85 比默认 R = 0.9 长期效率更高——但 Anki 默认还是 0.9（兼容老 SM-2）
- 为什么 1885 年 Ebbinghaus 的指数遗忘曲线在 2022 年被改成 power law——19 世纪心理学被 21 世纪 ML 拟合事实推翻

## 核心要点

FSRS 的三块积木：

1. **DSR 三状态**：每张卡背后有三个数——D（Difficulty 难度，1-10）/ S（Stability 稳定性，单位天）/ R（Retrievability 今天能想起的概率，0-1）。类比：每张卡像一颗角色——D 是它的"难缠程度"，S 是它的"血量上限"，R 是它"此刻还剩多少血"。

2. **遗忘曲线改成 power law**：FSRS-5 用 R(t, S) = (1 + (19/81)·t/S)^(-0.5)。类比：S 越大越不易掉血，但时间 t 一过仍会慢慢松动；不是 1885 年那种"e^(-t/S) 指数掉血"，是慢得多的双曲线衰减。

3. **17 weights 个人训练**：每次复习成功 / 失败后 D 和 S 怎么变？由 17 个浮点数 w0..w16 控制。每个 Anki 用户跑一次 L-BFGS 在自己的复习历史上拟合，10 秒搞定。类比：把"哪种健身策略对你最好"交给一个数学优化器，而不是手抄一本《如何健身》。

## 实践案例

### 案例 1 — 算"今天还能想起这张卡的概率 R"

```python
def forgetting_curve(t_days: float, stability: float) -> float:
    # FSRS-5 的遗忘曲线（power law 双曲线衰减）
    FACTOR = 19.0 / 81.0  # ≈ 0.235
    return (1.0 + FACTOR * t_days / stability) ** -0.5

forgetting_curve(10, 30)  # ≈ 0.96 — S=30 天的卡，10 天后还能想起 96%
forgetting_curve(60, 30)  # ≈ 0.85 — 60 天后掉到 85%
```

逐部分：
- `t_days` 是真实日历天数（含周末、跳过日），不是"我看过几次"
- `stability` 由历次复习累积更新
- `^-0.5` 是 power law decay，比指数 e^(-t/S) 慢得多——意味着旧卡更耐放

### 案例 2 — 复习成功后 S 怎么变

```python
import math

def next_stability_success(S, D, R, w):
    # FSRS-5 Eq 2 简化版：成功复习后新 stability
    return S * (1 + math.exp(w[8])
                  * (11 - D)                          # 越简单的卡 S 长得越快
                  * (S ** -w[9])                      # 已经稳的卡再长会被惩罚（边际递减）
                  * (math.exp(w[10] * (1 - R)) - 1))  # 临界复习（R 低时复习）涨更多

# 例：S=30 天的中等难度卡 (D=5)，距上次 30 天 (R≈0.9)，点 Good
S_new = next_stability_success(30, 5, 0.9,
            [0]*8 + [1.616, 0.154, 1.082])
# ≈ 88 天 — 下次约 3 个月后再看
```

要点：
- `(11 - D)` 项：D=10（最难）时为 1，D=1（最简单）时为 10——简单卡涨 10 倍快
- `(e^(w10*(1-R)) - 1)` 项：在卡接近遗忘（R 低）时复习成功，S 增长更多——把心理学 "desirable difficulty" 数学化

### 案例 3 — 用 L-BFGS 个人化训练 17 weights

```python
from scipy.optimize import minimize

FACTOR = 19.0 / 81.0
def fsrs_loss(w, reviews):
    total = 0.0
    for (t, S_prev, D_prev, grade) in reviews:
        R_pred = (1.0 + FACTOR * t / S_prev) ** -0.5  # 与案例 1 同一条曲线
        y = 1.0 if grade >= 2 else 0.0  # 记得 / 忘了
        total += (R_pred - y) ** 2
    return total + 0.001 * sum(abs(x) for x in w)  # L1 正则

trained = minimize(fsrs_loss,
                   x0=[0.4, 1.2, 3.1] + [1.0]*14,
                   args=(my_review_log,),
                   method="L-BFGS-B")
```

5k reviews 跑 ~10 秒（Rust 版），单核 CPU 即可，无需 GPU——和"训练一个神经网络"完全不是一个量级。

## 踩过的坑

1. **以为"立即再点 Good 一遍"S 会涨**：Eq 2 里 `(e^(w10*(1-R))-1)` 项，刚复习完 R=1，这项为 0，S 不变。这是 FSRS 故意的——不奖励"立刻复习"
2. **以为失败 (Again) 会让 S 归零**：实际把 30 天 S 砍到 ~3 天，**保留** D 信息。SM-2 时代 EF 减 0.2 + interval 重置是不可恢复的，FSRS 改进了这点
3. **以为 17 weights 越多越好越可解释**：Eq 2 的 6 个相乘因子高度耦合，单独改 w8/w9/w10 任一个会破坏整体平衡。"每个 weight 各有清晰含义"是松承诺
4. **以为 R_target=0.9 是最优**：Wilson 2019 PLOS *The 85% Rule* 证 R=0.85 长期 retention 更优。FSRS 默认 0.9 只是为了兼容 SM-2

## 适用 vs 不适用场景

**适用**：
- 事实记忆（fact recall）：单词、语法、算法模板、配置项默认值
- 需要 5 年以上长期记忆的场景——FSRS 优势在 1k+ reviews 后才显现
- 想要可审计、可分叉的开源调度器（vs 闭源 SuperMemo SM-18）
- 跨设备 / 多平台（Anki / AnkiDroid / Mochi 都已集成）

**不适用**：
- 理解型学习（"为什么 raft 这么设计"）——schema-level 理解用 active recall + 写笔记，不是抽卡
- 学了 1 周就放弃——前 100 reviews 与 SM-2 没区别
- 纯静态查询信息（API 参考）——开 IDE 查就好，别背
- 个性化需求强但样本太小（< 500 reviews）——trained vs default RMSE 差 < 0.01，白训

## 历史小故事（可跳过）

- **1885 年**：Ebbinghaus 用自己当被试背 2300 个无意义音节，画出第一条遗忘曲线 R(t) = e^(-t/S)。**纯描述定律**，没"该什么时候复习"的算法
- **1972 年**：Sebastian Leitner 把"间隔重复"做成 5 个物理盒子，pass 进下一个。无 per-card 状态、无个性化
- **1990 年**：Piotr Wozniak 博士论文造出 SuperMemo SM-2——第一个计算机化间隔重复，6 个常数 + EF（ease factor）一个 per-card 变量。EF 同时承担"难度 + 稳定性"两个语义，是 SM-2 的根本缺陷
- **2022 年**：浙江大学本科生 Jarrett Ye 把"何时复习"建模成 stochastic shortest path（SSP），KDD Workshop 论文。DSR 三状态 + R(t,S) 公式起源在此
- **2023 年 10 月**：FSRS-5（17 weights）写入 Anki 核心，成为内置可选调度器（仍需手动开启）

## 学到什么

- **复杂行为可以用少量参数 + 大量数据拟合**：17 weights + 5k review log = 比 30 年手调常数更准的调度
- **DSR 三状态拆分**是关键架构胜利——SM-2 的 EF 同时背"难度 + 稳定性"是耦合错误，FSRS 拆开后两个维度独立演化
- **不变 = 不会变好**：SuperMemo 30 年闭源不变，开源 + 可训练参数让这个领域突然能进步
- **empirical fit > 纸面定律**：1885 年的指数遗忘曲线在 70 用户实测下 power law 误差低 15%——没有大数据就没有这个发现

## 延伸阅读

- FSRS-5 完整 spec：[fsrs4anki wiki — The Algorithm](https://github.com/open-spaced-repetition/fsrs4anki/wiki)（5 个方程 + 17 weights 最权威）
- 工业代码：[fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs)（Rust 核心，看 `src/inference.rs` 看方程到代码 1:1 映射）
- 评测对照：[srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)（70 用户脱敏 log，含 SM-2 / FSRS / NN baseline 对比表）
- Wilson et al. 2019 *The Eighty Five Percent Rule for Optimal Learning*（PLOS）：R_target 该选多少
- [[cognitive-load-theory]] —— element interactivity 决定卡片该拆多碎

## 关联

- [[cognitive-load-theory]] —— element interactivity 决定 D 起点；FSRS 拆卡建议的理论依据
- [[dijkstra-shortest-path]] —— Ye 2022 把"何时复习"建模成 stochastic shortest path
- [[program-comprehension-fmri]] —— 大脑记忆复用脑区，与 FSRS 的 DSR 状态有间接对应
- [[dqn]] —— RL 在动作空间找最优；FSRS 反着来——监督学习在 review log 上回归 R
- [[muzero]] —— 模型化环境（vs 记忆模型）思路对照
- [[no-silver-bullet]] —— 间隔重复是 essential complexity，不能靠简单启发式消除

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cognitive-load-theory]] —— Cognitive Load Theory — 学不会不是不努力，是工作记忆装不下
- [[dijkstra-shortest-path]] —— Dijkstra 最短路径 — 一杯咖啡时间想出来的贪心算法
- [[dqn]] —— DQN — Deep Q-Network
- [[muzero]] —— MuZero — 不用规则也能下棋
- [[no-silver-bullet]] —— No Silver Bullet — 软件难度的二分手术刀
- [[program-comprehension-fmri]] —— Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区

