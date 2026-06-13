---
title: Spec-Agent — 用 Agent + 分离逻辑 + Fuzz 自动写 C++ 合约
来源: 'Tarun Suresh, David Korczynski, Julien Vanegue, "Agentic Separation Logic Specification Synthesis", arXiv:2605.27531, Bloomberg, 2026'
日期: 2026-06-13
子分类: 形式化验证
分类: 形式化方法
provenance: pipeline-v3
---

## 是什么

**Spec-Agent** 是一套面向大规模 C++ 代码库的 **agentic 规格合成系统**：给定函数实现、注释和现有单元测试，自动推断 `{pre} f {post}` 形式的 **代码合约（code contract）**，并用 fuzz 反复打脸、修正 LLM 猜错的候选。

日常类比：你雇了一个**会写说明书的外包**，但他第一次写的东西经常漏条件。于是你：

1. 先看他改的是**纯逻辑**、**带循环的集合性质**，还是**动堆内存**——决定说明书该用哪种「方言」写；
2. 把项目里已有的单元测试**改造成压力测试**，用海量随机输入去挑刺；
3. 一旦发现「某输入下说明书说错了」，把反例喂回去让他改，直到 fuzz 再也找不到漏洞，或达到重试上限。

论文把这套流程叫做 **Agentic Separation Logic Specification Synthesis**。关键创新不是「再用 LLM 写注释」，而是把 **分离逻辑（Separation Logic）** 当作合约语言，并把 **libFuzzer 模糊测试**  repurposed 成 **规格验证的伪 oracle**——在 C++ 缺乏成熟全程序验证器的现实下，用运行时断言 + 覆盖率驱动 fuzz 筛掉错误合约。

## 为什么重要

LLM 写代码很快，但** correctness 没有保证**。代码合约（前置/后置条件）是连接「实现」与「验证、迁移、安全分析」的桥梁。不理解 Spec-Agent，下面几件事很难讲清楚：

- 为什么「让 Claude 读函数写 contract」在百万行 BDE / BlazingMQ 上**又贵又偏简单逻辑**——baseline 大量停在命题逻辑，分离逻辑与一阶量词很少；
- 为什么 **分离逻辑** 对系统软件不是锦上添花——`swap(int *x, int *y)` 必须写出 `x` 与 `y` **指向不同单元**，否则自交换语义未定义；
- 为什么 fuzz  traditionally 找 bug，这里却能 **证伪错误规格**——违反合约的输入 = 反例，进入 CEGIS 式 refinement loop；
- 为什么论文在 BDE 上达到 **~86% 函数合成有效合约**、BMQ ~78%，且 Spec-Agent + 开源模型在 token 成本上约为 Claude Code Opus 4.6 的 **1/10**，同时 FOL / Prop SL / FOSL 合约数量明显多于 baseline。

## 核心概念

### 1. 规格合成（Specification Synthesis）

与 **程序验证** 对偶：验证给定 `{P} c {Q}` 是否成立；合成则是给定 `c`，求合适的 `P`、`Q`。目标是 **最弱前置条件**（调用者最少要满足什么）和 **最强后置条件**（执行后能断言什么）。Spec-Agent 用 LLM 生成候选，用 fuzz 过滤，用 counterexample 引导下一轮。

### 2. 四层规格语言「梯子」

Spec-Agent 不是一上来就写最复杂的逻辑，而是按函数特征选 **目标语言 L**：

| 层级 | 名称 | 能表达什么 | 典型触发条件 |
|------|------|------------|--------------|
| Prop | 命题逻辑 | `∧ ∨ ¬ ⇒`、分支用析取蕴含编码 | 无循环、无堆 |
| FOL | 一阶逻辑 | `∀ ∃`  over 容器元素 | 有循环 / 归纳变量 |
| Prop SL | 命题分离逻辑 | `x ↦ v`、分离合取 `*` | 动态内存 / 堆访问（heap tracing） |
| FOSL | 一阶分离逻辑 | 量词 + 堆形状 | 既遍历容器又动堆 |

四层形成 **偏序格**：Prop ⊑ FOL，Prop ⊑ Prop SL，二者都 ⊑ FOSL。接受候选时要求：fuzz 通过 **且** 候选表达力 `ℓ(cand)` 至少达到目标 L（不能太「贫」——例如堆函数却缺 `↦`）。

### 3. 分离逻辑回顾（与 [[reynolds-separation-logic]] 衔接）

- **`x ↦ n`**：地址 `x` 处存值 `n`，且该原子描述其堆 footprint；
- **`p * q`**：`p` 与 `q` 占用的堆区域 **不相交**；
- 经典例子：`swap` 的前置 `x ↦ v₁ * y ↦ v₂`，后置 `x ↦ v₂ * y ↦ v₁`——隐含 `x ≠ y` 的分离性。

Infer 等工具用 separation logic 做 **组合式** 堆推理；Spec-Agent 则反向：**从代码合成** 这类断言，而不是从断言证代码。

### 4. Spec-Agent 流水线（六步）

```text
Code Mining → Fuzz Harness Gen → Language Selection
     → LLM Spec Generation → Fuzz Testing → Refinement (loop)
```

- **Code Mining**：Tree-sitter 抽静态特征（循环、分支）；跑现有单测 + **heap tracing** 判断是否触堆；
- **Fuzz Harness**：把单测里硬编码输入 **提升** 为 libFuzzer 可控参数，保留 fixture/setup；
- **Generation**：prompt 含语法、该层逻辑的手写范例（最多 10 个），**不用**单测内容（避免泄漏测试 oracle）；
- **Fuzz Testing**：把候选合约 **编译成 C++ 运行时断言**，在 fuzz 下检查；分离算子在 **观测到的堆状态** 上解释；
- **Refinement**：反例 + 结构诊断（表达力不足）反馈给 LLM，直到接受或预算耗尽。

### 5. Fuzz 作为伪 Oracle 的边界

能 **拒绝** 错误规格（有 counterexample），不能 **证明** 规格完全正确（那需要 Frama-C 级证明器，C++ 全程序验证仍极贵）。专家人工抽检 + fuzz 零 false positive（论文声称在评测设置下）是实用折中。

## 实践案例

### 案例 1：指针交换 — Prop SL 合约

论文 Figure 2 左侧经典例子。C++ 实现：

```cpp
void swap(int *x, int *y) {
    int z = *x;
    *x = *y;
    *y = z;
}
```

Spec-Agent 在检测到堆读写后，目标语言为 **Prop SL**，期望合成类似：

```text
pre:  x ↦ v₁ * y ↦ v₂
post: x ↦ v₂ * y ↦ v₁
```

读法：调用前两块 **分离** 的内存分别持有 `v₁`、`v₂`；返回后值互换。若缺少 `*`（写成普通合取），就无法排除 `x == y` 的未定义行为——这就是为什么要上 separation logic，而不是纯命题逻辑写 `*x == v1`。

运行时验证思路（概念性，非论文原码）：在 harness 入口记录 `*x`、`*y` 与地址集合；每次 fuzz 输入执行 `swap` 后检查后置；若存在输入使后置失败，该输入成为 **refinement 反例**。

### 案例 2：容器查找 — FOL 合约

带循环的 `lookup`（Figure 2 右侧风格）：

```cpp
bool lookup(std::list<int>& lst, auto P) {
    for (auto it = lst.begin(); it != lst.end(); ++it) {
        if (P(*it)) return true;
    }
    return false;
}
```

无特殊前置时 `pre` 可为 `true`。后置在 **FOL** 层常合成：

```text
post: (∀x ∈ lst. ¬P(x) ⇒ ret = false)
   ∨ (∃x ∈ lst.  P(x) ⇒ ret = true)
```

含义：返回 `false` 当且仅当所有元素都不满足 `P`；返回 `true` 当存在满足者。量词在 Spec-Agent 里 **有界编译** 为对 `[0, lst.size())` 或 iterator 区间的循环检查——边界表达式由 LLM 从参数/容器接口生成，再被 fuzz Stress。

若函数 **既** 遍历容器 **又** `new`/`delete`，目标语言升为 **FOSL**，后置可能同时含量词与 `↦` / `*` 堆断言。

### 案例 3：CEGIS 式 refinement 伪代码

下面用 Python 风格伪代码概括论文核心循环（帮助理解 agentic 部分，非官方实现）：

```python
def spec_agent_synthesize(func, tests, max_retries=20):
    features = code_mining(func, tests)          # static + heap trace
    L = select_language(features)              # Prop | FOL | PropSL | FOSL
    harness = generalize_tests_to_fuzzer(func, tests)

    feedback = None
    for attempt in range(max_retries):
        cand = llm_generate_contract(func, language=L, feedback=feedback)
        if not parses(cand, grammar=L):
            feedback = "syntax error"
            continue
        if expressivity(cand) < L:
            feedback = f"need operators of {L}, got {expressivity(cand)}"
            continue
        assertion = compile_to_runtime_assert(cand)
        counterexample = libfuzzer_find_violation(func, harness, assertion)
        if counterexample is None:
            return cand  # fuzz-valid at target expressivity
        feedback = f"violated post on input {counterexample}"
    return best_effort(cand)
```

与「Claude Code 子 agent 自由探索」相比，Spec-Agent 强调 **确定性流水线**：每轮一次 LLM 调用 + 一次 fuzz，上下文不膨胀，因此在固定算力下 **有效 refinement 次数更多**。

## 实验结果（论文摘要）

- **代码库**：Bloomberg 开源依赖 **BDE**（651 个目标函数）与 **BlazingMQ**（508 个）；合计 **400 万+ LOC** C++；
- **最佳配置**（如 Qwen3-Coder-Next）：BDE **85.87%** Test Valid，BMQ **77.73%**；Claude Opus 4.6 约 81% / 67%；
- **表达力**：Spec-Agent 在 FOL、Prop SL、FOSL 上合成的 **有效合约数** 显著高于 Claude Code（Table 2）；平均逻辑原子数更高（~3–4 vs ~2.3）；
- **FOSL 天花板**：最复杂函数上「最强合约」比例仍偏低——论文认为可能需要新算法；
- **成本**：同等验证设置下 token 约为 Claude Code 的 **1/10**。

## 与相关工作的关系

| 方向 | 代表 | 与 Spec-Agent 的差异 |
|------|------|----------------------|
| 分离逻辑验证 | Infer、VST | 从代码 **推断** 摘要 vs 从规格 **证明** 代码 |
| 分离逻辑合成 | SuSLik、SSL | 从 `{P} {Q}` **生成程序**；Spec-Agent 反方向 **生成 P,Q** |
| LLM 合约合成 | 先前 LLM contract 工作 | 少见 separation logic + 百万 LOC + 系统化 fuzz 验证 |
| Lemma 合成 | symbolic-heap entailment | 证明辅助；Spec-Agent 面向仓库级函数合约 |

## 局限与批判性阅读

1. **Soundness**：fuzz 通过 ≠ 数学证明；未覆盖路径上的合约仍可能错；
2. **Trivial 合约**：部分有效合约退化为 `true`（论文报告 BDE ~6%、BMQ ~17% 量级，视模型而定）；
3. **编译失败率**：断言注入 + 复杂量词/堆编码导致 **Compile Error** 仍占 13–30%；
4. **语言选择启发式**：有 loop 不一定需要 quantifier，无 loop 有时仍需要—— lattice 约束部分缓解但不完美；
5. **C++ 特化**：运行时堆观测、容器边界约定绑在 C++ 语义上，迁移到其他语言需重做 backend。

## 自测题

1. Spec-Agent 四档逻辑如何选择？若函数只有 `if-else` 无堆无循环，目标层是哪一档？
2. 为什么 `swap` 的合约必须用 `*` 而不是 `∧`？
3. fuzz 在 pipeline 里能证明什么、不能证明什么？
4. 「Test Invalid = 0%」对 Spec-Agent 某些配置意味着什么？与 expert review 如何互补？
5. 若 LLM 生成的前置过强（拒绝合法输入），fuzz 能发现吗？为什么？

## 延伸阅读

- [[reynolds-separation-logic]] — `↦` 与 `*` 的语义基础
- [[infer-biabduction]] — 工业级从代码 **反推** 分离逻辑摘要（与合成合约互补）
- arXiv:2605.27531 — 原文附录含更多合约样例与 case study
- libFuzzer / LLVM — harness 与 coverage-guided fuzz 实现背景

## 一句话总结

**Spec-Agent = 按函数特征选分离逻辑/一阶逻辑的「合约方言」+ LLM 起草 + libFuzzer 当伪法官 + 反例驱动改稿**；它把 formal methods 里最难手工写的 heap/loop 合约，在百万行 C++ 上推到可规模化的工程中间态——不是终局证明，却是 LLM 时代系统软件 **可验证文档** 的一条可行路径。
