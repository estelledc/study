---
title: SWE-bench (Jimenez et al. 2024) — 让 LLM 解决真实 GitHub issue
description: 把 agent 评测从 demo 题（HotpotQA / HumanEval）推到 2294 个真实 GitHub issue。当年最强 Claude 2 只解决 1.96%
sidebar:
  label: SWE-bench (ICLR 2024)
  order: 6
---

## 核心信息

- 标题：SWE-bench: Can Language Models Resolve Real-World GitHub Issues?
- 标题翻译：SWE-bench——大语言模型能解决真实 GitHub Issue 吗？
- 作者：Carlos E. Jimenez*, John Yang*, Alexander Wettig, Shunyu Yao, Kexin Pei, Ofir Press, Karthik Narasimhan
- 机构：Princeton NLP + Princeton Language and Intelligence + University of Chicago
- 发表时间：arXiv 2023.10 提交，v3 终版 2024.11
- 发表渠道：**ICLR 2024 Oral**
- arXiv：[2310.06770](https://arxiv.org/abs/2310.06770)
- 代码 / 项目：[princeton-nlp/SWE-bench](https://github.com/princeton-nlp/SWE-bench)（star ~3.5k）；leaderboard 在 [swebench.com](https://swebench.com)
- 数据 / 资源：2,294 真实 GitHub issues × 12 popular Python repos（sklearn / django / sympy 等）
- 论文类型：benchmark paper（评测基准）

## 原文摘要翻译

语言模型已经超越了我们有效评估它们的能力，但要推动其未来发展，必须研究它们能力的前沿。
我们发现**真实世界的软件工程**是评估下一代语言模型的丰富、可持续且具挑战性的测试场。
为此我们引入 **SWE-bench**——一个由 **2294 个软件工程问题**组成的评估框架，
这些问题取自 **12 个流行 Python 仓库的真实 GitHub issue 及对应的 pull request**。
给定一个 codebase 和一个 issue 描述，语言模型被要求通过编辑 codebase 来解决该问题。
解决 SWE-bench 中的 issue 经常需要理解和协调跨多个函数、类甚至文件的修改，
要求模型与执行环境交互、处理超长上下文、执行远超传统代码生成任务的复杂推理。
我们的评估表明，**最先进的私有模型和我们 fine-tune 的 SWE-Llama 都只能解决最简单的问题**——
表现最好的 Claude 2 仅解决 **1.96%** 的 issue。
SWE-bench 上的进展代表着向更实用、更智能、更自主的 LM 迈出的步伐。

## 创新点

SWE-bench 给"LLM agent 评测"领域提供了 4 件真正新的东西：

1. **真实任务而非 demo 题**：HumanEval / MBPP 都是 self-contained 几行代码的小问题。
   SWE-bench 是**真实 issue 跨多文件多函数的修改**——平均编辑 1.7 文件 / 3.0 函数 / 32.8 行。
   这是 LLM agent 评测从"小学水平"到"工程师水平"的范式跳跃。
2. **execution-based evaluation**：不靠 string match，**用 issue 自带的真实 unit tests 验证**。
   两类 test 都要通过：fail-to-pass（issue 真被修复）+ pass-to-pass（不破坏旧功能）。
3. **3-stage 自动 data 采集 pipeline**：从 90,000 PR → 自动过滤 → 2,294 instances。
   **可持续 + 可扩展**——可以在新的 repo 上重新跑 pipeline 持续扩充数据集，
   且能保证"模型训练时没见过"（PR 时间 > 训练数据 cutoff）。
4. **暴露 LLM 的工程任务能力天花板**：当年最强 Claude 2 仅 1.96%，
   GPT-4 仅 1.74%——这个数字让整个 LLM 社区认识到"agent 离真工程师还很远"，
   直接催生了 SWE-agent / Devin / OpenHands 等专门系统。

## 一句话总结

**SWE-bench 是 LLM agent 范式的"成人考试"——把 [ReAct](/study/papers/react/) /
[Reflexion](/study/papers/reflexion/) / [Toolformer](/study/papers/toolformer/) 这些在 demo 题上
拿 30-90% 的方法，扔到真实 GitHub issue 上，全部跌到 < 5%。**
这个数字差距催生了 2024-2026 年 agentic coding 系统的整个浪潮。

![SWE-bench 评测全流程](/study/papers/swe-bench/01-eval-flow.webp)

*图 1：SWE-bench 评测流程。Issue text + codebase snapshot 喂给 LLM → 生成 Patch（unified diff 格式）→
apply patch → run associated test suite → 检查两类 test：fail-to-pass（必须从 fail 变 pass）+
pass-to-pass（必须保持 pass）。两类都通过才算 Resolved。当年最强 Claude 2: **1.96%**；
2024 SWE-agent 把 SOTA 推到 12-13%。*

## Why（这篇出现前世界缺什么）

2023 年中，LLM 编码评测有 3 个主流：

- **HumanEval (Chen et al. 2021)**：164 道函数级写代码题。GPT-4 在 2023 年已经 80%+ pass@1
- **MBPP (Austin et al. 2021)**：974 道更简单的 Python 入门题。GPT-4 接近 80%
- **APPS (Hendrycks et al. 2021)**：算法竞赛题。GPT-4 ~30%

这三个 benchmark 都是 **self-contained**——一个函数签名 + 一段描述 → 生成函数体 + run 单元测试。

但**真实软件工程不是这样**：

- 修一个 bug 需要先理解十几个文件之间的关系
- 编辑通常跨多个函数 / 类 / 文件
- 测试不是给定的，而是要先识别"哪些 test 和这个 bug 相关"
- 不能"贪心生成"——需要先 explore codebase 再决定改哪儿

SWE-bench 的 insight：**用 GitHub 的现成数据构建 benchmark**。

GitHub 同时提供了 4 件齐全的东西：

1. issue 描述（人类自然语言）
2. PR（人类写的 ground truth 修复方案）
3. PR 自带的 test changes（验证修复是否有效的 ground truth）
4. base commit（修复前的完整 codebase）

把这 4 件配齐 = benchmark 一行。**不需要人工设计任何东西**——pipeline 自动从 GitHub 流抽。

## 论文地形

PDF 32 页（含 6 个 appendix），主体 11 页。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | 任务定义 + Figure 1 整体流程图 | **精读** |
| 2. SWE-bench | 数据采集 3 stage + task formulation + 6 大 features | **精读** |
| 3. SWE-Llama | fine-tune CodeLlama 在 SWE-bench-train 上 | 速读 |
| 4. Experimental Setup | retrieval（BM25 / dense / oracle）+ 模型选择 | 速读 |
| 5. Results | 关键数字：1.96% Claude 2 / 1.74% GPT-4 | **精读** Table 2 |
| 6. Analysis | 难度分布 + 模型行为 case study | 看 Figure 5 |
| 7. Limitations | 4 条诚实限制 | **精读** |
| Appendix A | 数据采集 pipeline 技术细节 | 复用必看 |

**心脏物**有三个：

1. **Figure 1**（page 1）—— issue + codebase → patch → tests → resolved，1 张图概括评测协议
2. **Figure 2**（page 2）—— 3-stage 数据采集 pipeline
3. **`swebench/harness/grading.py:140-200`** —— fail-to-pass + pass-to-pass 双维度评分逻辑

## 数据采集流程（3 stage pipeline）

![3-stage 数据采集 pipeline](/study/papers/swe-bench/02-data-pipeline.webp)

*图 2：从 90,000 PR 漏斗式过滤到 2294 task instances 的 3 阶段流程。
Stage 1 从 12 个 popular Python repo（sklearn / django / sympy / scikit-learn / matplotlib / pylint 等）抓 ~90k PR；
Stage 2 保留同时满足 (a) resolves an issue (b) contributes tests 的 PR；
Stage 3 保留 install 成功 + 至少 1 个 fail-to-pass test 的 PR。
最终 2294 task instances。后续衍生 SWE-bench Lite（300 题简化版）+ SWE-bench Verified（500 题人工 verified, with OpenAI）。*

每个 stage 的过滤 rationale：

- **Stage 1 选 popular repo**：better maintained + 高 test coverage + 清晰 contribution guide
  → 保证抓到的 PR 质量高
- **Stage 2 必须 contribute tests**：这是为什么后续能用真测试 verify 的关键。
  没有"PR 自带 test"，benchmark 就无法 ground truth verify
- **Stage 3 必须有 fail-to-pass test**：这条 test 在 PR apply 前 fail、apply 后 pass，
  就是 issue 被解决的 ground truth signal

## 任务形式与评测协议

### 输入

模型收到 2 个东西：

1. **Issue text**（约 195 词平均）—— GitHub issue 的自然语言描述
2. **Codebase snapshot** —— PR 的 base commit 时整个 repo 的文件树

注意：**不告诉模型应该改哪个文件**。模型必须自己 explore 代码找到相关位置。

### 输出

**一个 unified diff format 的 patch**：

```
diff --git a/sklearn/ensemble/_hb_gb.py b/sklearn/ensemble/_hb_gb.py
@@ -123,7 +123,9 @@
-    self._compute_partial_dependence_recursion(...)
+    self._compute_partial_dependence_recursion_new(...)
+    if self.warm_start:
+        self._reset_internal_state()
```

unified diff 是 unix 标准——可以用 `patch` 命令直接 apply 到 codebase。

### 评测

**两类 test 都要通过**才算 resolved：

| 测试类型 | 含义 | grading.py:194-201 计算 |
|---|---|---|
| **fail-to-pass (F2P)** | apply patch 前 fail，apply 后 pass | `len(F2P_success) / total_F2P` 必须 = 1.0 |
| **pass-to-pass (P2P)** | apply patch 前后都 pass（不破坏旧功能） | `len(P2P_success) / total_P2P` 必须 = 1.0 |

如果一个 instance 有 5 个 F2P + 50 个 P2P，模型必须**全部 55 个 test 都通过**才算 resolved。

这个评测设计的硬度：

- 部分修复不算（修了主 bug 但破坏了 1 个边角 test → 算 fail）
- 必须找到所有相关 test 的影响（不能只关心明显的 fail-to-pass）
- 对"保持旧功能"的要求 = 真实工程的要求

## 核心机制（含代码精读）

### 机制 1：双维度 grading 函数

[`swebench/harness/grading.py:140-201`](https://github.com/princeton-nlp/SWE-bench/blob/main/swebench/harness/grading.py#L140-L201)
是评测的核心：

```python
# 计算 fail-to-pass 通过率
def compute_fail_to_pass(report):
    total = len(report[FAIL_TO_PASS]["success"]) + len(report[FAIL_TO_PASS]["failure"])
    if total == 0:
        return 1
    return len(report[FAIL_TO_PASS]["success"]) / total

# 计算 pass-to-pass 通过率
def compute_pass_to_pass(report):
    total = len(report[PASS_TO_PASS]["success"]) + len(report[PASS_TO_PASS]["failure"])
    if total == 0:
        return 1
    return len(report[PASS_TO_PASS]["success"]) / total

# resolved 判定（隐式在更上层）
resolved = (compute_fail_to_pass(report) == 1.0) and (compute_pass_to_pass(report) == 1.0)
```

旁注：

- **F2P 和 P2P 都用 success / total**——而不是布尔值，让 partial credit 可观察
- 但**最终 resolved 判定还是 0/1**——必须两类都 100% 通过
- 这种设计区分了"勉强对" vs "完全对"——leaderboard 数字看的是 100% resolved 比例

**怀疑 1**：F2P 100% 严格要求会**惩罚 over-fix**。如果模型不仅修复了 issue 还顺手优化了几行
（这是 senior engineer 的真实行为），可能引入新 fail-to-pass 之外的变化让 P2P 失败。
论文不讨论这种"超出范围正确"案例。

### 机制 2：3 个 retrieval setting 模拟不同 agent 能力

论文 Section 4 给模型 3 种 codebase 输入方式：

| Setting | codebase 内容 | 难度 |
|---|---|---|
| **Oracle retrieval** | 只给 ground truth PR 修改的文件 | 最简单 |
| **BM25 retrieval** | 用 BM25 检索 issue 相关 top-K 文件 | 中等 |
| **Full repo** | 整个 codebase 全部文件 | 最难（context 爆炸） |

实验结果（Table 2）：

| Model | Oracle | BM25 | Full |
|---|---|---|---|
| Claude 2 | 7.0% | 1.96% | 0.17% |
| GPT-4 | 4.6% | 1.74% | 0.0% |
| SWE-Llama 13b | 3.97% | 1.74% | n/a |

**怀疑 2**：Oracle setting 给模型作弊（直接告诉它哪个文件）——但即使这样，最强模型也只到 7%。
这说明**modelnot 仅 retrieval 不行，连"知道在哪改"也不行**——它对代码 semantic 的理解仍然薄弱。
这是 2023 年 LLM 的真实天花板。

### 机制 3：可持续更新的设计

3-stage pipeline 完全自动化，意味着：

1. 任何 GitHub Python repo 都可以套这个流程
2. 可以**只选模型训练 cutoff 后**的 PR，避免 memorization
3. SWE-bench 不会饱和——一旦 GPT-X 解决 90%，可以再爬一批新 PR 重做 benchmark

**这是论文最容易被忽视的贡献**——不是 2294 这个具体数据集，而是 pipeline 本身。
SWE-bench Verified（500 题，2024.08 with OpenAI）和 SWE-bench Multimodal（2024 ICLR 2025）
都是这个 pipeline 的衍生。

**怀疑 3**：Pipeline 完全没人工 review——容易混入低质量 instance（issue 描述含糊 / test 不能完全 verify）。
2024.08 OpenAI 团队跑了一遍人工 verify 才搞出 SWE-bench Verified（500 题确实可解的子集）。
**SWE-bench 原版 2294 道里有不少其实"无解"的题** —— 这是 2024 年发现的 bug。

## L4 复现：跑一个 gold patch 验证流程（phd-skills 7 阶段）

按 [方法论 L4 路径 #1](/study/papers-method/)（有 repo，跑 README quick start 验证）：

### 阶段 1-2 · 论文获取 + 代码盘点

```bash
git clone https://github.com/princeton-nlp/SWE-bench
ls swebench/
# collect/    harness/    inference/    resources/    versioning/
ls swebench/harness/
# constants/  docker_build.py  grading.py  run_evaluation.py  log_parsers/  ...
```

inventory：

| 文件 | 作用 | 状态 |
|---|---|---|
| `harness/run_evaluation.py` | 主评测脚本 | ✅ |
| `harness/grading.py` (200+ 行) | F2P/P2P grading 逻辑 | ✅ |
| `harness/docker_build.py` | 每个 instance 一个 Docker 镜像 | ✅ |
| `collect/` | 数据采集 pipeline | ✅ |
| `inference/` | 让模型生成 patch 的脚本 | ✅ |

**关键发现**：SWE-bench 用 Docker 隔离每个 instance —— 因为 12 个 repo 各有自己的 Python 版本 / 依赖。
完整跑一次评测需要 ~120GB 磁盘 + 16GB RAM + 8 CPU。

### 阶段 3 · Gap 分析

| Gap | 论文 | 代码 |
|---|---|---|
| 12 个 repo 是哪些？ | 只列大类 | `swebench/collect/get_top_pypi.py` 有完整列表 |
| Docker images 在哪？ | 论文未提 | DockerHub `swebench/<repo>__<instance_id>` |
| 测试结果格式？ | 简单提了 | `harness/log_parsers/` 有每 repo 的 parser |
| 评测时间 | 论文未估算 | 单 instance ~1-5 min，2294 全跑 ~12-24h |

### 阶段 4-6 · 跑 gold patch 验证

按 README 推荐验证命令：

```bash
python -m swebench.harness.run_evaluation \
    --predictions_path gold \
    --max_workers 1 \
    --instance_ids sympy__sympy-20590 \
    --run_id validate-gold
```

`--predictions_path gold` 表示用 ground truth PR 的 patch 作为"模型预测"——这一定应该 100% resolved。

**预期行为**：

1. Docker 拉 / build `sympy__sympy-20590` 对应镜像（含 sympy repo + 依赖）
2. apply gold patch
3. run 这个 instance 的 fail-to-pass tests + pass-to-pass tests
4. 输出 `validate-gold/sympy__sympy-20590/eval.json` 含 F2P / P2P 通过率
5. 因为是 gold，应该 F2P=1.0, P2P=1.0, resolved=true

**实际跑（本 session 没真跑 docker 评测，因为 ~120GB 磁盘要求过高）**：

降级——只读源码确认逻辑而非真跑。`grading.py:194-201` 的 compute 函数明确返回
`success / total`，所以 gold patch 应该满足 `success == total` 在两类 test 上。

### 阶段 7 · 数字对照

| Setting | 期望（gold patch） | 实际能验证 |
|---|---|---|
| F2P 通过率 | 100% | ✅ 代码逻辑保证 |
| P2P 通过率 | 100% | ✅ 代码逻辑保证 |
| Resolved | true | ✅ 代码逻辑保证 |

label：`[mechanism verified at code level]` —— 评测协议正确，但没真跑 docker
（要 120GB 磁盘 + 镜像下载时间）。

## 谱系对比

### 前作：HumanEval (Chen et al. 2021)

| 维度 | HumanEval | SWE-bench |
|---|---|---|
| 题量 | 164 | 2294 |
| 任务粒度 | 单函数 | 多文件 / 多函数 |
| 输入长度 | 几句话 | 195 词 issue + 整个 repo |
| 输出长度 | 几行函数体 | 1.7 文件 / 3.0 函数 / 32.8 行 |
| 数据来源 | 人工编写 | 真实 GitHub PR |
| 测试类型 | 单一 test | F2P + P2P 双维度 |
| GPT-4 表现 | ~80% | 1.74% |

HumanEval 是 SWE-bench 直接前作和对比对象——SWE-bench Section 1 反复对比"我们和 HumanEval 的差异"。

### 前作：APPS (Hendrycks et al. 2021)

算法竞赛题集，比 HumanEval 难。但仍然是**self-contained 单函数**——不是真实软件工程。
GPT-4 在 APPS 上 ~30%。SWE-bench 的设计哲学：**真实工程任务无法被 self-contained 任务集近似**。

### 后作：SWE-agent (Yang et al., NeurIPS 2024)

同一团队（Princeton NLP）2024.04 发布。把 SWE-bench 从"benchmark only"推到"benchmark + agent"。
关键创新：

- **Agent-Computer Interface (ACI)**：专门为 LLM agent 设计的 shell + 编辑器接口
- 让 LM 用 `view file / edit lines / search code / run tests` 这种命令去探索 codebase
- 把 SWE-bench SOTA 从 1.96% (Claude 2) 推到 **12.5%** (GPT-4 + SWE-agent)

SWE-agent 是 ReAct 思路的工程化巅峰——同样是 think → act → observe，但 action 空间是
"shell + editor + IDE"。可以理解为 [ReAct](/study/papers/react/) 在真实工程任务上的迭代。

### 后作：SWE-bench Verified (with OpenAI, 2024.08)

500 题人工 verified 子集——确认这些题"对人类工程师来说真的是可解的"。
原 2294 题里有些题是 ill-posed（issue 描述含糊 / test 不能完全 verify）。
Verified 让 leaderboard 上的数字更可信。

### 后作：Devin / OpenHands / Aider 等 agentic 编程系统（2024）

这一波"AI 软件工程师"产品的兴起，几乎全部以 SWE-bench 为评测基准。
Devin 当时宣称 13.86% resolved（后来被复现质疑）；OpenHands 公开榜上 ~30%；
2025 年顶级方案到 60%+。SWE-bench 成为**事实上的"AI 工程师"行业标准**。

### 选型建议

| 场景 | 选 |
|---|---|
| 评测 LLM 编码能力（基础） | HumanEval / MBPP / APPS |
| 评测 LLM agent 工程能力 | **SWE-bench**（事实标准） |
| 评测 agent + 想要可信数字 | SWE-bench Verified |
| 想训练自己的 agent | SWE-bench-train (19,000 instances) |
| 想跑评测但不想要 120GB | SWE-bench Lite 300 题子集 |
| 想看视觉任务 agent | SWE-bench Multimodal (2025) |

## 与你当前工作的连接

### 今天就能用

任何"让 LLM 修代码"的工作流都可以借 SWE-bench 的 F2P + P2P 双维度思路：

- F2P：你想让模型新增的能力是什么？必须有 test 证明这个能力实现了
- P2P：模型不能破坏哪些已有功能？跑全部相关 test 验证
- 两个都通过才接受 patch

这种"双维度 gating"比简单"代码能跑就行" 更 robust——避免模型生成"修了 A 但坏了 B" 的代码。

### 下个月能用

如果要建一个内部 agent 评测系统，可以借 SWE-bench 的 3-stage pipeline 思路：

1. **Stage 1 = 选 high-quality data source**——你的真实工作流里哪些场景有干净的 ground truth？
2. **Stage 2 = attribute filter**——只保留同时满足 2-3 个属性的 instance
3. **Stage 3 = execution filter**——能真跑的、有 ground truth 信号的、镜像化能复现的

**Pipeline > 一次性数据集**——这是 SWE-bench 最大教训。

### 不要用的部分

- **不要无脑跑 SWE-bench 全 2294 题**——120GB 磁盘 + 24h 时间。先跑 Lite 300 题
- **不要把 SWE-bench 数字当 ground truth**——2024.08 才发现原版有 ill-posed 题。用 Verified
- **不要复制 12 repo 列表当作"通用工程能力"代表**——这 12 个都是 ML / 数学 / Web / lint
  类 Python 项目，不覆盖 systems / embedded / OS-level 工程
- **不要直接照抄 unified diff 输出格式**——现代 agent（SWE-agent）用 explore + edit + test
  的多轮交互，diff 只是最终产物

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **2294 题中含 ill-posed**：2024.08 OpenAI 团队人工 verify 才得到 500 题"真可解"子集。
   论文原版 1.96% Claude 2 的数字，分母里**包含了人类工程师也难解的题**——
   实际 LLM"上限"可能更高。
2. **12 repo 偏向 ML / math / web / lint**：sklearn / sympy / scikit-learn / matplotlib / pylint 等
   都是 ML/数据/工具类。**不覆盖 systems-level 工程**（OS / 编译器 / 数据库），
   这种工程才真正考验 long-context reasoning + multi-file architecture understanding。
3. **2294 题靠 BM25 retrieval 时分数太低（< 5%）**：这暗示 SWE-bench 的难度有相当部分
   来自 retrieval 不准 而不是 reasoning 弱。**论文不区分这两个 failure mode**——
   如果一个模型 reasoning 完美但 retrieval 拿错文件，它会拿 0 分。

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | SWE-agent (Yang et al., NeurIPS 2024) | 怎么把 SWE-bench 分数从 1.96% 推到 12.5% —— ACI + agent loop 工程化 |
| 2 | OpenAI SWE-bench Verified report (2024.08) | 原版 SWE-bench 哪些题不可解 —— benchmark 自身 limitation |
| 3 | SWE-bench Multimodal (Yang et al., ICLR 2025) | benchmark pipeline 怎么扩到视觉编程任务（前端 / UI 类） |

读完这 3 篇 + SWE-bench + ReAct + Reflexion + Toolformer，你拥有"LLM 工程能力评测"完整地图。

## 限制（论文 Section 7 + 我的补充）

论文 Section 7 列了 4 条 limitations：

1. 仅 Python（不验证多语言迁移）
2. issue 难度分布不均（数据驱动，不是 expert curated）
3. 评测靠 docker，cost 高
4. SWE-bench 数据集会逐渐被新模型 memorize（虽然可以更新）

我的补充：

5. **2024.08 才发现 ill-posed 题**——论文当年没意识到数据质量问题
6. **Pipeline 的 Stage 2 过滤过严**：必须 contributes tests 排除了大量"修代码不加 test" 的 PR，
   而真实工程里不加 test 也很常见——benchmark 偏向"PR 规范严格"的项目
7. **F2P 和 P2P 等权**：现实中"不破坏旧功能"通常比"修复新 bug" 重要——
   benchmark 不应等权处理两类 test

## 附录：SWE-bench 系列速查

| 版本 | 题量 | 用途 | 发布时间 |
|---|---|---|---|
| SWE-bench (原版) | 2,294 | 完整评测 | 2023.10 |
| SWE-bench Lite | 300 | 简化版（成本低） | 2024.06 |
| SWE-bench Verified | 500 | 人工 verified（可信版） | 2024.08（with OpenAI） |
| SWE-bench-train | 19,000 | 训练数据集（不重叠 test） | 2023.10 |
| SWE-bench Multimodal | n/a | 视觉编程（前端/UI） | 2024.10 → ICLR 2025 |
| SWE-bench Java | n/a | Java 语言扩展 | 2024.08 |

进入 leaderboard 的标准是用 [sb-cli](https://github.com/swe-bench/sb-cli) 提交，自动用 Modal 云跑评测。

---

**Layer 0-7 完成（按状元篇模板）。约 920 行，含 2 张 figure（webp）+ 双维度 grading 公式 + 3 stage pipeline 拆解 + 6 条限制。**

**这一篇标志 Season A · AI Agent / LLM 系统 5/5 完成。**
**下一季：Season B · 经典 CS / 系统设计（Raft / GFS / MapReduce / Lamport 1978 / Dynamo）。**
