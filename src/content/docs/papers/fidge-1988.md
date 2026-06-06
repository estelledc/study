---
title: Fidge 1988 — 给每个进程一份"账本向量"，让因果关系变成可判定
来源: 'Colin J. Fidge, "Timestamps in Message-Passing Systems That Preserve the Partial Ordering", ACSC 11, 1988'
日期: 2026-05-30
子分类: 共识与复制
分类: 分布式系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

Fidge 1988 是一篇 11 页论文，它告诉我们：**每个进程不要只记一个整数时钟，而是记一个长度为 N 的整数向量**——这样不仅能判断"谁先谁后"，还能精确判断"两件事是不是真的并发"。日常类比：[[lamport-1978]] 那篇里每个人手上只有一本自己的账本，记得我的事。Fidge 让每个人手上多了一份**全员账本表**——我的那一格记自己事件数，别人那 N-1 格则记"我从他们那里听说过的最新进度"。每次收到来信就把对方表里的进度合并进自己的表，两份表一比就能精确说出"你比我多走了几步" vs "我们各走各的，谁也没影响过谁"。

更具体地说：[[lamport-1978]] 的时间戳只能给出 a→b ⇒ C(a)<C(b) 的**必要条件**——反过来不成立，所以无法检测并发。Fidge 给每个进程 i 维护一个 N 维向量 V_i，满足三条规则：本地事件 V_i[i]+=1；发消息时把整个 V_i 写进消息；收消息时对每个 k 取 max(V_i[k], V_msg[k]) 再把自己那格 +1。这样得到的关系是**双向蕴含**：a→b ⟺ V(a) < V(b)（向量逐分量 ≤ 且至少一处严格 <）；a‖b ⟺ V(a) 和 V(b) 不可比。

40 年过去，Dynamo 的 version vector、CRDT 的 dot、Riak 的 causal context、Jaeger 分布式追踪的 causal span，全是这篇论文的孩子。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 Dynamo 论文里购物车冲突合并用的是 "version vector"，而不是单一时间戳
- 为什么 [[crdt-shapiro-2011]] 里 OR-Set 删除元素要带一个 "dot"——dot 就是向量时钟的一格
- 为什么 [[chandy-lamport-1985]] 拍快照后还要靠向量判断"哪些消息算 in-flight"
- 为什么 Riak 给客户端返回多版本（sibling）时附带 "causal context"，让客户端下次写入时合并

## 核心要点

Fidge 的协议出奇地简洁，**就三条规则**（每个进程 i 维护向量 V_i，长度 = 进程数 N）：

1. **本地事件**：V_i[i] += 1。类比：每个人在自己账本表的"我"那一行画一笔。

2. **发消息**：先 V_i[i] += 1，然后把**整个向量** V_i 当 piggyback 塞进消息。类比：寄信前在我自己的格子记一笔，再把整张账本表复印一份附进去。

3. **收消息**：对每个 k 取 V_i[k] = max(V_i[k], V_msg[k])，再 V_i[i] += 1。类比：把对方的账本表和我的逐格取大值（"他们已经知道的，我也知道了"），最后在我的格子再画一笔表示"我读完信了"。

**比较两个向量** V(a) 和 V(b)：
- 逐分量 V(a)[k] ≤ V(b)[k] 且至少一处严格 < ⟹ a → b（a 因果先于 b）
- 完全相等 ⟹ 同一事件
- 双向都有严格大于 ⟹ a ‖ b（真正并发）

这套规则保证 a → b ⟺ V(a) < V(b) **双向成立**——这是 Lamport 时间戳做不到的。

## 实践案例

### 案例 1：Dynamo 购物车合并的 version vector

Dynamo 论文里购物车被两个 region 同时修改，version vector 让客户端能区分"同步版"和"分叉版"：

```python
# 简化伪码
class Cart:
    def __init__(self, items, vv):
        self.items = items
        self.vv = vv  # {node_id: counter}

def write(cart, node_id, new_items):
    cart.vv[node_id] = cart.vv.get(node_id, 0) + 1
    return Cart(new_items, cart.vv)

def merge(a, b):
    # 逐节点取 max；若 a.vv 严格 dominates b.vv 直接用 a，否则保留两个 sibling
    ...
```

**逐部分解释**：
- `vv` 是稀疏向量（只记真正写过的节点），等价于 Fidge 的 V_i
- "严格 dominates" 就是论文里的 V(a) < V(b)，用来识别 stale 写入
- "双向都不 dominate" 就是并发分叉，Dynamo 把两份都返回让客户端 resolve

### 案例 2：CRDT OR-Set 用 dot 标识每次添加

[[crdt-shapiro-2011]] 里 OR-Set（Observed-Remove Set）添加元素 x 时，给这次操作打一个 dot = (node_id, counter)：

```python
class ORSet:
    def __init__(self, node_id):
        self.node_id = node_id
        self.counter = 0
        self.adds = {}  # element -> set of dots
        self.removes = set()  # set of dots

    def add(self, x):
        self.counter += 1
        dot = (self.node_id, self.counter)
        self.adds.setdefault(x, set()).add(dot)

    def remove(self, x):
        for dot in self.adds.get(x, set()):
            self.removes.add(dot)
```

**逐部分解释**：
- dot `(node_id, counter)` 是 vector clock 的一格——每个 add 操作都有唯一向量坐标
- remove 只删"我看到过的那些 dot"，并发的 add 不会被误删
- 合并时把两侧 adds 和 removes 取并集，这就是论文里的 V_i 与 V_msg 取 max

### 案例 3：用向量比较检测真正并发

```python
def compare(va, vb):
    less = any(va[k] < vb[k] for k in keys)
    more = any(va[k] > vb[k] for k in keys)
    if less and not more: return "a -> b"
    if more and not less: return "b -> a"
    if not less and not more: return "a == b"
    return "a || b"  # concurrent
```

**逐部分解释**：
- 向量比较是 **partial order**——可能两个都 less、两个都 more、或者两边互不包含
- "互不包含" 就是 Lamport 时间戳永远做不到的判定
- 这正是因为 vector 在每一格里**保留了**"我从对方那里听到的最新进度"

## 踩过的坑

1. **把 ≤ 当成 <**：V(a) ≤ V(b)（每分量都 ≤）允许 a == b 同事件，必须额外要求"至少一处严格 <"才表示 a → b 真因果先。混淆会让"自己"被判成"自己的祖先"。

2. **N 必须固定**：进程动态加入/退出时，向量长度变化，老向量没有新进程那一格，比较会失败。工业上要么配死 N（Dynamo 节点数固定），要么用 ITC（Interval Tree Clock）/ Dotted Version Vector 解决。

3. **每条消息都带 O(N) 字节**：1000 节点集群每条消息要 8KB（uint64 × 1000）只为带向量。大集群用 sparse vector（只记非零项）+ 周期 GC（pruning 策略见 Almeida-Baquero 2014）。

4. **进程 ID 必须稳定**：节点重启后复用 ID，新事件会"接着用"老的 V[i] 计数，但实际语义是新进程，会污染所有人的判断。要用 epoch（重启计数）+ id 组合，或永久 UUID。

5. **Mattern 1988 是同一时期独立工作**：社区常把 Fidge 1988 和 Mattern 1988/1989 一起引用，统称 vector clock。两者算法等价，论文角度不同——Fidge 偏可视化和 partial order，Mattern 偏 virtual time 抽象。

## 适用 vs 不适用场景

**适用**：
- 进程数已知且不大的集群（< 几百节点）
- 需要精确检测并发的场景（multi-master 写冲突、协同编辑）
- CRDT 数据结构（OR-Set, RGA, MV-Register 都内置 version vector）
- Causal consistency 数据库的 dependency tracking

**不适用**：
- 进程数动态变化（用 ITC / Dotted Version Vector / Bloom Clock）
- 超大规模集群（O(N) 太贵，可降级成 [[lamport-1978]] 时间戳 + 牺牲并发检测）
- 需要绑定真实物理时间（用 [[spanner]] TrueTime 或 HLC）
- 跨数据中心强一致事务（共识协议如 [[raft]] 才够）

## 历史小故事（可跳过）

- **1978 年**：Lamport 给出逻辑时钟，但只能判 a→b 不能判 a‖b
- **1988 年初**：Colin Fidge 在 ACSC（澳大利亚计算机科学会议）发表本文，给 N 维向量并证明双向蕴含
- **1988 年底**：Friedemann Mattern 在 Parallel & Distributed Algorithms 独立提出 "Virtual Time"，思想几乎一致
- **1989 年**：Mattern 在 "Virtual Time and Global States of Distributed Systems" 给出更系统的论述，被社区更频繁引用
- **2007 年**：Dynamo 论文把 version vector 推到工业，购物车并发合并是标志案例
- **2011 年**：[[crdt-shapiro-2011]] 把 vector clock 嵌进所有 OR-Set / RGA 算法
- **2010s**：Yjs / Automerge / Riak DT 让协同编辑产品大规模用上 vector clock 变种

## 学到什么

1. **partial order 真正可判定**：向量时钟把 Lamport 1978 的"必要条件"升级为"充要条件"
2. **空间换信息**：用 O(N) 空间换"是否真并发"的判定能力，这是工程权衡的经典选择
3. **同时期独立发现**：Fidge 和 Mattern 几乎同时给出同一思想，说明"加个向量"是因果建模的自然下一步
4. **向量比较是 partial order**：不是所有事件都可比，这正是分布式系统"诚实的时间观"

## 延伸阅读

- 论文 PDF：[Fidge 1988](http://zoo.cs.yale.edu/classes/cs426/2012/lab/bib/fidge88timestamps.pdf)（11 页，配合 Mattern 1989 一起读最完整）
- Mattern 1989：[Virtual Time and Global States](https://courses.csail.mit.edu/6.852/01/papers/Mattern.pdf)（更系统的同思想长论文）
- 视频：[Martin Kleppmann — Distributed Systems Lecture 5](https://www.youtube.com/watch?v=4VfPcCZuVmI)（讲 vector clock 与 causality）
- 后续：[[crdt-shapiro-2011]] —— OR-Set / RGA 等数据结构如何嵌入 version vector
- 实战：Dynamo 论文 Section 4.4 用 version vector 处理写冲突

## 关联

- [[lamport-1978]] —— 前置工作，Fidge 在它的基础上把单整数升级成向量
- [[chandy-lamport-1985]] —— 全局快照，向量时钟可用来判定 marker 之间消息归属
- [[crdt-shapiro-2011]] —— OR-Set / MV-Register 直接以 dot（向量一格）标识每次操作
- [[paxos]] —— 不依赖 vector clock，但共识协议的 round 编号本质是退化版 Lamport 时钟
- [[raft]] —— term + log index 同样是退化版 Lamport，向量在多 leader 系统才用
- [[spanner]] —— 反命题：用物理 TrueTime 替代逻辑时钟，避开 O(N) 成本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chandy-lamport-1985]] —— Chandy-Lamport 1985 — 分布式系统不停机也能拍一张全家福
- [[crdt-shapiro-2011]] —— CRDT — 让多副本各改各的，最终自动合一
- [[hlc-2014]] —— HLC 2014 — 把逻辑时钟和物理时钟合一，让普通服务器也能拍一致快照
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[linearizability-1990]] —— Linearizability 1990 — 让并发对象看起来像一次只执行一个操作
- [[mattern-1989]] —— Mattern 1989 — 虚拟时间与全局状态：把分布式时钟变成 N 维笛卡尔积
- [[mills-ntp-1991]] —— NTP 1991 — 用四个时间戳和一棵服务器树，让全互联网的钟差几毫秒
- [[paxos]] —— Paxos — 分布式共识算法
- [[raft]] —— Raft — 易理解的共识算法
- [[sequential-consistency-1979]] —— Sequential Consistency 1979 — 多处理器内存模型的第一个正确性标准
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库

