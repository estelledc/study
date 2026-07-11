---
title: TLA — 把状态机和时序逻辑捏成一个公式
来源: Leslie Lamport, 'The Temporal Logic of Actions', ACM TOPLAS, Vol. 16, No. 3, May 1994
日期: 2026-05-30
分类: 分布式系统 / 形式化方法
难度: 中级
---

## 是什么

TLA（**Temporal Logic of Actions**，**动作的时序逻辑**）是 Leslie Lamport 在 1994 年提出的一套**用一条数学公式描述整个并发系统**的方法。

日常类比：你想拍一段连续剧的剧本。

- 传统状态机说："第 1 集人物是 A，第 2 集变 B" —— 只讲**画面**
- 传统时序逻辑说："最终某天人物会变 B" —— 只讲**时间**
- TLA 说："人物状态由这条规则决定，每一帧要么按规则跳，要么不变" —— 把**画面 + 时间** 写在同一句里

写出来形如：

```
Spec == Init ∧ □[Next]_vars ∧ Fairness
```

- `Init`：开机时变量是什么
- `Next`：每一步允许怎样改变量（一个**动作**，action）
- `□[Next]_vars`：从此以后，**每一步**要么按 Next 改，要么所有变量原地不动
- `Fairness`：保证某些动作不会被永远拖着不发生

整套 = 一个**逻辑公式**。系统就是这个公式，证明就是逻辑推演。

## 为什么重要

不理解 TLA 没法回答的问题：

- AWS 为什么敢说 DynamoDB / S3 的并发协议"上线前已穷举所有竞态"？答：他们用 **TLA+** 写规范、跑 TLC 模型检查
- MongoDB 副本集协议、Azure Cosmos DB 一致性等级、Intel 缓存一致性 —— 都在用 TLA+
- 为什么过去 30 年里**工业采用最广的形式化方法之一**是 TLA+，而不是更早的 CSP / Z notation / VDM？答：TLA 的"公式即系统、精化即蕴含"让数学和工程对得上

一句话：分布式协议肉眼读不出 race，TLA+ 让机器替你穷举。

## 核心要点

TLA 的设计哲学可拆 **四点**：

1. **动作（action）= 前后态的关系**。写 `x' = x + 1` 表示"下一步 x 比这一步多 1"。带撇号的是**后态**变量，不带撇号是**前态**变量。这一招把"状态机的迁移"翻译成"普通谓词逻辑公式"。

2. **□[A]_v = 永远要么做 A 要么不动**。`□` 是时序逻辑的"始终"。`[A]_v` 表示"动作 A 或者变量 v 不变"。这个"或者不变"叫 **stuttering（停滞）允许**——它让粒度无关：你把一个原子动作拆成两步实现，逻辑上仍等价。

3. **精化 = 蕴含**。"实现 Impl 满足规范 Spec" 在 TLA 里就是一句逻辑：`Impl ⇒ Spec`。这是 TLA 最漂亮的一招——同一种语言写规范、写实现、写"满足"。

4. **TLA+ = TLA + 集合论**。1994 论文只给逻辑核，1999 年 Lamport 加上 Zermelo-Fraenkel 集合论 + 模块化语法，造出工业用的规范语言 **TLA+**，配套工具 **TLC**（模型检查）和 **TLAPS**（证明）。

## 实践案例

### 案例 1：一个最小的 TLA+ 计数器

```
VARIABLE x
Init == x = 0
Next == x' = x + 1
Spec == Init ∧ □[Next]_x
```

**逐部分解释**：

- `Init`：开机时 x 必须是 0。
- `Next`：一步合法变化是"后态 x 比前态多 1"（`x'` 是后态）。
- `□[Next]_x`：从此以后每一步要么执行 Next，要么 x 不变（stuttering），所以实现里插入内部细节步也不破坏规范。

### 案例 2：用 TLA+ 描述一个简易的两进程互斥

```
VARIABLE pc1, pc2, turn
Init   == pc1 = "idle" ∧ pc2 = "idle" ∧ turn = 1
Enter1 == pc1 = "idle" ∧ turn = 1 ∧ pc1' = "crit" ∧ UNCHANGED ⟨pc2, turn⟩
Exit1  == pc1 = "crit" ∧ pc1' = "idle" ∧ turn' = 2 ∧ UNCHANGED pc2
Enter2 == pc2 = "idle" ∧ turn = 2 ∧ pc2' = "crit" ∧ UNCHANGED ⟨pc1, turn⟩
Exit2  == pc2 = "crit" ∧ pc2' = "idle" ∧ turn' = 1 ∧ UNCHANGED pc1
Next   == Enter1 ∨ Exit1 ∨ Enter2 ∨ Exit2
Mutex  == ¬(pc1 = "crit" ∧ pc2 = "crit")
```

**逐部分解释**：

- `turn` 像一把只能递给一个人的令牌；只有轮到自己才能 `Enter`。
- `UNCHANGED` 写明本动作不碰哪些变量，避免"偷偷改别人状态"。
- 把 `Spec` 和 `Mutex` 交给 **TLC**，它会枚举交错；若互斥被打破，会吐一条反例迹。

### 案例 3：AWS 怎么用 TLA+

Newcombe et al.（CACM 2015）描述 AWS 团队在 DynamoDB / S3 / EBS 上的实践：

- 工程师写 200–1000 行 TLA+ 规范
- 用 TLC 跑模型检查（数小时到数天，参数受限于状态空间）
- **多次发现纸面 review 没看出的并发 bug**——其中一个是 35 步深的反例，人脑根本走不到
- 落地结论："TLA+ 让我们敢做激进优化"

### 案例 4：精化的味道

写两份 TLA+ 规范：`HighLevel` 是粗粒度抽象，`LowLevel` 是真实实现。证明 `LowLevel ⇒ HighLevel` 即"实现满足抽象"。stuttering 允许让 `LowLevel` 比 `HighLevel` 多出"内部步"也无所谓。这就是 Lamport 在论文里反复强调的 **组合性**：你可以分层规范、分层证明。

## 踩过的坑

1. **TLA+ 不是编程语言**。规范不能直接编译成可执行代码，它是**数学描述**。要写代码还得另写，工程师要做"规范 ↔ 代码"双轨同步。
2. **状态空间爆炸**。TLC 是有限模型检查，参数稍大（10 个进程、消息缓冲 5）就跑不动；要会做**抽象**和**对称约简**。
3. **公平性是头号坑**。**弱公平**（weak fairness）：动作连续可发就一定发；**强公平**（strong fairness）：动作无限次可发就一定发。选错验证活性会假阴/假阳。
4. **集合论符号陡峭**。`∀ ∃ ∈ ⊆ ∪ CHOOSE`——工程师没数学背景容易第一周就劝退。**PlusCal** 是 Lamport 后来设计的"伪代码风格"前端，缓和这一关。
5. **stuttering 直觉反**。"每一步要么改要么不变"听起来是废话，其实是 TLA 让粒度无关、让组合性成立的命门。新人常忽略 `_v` 下标的意义。

## 适用 vs 不适用场景

**适用**：

- 分布式协议（共识、复制、租约、事务）—— 这是 TLA+ 的主场
- 并发数据结构（无锁队列、读写锁）的正确性验证
- 缓存一致性、内存模型
- 关键安全属性需要"穷举所有交错"才能放心的场景

**不适用**：

- 算法效率分析（TLA 不管时间复杂度）
- 数值/概率系统（需要 PRISM 这类概率模型检查）
- UI / 业务逻辑这种状态空间天文级又不需要严密保证的场景
- 团队完全没有形式化背景且没有时间投入学习成本的场景

## 历史小故事（可跳过）

- **1977 年**：Amir Pnueli 把时序逻辑引入计算机科学（图灵奖工作之一）
- **1989 年**：Lamport 'A Simple Approach to Specifying Concurrent Systems' 是 TLA 雏形
- **1990 年**：Abadi & Lamport 论文 'The Existence of Refinement Mappings' 解决精化的数学基础
- **1994 年**：本论文 TOPLAS 发表，TLA 完整成形
- **1999–2002 年**：Lamport 写《Specifying Systems》一书，定义 TLA+ 规范语言，造 TLC
- **2015 年**：Newcombe 等人 CACM 文章 'How Amazon Web Services Uses Formal Methods' 把 TLA+ 推向主流
- **2019 年起**：Apalache（基于 SMT 的符号模型检查器）让大规模规范变得可行

Lamport 这一生拿到 2013 年图灵奖，TLA 是奖词列出的核心贡献之一。

## 学到什么

1. **系统就是公式**——这是 TLA 最反直觉也最有力的洞见：规范、实现、"满足关系" 全部用同一种逻辑写
2. **stuttering 允许 = 粒度无关**：让"细化实现"和"抽象规范"自然兼容，是组合验证的关键
3. **机器穷举 > 纸面 review**：分布式协议 race 只有数小时模型检查能挖出来
4. **形式化方法的工业落地需要 30 年**：理论 1977，论文 1994，工业 2015——耐心很重要

## 延伸阅读

- 论文 PDF：[Lamport 1994 The Temporal Logic of Actions](https://lamport.azurewebsites.net/pubs/lamport-actions.pdf)（TOPLAS 原文，长，先扫前 10 页拿核心）
- 入门书：Lamport《Specifying Systems》（[免费 PDF](https://lamport.azurewebsites.net/tla/book.html)）
- 工业实践：Newcombe et al. 'How Amazon Web Services Uses Formal Methods'（CACM 2015，工程视角必读）
- 视频：Lamport TLA+ 视频课（[官网课程](https://lamport.azurewebsites.net/video/videos.html)，作者亲讲，节奏慢但权威）
- PlusCal：用伪代码风格写 TLA+ 的前端，新人推荐先学这个再回到原生 TLA+

## 关联

- [[paxos-1998]] —— Paxos 共识协议；Lamport 用 TLA+ 写过 Paxos 的规范
- [[paxos-simple-2001]] —— Paxos Made Simple；TLA+ 是这条家族同源工具
- [[lamport-1978]] —— Time, Clocks, and the Ordering of Events；Lamport 分布式系统时序观的起点
- [[hoare-logic]] —— Hoare 三元组；TLA 与 Hoare 都属于"程序对不对 = 逻辑命题"流派
- [[hindley-milner]] —— 同样是"机器替你做严格推导"的思想，但作用域是类型而非时序

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[afs-1988]] —— AFS 1988 — 客户端缓存 + 回调失效让分布式文件系统真正能扩展
- [[chandy-lamport-1985]] —— Chandy-Lamport 1985 — 分布式系统不停机也能拍一张全家福
- [[chapar-2016]] —— Chapar — 第一个被机器证明的因果一致 KV 存储
- [[coda-1990]] —— Coda 1990 — 笔记本拔网线照样写文件，重连后自动合并
- [[davis-putnam-1960]] —— Davis-Putnam 1960 — 让机器自动判断一堆逻辑式能不能同时成立
- [[dijkstra-1965]] —— Dijkstra 1965 — N 个进程怎么轮流上厕所而且谁也别卡死
- [[ethane-2007]] —— Ethane 2007 — 把企业网安全策略集中到一台中央电脑上
- [[flp-1985]] —— FLP 1985 — 一个坏节点就能让异步共识永不终止
- [[frangipani-1997]] —— Frangipani — 把分布式文件系统盖在共享虚拟磁盘上
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[ironfleet-2015]] —— IronFleet — 把分布式协议证到一行 bug 都没有
- [[jupiter-2015]] —— Jupiter Rising — Google 数据中心网络十年怎么做到带宽涨百倍
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[logoot-2010]] —— Logoot — 给每个字符发一张"永不过期的座位号"
- [[netkat-2014]] —— NetKAT 2014 — 把网络转发写成可以做数学等式变换的代数式
- [[nfs-1985]] —— NFS 1985 — 让远程磁盘看起来像本地磁盘
- [[openflow-2008]] —— OpenFlow 2008 — 把交换机的『分拣规则』搬到一台中央电脑上
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[paxos-simple-2001]] —— Paxos Made Simple — Lamport 用平直英语把共识协议推导一遍
- [[proverif-2001]] —— ProVerif — 把密码协议翻成 Prolog 规则让计算机自己证安全
- [[sel4-2009]] —— seL4 — 第一个被数学证明"代码和规范完全一致"的操作系统内核
- [[sequential-consistency-1979]] —— Sequential Consistency 1979 — 多处理器内存模型的第一个正确性标准
- [[tamarin-2012]] —— Tamarin — 让计算机自己证 Signal、TLS 1.3 这种带 DH 的协议是不是真安全
- [[tendermint-2016]] —— Tendermint — 把拜占庭共识塞进开放区块链的工程模板
- [[tla-yu-tlc-1999]] —— TLC — 让 TLA+ 规范可以一键机检的模型检查器
- [[verdi-2015]] —— Verdi — 在 Coq 里完整证明 Raft 协议的分布式系统验证框架
- [[vogels-eventual-2009]] —— Eventually Consistent 2009 — 给互联网规模存储一套'放弃强一致'的官方词汇
- [[why3-2013]] —— Why3 — 写一次程序规范，多个证明器一起来证

