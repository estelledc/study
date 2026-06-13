---
title: Verus-SpecGym — 规格自动形式化与 Agent 评测环境
来源: https://arxiv.org/abs/2605.26457
日期: 2026-06-13
子分类: 形式化验证
分类: 形式化方法
provenance: pipeline-v3
---

## 从日常类比开始：合同条款 vs 判例测试

你请律师帮你写一份**租房合同**（informal specification：口头 + 邮件里说的「月租 8000、押一付三、宠物可养小型犬」）。律师把它整理成**正式条款**（formal specification：每一条都能被法庭机械解释）。

接下来有两种「验合同」的办法：

| 方法 | 类比 | 问题 |
|------|------|------|
| **专家对照** | 再雇一位资深律师，逐条对照「用户原意」 | 每道题都要人工写金标准，**贵且难扩展** |
| **LLM 当法官** | 让另一个 AI 读合同说「看起来对」 | 便宜，但会漏掉**边界条款**（26% 漏检，论文实测） |
| **判例 + 对抗测试** | 用官方样例 + 对手专门找的 hack 输入测条款 | 可规模化、可复现、能抓 subtle bug |

**形式化验证**里的故事更尖锐：Verus 可以证明 Rust 代码**满足**你写的 `requires` / `ensures`。但若 formal spec 本身写偏了——太宽则「证过了错的程序」，太窄则「对的程序证不过」——整个验证链条从根上就不成立。

CMU + Amazon 等作者 2026 年的 **Verus-SpecGym**（arXiv:[2605.26457](https://arxiv.org/abs/2605.26457)）要回答的问题因此不是「AI 会不会写代码」，而是：

> **语言模型 Agent 能否把 Codeforces 自然语言题面，翻译成忠实于原意的 Verus 形式化规格？**

他们同时贡献了 **Verus-SpecBench**（581 道规格写作任务）和一套**可执行测试**评测管线，避免依赖专家金标准或 LLM 法官。

一句话：**验证保证「代码 ⊆ 规格」；SpecGym 评测「规格 ≈ 用户意图」。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 论文 | *Verus-SpecGym: An Agentic Environment for Evaluating Specification Autoformalization* |
| 机构 | CMU、Amazon 等 |
| 代码 | [formal-verif-is-cool/verus-spec-gym](https://github.com/formal-verif-is-cool/verus-spec-gym) |
| 目标语言/验证器 | [Verus](https://github.com/verus-lang/verus) — Rust 上的 SMT（Z3）验证框架 |
| 任务来源 | Codeforces 编程题（581 道，含官方测试 + 人类 hack） |
| Agent 框架 | SWE-Agent + Harbor 集成；工具含 bash、文件编辑、`verus_gym_specgen_check`、submit |
| 预算 | 每题 $2.5 + 75 分钟超时 |

论文核心贡献四条：

1. **Verus-SpecGym**：Agent 与 Verus / shell / 文件系统交互，迭代写规格。
2. **Verus-SpecBench**：581 道「填 `pre_spec` / `post_spec` 空洞」任务。
3. **可执行规格评测**：扩展 Verus `exec_spec` → `exec_spec_unverified`，把逻辑谓词编译成可跑的 Rust 检查。
4. **四桶测试 + Codeforces hacks**：官方测试 + 竞赛者提交的对抗输入，比纯 LLM 造 counterexample 更贴近真实边界。

---

## 为什么重要

### 1. 验证链的「中间人问题」

Verified code generation 的流程是：

```text
informal 题面 s_I  →  formal 规格 s_F  →  程序 p  →  Verus 证明 p ⊨ s_F
```

若 $R_{s_F} \neq R_{s_I}$（形式化关系与 informal 意图不一致），证明成功也**不能**推出程序符合用户原意。瓶颈从「写证明」转向「**写对规格**」——即 **specification autoformalization（规格自动形式化）**。

### 2. 写对代码 ≠ 写对规格

论文对比 gpt5.3-codex：在 187 道「规格写错但输出唯一」的子集上，同一模型 **Python 解题 Pass@1 达 81.8%**，但 **Verus 规格 Pass@1 仅 57.8%**。Agent 常常「会做题，不会写合同条款」。

### 3. 评测本身曾是难题

- 专家金标准：每题一份，无法规模化。
- LLM-as-judge：对 gpt5.3-codex 自评，**25.7%** 的错误规格被误判为正确。
- SpecGym 路线：**确定性、可复现**的测试桶 + 符号/执行双路径判定。

---

## 核心概念

### 1. 忠实规格（Faithful Specification）

设 informal 题面定义输入输出关系 $R_{s_I}$，Agent 生成的 formal 规格定义 $R_{s_F}$。

| 性质 | 集合论表述 | 直觉 |
|------|------------|------|
| **Soundness（健全）** | $R_{s_F} \subseteq R_{s_I}$ | 形式化**不能多收**非法输入/错误输出 |
| **Completeness（完备）** | $R_{s_I} \subseteq R_{s_F}$ | 形式化**不能漏收**合法输入/正确输出 |
| **Faithful（忠实）** | $R_{s_F} = R_{s_I}$ | 两者完全重合 |

规格拆成两半：

- **`pre_spec(in)`**：哪些输入合法（定义 $\mathrm{dom}(R_{s_F})$）
- **`post_spec(in, out)`**：合法输入下哪些输出可接受

### 2. 四桶测试（Four Buckets）

评测把测试用例分成四类，分别探测 pre/post 的 soundness 与 completeness：

```text
τ_pre-comp   合法输入           → pre_spec 应接受
τ_pre-sound  非法输入           → pre_spec 应拒绝
τ_post-comp  合法 (in, out) 对  → post_spec 应接受
τ_post-sound 合法 in + 错误 out → post_spec 应拒绝
```

**只有四桶全部通过**，该题才算 solved。论文统计：平均每题约 21 / 80 / 55 / 78 个测试（pre-sound / pre-complete / post-sound / post-complete），每桶至少 5 个。

**Codeforces hacks** 是关键增量：选手在官方测试通过后提交的对抗输入，人类针对真实错误解法设计，能暴露官方测试漏掉的 implicit constraint。论文消融显示：**仅看 completeness 桶会显著高估 Pass@1**（例如 gpt5.3-codex 从 76.6% 跌到 57.8%）。

### 3. Verus 与 spec fn

Verus 在 Rust 里嵌入 `verus! { ... }` 块，用 `spec fn` 写**纯逻辑谓词**（给 Z3 用，不是普通可执行 Rust）。典型骨架：

```rust
use vstd::prelude::*;

verus! {

pub struct In1 {
    pub n: usize,
    pub arr: Seq<i64>,
    pub k: i64,
}

pub struct Out {
    pub pos: i64,
}

// Agent 要填写的两个洞
pub open spec fn pre_spec(in1: In1) -> bool {
    // TODO: 合法输入谓词
    true
}

pub open spec fn post_spec(in1: In1, out: Out) -> bool {
    // TODO: 正确输出谓词
    true
}

} // verus!
```

Agent 还可添加 helper `spec fn`，但输入输出类型由 benchmark 流水线**预先固定**（保证与 exec_spec 兼容）。

### 4. exec_spec 与 exec_spec_unverified

Verus 规格本质是逻辑公式，**不能直接** `cargo run` 在 concrete input 上。论文扩展 Verus 内置的 **exec_spec** 机制：

1. **符号路径**：把测试注入为 `assert(pre_spec(x))` 或 `assert(!post_spec(x,y))`，跑 Verus 证明。
2. **执行路径**：若符号检查 inconclusive / 超时，用 `exec_spec_unverified!` 把 spec 编译成 `exec_pre_spec(&exec_in1) -> bool` 的可执行 Rust，对 typed 测试值跑 `assert_eq!`。

`exec_spec_unverified` 与原版区别：**不要求**「可执行代码 ↔ 原 spec」的 correspondence proof。Benchmark 只需测试，不需要把生成代码纳入 verified 项目——避免「证明失败但测试代码其实能跑」的假阴性。

扩展覆盖：Seq / Set / Map / Multiset、`subrange`、`contains`、有界多变量 `forall` 等 Codeforces 常见约束。

### 5. Verus-SpecGym Agent 循环

```text
读取 problem_statement.md + solve.rs 骨架 + 样例测试 + Verus 文档
    ↓
编辑 pre_spec / post_spec
    ↓
verus_gym_specgen_check   ← 仅在「完备性桶」样例上给反馈
    ↓
读 attempts/*/feedback.txt，根据 Verus 报错迭代
    ↓
submit → 隐藏测试四桶全量评测
```

训练时 Agent 只见 **3 个 completeness 样例**；soundness 桶在最终评测才出现——防止过拟合公开 counterexample。

---

## 代码示例一：二分查找 — 四种典型错误规格

论文用「在有序数组中找 k 的**最左**出现位置，找不到返回 -1」说明四桶如何各抓一种错误（Figure 2）。

**错误 1 — pre_spec 不完备（太严）**：要求严格递增，拒绝含重复元素的有效输入。

```rust
pub open spec fn pre_spec(in1: In1) -> bool {
    in1.n >= 1
    && in1.arr.len() == in1.n
    && forall |i: usize|
        0 <= i < in1.n ==>
        (i + 1 < in1.n ==>
            #[trigger] in1.arr[i as int] < in1.arr[(i + 1) as int])
}
// 失败：arr = [10,20,20,20,30], k=20 是合法输入，但被拒绝
```

**错误 2 — pre_spec 不健全（太宽）**：只检查长度，接受未排序数组。

```rust
pub open spec fn pre_spec(in1: In1) -> bool {
    in1.arr.len() == in1.n
}
// 失败：arr = [3,2,3] 非法（未排序）却被接受
```

**错误 3 — post_spec 不完备**：不允许 `pos = -1` 的「未找到」分支。

```rust
pub open spec fn post_spec(in1: In1, out: Out) -> bool {
    0 <= out.pos
    && out.pos < in1.n as i64
    && in1.arr[out.pos as usize as int] == in1.k
}
// 失败：k=24 不存在时正确输出 pos=-1，但 spec 拒绝
```

**错误 4 — post_spec 不健全**：允许任意一个匹配位置，而非**最左**。

```rust
pub open spec fn post_spec(in1: In1, out: Out) -> bool {
    if out.pos == -1 {
        forall |i: usize|
            0 <= i < in1.n ==> #[trigger] in1.arr[i as int] != in1.k
    } else {
        0 <= out.pos
        && out.pos < in1.n as i64
        && in1.arr[out.pos as usize as int] == in1.k
    }
}
// 失败：k=20 时 out.pos=3 也满足「某处等于 k」，但最左应是 index=1
```

这四个例子对应四桶测试各一种失败模式，也是 Agent 在真实 Codeforces 题上最常犯的错。

---

## 代码示例二：exec_spec_unverified 可执行检查

Benchmark 评测时，规格会被宏展开成可执行 counterpart（简化示意）：

```rust
use vstd::contrib::exec_spec::*;
use vstd::prelude::*;

verus! {
exec_spec_unverified! {
    pub open spec fn pre_spec(in1: In1) -> bool {
        in1.n >= 1
        && in1.arr.len() == in1.n as int
        && forall |i: int, j: int|
            0 <= i < j < in1.n ==>
            in1.arr[i] <= in1.arr[j]
    }

    pub open spec fn post_spec(in1: In1, out: Out) -> bool {
        if out.pos == -1 {
            forall |i: int| 0 <= i < in1.n ==> in1.arr[i] != in1.k
        } else {
            0 <= out.pos && out.pos < in1.n as i64
            && in1.arr[out.pos as int] == in1.k
            && forall |i: int|
                0 <= i < out.pos ==> in1.arr[i] != in1.k
        }
    }
}
}

fn main() {
    let exec_in1 = ExecIn1 {
        n: 5,
        arr: vec![10, 20, 20, 20, 30],
        k: 20,
    };
    let exec_out = ExecOut { pos: 1 };
    assert_eq!(exec_pre_spec(&exec_in1), true);
    assert_eq!(exec_post_spec(&exec_in1, &exec_out), true);
}
```

评测器决策树（Figure 6）：

```text
具体测试 t + Agent 提交的 spec s
  → 先试 Verus 能否证明 s(t) 或 ¬s(t)
  → 若符号路径 unknown → exec_spec 编译并运行
  → 归入六类：编译错误 / accept-reject × symbolic-exec / exec  indeterminate
```

对 **post_complete / post_sound** 桶，前沿模型大量依赖 **exec 回退**；没有 exec_spec，许多用例会停在「symbolically unknown」。

---

## 数据流水线（Verus-SpecBench 怎么造出来）

从 Codeforces 到 benchmark 任务，五阶段：

1. **Sourcing**：抓题面 $s_I$、官方测试 $\tau$、hack 集合 $H$。
2. **Filtering**：去掉浮点 I/O、重复/截断测试、语法无效 hack 等。
3. **Hack collection**：按 Figure 4 路由到四桶（invalid input → pre-sound；valid + wrong output → post-sound …）。
4. **Test-case conversion**：构造 Agent 写 parser $R$ + printer $P$，要求 $P(R(t)) == t$ 字节级 round-trip，防止「测错输入」。
5. **Final selection**：每桶 ≥5 测试，共 581 题保留。

Agent 拿到的每题目录含：`problem_statement.md`、`solve.rs` 骨架、样例、**另一题的完整规格范例**、Verus 文档、**评测器源码**（可 grep 理解评测逻辑）——降低「不会 Verus 语法」导致的假失败。

---

## 实验结果（Pass@1，四桶全过才算对）

| 模型 | Pass@1 | Pass@1（仅 completeness 桶） |
|------|--------|------------------------------|
| gemini-3.1pro | **77.8%** | 82.4% |
| gpt5.3-codex | 57.8% | 76.6% |
| opus4.6 | 51.1% | 58.7% |
| deepseek-v4pro | 24.3% | 31.8% |
| glm-5.1 | 21.5% | 24.8% |
| kimi-k2.6 | 25.5% | 29.1% |

读数要点：

- **前沿 vs 开源**差距大（~78% vs ~22–25%），说明规格形式化比「裸写 Python 解」更吃模型能力。
- **Soundness 桶**是 Pass@1 的主要杀手；只看 completeness 会乐观 5–20 个百分点。
- **Hack 测试**能抓到官方测试完全漏掉的规格错误（论文 case study）。
- **LLM judge** 漏掉 executable evaluator 抓到的 **26%** 失败。
- 弱模型大量死在 **Verus 编译/语法** 或 exec_spec 不兼容 fragment，而不只是「逻辑写错」。

---

## 三类高频失败模式（定性分析）

论文归纳 Agent 写错规格的三大簇：

1. **遗漏输入假设**：题面说「数组非降序」，spec 只写长度；或忘记「字符只能是 '(' 和 ')'」。
2. **接受错误输出**：post 太弱，允许多解之一而非题面要求的唯一语义（如最左位置、最小插入数）。
3. **拒绝合法输出**：post 太严，漏掉 `-1`、空集、0 等边界合法答案。

这与软件工程里「需求文档 ↔ 验收标准」不对齐是同一类问题，只是这里验收标准是**可机器检查的 Verus 谓词**。

---

## 与相关工作的位置

| 方向 | 代表 | SpecGym 差异 |
|------|------|--------------|
| 代码生成 benchmark | HumanEval, Codeforces 提交 | 不评规格忠实度，只测 $p(x) \in Y_i$ |
| Verified code gen | Verus / Dafny / Lean 证明 | 假设 $s_F$ 已给定 |
| 规格挖掘 / 合成 | 从测试反推 spec | 这里是 **NL → formal**，且要 faithful |
| LLM 评规格 | Sun et al. 等 | SpecGym 用 executable + hacks，漏检率更低 |

Harbor 集成让 SpecGym 对齐现代 **tool-using agent** 评测范式：轨迹日志、预算、submit 语义与 SWE-bench 类环境一致。

---

## 零基础读者可以怎么用这篇论文

1. **学形式化验证的「上游」**：先会写 `requires`/`ensures`，再理解「规格从哪来」——SpecGym 把这个问题变成了可量化 benchmark。
2. **学 Agent 环境设计**：local check（样例）+ hidden test（四桶）+ 专家 prompt + 开源评测器，减少 benchmark 噪声。
3. **学测试驱动规格**：四桶 = 对「输入域」和「输出关系」分别做 positive/negative testing；hacks = 人类 adversarial fuzz。
4. **动手**：克隆 [verus-spec-gym](https://github.com/formal-verif-is-cool/verus-spec-gym)，从单题 skeleton 开始填 `pre_spec`/`post_spec`，跑 `verus_gym_specgen_check` 看 feedback。

---

## 局限与开放问题

- **测试覆盖 ≠ 完全等价**：$R_{s_F} = R_{s_I}$ 无法在有限测试下严格证明，只是高置信近似；更多测试边际收益递减但未达 100%。
- **题源偏 competitive programming**：Codeforces 风格约束清晰，与「脏」工业需求（IO、并发、浮点）有 gap。
- **Verus 片段限制**：复杂 spec 可能 symbolically unknown 且 exec 不支持，评测 indeterminate。
- **成本**：前沿模型每题 $2.5 × 581 全量评测仍不便宜。

开放方向：更强 open-weight 规格 Agent、从规格自动生成证明骨架、把 pipeline 迁到 Dafny/Lean、工业 API 的 informal→formal。

---

## 小结

| 问题 | SpecGym 的回答 |
|------|----------------|
| 评什么？ | NL 题面 → Verus `pre_spec` / `post_spec` 是否 **faithful** |
| 怎么评？ | 四桶测试 + 符号 Verus + **exec_spec_unverified** 执行回退 |
| 数据从哪来？ | 581 道 Codeforces + 官方测试 + **人类 hacks** |
| 难不难？ | 前沿 ~52–78%，开源 ~22–25%；**会写代码 ≠ 会写规格** |
| 为何不用 LLM judge？ | 漏 26% 错误；executable 更可靠 |

Verus-SpecGym 把「规格自动形式化」从口头挑战变成了**可复现的 Agent  gym**：它测的不是证明有多长，而是**形式化合同是否真对应用户说的那句话**。在 AI 写代码 + 形式化验证的组合拳里，这一步正在成为新的瓶颈——也是新的研究前沿。

---

## 延伸阅读

- 论文 HTML：[arXiv:2605.26457](https://arxiv.org/html/2605.26457)
- Verus 项目：[verus-lang/verus](https://github.com/verus-lang/verus)
- 相关 benchmark 思路：verified code generation、LLM-as-judge 的局限性
- 本仓库笔记：[seL4 形式化验证](sel4-formal-2009.md)（内核级证明）、[Infer 分离逻辑](infer-biabduction.md)（另一种「规格/不变量」文化）
