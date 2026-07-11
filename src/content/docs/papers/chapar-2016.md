---
title: Chapar — 第一个被机器证明的因果一致 KV 存储
来源: 'Lesani, Bell, Chlipala, "Chapar: Certified Causally Consistent Distributed Key-Value Stores", POPL 2016'
日期: 2026-05-31
分类: 形式化方法
难度: 中级
---

## 是什么

Chapar 是一个 **Coq 框架**，里面**机器证明**了两个分布式 KV 存储算法**真的满足因果一致性**。日常类比：以前论文里一句话「我们的算法满足因果一致性」靠人肉相信；Chapar 把这句话变成一份**机器替你检查过的数学证明**，每一步都可以重放。

「因果一致性」是分布式存储的一种保证：如果你先发"小明生日"再发"祝小明生日快乐"，不能让别人先看见"快乐"再看见"生日"。中间发生过什么因果链，**所有副本都必须按这个顺序看到**。这比线性化（强一致性）弱，但比"最终一致"强很多——它**保证了和因果有关的顺序，不要求和因果无关的顺序**。

Chapar 不止证了一个，而是证了**两个**实现，并附带一个**可以直接抽取成 OCaml 程序、真能跑**的产物。

## 为什么重要

不理解 Chapar，下面这些事都没法连起来：

- 为什么 2015-2016 是「分布式系统形式化验证」的爆发年——Verdi、IronFleet、Chapar 三篇同期把"分布式系统也能机器证明"立住
- 为什么后来的 CRDT、最终一致性、混合一致性论文动不动就 cite Chapar——它给了**一致性模型抽象语义 + 具体实现 refinement** 的范式
- 为什么 Coq 不再只能证编译器（CompCert）——分布式协议这种「消息乱序+并发」也驯服了
- 为什么"会写一致性模型"和"会证一致性"中间隔了 30 年——前者 1990 年代就有了（Ahamad 等），后者要等证明助理足够好
- 为什么"测试 + jepsen 跑一万次"还不够——只有证明能告诉你「在所有可能的乱序下都对」

## 核心要点

Chapar 的招式可以拆成 **三层**：

1. **两套语义**：写一个**抽象语义**（按因果顺序原子地把 put 应用到全局状态——这就是因果一致性的"应该是什么样"），再写一个**具体语义**（实际算法发消息、维护本地副本、用向量时钟决定能不能 deliver）。

2. **forward simulation 模拟证明**：证明具体语义跑出来的每一条 trace，都对应抽象语义的某条 trace。类比：电影替身演员每个动作必须能映射到主角同时刻的某个动作。这一步是 Chapar 的核心证明负担。

3. **OCaml 抽取 + 客户端 logic**：Coq 把验证过的实现自动翻译成可执行 OCaml 代码；同时配一套程序逻辑，让你**写跑在这个 KV 上的客户端**也能被证明对。

整个 Coq 开发**约 5000 行**。

## 实践案例

### 案例 1：因果一致性看起来容易，写错很容易

朴素想法：「每次 put 带个时间戳，按时间戳排序就行」。问题：**时钟不同步**。改用 Lamport 时间戳？**因果序还是丢**——两个无因果关系的 put 可能被强制排序。Chapar 用**向量时钟**：每个副本记一个数组 `[node1 计数, node2 计数, ...]`，每次 put 把自己那一格 +1，发消息时附带整个向量。**deliver 时检查所有因果前驱都到了才应用**。

举个具体场景，三个副本 A / B / C：

```
A: put(x, 1)              本地向量 [1,0,0]，发消息给 B、C
B: 收到 [1,0,0]，应用      本地向量 [1,0,0]
B: put(y, A 看见 1)        本地向量 [1,1,0]，发消息给 A、C
C: 先收到 B 的 [1,1,0]     →  发现自己向量 [0,0,0] 落后，**不能立刻 deliver**
C: 等到 A 的 [1,0,0] 到了   再 deliver B 的消息，因果序保住
```

证明的难点：副本 A 的本地向量时钟 + 收到的消息 = 全局因果历史的某个一致前缀。这个不变式要在每条 trace 上都成立，**Chapar 用 Coq 强制把每个分支都走一遍**。

### 案例 2：抽取出的代码真的能跑

```
Coq 源码 (Lesani-Bell-Chlipala 写)
  ↓ Coq 自带 Extraction 命令
OCaml 源码 (机器翻译)
  ↓ ocamlfind / dune 编译
可执行二进制
  ↓ 部署到三台机器
真实跑起来的因果一致 KV
```

**意义**：以前形式化验证的分布式协议大多停在"证明 + 伪代码"，Chapar 把"证明 → 可运行代码"打通了。

### 案例 3：客户端程序也被证明

Chapar 给了一套**程序逻辑（Hoare 风格）**，让你在 KV 上面写客户端时，也能证「这段代码不可能看到违反因果的状态」。

例子（论文里给的）：购物车应用——加商品和清空购物车的因果序不能颠倒，否则用户会"清空了又看见加进去"。这个属性可以在 Chapar 的 logic 里被机器证明出来。

类比：以前你只能担保"地基没问题"，Chapar 让你也能担保"盖在地基上的房子不会塌"——证明边界从协议本身延伸到了上层应用。

## 踩过的坑

1. **抽象语义不是越简单越好**：太简单的抽象（比如「只要最终收敛」）证不出客户端要的属性；太复杂的抽象证明负担爆炸。Chapar 的抽象选了「**按因果原子应用**」这个中间点。

2. **forward simulation 不是 backward**：一开始想用反向模拟（每条抽象 trace 找对应具体 trace），实操中 forward 简单得多。论文这一步选择影响了后续所有同类工作。

3. **向量时钟的元数据成本**：标准向量时钟每个 put 带一份 O(N) 大小的向量，N = 副本数。Chapar 的第二个实现做了优化（裁剪 + 合并），但**优化版的证明比朴素版难得多**，付出的工作量是原版的两倍。这是个普遍规律：**优化几乎总是让证明变难**。

4. **抽取出的 OCaml 不快**：Coq 抽取是为了正确性，不是性能。论文也承认抽取版只是 demo，工业用还得手写并对照证明。

5. **不是所有客户端属性都能在 Chapar 里证**：依赖"实时性"或"地理副本布局"的属性超出 Chapar 的语义边界——它只刻画因果序，不刻画延迟和拓扑。

6. **没处理副本动态加入/退出**：论文的语义假设副本集合静态固定。现实系统要扩缩容，这部分需要后续工作（如 reconfiguration 协议）补上。

## 适用 vs 不适用场景

**适用**：
- 想给一个一致性模型（CC、CC+、RYW、单调读）写形式化定义
- 想证明一个新分布式协议「真的满足某种一致性」
- 教学：让学生看明白「证明协议」长什么样
- 后续研究的脚手架——CRDT 验证、混合一致性、事务证明都建在它上面
- 给现有 KV 存储（Cassandra、Riak、Cosmos DB 的 CC 等级）做对照分析

**不适用**：
- 工业生产环境（抽取代码性能不够）→ 用证明指导手写实现
- 强一致性（线性化）→ 需要不同的证明技术（IronFleet 那一脉更合适）
- 拜占庭故障 → Chapar 假设节点不作恶
- 不会 Coq 的工程师 → 学习曲线陡，先学 Software Foundations
- 网络分区分析（CAP 取舍）→ Chapar 不刻画分区，需要另配假设

## 历史小故事（可跳过）

- **1990 年**：Ahamad 等定义"因果一致性"，纯论文，无机器验证
- **2011 年**：COPS（Lloyd 等）实现真实因果一致 KV 存储，工程上立住，但没有形式化证明
- **2014-2015 年**：Verdi (Wilcox 等) 用 Coq 证 Raft 共识——告诉大家分布式系统能被机器证明
- **2015 年**：IronFleet (微软) 用 Dafny 证多 Paxos 协议，规模更大
- **2016 年 1 月**：Chapar 在 POPL 出现，把范式从"共识协议"扩展到"一致性模型 + KV 存储"
- 之后：Disel (POPL 2018)、Verified CRDT、Gotsman 等混合一致性证明一脉传承

Chapar 的名字来自波斯语"信使"，呼应"消息传递"主题。第一作者 Mohsen Lesani 后来去了 UC Riverside，继续做 CRDT 和事务证明。

## 学到什么

1. **一致性模型可以被精确写成抽象语义**——以前模糊的"因果序"在 Chapar 里就是 Coq 里的 inductive 关系
2. **forward simulation 是分布式协议证明的主力工具**——比反向、比二元关系都好用
3. **抽取代码的价值不在性能，而在"它真的能跑"**——证明和实现之间的鸿沟少一道
4. **2015-2016 是机器证明分布式系统的临界点**——Coq、Dafny、F* 的工业可用度同时跨过门槛
5. **5000 行 Coq 是奠基论文的体量参考**——比 CompCert 小一个量级，但已足够把范式立住

## 延伸阅读

- 论文 PDF：[Chapar POPL 2016](https://lambda.uta.edu/popl16/chapar.pdf)
- 项目主页：[MIT PLV — Chapar](http://plv.csail.mit.edu/chapar/)
- 综述：[Burckhardt — Principles of Eventual Consistency](https://www.microsoft.com/en-us/research/publication/principles-of-eventual-consistency/)（理解 Chapar 抽象语义来自哪一脉）
- 同期对手：Wilcox 等，Verdi (PLDI 2015) 证 Raft；Hawblitzel 等，IronFleet (SOSP 2015) 证 Paxos
- 教材：[Software Foundations 第 3-5 卷](https://softwarefoundations.cis.upenn.edu/) — 学完才能读 Chapar 源码
- 历史动机：[Ahamad 等 1990 — Causal Memory](https://www.cs.utexas.edu/users/lorenzo/corsi/cs380d/papers/p114-ahamad.pdf)（Chapar 抽象语义的精神来源）
- 后继：[Disel POPL 2018](https://ilyasergey.net/papers/disel-popl18.pdf)（把 Chapar 的思想推进到完整的会话类型 + 协议组合）

## 关联

- [[bayou-1995]] — 最终一致性 KV 的开山之作；Chapar 给它的一致性模型补上了机器证明
- [[sequential-consistency-1979]] — Lamport 1979 顺序一致性；因果一致性是它的弱化
- [[lamport-tla-1994]] — TLA+ 也能写一致性规范，但靠模型检查不靠定理证明
- [[bernstein-1981-cc]] — 经典并发控制；Chapar 的"原子应用"思想可追溯到这里
- [[hoare-logic]] — Chapar 客户端 logic 的祖宗
- [[stainless-2017]] — 同样是「Coq/Dafny 类」证明工程的代表作
- [[isabelle-hol-2002]] — 平行的另一种工业证明助理生态；选 Coq 还是 Isabelle 是分布式证明社区的长期话题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
