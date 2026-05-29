---
title: SWE-bench — 真实 GitHub Issue 评测
来源: 'Jimenez et al., "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?", ICLR 2024'
日期: 2026-05-29
分类: AI / 软件工程
难度: 中级
---

## 是什么

SWE-bench 是 Princeton 2023 年构造的一套**让大模型进真代码仓库修真 bug**的评测题集。日常类比：以前 LLM 编程比赛是数学题（HumanEval 这种几行 Python 函数），SWE-bench 是真活——把模型扔进客户的代码仓库、丢一个真 issue、让它自己去 fix。

题目长这样：

```
INPUT  = 一个 GitHub 仓库 + 一条真实 issue（"WCS 坐标算错了"）
OUTPUT = 模型生成的 patch（unified diff 格式）
评分   = apply 这个 patch，跑仓库自带的测试，全过 → 算解决
```

整套有 **2294 道题**，全部从 12 个流行 Python 项目（django / sklearn / sympy / matplotlib 等）的真实 PR 抓出来。每道题都有"开发者当时怎么修"的标准答案在那里等着对比。

## 为什么重要

不理解 SWE-bench，下面这些事都没法解释：

- 为什么 2024 年突然冒出 Devin / SWE-Agent / OpenHands / Cursor / Claude Code 一堆"AI 编码工程师"产品——它们排行榜冲的就是 SWE-bench
- 为什么 GPT-4 当年 HumanEval 80%、SWE-bench 只有 1.74%——从"小学应用题"到"真工程"是断崖式难度跳
- 为什么你现在看到的"Claude Sonnet 4.6 SWE-bench 60%+"宣传，三年前是 1.96%——31 个月把数字推了 30 倍
- 为什么后来又冒出"SWE-bench Verified 500 题"——原版 2294 题里有题目本身就**坏的**，得人工筛过才可信

## 核心要点

SWE-bench 的设计可以拆成 **三块**：

1. **数据怎么来**：从 12 个 popular Python repo 抓 ~90,000 个 merged PR，过滤出"PR body 里写了 fixes #N + diff 包含 test 文件"的，再剩下"测试在 patch 前 fail、patch 后 pass"的，最后剩 **2294 道**。三层漏斗每层 10× 收缩，全自动、无人工 review。

2. **怎么评分**：每道题有两类测试要跑：
   - **fail-to-pass (F2P)**：issue 里描述的 bug，patch 之前 fail、之后 pass——证明真的修了
   - **pass-to-pass (P2P)**：仓库已有的测试，patch 之前 pass、之后还得 pass——证明没破坏旧功能

   两类**都 100% 通过**才算解决。比"代码能跑就行"严格得多。

3. **三个子集**：
   - **full 2294**：原版，最权威也最贵（~120GB Docker 镜像、跑一遍要 24h）
   - **Lite 300**：自动筛"单文件单函数"简单题，让小团队也能跑
   - **Verified 500**：2024.08 OpenAI 联合 Princeton 人工筛过的"确实可解"题——现在排行榜默认报这个

## 实践案例

### 案例 1：一道题长什么样

`sympy__sympy-20590` 这道题：

- **issue**：用户报告"Symbol 实例的 `__eq__` 在 sympy 1.7 里行为变了——同名 Symbol 但不同 assumptions 现在被判等"
- **base_commit**：bug 还在的那个 commit（PR 修复之前）
- **ground truth patch**：开发者当年 PR #20596 的 diff，改了 `sympy/core/symbol.py` 的 `__eq__` 逻辑
- **F2P 测试**：`test_symbol_eq_assumptions`（patch 前 fail、后 pass）
- **P2P 测试**：仓库其他 1800+ 个 symbol 相关测试（patch 前后都得 pass）

模型只看 issue 文字 + base_commit 的 codebase，**看不到 PR**，自己想办法生成 patch。

### 案例 2：跑评测

官方 harness 装一下：

```bash
pip install swebench

# 把模型生成的 patch 放进 preds.json，每行：
# {"instance_id": "sympy__sympy-20590", "model_patch": "diff --git ..."}

python -m swebench.harness.run_evaluation \
    --predictions_path preds.json \
    --max_workers 4 \
    --instance_ids sympy__sympy-20590 \
    --run_id my-eval
```

每道题拉一个 Docker 镜像（因为 12 repo 各自的 Python / 依赖版本不同），容器里 apply patch、跑 pytest、解析 log、算分。**单题 1-5 分钟，2294 题全跑 24 小时**。

### 案例 3：排行榜怎么演化

[swebench.com/leaderboard](https://www.swebench.com/leaderboard) 显示 31 个月的进步：

| 时间 | SOTA 方案 | 分数 |
|---|---|---|
| 2023.10 | Claude 2 + BM25 检索 | 1.96% |
| 2024.04 | SWE-Agent + GPT-4（agent loop 思路） | 12.5% |
| 2024.10 | OpenHands + Claude 3.5 | 33% |
| 2025.10 | Claude 3.7 + 调优 agent harness | 65% |
| 2026.04 | Claude Opus 4.7 | ~74% |

注意 **2024.10 之后的数字全部在 Verified 500 题上报**——和原版 2294 不严格可比，看排行榜数字得读脚注。

## 踩过的坑

1. **原版 2294 题里有"坏题"**：issue 描述含糊、test 验证不到真实修复、ground truth 本身有 bug。2024.08 OpenAI 团队人工筛了一遍才得到 Verified 500——意味着论文当年报的 1.96% 分母里**包含了人都解不出来的题**，这个数字其实低估了模型能力。

2. **Pipeline 没人工 review**：3 阶段全自动 filter，没人看过题目质量。这是 SWE-bench 后续要"补 Verified 子集"的根源。

3. **训练数据污染风险**：12 个 repo 全是 GitHub 高 star Python 项目，几乎所有 LLM pretrain 都爬过。`fixes #N` 是强 signal，模型完全可能在训练时见过完整 issue + PR pair——但模型 vendor 不公开 cutoff 时间，没法独立 audit。

4. **retrieval 失败和 reasoning 失败混在一起**：BM25 检索拿错文件，模型看不到对的代码，自然修不了——但分数会和"reasoning 不行"一样记 0 分。论文不区分这两种 failure mode。

5. **F2P 和 P2P 等权**：现实工程里"不破坏旧功能"通常比"修一个新 bug" 重要得多，benchmark 不该等权处理。

## 适用 vs 不适用场景

**适用**：

- 评测 LLM agent 的"工程任务能力"——目前是事实上的行业标准
- 训练自己的编码 agent（用 19000 道训练 split）
- 想跑 benchmark 但预算紧 → SWE-bench Lite 300 题
- 想要可信数字 → SWE-bench Verified 500 题

**不适用**：

- 评测 LLM 基础编码能力（用 HumanEval / MBPP）——SWE-bench 难度过高，多数模型 < 5%，区分度差
- 评测 systems-level 工程能力（OS / 编译器 / 数据库 / 嵌入式）——SWE-bench 12 repo 全是 ML / 数学 / Web / lint 类
- 评测多语言能力——SWE-bench 仅 Python；2024 出的 Java / Multimodal 子集还小众
- 评测前端 / UI 工程（直到 SWE-bench Multimodal 才覆盖，但 SOTA 当时也才 7%）

## 历史小故事（可跳过）

- **2021 年**：HumanEval（OpenAI）+ MBPP（Google）发布，单函数小题集，GPT-4 出来后基本饱和到 80%。社区开始喊"benchmark 已经不够用"。
- **2023.10**：Princeton NLP（Carlos Jimenez / John Yang 等）发 SWE-bench，第一次把 LLM 评测推到**仓库级真实 issue**，Claude 2 baseline 1.96%——震撼整个 LLM 圈。
- **2024.04**：同一团队发 SWE-Agent，专给 agent 设计 ACI（Agent-Computer Interface），把分数推到 12.5%。
- **2024.06**：SWE-bench Lite 300 题发布，降低进入门槛。
- **2024.08**：OpenAI 联合 Princeton 发 SWE-bench Verified 500 题——人工筛过的"真可解"子集，从此排行榜默认报这个。
- **2024.10**：OpenHands 开源化 SWE-Agent 思路，分数推到 33%。
- **2025-2026**：Claude 3.5 → 3.7 → 4.6 → 4.7 持续推进，Verified 上 SOTA 接近 74%——开始进入"饱和期"，社区讨论 SWE-bench 2.0。

## 学到什么

1. **benchmark 是研究方向的发动机**——SWE-bench 没出现之前没有"AI 工程师"赛道；它一出现就把整个 2024-2026 agentic coding 浪潮带起来
2. **真实任务 ≠ 大量 demo 任务的堆叠**——单函数 1000 道题的总和，仍然不等于一道真实仓库任务
3. **execution-based evaluation > string match**——让代码真跑、真测试，比字符串对比可靠 100 倍
4. **benchmark 自己也会过期**——2294 原版 → Verified 500 是承认"原版有问题"，benchmark 维护者得持续打补丁
5. **数字差大不代表进步大**：1.96% → 74% 不是 38 倍提升，因为分母（题集）变了

## 延伸阅读

- 官方网站：[swebench.com](https://www.swebench.com/)（含 leaderboard、文档、提交入口）
- 代码仓库：[SWE-bench/SWE-bench](https://github.com/SWE-bench/SWE-bench)（star ~3.5k）
- 论文 PDF：[arXiv:2310.06770](https://arxiv.org/abs/2310.06770)
- OpenAI Verified 公告：[introducing-swe-bench-verified](https://openai.com/index/introducing-swe-bench-verified/)（看清原版的局限）
- [[react]] —— Reasoning + Acting 框架，是 SWE-Agent 等 agent loop 的祖先
- [[reflexion]] —— self-reflection 思路，2024 年 SWE-bench 上的 agent 大量复用

## 关联

- [[react]] —— SWE-bench 上跑分的 agent 系统普遍是 ReAct 式 think-act-observe 循环
- [[reflexion]] —— 失败重试 + 自我反思，agent 在 SWE-bench 上常用的 trick
- [[toolformer]] —— 让 LLM 学会用工具，SWE-Agent 的 ACI 思路远亲
- [[transformer]] —— 所有 SWE-bench 跑分模型的底层架构

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agentless]] —— Agentless — 反 Agent 派的 SWE-bench 解法

