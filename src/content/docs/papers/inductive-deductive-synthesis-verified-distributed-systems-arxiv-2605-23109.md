---
title: "Inductive Deductive Synthesis: Enabling AI to Generate Formally Verified Systems"
来源: https://arxiv.org/abs/2605.23109
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# Inductive Deductive Synthesis (IDS) 学习笔记

## 一句话总结

IDS 让 AI 像人一样"边写代码边证明"，通过归纳（从失败中学习新策略）和演绎（在每个步骤用形式化验证器检查）相结合的方式，自动生成**可机器验证的分布式系统**，7/7 通过之前连 GPT-5.4 和 Claude Opus 4.6 都搞不定的 7 个分布式一致性规范，耗时仅约 6.8 小时，花费约 $106/规范。

## 从日常类比开始

### 拼乐高 vs. 盖大楼

想象你在盖一栋大楼：

**传统 AI 编程** 就像让你"先把整栋楼盖好，再检查结构是否安全"。AI 先写出所有代码，最后才跑测试。问题是：大楼如果地基打错了，前面几百层全得拆。分布式系统尤其致命——可能有万亿种消息交错顺序，测试永远覆盖不完。

**IDS 的做法** 则是"每铺一块砖，就让结构工程师检查一块"。每写几行代码，就立刻用 Rocq（形式化验证工具）证明这段代码满足规范。证明不了？立刻回退，换一种设计。如果一种策略连续失败，换一个"架构师"（ISA）来想新方案。

这就像"链式思考"（chain-of-thought），但中间每一步都是**形式化验证过的**，不是 AI 的直觉。

---

## 三个核心概念

### 1. 形式化验证（Formal Verification）

传统测试只能证明"某些输入下程序是对的"。形式化验证要证明"对所有可能的输入，程序都是对的"。

它有三要素：
- **规范（Specification）**：用数学语言精确描述"什么是对的"
- **实现（Implementation）**：实际代码
- **证明（Proof）**：用机器检查器（如 Rocq）验证"实现满足规范"

### 2. 归纳合成（Inductive Synthesis）

从失败中学习。当一条路走不通时，不是一遍遍重试同一个策略，而是让另一个 Agent 分析失败原因，提出全新的设计方向。

类比：你写代码卡住了，请一位资深架构师来看，他说"别在这个方向上了，试试把数据结构换一下"。

### 3. 演绎合成（Deductive Synthesis）

从规范出发，一步步推导出实现。每个实现步骤都伴随着对应的证明步骤。

类比：给定"大楼必须抗震"的设计要求，你先选地基类型，再选框架类型，每一步都让结构工程师签字确认。

### IDS 的魔力在于两者的结合

归纳负责"换策略"，演绎负责"在某个策略下推进"。两者形成一个闭环。

---

## IDS 的架构

IDS 有三个核心角色：

**Coordinator（协调者）**：系统的大脑。启动多个 DSA，监控进度，在 Agent 卡住时调用 ISA，对完成候选做性能测试。

**DSA — Deductive Synthesis Agent（演绎合成 Agent）**：一个 LLM Agent，在给定策略下逐步构建代码+证明。每一步都交给 Rocq 验证器检查。如果通过，保存状态；如果失败，修复或回退。

**ISA — Inductive Synthesis Agent（归纳合成 Agent）**：当 DSA 卡住时介入，分两个角色：
- **Proposer（提议者）**：战术层面。"当前策略不错，但卡在某个证明上，试试加一个辅助引理。"
- **Reloader（重载者）**：战略层面。"当前策略是死路，换个全新的高层设计。"

---

## 第一个代码示例：计数器（Counter）

论文用了一个极简例子展示 IDS 如何工作。先理解它，就能理解整个框架。

### 规范（Specification）

```coq
Module Type CounterSpec.

Parameter t    : Type.      (* 状态类型 *)
Parameter init : t.         (* 初始状态 *)
Parameter inc  : t -> t.    (* 递增操作 *)
Parameter read : t -> nat.  (* 读取操作，返回自然数 *)

(* 属性1: 初始状态的读数为 0 *)
Axiom read_init :
  read init = 0.

(* 属性2: 递增后再读，比之前多 1 *)
Axiom read_inc :
  forall s,
  read (inc s) = S (read s).

End CounterSpec.
```

这个规范说了两件事：数从 0 开始；每 inc 一次，read 的结果就加 1。

### IDS 的逐步合成

**第 0 步：部分实现 + 部分证明**

IDS 先选一个状态表示——用一个列表，列表长度就是计数。

```coq
Definition t := list unit.
Definition init : t := nil.

Definition read (s : t) :=
  length s.

Theorem read_init :
  read init = 0.
Proof. reflexivity. Qed.
(* 这个定理证明了！初始空列表长度为 0 *)

(* inc 的实现先留空 *)
Definition inc (s : t) : t.
Admitted.

(* 对应的证明也留空 *)
Theorem read_inc :
  forall s,
  read (inc s) = S (read s).
Admitted.
```

关键：`Admitted` 是一个"占位符"。Rocq 验证器**仍然接受这个文件**，因为目前所有已证明的部分都通过了。这就是 IDS 的核心机制——**部分证明也是可以被检查的**。

**第 1 步：补全实现**

```coq
Definition inc (s : t) := tt::s.  (* 在列表头部加一个元素 *)

Definition read (s : t) :=
  length s.

Theorem read_inc :
  forall s,
  read (inc s) = S (read s).
Proof.
  intros s. unfold read, inc.
  simpl. reflexivity. Qed.
```

现在整个系统完整了，Rocq 验证器确认所有定理都证明完毕。

### 从计数器到分布式系统

这个计数器只是入门。在分布式系统中：

- `inc` 变成多个客户端并发写入
- `read` 可能从不同副本读取
- 需要保证"我写入的值，下次读能读到"（Read-Your-Writes）
- 需要保证" causally related 的操作顺序正确"（Causal Consistency）

IDS 的 DSA 在证明这些属性时，会不断尝试不同数据结构和证明策略。比如对 Chapar CC 规范：
- 第一次尝试：用一个大对象存所有 key → 证明卡住
- ISA Reloader 介入：改成每个 key 一个独立表格 → 证明可以分解为每个 key 的小问题 → **通过**

---

## 第二个代码示例：Read-Your-Writes 规范

这是 IDS suite 中最简单的分布式一致性规范之一：

```coq
Module Type RYWSpec.

Parameter t    : Type.           (* 副本状态 *)
Parameter op   : Type.           (* 操作: Put(key, value) 或 Get(key) *)
Parameter exec : list op -> nat -> option value.
  (* 执行一个操作序列，返回某个 key 的读取结果 *)

(* Read-Your-Writes 属性:
   如果客户端先 Put(k, v)，然后 Get(k)，
   那么在 Put 之后发出的 Get，必须能看到 v。 *)
Axiom ryw :
  forall (ops : list op) (k : key) (v : value) (prefix post : list op),
    Put k v :: prefix ++ Get k :: post = ops ->
    exec (prefix ++ Get k :: post) = Some v.

End RYWSpec.
```

IDS 的 DSA 会为这个规范生成一个多副本协议实现：
- 每个副本用向量时钟（vector clock）或每客户端计数器来追踪状态
- 每次 Put 时附加发送者的计数器
- 每次 Get 时检查是否收到足够的信息

如果某个数据结构导致证明无法分解（比如证明需要同时考虑所有 key），ISA Reloader 会触发，建议换一种表示方式。

---

## 关键机制详解

### 部分证明（Partial Proofs）

Rocq 的验证器对 `Admitted` 的处理是 IDS 能工作的基础：

```
完整实现 + 完整证明 → Rocq 接受 ✓
部分实现 + Admitted 占位符 → Rocq 仍然接受 ✓
不类型检查的代码 → Rocq 拒绝 ✗
```

这意味着 IDS 可以在"证明完成一半"的状态下判断当前设计方向是否正确。这相当于在每个步骤都得到**精确、无假阳性/假阴性**的反馈。

### 从验证到性能的闭环

IDS 不只是证明正确性。一旦一个候选实现完成（无论证明是否关闭），Coordinator 就把它提取为 OCaml 代码，在 5 台 VM 的 Google Cloud 集群上跑性能测试：

- 吞吐（throughput）
- P99 延迟
- 峰值内存
- 每 worker 操作数缩放

性能数据反馈给 ISA，指导它选择更高效的实现。最终 IDS 生成的实现比手动编写的参考实现最高快 3 倍。

---

## 实验结果

### 正确性对比

| 规范 | Codex (GPT-5.4) | Claude Code (Opus 4.6) | IDS |
|------|:-:|:-:|:-:|
| Chapar CC | 0/3 | 0/3 | 3/3 |
| RYW | 3/3 | 3/3 | 3/3 |
| MR | 0/3 | 0/3 | 3/3 |
| MW | 2/3 | 3/3 | 3/3 |
| RYW+MW | 0/3 | 1/3 | 3/3 |
| CC | 0/3 | 0/3 | 2/3 |
| LCC | 0/3 | 0/3 | 3/3 |
| **总计** | **2/7** | **2/7** | **7/7** |

### 效率

- IDS 平均每个规范耗时约 6.8 小时，花费约 $106
- 比人类专家快约 200 倍（人类需要 9-12 个月）
- 比 SOTA Agent 便宜约 17%

### 性能

IDS 生成的实现在所有 7 个规范上匹配或超越手写专家实现，Chapar CC 上比官方向量时钟实现快 3 倍。

### 消融实验（Ablation）

去掉任何组件都会显著下降：

- 去掉联合合成（-J）：7 个规范中只剩 RYW 能过
- 去掉 Rocq 反馈（-VF）：所有规范通过率降至 ≤1/3
- 去掉审计（-A）：出现过"put 守卫永远返回 false"这种 trivial 但通过验证的 bug
- 去掉 Proposer（-P）：最难规范全部 0/3 通过
- 去掉 Reloader（-R）：最难规范全部 0/3 通过

最关键的单个组件是 **Rocq 反馈**——结构化诊断（目标、假设、tactic 回溯）vs. 简单的通过/拒绝，前者让 DSA 能精确知道哪里错了。

---

## 为什么这很重要

### 1. 形式化验证不再是"专家特权"

传统上，证明一个分布式系统正确需要 9-12 个月专家时间。IDS 把这个变成了"给规范，几小时后自动获得可验证实现"。

### 2. 测试的局限性被揭示

Codex GPT-5.4 即使收到 100 个候选实现 + 完整形式规范，在 4 个分布式属性上只通过了 1 个。测试和"vibe coding"永远无法覆盖分布式系统的状态空间。

### 3. 这是"可验证编程"的转折点

论文作者用了一个精彩的说法：IDS 把 **vibe coding**（凭感觉编程）变成了 **verified coding**（可验证编程）。AI 生成的不再是"可能对的代码"，而是"机器验证过对的代码"。

### 4. 通用性

IDS 不依赖 Rocq。Lean 4、Verus 等验证器也能用。问题领域也不限于分布式系统——操作系统内核、编译器、密码协议、硬件设计都适用。

---

## 局限性和开放问题

1. **规范瓶颈**：IDS 需要手写 Rocq 规范，这本身就是最困难的环节。论文作者计划探索 LLM 辅助的自然语言→形式规范转换。

2. **评估范围**：目前只在 KV 存储一致性上验证，OS 协议、密码原语等领域待探索。

3. **未覆盖的场景**：7 个规范没有包含节点扩缩容、故障恢复、可观测性等生产系统需求。

---

## 我的理解：IDS 的哲学

IDS 的核心思想其实很朴素：**不要一口气吃成胖子**。

传统的 AI 编程方式是"先写代码，再证明"——等同于人类"先把证明写完再写代码"，这两者都被证明极其困难。

IDS 的突破在于把问题变成了**交互式搜索**：
- 每一步都很小（写几行代码 + 证一个小引理）
- 每一步都有精确反馈（Rocq 验证器说 yes/no）
- 失败时有人帮你换策略（ISA Proposer/Reloader）
- 成功了还要跑性能测试（Coordinator 的 benchmark 环节）

这本质上就是把人类写代码时"边写边想、卡住就换思路、最后检查对不对"这个过程，形式化后交给 AI Agent 系统自动执行。

---

## 延伸阅读

- 论文完整代码：https://github.com/skydiscover-ai/skydiscover
- Rocq 文档：https://rocq-lang.org/
- Chapar 原始论文：Lesani et al., Chapar: Certified Causally Consistent Distributed Key-Value Stores
- Dafny、Verus、Lean 4 等其它形式化验证工具
- AlphaVerus: bootstrapping formally verified code generation through self-improving translation
