---
title: Resolution Diagnostics — 判断 LLM 排名差距有没有统计分辨率
来源: 'Anany Kotawala, "Resolution Diagnostics for Paired LLM Evaluation", arXiv 2026'
日期: 2026-05-28
分类: machine-learning
难度: 中级
---

## 是什么

日常类比：两家奶茶店都让同一批人盲喝评分，A 店平均高 0.8 分。你不能只看"高了 0.8"，还要问：这批人够不够多、口味是不是集中、这个差距会不会只是抽样晃动。

Resolution Diagnostics 做的就是这件事：给 LLM 排行榜上的两个模型差距加一个"分辨率检查"。它不只问 A 是否比 B 高，还问当前 benchmark 的题量和结构，是否足以把这个差距稳定地区分出来。

论文把共享题目的模型比较看成 paired evaluation：两个模型做同一批题，所以每道题天然成对。核心输出是 resolution ratio：`q = N / N*`。`N` 是实际题量，`N*` 是要稳定看出当前差距所需题量；`q >= 1` 才叫有足够分辨率。

## 为什么重要

不理解这篇论文，下面这些事会看错：

- 排行榜相邻模型只差 0.5 个百分点时，名次可能比看起来脆弱。
- 同一批题上比较两个模型，不能当成两批互不相关的样本来算。
- 一个 p-value 刚好小于 0.05，不等于这个 benchmark 已有 80% power 去稳定发现同等差距。
- leaderboard 连续更新、同时比较很多模型时，单次测试的结论会变松。

## 核心要点

1. **把模型差距当成 paired test**：像同一张试卷给两名学生做，真正有用的是每道题上 A 与 B 的差值，而不是两个人各自的总分。对二分类正确率，论文主要用 McNemar / Connor 这条老统计路线。

2. **用 `N*` 和 `q` 说人话**：`N*` 像"需要多少张试卷才看得清"，`q` 像"现在的放大镜够不够用"。`q < 1` 不表示两个模型一样，只表示当前题量不足以支撑这个差距的分辨率目标。

3. **常见计算器会诱导错用**：把 unpaired Cohen-h 计算器的结果再乘 `(1-rho)`，在相邻小差距场景下大约会少算一半题量。论文证明这个偏差不是偶然，而是 close comparison 里稳定出现的因子。

## 实践案例

### 案例 1：把排行榜差距转成 q

```python
from math import ceil

N = 12032          # benchmark 真实题量
N_star = 24632     # 按 paired test 算出的所需题量
q = N / N_star
print(q, q >= 1)
```

**逐部分解释**：

- `N` 是排行榜已经用掉的题目数。
- `N_star` 是要在 `(alpha=0.05, power=0.8)` 下看清这个差距所需题量。
- 输出小于 1，就该写成"未达到目标分辨率"，而不是简单宣布名次可靠。

### 案例 2：为什么要按同一题成对比较

```python
scores_a = [1, 1, 0, 1, 0]
scores_b = [1, 0, 0, 1, 1]
diffs = [a - b for a, b in zip(scores_a, scores_b)]
gap = sum(diffs) / len(diffs)
print(diffs, gap)
```

**逐部分解释**：

- `zip` 表示第 i 道题上两个模型必须对齐比较。
- `diffs` 只关心同一道题谁赢谁输，抵消了题目本身难易。
- 如果拆成两批独立样本，就浪费了"同一题"提供的信息。

### 案例 3：给 leaderboard 报告加一行检查

```python
def verdict(q: float) -> str:
    if q >= 1:
        return "resolved"
    return "under-resolution"

for pair, q in [("rank 3 vs 4", 0.30), ("rank 7 vs 8", 2.60)]:
    print(pair, verdict(q))
```

**逐部分解释**：

- `resolved` 表示当前 benchmark 够大，能支持这个差距。
- `under-resolution` 表示要么扩大样本，要么降低口径，不该把名次讲得太满。
- 这比只报"第 3 名高于第 4 名"更适合给读者做风险提示。

## 踩过的坑

1. **把 `q < 1` 理解成两个模型一样**：错在把"看不清"当成"没有差异"，统计上这是两件事。

2. **只看 p-value 不看 power**：p-value 是这次样本下的拒绝强度，power 才回答"如果同等差距真实存在，重复实验有多大概率看出来"。

3. **用 unpaired 公式套 paired 数据**：同一批题会让两个模型正确率高度相关，不利用这个相关性会把方差结构算错。

4. **忽略题目类别聚类**：MMLU-Pro 这类 benchmark 有学科簇，同一学科里的题可能一起偏向某个模型，直接按独立题目算会过于乐观。

## 适用 vs 不适用场景

**适用**：

- 两个模型做同一批题，想判断分数差距是否够稳定。
- leaderboard 相邻名次差距很小，需要给产品或研究结论加置信边界。
- 二分类正确率、可逐题对齐的 graded score、可 bootstrap 的成对指标。
- benchmark 设计前，想反推某个目标差距大概要多少题。

**不适用**：

- 两个模型不是同一批题，无法形成逐题差值。
- benchmark 本身测错了能力；统计分辨率不能修复 construct validity。
- 只想描述当前固定题集上的分数，不想推广到题目总体。
- 缺少逐题结果，只剩排行榜总分；这时很多 paired 检查做不了。

## 历史小故事（可跳过）

- **1947 年**：McNemar 提出成对二分类差异检验，最早用于相关比例的抽样误差。
- **1987 年**：Connor 给出 paired proportions 的样本量公式，让"需要多少样本"可以直接算。
- **2018-2020 年**：NLP 社区反复提醒模型比较要选对显著性检验，并关注 underpowered 评测。
- **2024 年**：LLM eval 里的 error bar 和 benchmark variance 开始变成显性话题。
- **2026 年**：这篇论文把 paired test、power、multiplicity、cluster、anytime-valid testing 包成 leaderboard resolution protocol。

## 学到什么

- LLM 排名不是一个纯排序问题，而是一个统计声明：差距必须配上能否分辨这个差距的证据。
- `q = N / N*` 是很好的报告语言，因为它把复杂 power 计算翻译成"现在题量够不够"。
- Open LLM Leaderboard v1 有 11/40 个 pair 未达目标分辨率；MMLU-Pro top-10 相邻 pair 有 4/9 个未达，按真实学科聚类会升到 6/9。
- 常用 power calculator 的错用模式大约低估 2 倍题量，尤其伤害相邻排名这种小差距场景。

## 延伸阅读

- 论文 PDF：[Resolution Diagnostics for Paired LLM Evaluation](https://arxiv.org/pdf/2605.30315)（本文主论文，建议先看 Abstract 和 Table 5）
- Card et al. 2020：With Little Power Comes Great Responsibility（NLP 比较为什么经常 underpowered）
- Dror et al. 2018：The Hitchhiker's Guide to Testing Statistical Significance in NLP（选择检验方法的老指南）
- Miller 2024：Adding Error Bars to Evals（LLM eval 里 error bar 的近邻工作）
- [[chatbot-arena-2024]] —— pairwise preference leaderboard 的代表，未来也需要类似 resolution 检查
- [[lm-evaluation-harness]] —— 论文重分析 OLL v1 时依赖的逐题评测数据来源之一

## 关联

- [[chatbot-arena-2024]] —— 同样是模型排序，但更偏人类偏好和 pairwise battle。
- [[lm-evaluation-harness]] —— 提供逐题评测记录，才能做 paired diagnostics。
- [[bigbench-2022]] —— 大 benchmark 的题量和任务结构会直接影响分辨率。
- [[gpt-3]] —— 大模型能力展示推动了 leaderboard 文化，也放大了评测统计问题。
- [[instructgpt]] —— 对齐模型比较常依赖人类偏好，和本文的 pairwise 思路相邻。
- [[ranknet-2005]] —— 排序学习里也把 pairwise comparison 当核心信号。
- [[lambdarank-2006]] —— 从 pairwise 排序走向列表指标，适合对照 leaderboard 评价方式。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
