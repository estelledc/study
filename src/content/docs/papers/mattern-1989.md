---
title: Mattern 1989 — 虚拟时间与全局状态：把分布式时钟变成 N 维笛卡尔积
来源: 'Friedemann Mattern, "Virtual Time and Global States of Distributed Systems", Parallel and Distributed Algorithms (North-Holland), 1989'
日期: 2026-05-30
分类: papers / 分布式系统
难度: 中级
---

## 是什么

Mattern 1989 是一篇 22 页的论文，它告诉我们：**分布式系统里"时间"不是一根数轴，而是 N 维空间里的一个偏序结构**（偏序 = 有的事件能比先后，有的比不了，像"谁先发朋友圈"不一定有总排名）。每个进程有自己的一格时钟，所有进程的时钟拼起来就是一个 N 维向量；整个系统的"全局状态"不是一张外部快照，而是 N 个本地状态拼成的**笛卡尔积**（像每人交一张自拍，再拼成合照——没有人站在外面按快门）。日常类比：[[lamport-1978]] 像把所有人的时间合并到同一根时间轴上排队；Mattern 把它换成 N 个时区——每个人在自己的时区前进，跨时区时只能"取大值合并"，永远没有真正的"统一现在"。

更具体地说：Mattern 与 [[fidge-1988]] 几乎同期独立提出 vector clock，但视角不同。Fidge 偏工程构造；Mattern 提出更抽象的 **virtual time** 框架——证明"谁先谁后"的因果偏序与 N 维向量偏序是**同构**的（两边一一对应、谁大谁小说的是同一件事），并把一致的全局状态形式化为**反链**（一组互不可比的本地状态，像合照里不能出现"信已寄出但对方还没收到"），把 [[chandy-lamport-1985]] 的一致快照解释成 virtual time 上的横截面。社区合称 "Fidge-Mattern vector clock"，教材讲全局状态时几乎都引 Mattern。

40 年过去，Dynamo 的 version vector、CRDT 的 dot、终止检测、分布式调试器的事件回放，都建立在这篇的 virtual time 抽象上。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么"分布式系统的全局状态"不是外部观察，而是要靠协议构造（[[chandy-lamport-1985]]）
- 为什么 consistent cut（一致截面）一定是 vector time 的**反链**——一组互不可比的本地状态
- 为什么 Lamport 1978 的整数时钟只能给出"必要条件"，必须升级成 N 维向量才能判定"真正并发"
- 为什么终止检测、死锁检测都用 vector clock 的"对角推进"思想

## 核心要点

Mattern 把分布式时间和状态拆成 **三层抽象**：

1. **virtual time = N 维向量偏序**：每个进程 i 维护向量 V_i，规则与 Fidge 一致——本地事件 V_i[i]+=1；发消息 piggyback 整个 V_i；收消息逐分量 max 后 V_i[i]+=1。关键定理：a→b ⟺ V(a)<V(b)（双向同构）。**类比**：把全序时间换成"每个进程一个独立时区"，跨时区只能取最大值同步。

2. **global state = N 个本地状态的笛卡尔积**：不存在"外部观察者看一眼"的全局快照，只有"每个进程报一个本地状态，拼起来"的 product。**类比**：拍集体合照不可能瞬间冻结全员，只能让每人各自定格再拼起来。

3. **consistent cut = 反链**：一组本地状态 (s_1, ..., s_N) 一致 ⟺ 任意 send 事件在某个 s_i 之前 ⟹ 对应 receive 事件在某个 s_j 之前。等价地，cut 在 vector time 上是反链（任两个事件互不可比）。**类比**：拍合照时不能"我已经把信寄出去了，但你还没收到"——这种状态是不一致的。

这三层加起来：**virtual time 给时间观，笛卡尔积给状态观，反链给一致性判据**。Chandy-Lamport 1985 的 marker 算法本质上就是在 virtual time 里走出一条反链。

## 实践案例

### 案例 1：用 vector time 判定 consistent cut

```python
def is_consistent_cut(local_states, all_messages):
    # local_states[i] = 进程 i 报告的本地状态（含 V_i 向量）
    for msg in all_messages:
        sender, receiver = msg.from_, msg.to
        # 如果 receive 已发生在 cut 内，send 也必须发生在 cut 内
        if msg.recv_event in local_states[receiver].history:
            if msg.send_event not in local_states[sender].history:
                return False
    return True
```

**逐部分解释**：
- `local_states[i]` 是进程 i 自报的本地状态，含到目前为止的事件历史
- 一致性判据正是 Mattern 论文 Section 4 的形式化定义
- 反过来用向量比较：cut = (V_1, ..., V_N) 一致 ⟺ V_i[i] ≥ V_j[i] 对所有 j——"我看到的我自己"不能比"别人看到的我"还少

### 案例 2：终止检测中的对角推进

Mattern 论文末尾给了用 vector time 做终止检测的草图。每个进程维护"我所见的全局虚拟时间"——把自己 V 向量 broadcast，所有人取 min：

```python
def detect_termination(all_V):
    # all_V[i] = 进程 i 最新报告的 V_i
    global_min = [min(all_V[i][k] for i in range(N)) for k in range(N)]
    # 若 global_min == 上一轮 global_min 且无未决消息 → 终止
    return global_min == previous_min and no_pending_messages()
```

**逐部分解释**：
- 取 min 而非 max：像看水库**最低水位线**——只有所有进程都走过的高度才算"全局已完成"
- "水位不再上升 + 无消息在途" ⟹ 系统终止——Mattern 框架下稳定属性检测的范式

### 案例 3：与 Chandy-Lamport snapshot 的关系

```python
# Chandy-Lamport 算法在 virtual time 上的解读
def chandy_lamport_to_cut(snapshot):
    # 每个进程在收到 marker 的瞬间记录本地状态 s_i
    # 这些 s_i 在 vector time 上恰好构成一条反链
    cut = [snap.local_state for snap in snapshot]
    assert is_consistent_cut(cut, snapshot.messages)
    return cut
```

**逐部分解释**：
- marker 协议的目的就是构造 virtual time 上的一条反链
- in-flight 消息对应反链"上方"未到的 receive 事件——通道日志记录的就是这部分
- 这就是 Mattern 论文给的统一解释：snapshot 算法 = 在 virtual time 上构造一致截面

## 踩过的坑

1. **把 vector time 当全序**：vector time 是 partial order，两个事件可能不可比（V(a) 和 V(b) 各有严格大于）。误用 < 比较会触发 panic。Mattern 论文专门强调这一点，Lamport 整数时钟用 < 永远成立，vector 不行。

2. **把 global state 当外部视角**：分布式系统没有"上帝视角"。Mattern 严格定义 global state = product of local states，必须由协议构造。把它误解为"某个监控服务看到的瞬间"会让所有快照算法失去意义。

3. **把任意 cut 当一致 cut**：随便取每个进程一个本地状态拼起来不一定一致——可能出现"receive 已发生但 send 未发生"。Mattern 给出的反链判据是判定一致性的**充要条件**。

4. **进程数 N 必须固定且已知**：与 Fidge 一样的工程问题。动态加入/退出会让向量长度变化，比较失效。工业实现要么写死 N（早期 Dynamo），要么用 ITC（Interval Tree Clock）/ Dotted Version Vector。

5. **Mattern vs Fidge 的引用混乱**：两人 1988-1989 独立发表，算法等价。社区有人只引 Fidge、有人只引 Mattern、有人合引。读教材时遇到 "vector clock"，三种引法都可能见到，知道是同一思想就行。

## 适用 vs 不适用场景

**适用**：
- 需要"全局状态" / "一致快照" 概念的算法（终止检测、死锁检测、检查点恢复）
- 需要精确判定 a→b / a‖b 的因果追踪（[[crdt-shapiro-2011]]、causal consistency 数据库）
- 分布式调试器、事件回放系统——virtual time 给"重放某一时刻"提供精确语义
- 教学场景——比 Fidge 论文更系统，更能讲清 partial order 和 global state 的关系

**不适用**：
- 进程数动态变化（用 ITC / DVV / Bloom Clock）
- 超大规模集群（O(N) 向量太贵，可降级成 [[lamport-1978]] + 牺牲并发判定）
- 需要绑定真实物理时间（用 [[spanner]] TrueTime 或 HLC）
- 跨数据中心强一致事务（共识协议 [[raft]] / [[paxos]] 才够）

## 历史小故事（可跳过）

- **1978 年**：Lamport 给出逻辑时钟与 happens-before 偏序，但只能判必要条件
- **1985 年**：Chandy 与 Lamport 给出 marker snapshot 算法（[[chandy-lamport-1985]]），但当时缺一个"时间观"来统一解释
- **1988 年**：Colin Fidge 在 ACSC 11 给出 N 维向量时间戳，证明双向同构
- **1989 年**：Mattern 在 Parallel and Distributed Algorithms 上给出 virtual time + global state + consistent cut 的系统框架——这正是本篇
- **1994 年**：Schwarz & Mattern 综述 "Detecting causal relationships in distributed computations" 把 vector clock 变种统一在 virtual time 框架下
- **2007 年**：Dynamo 把 version vector 推到工业，购物车合并是标志案例
- **2010s**：CRDT 与 causal consistency 数据库（COPS, Bolt-on）让 virtual time 抽象成为分布式数据库标配

## 学到什么

1. **时间在分布式里是 partial order，不是 total order**——这是 Lamport 1978 的洞见，Mattern 把它升级为可判定的双向同构
2. **全局状态不是观察出来的，是构造出来的**——笛卡尔积 + 反链是构造规则，没有"外部观察者"
3. **抽象的力量**：Mattern 把 vector clock 从"工程协议"提升到"time-domain"层面，让后续所有算法（snapshot、终止检测、debugger）有共同语言
4. **同时期独立发现**：Fidge 与 Mattern 独立给出同一思想，说明"加个向量"是因果建模的自然下一步——但抽象框架的价值会更长久

## 延伸阅读

- 论文 PDF：[Mattern 1989](http://courses.csail.mit.edu/6.852/08/papers/Mattern.pdf)（22 页，配 [[fidge-1988]] 一起读最完整）
- 综述：Schwarz & Mattern, "Detecting causal relationships in distributed computations: in search of the holy grail"（1994）——把所有 vector clock 变种统一
- 视频：[Martin Kleppmann — Distributed Systems Lecture 5](https://www.youtube.com/watch?v=4VfPcCZuVmI)（讲 vector clock 与 causality）
- 后续：[[crdt-shapiro-2011]] —— OR-Set / RGA 等数据结构如何嵌入 version vector
- 教材：Tanenbaum-Steen 《Distributed Systems》第 6 章 Synchronization 整章基于 Mattern 框架

## 关联

- [[lamport-1978]] —— 前置工作，单整数全序时钟；Mattern 把它升级为 N 维向量偏序
- [[fidge-1988]] —— 同期独立工作，算法等价；Fidge 偏工程论证，Mattern 偏 virtual time 抽象
- [[chandy-lamport-1985]] —— 一致快照算法；Mattern 给它一个时间-domain 解释（snapshot = virtual time 反链）
- [[crdt-shapiro-2011]] —— OR-Set / MV-Register 直接以 dot（向量一格）标识每次操作
- [[paxos]] —— 不依赖 vector clock，但共识协议的 round 编号本质是退化版 Lamport 时钟
- [[raft]] —— term + log index 同样是退化版 Lamport，向量在多 leader 系统才用
- [[spanner]] —— 反命题：用物理 TrueTime 替代逻辑时钟，避开 O(N) 成本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chandy-lamport-1985]] —— Chandy-Lamport 1985 — 分布式系统不停机也能拍一张全家福
- [[crdt-shapiro-2011]] —— CRDT — 让多副本各改各的，最终自动合一
- [[fidge-1988]] —— Fidge 1988 — 给每个进程一份"账本向量"，让因果关系变成可判定
- [[hlc-2014]] —— HLC 2014 — 把逻辑时钟和物理时钟合一，让普通服务器也能拍一致快照
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[mills-ntp-1991]] —— NTP 1991 — 用四个时间戳和一棵服务器树，让全互联网的钟差几毫秒
- [[paxos]] —— Paxos — 分布式共识算法
- [[raft]] —— Raft — 易理解的共识算法
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库

