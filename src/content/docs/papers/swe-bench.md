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

1. **数据怎么来**：从 12 个 popular Python repo 抓 ~90,000 个 merged PR，过滤出"PR body 写了 fixes #N 且 diff 含 test 文件"的，再留下"测试在 patch 前 fail、后 pass"的，最后剩 **2294 道**。三层漏斗按**数量级**收缩，全自动、无人工 review。

2. **怎么评分**：每道题跑两类测试：
   - **fail-to-pass (F2P)**：issue 里那个 bug——patch 前 fail、后 pass，证明真修了
   - **pass-to-pass (P2P)**：仓库原有测试——patch 前后都得 pass，证明没砸旧功能

   两类**都 100% 通过**才算解决。比"代码能跑就行"严得多。

3. **三个子集**：
   - **full 2294**：原版，最权威也最贵（~120GB Docker、全跑约 24h）
   - **Lite 300**：自动筛"单文件单函数"简单题，小团队也能跑
   - **Verified 500**：2024.08 OpenAI 联合 Princeton 人工筛过的"确实可解"题——排行榜默认报这个

## 实践案例

### 案例 1：一道题长什么样

拿 `sympy__sympy-20590`：用户说"同名 Symbol 但不同 assumptions，现在被 `__eq__` 判等了"。模型只拿到：

```
INPUT = issue 文字 + base_commit 整仓代码（看不到后来的 PR）
OUTPUT = unified diff（改哪几个文件、改哪几行）
```

**逐部分解释**：`base_commit` 是 bug 还在的快照；ground truth 是开发者 PR #20596 对 `sympy/core/symbol.py` 的改法；F2P 是 `test_symbol_eq_assumptions`（前 fail 后 pass）；P2P 是同模块其它已绿测试（前后都得绿）。模型必须自己找文件、写 patch。

### 案例 2：跑评测（四步）

1. `pip install swebench` 装官方 harness  
2. 写一行预测（JSONL），例如：

```json
{"instance_id": "sympy__sympy-20590", "model_patch": "diff --git a/sympy/core/symbol.py b/sympy/core/symbol.py\n..."}
```

3. 跑单题（先别全跑 2294）：

```bash
python -m swebench.harness.run_evaluation \
  --predictions_path preds.json --max_workers 4 \
  --instance_ids sympy__sympy-20590 --run_id my-eval
```

4. harness 拉该 repo 的 Docker 镜像 → apply patch → pytest → 解析 log 算分。单题约 1–5 分钟；全量约 24 小时。

### 案例 3：怎么读排行榜

打开 [swebench.com/leaderboard](https://www.swebench.com/leaderboard)：

1. 先读脚注里的**子集名**（full 2294 / Lite 300 / Verified 500）
2. 再比 resolve rate；子集不同，百分比**不能直接相除当进步倍数**
3. 截至 2026-05 公开榜大致：2023.10 Claude 2+BM25 **1.96%（full）** → 2024.04 SWE-Agent+GPT-4 **12.5%** → 2024.10 起多数报 Verified（OpenHands ~33% → 后续 harness 约 65–74%）

## 踩过的坑

1. **原版有坏题**：描述含糊、test 验不到真修复。Verified 500 才是人工筛过的可解题；论文 1.96% 分母里含"人都解不出"的题。
2. **全自动 pipeline**：三阶段无人审题，这是后来必须补 Verified 的根因。
3. **训练污染**：12 个高 star Python 仓几乎都被 pretrain 爬过；`fixes #N` 是强信号，vendor 不公开 cutoff，难独立 audit。
4. **检索失败 ≠ 推理失败**：BM25（关键词检索）拿错文件，模型看不见对的代码也会得 0——和"想不通怎么改"混在同一分里。

## 适用 vs 不适用场景

**适用**：

- 评测 LLM agent 的仓库级修 bug 能力（行业事实标准）
- 训练编码 agent：用官方 **~19k train split**（与评测 2294 **不重叠**，别拿 test 练）
- 预算紧 → Lite 300；要对外报可信数字 → Verified 500

**不适用**：

- 基础编码能力（用 HumanEval / MBPP）——多数模型 < 5%，区分度差
- systems 工程（OS / 编译器 / DB / 嵌入式）——12 repo 偏 ML / 数学 / Web
- 多语言或前端 UI——主集仅 Python；Multimodal 子集当时 SOTA 约 7%

## 历史小故事（可跳过）

- **2021**：HumanEval + MBPP 单函数小题；GPT-4 后约 80% 饱和，社区喊 benchmark 不够用。
- **2023.10**：Princeton（Jimenez / Yang 等）发 SWE-bench，Claude 2 baseline 1.96%。
- **2024.04–08**：同团队 SWE-Agent（ACI：给 agent 用的编辑/终端接口）到 12.5%；Lite 300；OpenAI+Princeton 发 Verified 500。
- **2024.10 起**：OpenHands 等开源 agent 推到 Verified ~33%；2025–2026 公开榜逼近约 74%，社区开始谈饱和与 2.0。

## 学到什么

1. **benchmark 能开赛道**——没有 SWE-bench，就很难有 2024–2026 的 agentic coding 浪潮
2. **真仓库任务 ≠ 一千道单函数题的堆叠**
3. **跑测试评分 > 字符串比对**——execution-based evaluation 更可信
4. **题集也会过期**——2294 → Verified 500 是承认原版有问题；看榜先看子集脚注
5. **数字差大 ≠ 进步同倍**——1.96% → 74% 不能当 38 倍，因为分母（题集）变了

## 延伸阅读

- 官网：[swebench.com](https://www.swebench.com/)（leaderboard / 文档 / 提交）
- 代码：[SWE-bench/SWE-bench](https://github.com/SWE-bench/SWE-bench)
- 论文：[arXiv:2310.06770](https://arxiv.org/abs/2310.06770)
- Verified 公告：[introducing-swe-bench-verified](https://openai.com/index/introducing-swe-bench-verified/)
- [[react]] —— ReAct（Reasoning + Acting），agent loop 祖先
- [[reflexion]] —— 自我反思重试，SWE-bench agent 常用

## 关联

- [[react]] —— 跑分 agent 多为 ReAct 式 think-act-observe
- [[reflexion]] —— 失败后自我反思再试
- [[toolformer]] —— 学用工具；SWE-Agent ACI 的远亲
- [[transformer]] —— 跑分模型的底层架构
- [[swe-agent]] —— 同团队在 SWE-bench 上的 agent 解法
- [[agentless]] —— 不用复杂 agent loop 也能冲榜的对照路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agentless]] —— Agentless — 反 Agent 派的 SWE-bench 解法
- [[copilot-rct]] —— Copilot RCT — AI 编程助手的第一个严格随机对照实验
- [[react]] —— React UI 组件库
- [[reflexion]] —— Reflexion — 让 LLM 自我反思
- [[sillito-questions]] —— Sillito 44 问题 — 程序员改代码时到底在问什么
- [[swe-agent]] —— SWE-Agent — Princeton SWE-bench 解法

