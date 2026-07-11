---
title: Bayou — 离线先改本地，再回来和别人合并
来源: Terry et al., "Managing Update Conflicts in Bayou", SOSP 1995
日期: 2026-05-31
分类: 分布式系统
难度: 中级
---

## 是什么

Bayou 是 1995 年 Xerox PARC 做的一个**会"和好"的分布式存储系统**。日常类比：你和同事各自带着笔记本出差、各自改同一个共享日历，回到办公室后系统会自动帮你们把所有改动**合并**到一起，不用谁去手动对账。

它解决一个具体场景：移动设备经常断网，每个人在本地改自己的副本，**改完立刻能看见**；等某天两台设备碰到 WiFi，再把彼此的改动同步、合并，最终所有人看到同一份结果。

这套思路是今天 **Notion 离线编辑、Linear 乐观更新、Git 分布式提交** 的精神祖先。论文把"应用程序员定义合并规则"和"系统保证最终收敛"两件事第一次清晰地分开——这个分工至今没有更好的替代。

## 为什么重要

不理解 Bayou 的话，下面这些事都说不清：

- 为什么 Notion 断网时还能改文档，回到网上几秒就同步好——这就是 Bayou 的 tentative 写入
- 为什么 Linear 点完按钮 UI 立刻变绿，偶尔几秒后又"撤销"——这是 server 拒绝写入后回滚
- 为什么 Dynamo / Cassandra 这些 NoSQL 都用 vector clock + anti-entropy——直接抄的 Bayou
- 为什么 CRDT（[[crdt-shapiro-2011]]）会出现——大家发现 Bayou 那种"应用程序员手写合并代码"太累，要用数学结构替代

## 核心要点

Bayou 的世界观可以拆成 **三个机制**：

1. **每次写入自带"合并说明书"**：传统数据库写入只是 `UPDATE table SET ...`。Bayou 的写入是三件套：
   - `dependency_check`：一个谓词，判断"我希望的前提条件是否还成立"
   - `update`：要做的修改本身
   - `mergeproc`：如果前提不成立，怎么合并/退让

2. **写入分两层：tentative → committed**：你在本地的写入立刻可见但叫 **tentative**（暂定），可能会被回滚重排；只有被 **primary server**（指定的那台 server）盖章打号后才变 **committed**（敲定，不会再变）。

3. **anti-entropy（反熵）协议**：两台 server 相遇时，互相对照 version vector（"我看过哪些写入"清单），把对方没见过的写入传过去。最终所有 server 的写入序列收敛到一致——**最终一致性** 这个词的最早工业化版本之一。

补充一个常被忽略的设计点——**写入是日志（log），不是覆盖**。每次写入是 append，永不丢弃。这样回滚 tentative、重排序、anti-entropy 重放都只是在日志上重新走一遍。这个"log 是真相，state 是物化视图"的思路后来被 Kafka / Event Sourcing / CRDT 反复采用。

## 实践案例

### 案例 1：会议室预定 app

经典论文例子。三件套写法（伪代码）：

```
dependency_check: SELECT * FROM rooms
                  WHERE room='B1' AND time='14:00' AND status='free'
update:           INSERT booking (room='B1', time='14:00', user='Alice')
mergeproc:        if check 失败 → 找下一个空时段，重写 update
```

场景：Alice 和 Bob 都离线，**同时**预定 B1 房间 14:00。

- Alice 设备本地写入：dependency_check 通过（本地看到空），插入 booking → tentative
- Bob 设备本地写入：dependency_check 通过（本地也看到空），插入 booking → tentative
- 两人回到公司 → anti-entropy 把双方写入交换给 primary server
- primary 按 CSN（commit sequence number）顺序串行 apply：
  - Alice 的写入先到 → check 通过 → 14:00 给 Alice
  - Bob 的写入再到 → check **失败**（14:00 已占）→ 触发 mergeproc → 自动改成 15:00
- 最终：Alice 14:00、Bob 15:00，**没人手动介入**

### 案例 2：今天的 Notion 离线编辑

```
你离线打开 Notion → 改了 3 段文字 → 关电脑
（这 3 段写入是 tentative，存在本地 IndexedDB）
你回到 WiFi → Notion client 把 3 段写入推到 server
若期间无人改这几段 → 直接 commit（CSN 分配）
若同事也改了 → server 用 OT/CRDT 算法合并
```

Notion 没用 Bayou 的 mergeproc，换成了 CRDT，但 **tentative→committed** 的两层结构是 Bayou 教的。Linear 走得更远——所有写入先在 client 端 apply，**乐观更新**让 UI 在 50ms 内反馈，server 异步确认。这种"延迟容忍 + 本地立刻可见"的体验，本质就是 Bayou 1995 年定下的范式。

### 案例 3：Git 是 Bayou 的精神兄弟

```
git commit         → 本地 tentative（任何人本地都能 commit）
git pull / push    → anti-entropy（两台机器交换 missing commits）
git merge conflict → 触发 mergeproc（你手动合并）
git push 被拒      → 类似 dependency_check 失败
```

Git 1995 年还没出现（2005），但思路完全同源——**让本地先改，再设计合并机制**。区别在 Git 走得更激进：**没有 primary**、所有节点平权、合并冲突时把决策完全交给人。Bayou 还保留了 primary 的权威，是"半中心化"。

## 踩过的坑

1. **mergeproc 要应用程序员手写——心智负担巨大**：会议室例子简单，但日历重叠、文档段落合并、库存扣减各有各写法。这是后来 CRDT 出现的直接动机——用数学结构（G-Counter、LWW-Set）代替手写。

2. **primary 是单点**：primary 挂掉时虽然 tentative 写入还能继续，但**没人能给它们打 CSN**，永远停在 tentative。论文承认这是限制，建议用 Paxos 选举新 primary（[[paxos-1998]]）。

3. **tentative 闪烁体验差**：UI 上显示"已预定 14:00"，几秒后变成"15:00"——用户困惑。现代系统用乐观锁定 + 预测性 UI 来缓解，但根因没消失。

4. **anti-entropy 流量在大集群爆炸**：两两同步是 O(N²)。论文场景是几台到几十台 server，扩到几百台时需要 gossip 协议（Dynamo 用的）替代。

5. **session guarantees 不是免费的**：论文同期提出四种保证（read-your-writes / monotonic-reads / monotonic-writes / writes-follow-reads），但实现要求客户端保存 read/write set 元数据，跨设备切换时还要带过去。今天大多数离线 app 实际只做最弱的 read-your-writes。

## 适用 vs 不适用场景

**适用**：
- 移动/离线优先 app（Notion / Linear / Obsidian Sync / Apple Notes）
- 弱网络 + 高可用要求（CAP 选 AP，详见 [[brewer-cap-2000]]）
- 应用语义可定义合并规则的场景（日历、库存、协作文档）
- 端侧软件（local-first），数据归用户、云只是备份

**不适用**：
- 银行转账类强一致需求 → 用 Paxos / Raft（[[raft]]）
- 合并规则极复杂或不存在的数据 → 用强一致 + 离线提示
- 副本数极大（千台以上） → 用 gossip + CRDT，Bayou 原生不扩展
- 写多读少且冲突高频的场景 → mergeproc 频繁触发，体验受损

## 历史小故事（可跳过）

- **1989-1992**：Coda（CMU）首次提出"断连操作"概念，但冲突解决留给文件系统层粗粒度处理
- **1995**：Bayou 团队（Terry / Demers / Petersen 等）在 SOSP 发表此文。他们注意到 Coda 的不足，提出**应用语义级别**冲突解决
- **1996**：Jim Gray 写《The Dangers of Replication and a Solution》警告"无主复制 + 异步合并"会让冲突率随节点数平方增长。Bayou 是被点名的代表，但作者反驳"应用语义可控"
- **2007**：Amazon Dynamo 论文出现，明确说 anti-entropy + vector clock 来源是 Bayou
- **2011**：CRDT 论文（[[crdt-shapiro-2011]]）发表，用数学结构替代 Bayou 的手写 mergeproc
- **2010s 之后**：Notion / Linear / Figma 一代离线优先 app 全面采用 tentative→committed 两层模型
- **2020s**：Local-first software 运动（Ink & Switch）把 Bayou 的哲学重新包装成一种产品价值观

## 学到什么

1. **离线优先不是技术问题，是设计哲学**：Bayou 选的是"让本地先改，全局再协调"，整个 UI / 数据 / 网络模型都围绕这个转
2. **冲突无法消除，只能定义解决规则**：Bayou 的贡献是把"规则"上升到 API 一等公民——dependency_check / mergeproc
3. **最终一致性是工程妥协**：换来高可用 + 离线能力 → CAP 三选二的工业化呈现（[[brewer-cap-2000]]）
4. **30 年前的论文今天每个产品都在用**：理论 → 系统 → 工业落地各 10 年
5. **写入即日志**：把"做了什么"作为不可变记录，"现在状态"作为推导结果——这个模式后来反复出现在 Kafka / Event Sourcing / Git / CRDT 里

## 延伸阅读

- 论文 PDF：[Managing Update Conflicts in Bayou](https://courses.cs.washington.edu/courses/cse550/14au/papers/CSE550.bayou.pdf)（11 页，例子很具体易读）
- 后续：[Session Guarantees for Weakly Consistent Replicated Data](https://www.cs.utexas.edu/users/dahlin/Classes/GradOS/papers/SessionGuaranteesPDIS.pdf)（同团队 1994，定义四种 session 一致性）
- 现代视角：[CRDTs for Mortals](https://www.youtube.com/watch?v=DEcwa68f-jY)（James Long 讲为什么从 Bayou 走到 CRDT）
- 哲学论：[Local-first software](https://www.inkandswitch.com/local-first/)（Ink & Switch 2019，重提 Bayou 哲学）
- 反方观点：[The Dangers of Replication and a Solution](https://dl.acm.org/doi/10.1145/233269.233330)（Jim Gray 1996，警告无主复制冲突率随 N² 增长）
- [[crdt-shapiro-2011]] —— Bayou 手写 mergeproc 的数学化继任者
- [[dynamo]] —— Amazon 把 Bayou 思路工业化，撑起亚马逊购物车

## 关联

- [[crdt-shapiro-2011]] —— CRDT 用数学结构（半格、幂等合并）替代 mergeproc，去掉应用层手写
- [[dynamo]] —— Amazon Dynamo 直接继承 anti-entropy + vector clock，把 Bayou 推到亿级请求
- [[brewer-cap-2000]] —— Bayou 是 AP 选项的早期工业化代表，CAP 定理是它的理论概括
- [[paxos-1998]] —— 同期但走相反方向（强一致单序列），Bayou 选可用性，Paxos 选一致性
- [[gray-1978-notes]] —— 早期分布式事务参考，Bayou 是它的"最终一致版"
- [[aries-1992]] —— ARIES 是单机恢复，Bayou 是分布式版的冲突恢复，思路相通

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chapar-2016]] —— Chapar — 第一个被机器证明的因果一致 KV 存储
- [[coda-1990]] —— Coda 1990 — 笔记本拔网线照样写文件，重连后自动合并
- [[crdt-shapiro-2011]] —— CRDT — 让多副本各改各的，最终自动合一
- [[dynamo-2007]] —— Dynamo 2007 — 让购物车在机器故障时也能写入
- [[gilbert-lynch-2002]] —— Gilbert-Lynch 2002 — 把 CAP 从口号写成数学定理
