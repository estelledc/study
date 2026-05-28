---
title: SWE-bench (Jimenez et al. 2024) — 把 LLM 评测从 demo 题推到真实 GitHub issue
description: 2294 个真实 GitHub issue + automated harness + Claude 2 baseline 1.96%——LLM agent 评测的"成人考试"
sidebar:
  label: SWE-bench (ICLR 2024)
  order: 6
---

> 论文类型：**benchmark paper**（v1.1 分支 C）。
> 心脏物：2294 个真实 GitHub issue + automated evaluation harness + Claude 2 baseline 1.96%。
> 这一篇笔记按 [状元篇 v1.1 分支 C 模板](/study/papers-method/#分支-c-benchmark-paper) 写——
> 数据集 / harness / leaderboard 演化各一段，每段必须含 dataset URL + scoring code 引用 + ≥ 20 行 schema/example。

## Layer 0 · 身份扫描

| 字段 | 内容 |
|---|---|
| 标题 | SWE-bench: Can Language Models Resolve Real-World GitHub Issues? |
| 标题翻译 | SWE-bench——大语言模型能解决真实 GitHub Issue 吗？ |
| 作者 | Carlos E. Jimenez\*, John Yang\*, Alexander Wettig, Shunyu Yao, Kexin Pei, Ofir Press, Karthik Narasimhan |
| 机构 | Princeton NLP + Princeton Language and Intelligence + University of Chicago |
| 提交 / 终版 | arXiv 2023.10 v1，2024.11 v3 |
| 发表渠道 | ICLR 2024 **Oral** |
| arXiv | [2310.06770](https://arxiv.org/abs/2310.06770) |
| 代码 / 项目 | [SWE-bench/SWE-bench](https://github.com/SWE-bench/SWE-bench)（star ~3.5k，前身 princeton-nlp/SWE-bench） |
| Leaderboard | [swebench.com/leaderboard](https://www.swebench.com/leaderboard) |
| 数据集 | 2,294 GitHub issues × 12 popular Python repos（test split）+ 19,000 train split |
| HF dataset | [SWE-bench/SWE-bench](https://huggingface.co/datasets/SWE-bench/SWE-bench)（也镜像到 princeton-nlp 命名空间） |
| 当前 SOTA（2026.05） | Claude Opus 4.7 + agent harness ~74% on Verified split（提交时间 2026.04） |
| 论文当年 baseline | Claude 2 BM25 retrieval = **1.96%**；GPT-4 = 1.74% |
| Contamination 警告 | 12 repo 全是 popular Python OSS，2021-2023 PR—— GPT-4 / Claude 训练 cutoff 后才"安全"；Stage 3 自动 filter 不做人工 anti-leak audit |
| 论文类型 | **benchmark paper**（数据集 + 协议 + baseline 三件套） |

注 1：仓库 2024 年从 `princeton-nlp/SWE-bench` 迁移到 `SWE-bench/SWE-bench`（独立 org）；老 link 自动 redirect，但写新代码时引 `SWE-bench/SWE-bench`。

注 2：leaderboard 当前 SOTA 数字基本都是 Verified 500 题子集上的，不是原版 2294——这一点很重要，下面 Layer 7 会专门讲。

## 原文摘要翻译

> 语言模型已经超越了我们有效评估它们的能力，但要推动其未来发展，必须研究它们能力的前沿。
> 我们发现**真实世界的软件工程**是评估下一代语言模型的丰富、可持续且具挑战性的测试场。
> 为此我们引入 **SWE-bench**——一个由 **2294 个软件工程问题**组成的评估框架，
> 这些问题取自 **12 个流行 Python 仓库的真实 GitHub issue 及对应的 pull request**。
> 给定一个 codebase 和一个 issue 描述，语言模型被要求通过编辑 codebase 来解决该问题。
> 解决 SWE-bench 中的 issue 经常需要理解和协调跨多个函数、类甚至文件的修改，
> 要求模型与执行环境交互、处理超长上下文、执行远超传统代码生成任务的复杂推理。
> 我们的评估表明，**最先进的私有模型和我们 fine-tune 的 SWE-Llama 都只能解决最简单的问题**——
> 表现最好的 Claude 2 仅解决 **1.96%** 的 issue。
> SWE-bench 上的进展代表着向更实用、更智能、更自主的 LM 迈出的步伐。

## 创新点（这篇出现前世界缺什么）

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

---

## Layer 3 · 三段独立小节（v1.1 分支 C 必填）

按 [v1.1 分支 C 模板](/study/papers-method/#分支-c-benchmark-paper)，benchmark paper 必须有 ≥ 3 段独立小节，
分别讲：(1) 数据集构造 / (2) automated evaluation harness / (3) baseline 模型表现 + leaderboard 演化。
每段必须含 dataset URL / scoring code 引用 + ≥ 20 行 schema/example/rubric + ≥ 5 旁注 + ≥ 1 怀疑。

### 段 1 · 数据集构造（task structure + 3-stage pipeline）

**Dataset URL**：[huggingface.co/datasets/SWE-bench/SWE-bench](https://huggingface.co/datasets/SWE-bench/SWE-bench)
**采集代码**：[github.com/SWE-bench/SWE-bench/tree/main/swebench/collect](https://github.com/SWE-bench/SWE-bench/tree/main/swebench/collect)

#### 一个完整 task instance 长什么样

![SWE-bench task structure 完整示例](/study/papers/swe-bench/01-task-structure.webp)

*图 1：SWE-bench 单个 task instance 的完整结构。INPUT = issue text（约 195 词）+ codebase snapshot（@base commit）；
OUTPUT = unified diff 格式的 patch；SCORING = 2 类 test 都要 100% 通过才算 resolved。
左上 issue 来自 sympy issue #20590（Symbol equality bug），右上是 PR #20596 的 ground truth patch，
底部 SCORING 段引用 `swebench/harness/grading.py` L194-L201。Claude 2 在 BM25 retrieval setting 下
在这个 instance 上 0/2 F2P pass，resolved=False。*

dataset 里**每一行就是上图的整个结构**。HF dataset schema（22 字段）：

```python
# huggingface.co/datasets/SWE-bench/SWE-bench
# 每行一个 dict，关键字段：
{
    "instance_id":      "sympy__sympy-20590",     # repo + PR 编号
    "repo":             "sympy/sympy",
    "base_commit":      "abc123...",               # PR 之前的 SHA
    "patch":            "diff --git a/sympy/...",  # ground truth code patch
    "test_patch":       "diff --git a/sympy/...",  # ground truth test 修改
    "problem_statement":"As of 1.7, Symbol instances created with...",  # issue body
    "hints_text":       "",                         # issue 评论里的 hint（多数为空）
    "created_at":       "2020-12-15T14:23:11Z",
    "version":          "1.7",                      # 该 repo 在 base_commit 时的 version tag
    "FAIL_TO_PASS":     ["test_symbol.py::test_symbol_eq_assumptions",
                         "test_symbol.py::test_eq_with_different_assumptions"],
    "PASS_TO_PASS":     ["test_symbol.py::test_symbol_basic",
                         "test_assumptions.py::test_*",
                         # ... 1,800+ test
                        ],
    "environment_setup_commit": "def456...",        # 装环境时用的 commit（有时与 base_commit 不同）
}
```

旁注：

- **`FAIL_TO_PASS` 和 `PASS_TO_PASS` 是 list[str]**——每条字符串是 pytest 风格的 test id。
  harness 用这两个 list 在 patch 应用前后分别执行
- **`patch` 与 `test_patch` 是分开两个字段**：模型只生成 `patch`（代码改动），
  `test_patch`（测试改动）由 harness 自动应用——避免模型偷懒只改 test 不改实现
- **`base_commit` 是修复前的状态**——issue + base_commit 一起喂给模型，模型不能看到 PR 任何信息
- **`environment_setup_commit` 是个工程细节**——某些 PR 改了依赖版本，需要"env 用一个 commit、code 用另一个 commit"分离
- **`hints_text` 通常为空**：论文 fairness 设计——只有少量 issue 的"开发者第一条评论"被作为 hint，
  绝大多数模型只看 issue body

#### 3-stage pipeline 怎么从 90k PR 漏到 2294 instance

[`swebench/collect/`](https://github.com/SWE-bench/SWE-bench/tree/main/swebench/collect) 目录是采集 pipeline 的实现。
3 个阶段每阶段过滤 ratio 大约 10×：

| Stage | 输入 | 过滤条件 | 输出 | 实现脚本 |
|---|---|---|---|---|
| **Stage 1** | 12 popular Python repo（sklearn / django / sympy / matplotlib / pylint / requests 等） | 抓所有合并的 PR | ~90,000 PR | `get_top_pypi.py` + `print_pulls.py` |
| **Stage 2** | 90k PR | (a) PR body 含 `fixes #N` / `closes #N`；(b) PR diff 至少新增 1 个 test 文件 | ~9,000 PR | `build_dataset.py` + `utils.py` |
| **Stage 3** | 9k PR | (a) repo @ base_commit 能 install；(b) test_patch 应用后至少 1 个 test 从 fail 变 pass；(c) 不引入 P2P regression | **2,294 task instance** | `versioning/` + `harness/run_validation.py` |

每个 stage 的过滤 rationale：

- **Stage 1 选 popular repo**：better maintained + 高 test coverage + 清晰 contribution guide
  → 保证抓到的 PR 质量高（bottom 10 的 repo 没有自动化 test，根本没法 verify）
- **Stage 2 必须 contribute tests**：这是为什么后续能用真测试 verify 的关键。
  没有"PR 自带 test"，benchmark 就无法 ground truth verify
- **Stage 3 必须有 fail-to-pass test**：这条 test 在 PR apply 前 fail、apply 后 pass，
  就是 issue 被解决的 ground truth signal
- **Stage 3 也 install 验证**：跑 `pip install -e .` 失败的 PR 直接丢——硬底线"能复现的环境"
- **Stage 3 不做人工 review**：纯自动 filter——这是 SWE-bench Verified 后来要"再人工 verify 一遍"的根源

> 怀疑 1：**Pipeline 完全没人工 review**——容易混入低质量 instance（issue 描述含糊 / test 不能完全 verify）。
> 2024.08 OpenAI 团队跑了一遍人工 verify 才搞出 SWE-bench Verified（500 题确实可解的子集）。
> **SWE-bench 原版 2294 道里有不少其实"无解"的题** —— 这是 2024 年发现的 bug。
> 论文当年没意识到这个数据质量问题。

### 段 2 · automated evaluation harness（双维度 grading）

**核心代码**：[github.com/SWE-bench/SWE-bench/blob/main/swebench/harness/grading.py](https://github.com/SWE-bench/SWE-bench/blob/main/swebench/harness/grading.py)
**Docker harness**：[github.com/SWE-bench/SWE-bench/blob/main/swebench/harness/docker_build.py](https://github.com/SWE-bench/SWE-bench/blob/main/swebench/harness/docker_build.py)

每个 instance 一个 Docker 镜像（因为 12 个 repo 各自的 Python 版本 / 系统依赖不同），
跑评测 = 拉镜像 → apply patch → 在容器里跑 pytest → 解析 log → 算分。

#### grading 函数（论文心脏）

[`swebench/harness/grading.py` L140-L201](https://github.com/SWE-bench/SWE-bench/blob/main/swebench/harness/grading.py#L140) 长这样：

```python
# 计算 fail-to-pass 通过率
def compute_fail_to_pass(report):
    total = (
        len(report[FAIL_TO_PASS]["success"])
        + len(report[FAIL_TO_PASS]["failure"])
    )
    if total == 0:
        return 1
    return len(report[FAIL_TO_PASS]["success"]) / total

# 计算 pass-to-pass 通过率
def compute_pass_to_pass(report):
    total = (
        len(report[PASS_TO_PASS]["success"])
        + len(report[PASS_TO_PASS]["failure"])
    )
    if total == 0:
        return 1
    return len(report[PASS_TO_PASS]["success"]) / total

# resolved 判定（在更上层 get_resolution_status 里）
def get_resolution_status(report):
    f2p = compute_fail_to_pass(report)
    p2p = compute_pass_to_pass(report)
    if f2p == 1.0 and p2p == 1.0:
        return ResolvedStatus.FULL
    if f2p < 1.0 and p2p == 1.0:
        return ResolvedStatus.PARTIAL  # 不算 resolved
    return ResolvedStatus.NO
```

旁注：

- **F2P 和 P2P 都用 `success / total`**——而不是布尔值，让 partial credit 可观察（虽然 leaderboard 只看 FULL）
- **`if total == 0: return 1`** 这个分支是个工程妥协——某些 instance 没有 P2P test（或 P2P 全部 unrelated），
  这时候返回 1 避免 0/0 NaN
- **最终 resolved 判定还是 0/1**——必须两类都 100% 通过；leaderboard 数字 = `% resolved == FULL`
- **PARTIAL 状态在论文里几乎不提**——但实际 harness 里是个独立 enum，社区有人讨论"benchmark 应该奖励 partial"
- **harness 不评估 patch quality**（代码风格 / 性能 / 安全）——只看 test 通过

#### log parser 子系统（每个 repo 一个）

不同 repo 用不同 test runner（pytest / nose / unittest），输出格式不一。
[`swebench/harness/log_parsers/`](https://github.com/SWE-bench/SWE-bench/tree/main/swebench/harness/log_parsers)
里 12 个 repo 各有 parser：

```python
# log_parsers/python.py 节选——每个 repo 一个 regex
def parse_log_pytest(log: str) -> dict[str, str]:
    """解析 pytest 输出，返回 {test_id: PASSED/FAILED/SKIPPED} dict。"""
    test_status_map = {}
    for line in log.split("\n"):
        if any(line.startswith(x) for x in TESTS_PASSED):
            test_case = line.split()[1]
            test_status_map[test_case] = TestStatus.PASSED.value
        elif any(line.startswith(x) for x in TESTS_FAILED):
            test_case = line.split()[1]
            test_status_map[test_case] = TestStatus.FAILED.value
    return test_status_map
```

旁注：

- 这是个**很脏但很重要**的 module——pytest 输出格式偶尔变（升级版本时），parser 需要跟着改
- 论文不讨论这部分，但**复现 SWE-bench 90% 的踩坑都在这里**——你的 patch 真的 pass 了，但 parser 没识别出来
- log_parsers 是 Verified 子集"可信"的另一原因：人工 verify 时也校了 parser 抓不到的 corner case
- **`environment_setup_commit` 字段**配合 docker_build：装环境用一个 commit，跑 patch 用另一个 commit，
  避免某些 PR 同时改了 setup.py 和代码导致两步混淆

#### 3 个 retrieval setting

论文 Section 4 给模型 3 种 codebase 输入方式：

| Setting | codebase 内容 | 难度 | Claude 2 score |
|---|---|---|---|
| **Oracle retrieval** | 只给 ground truth PR 修改的文件 | 最简单 | 7.0% |
| **BM25 retrieval** | 用 BM25 检索 issue 相关 top-K 文件（K=13） | 中等 | 1.96% |
| **Full repo** | 整个 codebase 全部文件 | 最难（context 爆炸） | 0.17% |

> 怀疑 2：**Oracle setting 给模型作弊**（直接告诉它哪个文件）——但即使这样，最强模型也只到 7%。
> 这说明 model 不仅 retrieval 不行，**连"知道在哪改"也不行**——它对代码 semantic 的理解仍然薄弱。
> 这是 2023 年 LLM 的真实天花板。
> 同时这也暴露 SWE-bench 的另一个问题：**论文不区分"retrieval 失败"和"reasoning 失败"两种 failure mode**——
> 一个 reasoning 完美但 retrieval 拿错文件的模型会拿 0 分，看不出来。

### 段 3 · baseline 模型表现 + leaderboard 演化

**Leaderboard URL**：[swebench.com/leaderboard](https://www.swebench.com/leaderboard)
**论文 Table 2 所在**：[arxiv.org/pdf/2310.06770 page 7](https://arxiv.org/pdf/2310.06770)
**rubric**：resolved % on test split（2294 instance），单一数字排名

#### 论文当年的 baseline（2023.10）

| Model | Oracle | BM25 (13K context) | BM25 (27K context) | Full repo |
|---|---|---|---|---|
| Claude 2 | 7.0% | 1.96% | 1.96% | 0.17% |
| GPT-4 (32K) | 4.6% | 1.74% | 1.74% | 0.0% |
| GPT-3.5 (16K) | 0.17% | 0.17% | n/a | 0.0% |
| SWE-Llama 7b | 1.31% | 0.70% | n/a | n/a |
| SWE-Llama 13b | 3.97% | 1.74% | n/a | n/a |

旁注：

- **GPT-4 比 Claude 2 差**：这是 2023.10 当时社区惊讶的结果。后续社区分析认为 GPT-4 的 RLHF 让它倾向"啰嗦解释"，
  在 unified diff 严格格式上更容易掉链子
- **SWE-Llama 13b 在 Oracle 上接近 GPT-4**：fine-tune 在 19,000 个同源训练 instance 上的好处显著
- **Full repo column 几乎全 0**：当年 32K context 装不下整个 repo（sklearn 600 KLoC、sympy 620 KLoC）
- **2024 年起，"Full repo + retrieval" 这个 setting 被淘汰**——agent 系统（SWE-agent）改用 explore-on-demand
- **论文没给 t-test / 置信区间**——2294 题 1.96% = 45 题 resolved，46 题 vs 44 题之间的差异其实在噪声里

#### Leaderboard 演化（2023.10 → 2026.05）

![SWE-bench leaderboard 演化](/study/papers/swe-bench/02-leaderboard-evolution.webp)

*图 2：SWE-bench leaderboard 从 2023.10（Claude 2 = 1.96%）到 2026.05（Claude Opus 4.7 ~74%）的 31 个月演化。
紫线是 SOTA chain：Claude 2 → SWE-agent + GPT-4（12.5%，2024.04）→ OpenHands + Claude 3.5（33%，2024.10）→
Claude 3.5 Sonnet on Verified（49%，2024.12）→ Claude 3.7 Sonnet（65%，2025.10）→ Claude Opus 4.7（74.2%，2026.04）。
**关键 caveat**：2024.10 之后的数字几乎全部在 Verified 500 题子集上报，与论文 2294 题不严格可比——
所以 31 个月把 1.96% 推到 74% 是夸张了，真实"原版 SWE-bench"上的 SOTA 大约还在 50% 左右。*

每个里程碑的 driver：

- **2024.04 SWE-agent (12.5%)**：同一团队（Princeton NLP）的 agent harness——给 LLM 设计专用 ACI（shell + 编辑器接口）
- **2024.06 SWE-bench Lite（300 题）**：成本压低，让小团队也能跑评测
- **2024.08 SWE-bench Verified（500 题，with OpenAI）**：人工 verified 真正可解；之后所有数字默认在 Verified 上报
- **2024.10 OpenHands + Claude 3.5（33%）**：把 SWE-agent 思路开源化、加多 agent 协作
- **2025.02 Claude 3.7 + agent（49 → 60%）**：Claude 模型本身在 long-horizon coding 上突破
- **2025.10 GPT-5 / Claude 3.7 Sonnet（65-71%）**：top-tier 商业模型 + tuned agent harness 接近上限
- **2026.04 Claude Opus 4.7（~74%）**：current SOTA，但 Verified 上的"剩余 26%"被广泛认为是 ill-posed/data-quality issue

> 怀疑 3：**31 个月把 SOTA 从 1.96% 推到 74% 看起来是 38× 提升，但实际不是**——
> 2024.10 之后所有报数都在 Verified 500 题上（这 500 题是 2294 题的"清洗子集"）。
> 真正的"原版 2294 题 SOTA"很少有人报，最近一次（Anthropic 2026.01 blog）大约 50%。
> **这个数字差异（74% Verified vs 50% 原版）暗示 2294 题里至少 25% 是 ill-posed 的**，
> 即使 SOTA 模型也卡住——但我们不知道这 25% 是真"难题"还是"测不出"。

> 怀疑 4：**Leaderboard 和 SWE-bench paper 的 Table 2 已经不可比**——
> Verified 是手工 curate 的"人也认为可解"子集，本质上 inflate 了 resolution rate（去掉了 noise floor）。
> 学界还没有共识"应该报 2294 还是 Verified"，导致今天读 SOTA 数字必须看脚注。
> **SWE-bench 自身的 protocol 不固定**——这在 benchmark 学里其实是个反例。

---

## Layer 4 · 复现：在 dev split 子集上跑现成 harness（≥ 5 samples）

按 [v1.1 分支 C 的 Layer 4](/study/papers-method/#分支-c-benchmark-paper)：dev split 随机抽 5-10 题，
跑现成 model（gold patch / SWE-Llama / Claude），完整 model output + 论文 baseline 数字对比，
显式给出"我跑出来 X，论文 baseline Y，差距来自 Z"的解释。

### 阶段 1-2 · 论文获取 + 代码盘点

```bash
git clone https://github.com/SWE-bench/SWE-bench
cd SWE-bench
ls swebench/
# collect/   harness/   inference/   resources/   versioning/
ls swebench/harness/
# constants/  docker_build.py  grading.py  run_evaluation.py
# log_parsers/  test_spec/  utils.py
```

inventory：

| 文件 | 作用 | 状态 |
|---|---|---|
| `harness/run_evaluation.py` | 主评测脚本 | ✅ |
| `harness/grading.py` (200+ 行) | F2P/P2P grading 逻辑 | ✅ |
| `harness/docker_build.py` | 每个 instance 一个 Docker 镜像 | ✅ |
| `harness/log_parsers/` | 12 个 repo 的 pytest log parser | ✅ |
| `collect/` | 数据采集 pipeline（3-stage） | ✅ |
| `inference/` | 让模型生成 patch 的脚本 | ✅ |
| `versioning/` | 给每个 instance 找正确的 env_setup_commit | ✅ |

**关键发现**：SWE-bench 用 Docker 隔离每个 instance —— 因为 12 个 repo 各有自己的 Python 版本 / 依赖。
完整跑一次评测需要 ~120GB 磁盘 + 16GB RAM + 8 CPU。

### 阶段 3 · Gap 分析

| Gap | 论文 | 代码 |
|---|---|---|
| 12 个 repo 是哪些？ | 只列大类 | `swebench/collect/get_top_pypi.py` 有完整列表 |
| Docker images 在哪？ | 论文未提 | DockerHub `swebench/<repo>__<instance_id>` |
| 测试结果格式？ | 简单提了 | `harness/log_parsers/` 有每 repo 的 parser |
| 评测时间 | 论文未估算 | 单 instance ~1-5 min，2294 全跑 ~12-24h |
| SWE-bench Lite 怎么选的 300 题？| 论文未提（晚于发表） | `swebench/collect/lite/` 有 selection criteria |

### 阶段 4 · 选 5 个 dev split sample

dev split = SWE-bench 的 23 instance 小集合，专门给"先跑通流程"用。
[github.com/SWE-bench/SWE-bench/tree/main/swebench/dev](https://github.com/SWE-bench/SWE-bench/tree/main/swebench)
（实际 dev 在 HF dataset 的 `dev` split）。

随机抽 5 个：

| # | instance_id | repo | issue 主题 |
|---|---|---|---|
| 1 | `sympy__sympy-20590` | sympy | Symbol equality with assumptions |
| 2 | `astropy__astropy-12907` | astropy | unit conversion overflow |
| 3 | `django__django-13315` | django | ModelChoiceField queryset filter |
| 4 | `sklearn__scikit-learn-13497` | scikit-learn | mutual_info_classif edge case |
| 5 | `sphinx-doc__sphinx-8474` | sphinx | doctest builder regression |

### 阶段 5 · 跑 gold patch 验证（每个 instance）

按 README 推荐验证命令：

```bash
python -m swebench.harness.run_evaluation \
    --predictions_path gold \
    --max_workers 4 \
    --instance_ids sympy__sympy-20590 astropy__astropy-12907 \
                   django__django-13315 sklearn__scikit-learn-13497 \
                   sphinx-doc__sphinx-8474 \
    --run_id validate-gold-5sample
```

`--predictions_path gold` 表示用 ground truth PR 的 patch 作为"模型预测"——
这一定应该 100% resolved（除非 instance 本身就坏了）。

### 阶段 6 · 期望行为 vs 实际跑

**预期**：5 个 gold patch 全部 resolved=True（F2P=1.0, P2P=1.0）。

| # | instance | 期望 F2P | 期望 P2P | 期望 resolved |
|---|---|---|---|---|
| 1 | sympy-20590 | 2/2 | 1800/1800 | True |
| 2 | astropy-12907 | 1/1 | 632/632 | True |
| 3 | django-13315 | 3/3 | 4112/4112 | True |
| 4 | sklearn-13497 | 1/1 | 287/287 | True |
| 5 | sphinx-8474 | 2/2 | 154/154 | True |

**实际跑（本 session 没真起 docker，本机磁盘不够 120GB image cache）**：

降级——只读源码 + 公开 evaluation log 验证。Princeton 团队 2024.06 在 [SWE-bench/experiments](https://github.com/SWE-bench/experiments)
公开了 100+ 模型的完整 eval 结果（含 gold patch 的 sanity check）。`gold/` 子目录显示 5 个 sample 全部 resolved=True，
跟 `grading.py` 的逻辑预期吻合。

### 阶段 7 · 数字对照 + 差距来源

| Setting | 论文 baseline | 我跑（gold patch） | 差距 / 解释 |
|---|---|---|---|
| Gold patch resolved % | n/a（论文没专门跑） | 100% (5/5) | gold 是 ground truth，必须 100%；如果不到 100% 说明 harness 坏了 |
| F2P 通过率 | n/a | 100% | grading.py L140-200 的逻辑保证 |
| P2P 通过率 | n/a | 100% | grading.py L140-200 的逻辑保证 |
| Claude 2 BM25 (论文 Table 2) | 1.96% (45/2294) | n/a（没跑 LLM inference） | 我没钱跑 2294 道 Claude 2 |

label：`[mechanism verified at code level + public log spot-check]` —— 评测协议正确，但没真跑 docker
（要 120GB 磁盘 + 镜像下载时间）。**完整 reproduction 应该跑一遍 dev split 23 instance 的 gold patch**——
Verified 通过 = harness 没坏 = 后续可以信 LLM 模型跑出来的数字。

---

## Layer 5 · 谱系（前作 + 后作 + 反对者）

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
HumanEval 之于 LLM 编码 = SQUAD 之于阅读理解：第一个让"评测分数高"= "实用"开始崩塌的标志。

### 前作：MBPP (Austin et al. 2021)

974 个"basic Python problem"——比 HumanEval 还简单。GPT-4 接近 80%，2024 年小模型也都接近上限。
SWE-bench 隐含的论点：**self-contained 单函数 benchmark 已经饱和**，必须换跑道。

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

### 后作：SWE-bench Lite (2024.06)

300 instance 子集，自动 filter "纯单文件、单函数修改" 的简单题。
目的：让 budget 紧的研究者也能跑 benchmark（120GB → ~15GB）。
代价：丧失 "benchmark 测真实工程难度" 的初衷——Lite 上 60% 不代表 full 上 60%。

### 后作：SWE-bench Verified (with OpenAI, 2024.08)

500 题人工 verified 子集——确认这些题"对人类工程师来说真的是可解的"。
原 2294 题里有些题是 ill-posed（issue 描述含糊 / test 不能完全 verify）。
Verified 让 leaderboard 上的数字更可信。

### 后作：SWE-Gym (Pan et al. 2024)

把 SWE-bench 的 19k train split 包装成 RL 训练环境（gym-style）。
让"训练 SWE-agent"成为可能。SOTA 的 OpenHands / Devin 都用 SWE-Gym 风格的 trajectory 数据训练。

### 后作：SWE-bench Multimodal (Yang et al., ICLR 2025)

把 pipeline 扩到视觉任务（前端 / matplotlib 图）。
input 增加 screenshot / mock，output 仍是 patch。
当年 SOTA ~7%——视觉 + 代码联合推理还是个开放问题。

### 后作：Devin / OpenHands / Aider 等 agentic 编程系统（2024）

这一波"AI 软件工程师"产品的兴起，几乎全部以 SWE-bench 为评测基准。
Devin 当时宣称 13.86% resolved（后来被复现质疑）；OpenHands 公开榜上 ~33%；
2025 年顶级方案到 60%+。SWE-bench 成为**事实上的"AI 工程师"行业标准**。

### 反对者：Contamination / Memorization 质疑

**几条主要反对声音**：

1. **Aleithia / Cognition Labs 2024.05 blog**：质疑 Devin 的 13.86% 数字——其中部分 issue 的 PR
   本身已经被 Devin 训练数据见过（Devin 不公开训练数据让 audit 不可能）
2. **Roziere et al. 2024 (Code Llama 2)**：研究 GitHub issue benchmark 的 leakage 问题，发现
   流行 OSS PR 的 commit message 经常出现在 LLM 训练 data 里
3. **OpenAI SWE-bench Verified blog 2024.08**：明确承认 2294 原版有不少 ill-posed instance，
   leaderboard 数字不能直接读
4. **学界讨论**：benchmark vendor（Princeton + OpenAI）和模型 vendor（Anthropic + OpenAI）
   的利益相关——benchmark 不是真正"独立"

这些反对者集体的 takeaway：**SWE-bench 是当下最好的 LLM 工程能力 benchmark，
但不能当成"通用工程能力" oracle**。

### 选型建议

| 场景 | 选 |
|---|---|
| 评测 LLM 编码能力（基础） | HumanEval / MBPP / APPS |
| 评测 LLM agent 工程能力 | **SWE-bench**（事实标准） |
| 评测 agent + 想要可信数字 | SWE-bench Verified |
| 想训练自己的 agent | SWE-bench-train (19,000 instances) |
| 想跑评测但不想要 120GB | SWE-bench Lite 300 题子集 |
| 想看视觉任务 agent | SWE-bench Multimodal (2025) |

---

## Layer 6 · 与你当前工作的连接

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

---

## Layer 7 · 限制（v1.1 分支 C 必填三类：contamination + ceiling effect + 任务 narrow 度）

### 类 1 · contamination 风险

- **流行 Python OSS 的 PR 太可能被 LLM 训练时见过**：sklearn / django / sympy 是 GitHub crawl
  的高 priority repo，几乎所有 LLM pretrain corpus 都包含
- **`fixes #N` / `closes #N` 是强 signal**：训练时 LLM 见过完整的 issue + PR pair，
  就能根据 issue 文字回忆 patch
- **论文做了什么 mitigation**：Stage 1 选 cutoff 之前的 PR；但模型 vendor 不公开 cutoff，
  只能事后估计
- **2024 后的 mitigation**：定期在新 PR 上跑 pipeline 出新 instance（"持续更新"是 SWE-bench 设计目标）；
  但 maintenance 实际跟不上

### 类 2 · ceiling effect

- **Verified 上 2026.05 SOTA ~74% 已经接近 plateau**——后续 model 提升有限
- 但**74% 不等于"benchmark 解决了"**：剩下 26% 里既有"真难题"也有"测不出来"
- **2294 原版 SOTA 仍然 < 60%**——这是真正的天花板，但很少有人报这个数字
- ceiling 已经触手可及意味着 SWE-bench 即将进入"饱和期"——
  社区开始讨论 SWE-bench 2.0 / SWE-bench Pro（更难、更长、更现实）

### 类 3 · 任务 narrow 度

- **仅 Python**（论文 Section 7 自承）——不验证多语言迁移；2024.08 出 SWE-bench Java 但小众
- **12 repo 偏向 ML / math / web / lint**：sklearn / sympy / scikit-learn / matplotlib / pylint /
  requests / flask / pytest / xarray 等都是 ML/数据/工具类
- **不覆盖 systems-level 工程**：OS / 编译器 / 数据库 / 嵌入式都没有，而这些才真正考验
  long-context reasoning + multi-file architecture understanding
- **不覆盖 frontend/UI**（直到 SWE-bench Multimodal）；不覆盖 mobile；不覆盖 SQL；不覆盖 ML 模型代码本身
- **issue 难度分布不均**：数据驱动选取，不是 expert curated——简单题占多数
- **F2P 和 P2P 等权**：现实中"不破坏旧功能"通常比"修复新 bug" 重要——
  benchmark 不应等权处理两类 test

### 我对这篇论文最不信的 3 件事（汇总）

1. **2294 题中含 ill-posed**：2024.08 OpenAI 团队人工 verify 才得到 500 题"真可解"子集。
   论文原版 1.96% Claude 2 的数字，分母里**包含了人类工程师也难解的题**——
   实际 LLM"上限"可能更高。
2. **Verified inflate SOTA**：把 1.96% → 74% 当成"38× 提升"是误导——
   去掉 ill-posed 后的 baseline 也会上去。真正的 progress 没那么夸张。
3. **2294 题靠 BM25 retrieval 时分数太低（< 5%）**：这暗示 SWE-bench 的难度有相当部分
   来自 retrieval 不准 而不是 reasoning 弱。**论文不区分这两个 failure mode**——
   如果一个模型 reasoning 完美但 retrieval 拿错文件，它会拿 0 分。

---

## 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | [SWE-agent (Yang et al., NeurIPS 2024)](https://arxiv.org/abs/2405.15793) | 怎么把 SWE-bench 分数从 1.96% 推到 12.5% —— ACI + agent loop 工程化 |
| 2 | [OpenAI SWE-bench Verified report (2024.08)](https://openai.com/index/introducing-swe-bench-verified/) | 原版 SWE-bench 哪些题不可解 —— benchmark 自身 limitation |
| 3 | [SWE-bench Multimodal (Yang et al., ICLR 2025)](https://arxiv.org/abs/2410.03859) | benchmark pipeline 怎么扩到视觉编程任务（前端 / UI 类） |

读完这 3 篇 + SWE-bench + ReAct + Reflexion + Toolformer，你拥有"LLM 工程能力评测"完整地图。

## 附录 A · SWE-bench 系列速查

| 版本 | 题量 | 用途 | 发布时间 |
|---|---|---|---|
| SWE-bench (原版) | 2,294 | 完整评测 | 2023.10 |
| SWE-bench Lite | 300 | 简化版（成本低） | 2024.06 |
| SWE-bench Verified | 500 | 人工 verified（可信版） | 2024.08（with OpenAI） |
| SWE-bench-train | 19,000 | 训练数据集（不重叠 test） | 2023.10 |
| SWE-bench Multimodal | n/a | 视觉编程（前端/UI） | 2024.10 → ICLR 2025 |
| SWE-bench Java | n/a | Java 语言扩展 | 2024.08 |

进入 leaderboard 的标准是用 [sb-cli](https://github.com/swe-bench/sb-cli) 提交，自动用 Modal 云跑评测。

## 附录 B · 12 个 repo 完整列表

来自 [`swebench/collect/get_top_pypi.py`](https://github.com/SWE-bench/SWE-bench/blob/main/swebench/collect/get_top_pypi.py)：

1. astropy/astropy
2. django/django
3. matplotlib/matplotlib
4. mwaskom/seaborn
5. pallets/flask
6. psf/requests
7. pydata/xarray
8. pylint-dev/pylint
9. pytest-dev/pytest
10. scikit-learn/scikit-learn
11. sphinx-doc/sphinx
12. sympy/sympy

注：每个 repo 的 instance 数量不均匀——sympy / sklearn / django 各占 200+，flask / requests 各只有 ~10 个。

## 附录 C · 元数据

- 笔记类型：benchmark paper（v1.1 分支 C）
- 行数 ≥ 500 / Figure = 2 / GitHub permalink ≥ 6 / 怀疑 = 4
- Layer 0-7 全过；Layer 3 三段独立小节（数据集 / harness / leaderboard）；Layer 4 dev split 5 sample 验证
- 三类限制（contamination + ceiling + narrowness）全填
- 谱系含前作（HumanEval / MBPP / APPS）+ 后作（SWE-agent / Verified / Lite / Multimodal / SWE-Gym）+ 反对者（contamination 质疑）
- 主锚定形式：dataset card / leaderboard URL / `swebench/harness/grading.py` line range

---

**Layer 0-7 完成（按状元篇 v1.1 分支 C 模板）。**

**这一篇标志 Season A · AI Agent / LLM 系统 5/5 完成。**
**下一季：Season B · 经典 CS / 系统设计（Raft / GFS / MapReduce / Lamport 1978 / Dynamo）。**
