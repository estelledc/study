---
title: IronFleet — 把分布式协议证到一行 bug 都没有
来源: Hawblitzel et al., "IronFleet — Proving Practical Distributed Systems Correct", SOSP 2015
日期: 2026-05-31
分类: 分布式系统
难度: 高级
---

## 是什么

IronFleet 是微软研究院 2015 年的一项工作：**把一个完整的 Multi-Paxos 复制状态机和一个分片 KV 存储，从顶层规约一直到可执行代码，全部用数学证明走通**。

日常类比：**盖楼前先把『这楼能扛 8 级地震』这一行字写在图纸最上层；每张更细的施工图都要数学证明"我没违反这行字"；最后施工队按底层图施工——这栋楼数学保证不会塌**。

IronFleet 做了两个系统：

- **IronRSL**：一个 Multi-Paxos 复制状态机，支持视图变更、日志压缩、批处理
- **IronKV**：一个分片键值存储，支持 reshard

两个都从最抽象的"看它像什么"一路证到 C# 可执行二进制。

## 为什么重要

不理解 IronFleet，你很难解释下面这些事：

- 为什么 2015 年之前**没有**完整可执行的、被数学证明无 bug 的 Paxos 实现
- 为什么 Lamport 的 TLA+ 只能"模型检查到一定深度"，而 IronFleet 能"证到任意状态"
- 为什么后续 Verus / Anvil / Verdi 都要回头引用这篇——它把"分布式精化"的工程模板定下来了
- 为什么"我代码经过测试"和"我代码被证明"在分布式场景下天差地别——并发交错让测试空间爆炸

## 核心要点

IronFleet 的方法叫**精化**（refinement），可以拆成 **三层金字塔**：

1. **顶层规约（High-level spec）**：用 TLA 风格写"这系统对外像什么"。比如 IronRSL 顶层就一句话——"它等价于一台不会崩的机器"。

2. **协议层（Distributed protocol）**：写出 Multi-Paxos 状态机，每个节点能执行什么动作。证明：协议层的每一步行为，都是顶层那台"不崩的机器"某一步行为的合法实现。

3. **实现层（Implementation）**：写真正能跑的 Dafny 代码，编译成 C#。证明：实现的每一步，都是协议层某一步的合法实现。

三层叠起来，传递性给出："实现 → 顶层规约"。**只要你信顶层那一行字，你就信这堆代码**。

关键工具：

- **Dafny**：微软的验证语言，代码和规约写在一起，SMT 求解器自动尝试证明
- **I/O reduction**：把 send / 本地计算 / receive 折叠成一个原子 host step，让证明不必推线程交错
- **Always-eventually 时序逻辑**：同时证 safety（坏事不发生）和 liveness（好事终将发生）——后者在 2015 年是首次

## 实践案例

### 案例 1：顶层规约长什么样

IronRSL 的顶层规约（简化）：

```dafny
datatype Service = Service(state: AppState, requests: seq<Request>)

predicate ServiceNext(s: Service, s': Service)
{
    exists req :: req in s.requests &&
        s' == Service(Apply(s.state, req), s.requests - {req})
}
```

读法："系统状态就是一个 app state + 一队请求；下一步要么是把队里某条请求执行掉，得到新 state"。**没有节点、没有网络、没有 leader**——抽象到极致。

### 案例 2：协议层怎么"匹配"顶层

协议层有几十个节点、消息、日志条目。但 IronFleet 证明：

```
forall protocol_state, protocol_next:
    if protocol_step(protocol_state, protocol_next) then
        exists service_step:
            service_next(abstract(protocol_state), abstract(protocol_next))
            或   abstract(protocol_state) == abstract(protocol_next)  // stutter
```

读法："协议每走一步，要么对应顶层走一步，要么对外看不出区别（比如内部消息往返）"。这叫 **simulation relation**。

### 案例 3：性能代价

论文评测（三副本、批处理开/关对比 EPaxos 仓库里的 Go MultiPaxos）：

| 指标 | IronRSL | 未验证 Go 基线 |
|------|---------|----------------|
| 峰值吞吐 | 最高约 18200 req/s | 同设置下约 2.4× 以内更快 |
| 证明负担 | 整体标注约 7.7:1（去掉 liveness ≈ 5.4:1）；实现层 ≈ 3.6:1 | 无证明标注 |

慢在同数量级（约 2.4×），不是数量级崩盘；代价主要来自可验证数据结构、C# 运行时、以及每个优化都要再证一遍。**证明标注远多于实现**——这个比例至今是工业落地的最大障碍。

## 踩过的坑

1. **Dafny 自动化在 quantifier 多的地方不稳**：`forall x: ...` 一多，SMT 求解器要么超时要么乱猜，必须手写 trigger 提示。团队后期一半时间在调 trigger。

2. **liveness 证明工程量远大于 safety**：safety 通常一个不变式就 OK，liveness 要构造 well-founded ordering（每一步在某种度量上"前进"），抽象等级再上一层。

3. **顶层规约本身可能写错**：IronFleet 的顶层规约不到 100 行，但仍出现过"规约漏写一种情形"。**论文坦白：他们的工具只保证『代码满足规约』，不保证『规约写对了』**——还得靠人 review。

4. **I/O reduction 不是免费**：要证 host 的局部动作可以折叠，必须证明这些动作之间没有外部可见副作用。每加一个新动作都要重证一次。

## 适用 vs 不适用场景

**适用**：

- 协议本身已经稳定（Paxos / Raft / 2PC）想要彻底无 bug
- 系统对正确性极敏感（区块链共识、关键设施）
- 团队愿意接受约 3.7 人年量级的验证投入，以及约 2–3× 的性能差距

**不适用**：

- 协议还在快速迭代——每改一行规约可能要重写大量证明
- 拜占庭故障场景（IronFleet 假设 fail-stop）
- 需要利用底层硬件 unsafe 优化的高性能系统
- 中小团队（论文合计约 3.7 人年，短期难摊）

## 历史小故事（可跳过）

- **2010 年**：Hawblitzel / Howell 等人在微软做 Verve（验证微内核），尝到 Dafny 甜头
- **2013 年**：组里讨论"能不能验一个真正分布式的协议"——不只是模型检查 TLA+，要可执行
- **2014–2015**：IronFleet 项目，3.7 人年完成。论文标题刻意叫 "Practical"——和当时大多数验证工作的 toy 例子拉开距离
- **2017 年**：同组的 Komodo / Ironclad 把同样方法用到加密协议、enclave
- **2023 年**：Verus（Rust 上的 Dafny 后继）继承这套精化方法，但试图把比例降下来

## 学到什么

1. **精化是分布式验证的主轴**：抽象 → 协议 → 实现，三层每层都证；这是把"端到端正确"拆成可处理的工程问题的唯一已知方法
2. **safety 容易，liveness 难**：safety 一个 invariant，liveness 要 well-founded measure，是另一个数量级
3. **证明标注 ≫ 实现是当前工业边界**：论文整体约 7.7:1；后续 Verus / Anvil 等项目的核心目标之一就是把这个比例压下来
4. **被证明 ≠ 没 bug**：规约写错、I/O 模型不对、TCB（trusted base，Dafny 自身 + 编译器）有 bug，仍可能有故障
5. **"6 个 9 的可用性"和"被证明的可用性"是两件事**：前者是观察统计，后者是数学保证；IronFleet 是首次让分布式系统拿到后者

## 延伸阅读

- 论文 PDF：[IronFleet SOSP 2015](https://www.microsoft.com/en-us/research/wp-content/uploads/2015/10/ironfleet.pdf)
- 项目仓库：[GitHub: microsoft/Ironclad](https://github.com/microsoft/Ironclad)
- Dafny 教程：[Dafny tutorial](https://dafny.org/dafny/OnlineTutorial/guide)
- 后续工作 Verus：[Verus — Rust verification](https://github.com/verus-lang/verus)
- [[paxos-1998]] —— IronFleet 验证的协议主体
- [[lamport-tla-1994]] —— 顶层规约用的时序逻辑
- [[dafny-2010]] —— IronFleet 用的验证语言
- [[tla-yu-tlc-1999]] —— TLC 模型检查器，IronFleet 的"前辈"，但只能查有限深度

## 关联

- [[paxos-1998]] —— 被验证的核心协议
- [[paxos-simple-2001]] —— Lamport 的"白话版" Paxos，IronRSL 顶层规约的灵感
- [[lamport-tla-1994]] —— 顶层规约语言的祖师爷
- [[tla-yu-tlc-1999]] —— 模型检查 vs 定理证明，IronFleet 走后者
- [[dafny-2010]] —— 实现工具
- [[byzantine-generals-1982]] —— IronFleet 不处理拜占庭，但它是分布式正确性话题的基石
- [[raft]] —— 同期的"易理解"共识协议；IronFleet 选了更难证的 Multi-Paxos
- [[isabelle-hol-2002]] —— 另一条验证路线（更高阶但自动化少）
- [[vcc-2009]] —— 微软早期 C 验证器，Dafny 的前身
- [[verisoft-2008]] —— 同期德国微内核验证项目，规模相近但目标不同
