---
title: CRDT 形式定义 — SSS 2011 八页浓缩版
来源: Shapiro, Preguiça, Baquero, Zawirski, "Conflict-Free Replicated Data Types", SSS 2011
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

这是 [[crdt-shapiro-2011]] 同一组作者同年发表的**会议短版**——只有 8 页，但**第一次正式把 CRDT 这个词和它的形式化定义钉在文献上**。同事手里那本 50 页 INRIA 长报告（RR-7506）是技术详尽版；SSS 2011 是公开发表的"骨架版"。

日常类比：长报告像一本完整菜谱（包括葱花切多细、火候多大），SSS 短版像菜单本身——只列每道菜的"必要约束"：什么可以叫做 CRDT，两条等价的实现路线，以及一条能合到一起的数学保证。

短版给的核心是三件事：

1. **CvRDT（state-based）**的最小形式化：状态构成 join-semilattice
2. **CmRDT（op-based）**的最小形式化：并发操作两两可交换
3. **等价定理**：任何 CvRDT 可以翻成 CmRDT，反之亦然

## 为什么重要

不读 SSS 短版，下面这些事都说不清：

- 为什么 CRDT 这个词突然在 2011 年的论文里出现并被广泛引用——它就是这篇带火的
- 为什么后人提到"CvRDT ≡ CmRDT 等价"几乎都引这一篇而不是长报告
- 为什么 Riak 早期文档里 LWW-Element-Set 的定义和 SSS 短版几乎逐字一致——工程师就是照短版抄的
- 为什么 Akka Distributed Data 的 API 命名（LWWMap / GCounter / ORSet）能直接对应短版表格——短版给了"接口字典"

短版和长版是一对：长版给所有 CRDT 的设计 + 完整证明，短版给**最小可用形式化**。学习时反而该先看短版骨架，再下钻长版细节。

## 核心要点

### CvRDT 的形式化定义（短版只用三行）

一个 CvRDT 是一个三元组 `(S, ⊑, ⊔)`——日常桥接：

- `S`：副本可能出现的全部状态（像所有可能的购物清单）
- `⊑`：偏序，"谁包含谁 / 谁更新"（清单 A 是否已经覆盖清单 B）
- `⊔`：join，两份状态取**最小上界**（按规则合一份谁都不亏的总清单）

要求 `(S, ⊑, ⊔)` 构成 **join-semilattice**。merge = `⊔`，交换/结合/幂等由公理免费给出。每个 update 必须**单调递增**——只能让状态在 ⊑ 上变大。

### CmRDT 的形式化定义

一个 CmRDT 把每个 update 拆成两段：

- `prepare(本地, 参数)` → 生成 op（运行在源副本）
- `effect(op, 副本)` → 把 op 应用到任意副本

要求：所有"并发的"两个 op 必须交换（apply 顺序不影响结果）。"并发"由因果序判定（happens-before 不可比即并发）。

下层假设：reliable causal broadcast——每个 op 至少送达一次，因果序保留。

### 等价定理（短版 Theorem 2.1 的核心贡献）

短版给了一条骨架级的对偶证明：

- CvRDT → CmRDT：每次 update 后把"新状态"作为 op 广播，effect = merge
- CmRDT → CvRDT：状态 = "已交付 op 集合"，⊔ = 集合并

这意味着两条路只是同一概念的不同包装。工程上选哪条，看带宽 vs 网络层假设。

### 强最终一致 SEC 的形式化

SEC 的形式定义（短版式 1）：

> **任意两个副本，只要 delivered updates 集合相同，state 必然相等**。

这比传统 EC 严格——传统 EC 只要求"网络静止后最终收敛"，SEC 不依赖"网络静止"假设，**没有终止性前提**。

## 实践案例

### 案例 1：LWW-Element-Set（短版唯一详细给出的 Set）

```
状态 = (A, R)，A 是 add 集合，R 是 remove 集合
add(e):    A := A ∪ {(e, now())}
remove(e): R := R ∪ {(e, now())}
contains(e): 存在 (e, t_a) ∈ A 且不存在 (e, t_r) ∈ R 满足 t_r ≥ t_a
merge((A1,R1), (A2,R2)) = (A1∪A2, R1∪R2)
```

为什么是 CRDT：A、R 都只增（G-Set），逐对取并是 semilattice join；contains 是派生函数，不影响合并。代价：时间戳必须可比（Lamport / 物理时钟+副本 ID 破平），并发 add/remove 由时间戳大者赢——会丢一边。

### 案例 2：MV-Register（多值寄存器）

并发写不丢任何一边。状态 = `{(v, vc)}`，vc 是 vector clock（每副本一个计数的版本向量）：

```
A: write("红") → {("红", [A:1])}
B: 同时 write("蓝") → {("蓝", [B:1])}
merge → {("红",[A:1]), ("蓝",[B:1])}  // 两版不可比，都保留
读 → ["红","蓝"]，交给应用决定怎么合
```

**逐步解释**：① 写附带本副本 vc；② merge 丢掉被支配的旧版；③ 不可比版本全部留下。Dynamo 论文 / Riak 的 sibling values 就是这思路（注意：DynamoDB 默认是 LWW，不是 siblings）。

### 案例 3：Riak 怎么照短版抄

短版 Algorithm 1 的接口骨架，几乎能直接翻成代码：

```
new() → 空状态
update(state, args) → 新状态          # 本地单调更新
merge(a, b) → join(a, b)              # 半格合并
value(state) → 对外可读值
```

Riak 2.0 的 `riak-dt`：`dvvset.erl` ↔ MV-Register，`lwwreg.erl` ↔ LWW-Register，签名与上表逐字对应。

## 踩过的坑

1. **短版没解决墓碑 GC**：LWW-Element-Set 的 R 集合永远只增，删了的元素信息得永久保留防"复活"。短版只承认问题，方案得等长版的 OR-Set 或 [[crdt-json]] 的 RGA。

2. **等价定理不保证效率**：CvRDT → CmRDT 翻译过去会发整个新状态，带宽爆炸；CmRDT → CvRDT 翻译过去状态变成"全部 op 集合"，存储爆炸。形式上等价 ≠ 工程上等价。

3. **causal broadcast 工程上很难严格做**：要求"因果序保留"，TCP 单连不够，要应用层版本向量 + 重发。短版假设这层"已存在"，实际很多系统其实凑合用 best-effort，并不严格满足前提。

4. **LWW 时钟陷阱**：物理时钟漂移会让"后写的"反而时间戳更小，覆盖错。生产里要么混合 Lamport（HLC），要么明确接受偶发"丢更新"。

## 适用 vs 不适用

**适用**：
- 想用 CRDT 但只想读 8 页骨架——SSS 短版正好
- 自己实现 CRDT 库时拿来对接口（LWW-Register / MV-Register / GCounter 模板齐了）
- 写论文需要引"CRDT 形式化"出处——惯例引这一篇

**不适用**：
- 想看具体复杂 CRDT（OR-Set 完整版 / RGA / 序列）→ 看 [[crdt-shapiro-2011]] 长版
- 想看墓碑 GC 方案 → 看 delta-CRDT 系列
- 想看 JSON / 嵌套结构 → 看 [[crdt-json]]

## 历史小故事（可跳过）

- **2007**：Letia / Preguiça / Shapiro 在 SOSP'07 发 Treedoc，"协同序列 CRDT"原型，但没有"CRDT"这个词
- **2011 年初**：长报告 RR-7506 在 INRIA 内部流传（50 页技术备忘）
- **2011 年 10 月**：SSS 2011 在格勒诺布尔召开，短版发表——**"CRDT" 第一次出现在公开会议论文标题里**
- **2012 年起**：Riak、Akka 等工程实现直接以短版为接口契约
- **2017**：Kleppmann 把这套推广到嵌套 JSON ([[crdt-json]])

## 学到什么

1. **会议短版 vs 长报告的分工**：短版是"接口契约"，长版是"参考实现"。读骨架先读短版，做证明读长版
2. **形式定义的力量**：semilattice 三公理 + 等价定理就够定义"什么算 CRDT"——再复杂的设计都得过这道坎
3. **CvRDT ≡ CmRDT 是同一硬币的两面**：不是两套独立理论，而是一个概念的两种封装
4. **SEC 比传统 EC 强**：去掉了"网络静止"假设，这点经常被工程师忽略，但它解释了为什么 CRDT 系统可以"永远在线"

## 延伸阅读

- 论文 PDF：[SSS 2011 短版 RR-7687](https://pages.lip6.fr/Marc.Shapiro/papers/RR-7687.pdf)（8 页，浓缩到极致）
- 同组同年长版：[[crdt-shapiro-2011]]（50 页，全部 CRDT 设计 + 完整证明）
- 视频：[Martin Kleppmann — CRDTs and Distributed Consistency](https://www.youtube.com/watch?v=B5NULPSiOGw)
- 工程入门：[Riak Data Types 文档](https://docs.riak.com/riak/kv/latest/developing/data-types/)
- [[crdt-json]] —— 6 年后被推广到嵌套 JSON

## 关联

- [[crdt-shapiro-2011]] —— 同组同年的 INRIA 长报告，技术细节版
- [[crdt-json]] —— 把 CRDT 推广到任意嵌套 JSON
- [[brewer-cap-2000]] —— CAP 定理；CRDT 站在 AP 一边
- [[lamport-clocks-1978]] —— LWW / OR-Set 都依赖 Lamport 风格逻辑时钟
- [[paxos-1998]] —— 强一致路线的代表，与 CRDT 互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[brewer-cap-2000]] —— Brewer CAP — 网络一断电，一致性和可用性只能留一个
- [[crdt-json]] —— CRDT JSON — 协同编辑 JSON 数据结构
- [[crdt-shapiro-2011]] —— CRDT — 让多副本各改各的，最终自动合一
- [[logoot-2010]] —— Logoot — 给每个字符发一张"永不过期的座位号"
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议

