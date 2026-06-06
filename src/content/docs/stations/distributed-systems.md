---
title: 分布式系统阅读站
description: 75 篇论文 · 时钟→共识→复制→可观测性分阶段路线图
sidebar:
  order: 3
  label: 分布式系统
---

> **专题一句话**：多台机器假装是一台——从 Lamport 时钟到 Raft 共识，再到 Spanner 全球 SQL 与 CRDT 协同编辑。  
> 候选池：仓库 [`research/papers-distributed-systems.md`](https://github.com/estelledc/study/blob/main/research/papers-distributed-systems.md)

## 统计

| 维度 | 数量 |
|---|---:|
| 已写论文 | **75** |
| 候选（深化） | **60**（大多已落站） |

[← 返回专题阅读站](/study/reading-stations/) · [论文全景 · 分布式](/study/papers-atlas/#分布式系统)

---

## 专题导读

分布式系统的阅读顺序不是按年份，而是按**依赖链**：

1. 先接受「没有全局时钟」
2. 再理解「共识为什么难」
3. 然后看工业界怎么在可用性与一致性间取舍
4. 最后补上可观测性、最终一致与协同编辑

---

## 阅读路线图

### 阶段 0 · 时间与不可能（入门，4 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 1 | [[lamport-1978]] | 初级 | 逻辑时钟；「先发生」关系 |
| 2 | [[byzantine-generals-1982]] | 中级 | 拜占庭容错问题表述 |
| 3 | [[flp-1985]] | 高级 | 异步共识不可能性 |
| 4 | [[sequential-consistency-1979]] | 中级 | 一致性模型谱系起点 |

### 阶段 1 · 共识经典（中级，6 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 5 | [[paxos]] | 中级 | 分布式共识标准答案 |
| 6 | [[raft]] | 初级 | 可读的共识实现 |
| 7 | [[vr-revisited-2012]] | 中级 | Viewstamped Replication 现代版 |
| 8 | [[fast-paxos-2006]] | 高级 | Paxos 快路径 |
| 9 | [[epaxos-2013]] | 高级 | 无 leader 并行 commit |
| 10 | [[hotstuff-2019]] | 高级 | 现代 BFT 共识（区块链邻域） |

### 阶段 2 · 工业复制与协调（中级，6 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 11 | [[chubby]] | 中级 | Google 分布式锁 / 选主 |
| 12 | [[spanner]] | 高级 | 全球 TrueTime + SQL |
| 13 | [[dynamo]] | 中级 | 最终一致 KV；可用性优先 |
| 14 | [[megastore-2011]] | 高级 | 实体组 + Paxos |
| 15 | [[chain-replication-2004]] | 中级 | 链式复制；高吞吐线性化 |
| 16 | [[pbft-1999]] | 高级 | 实用拜占庭容错 |

### 阶段 3 · 大数据存储与计算（中级，5 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 17 | [[gfs]] | 中级 | Google 分布式文件系统 |
| 18 | [[mapreduce]] | 初级 | 批处理编程模型 |
| 19 | [[consistent-hashing-1997]] | 初级 | DHT 与缓存分布 |
| 20 | [[crdt-json]] | 中级 | JSON CRDT 工程化 |
| 21 | [[crdt-shapiro-2011]] | 高级 | CRDT 理论与分类 |

### 阶段 4 · CAP、事务与协同（中级→高级，6 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 22 | [[brewer-cap-2000]] | 初级 | CAP 直觉 |
| 23 | [[cap-12-years-later-2012]] | 中级 | CAP 再审视 |
| 24 | [[vogels-eventual-2009]] | 初级 | 最终一致工程实践 |
| 25 | [[saga-1987]] | 中级 | 长事务补偿 |
| 26 | [[gray-1978-notes]] | 高级 | 2PC 起源 |
| 27 | [[linearizability-1990]] | 高级 | 线性一致性形式化 |

### 阶段 5 · 可观测性与运维（中级，4 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 28 | [[dapper-2010]] | 中级 | 分布式链路追踪 |
| 29 | [[chandy-lamport-1985]] | 高级 | 分布式快照 |
| 30 | [[xtrace-2007]] | 高级 | 黑盒故障诊断 |
| 31 | [[lampson-hints]] | 初级 | 系统设计原则（跨专题） |

---

## 已写论文精选（按子类）

### 共识与复制

[[paxos]] · [[raft]] · [[vr-1988]] · [[vr-revisited-2012]] · [[fast-paxos-2006]] · [[mencius-2008]] · [[epaxos-2013]] · [[flexible-paxos-2016]] · [[chain-replication-2004]] · [[craq-2009]] · [[tendermint-2016]] · [[hotstuff-2019]]

### 存储与协调

[[chubby]] · [[spanner]] · [[dynamo]] · [[gfs]] · [[megastore-2011]] · [[borg]] · [[borg-omega-kube-2016]]

### CRDT 与协同

[[crdt-shapiro-2011]] · [[crdt-sss-2011]] · [[crdt-json]] · [[crdt-json-2017]] · [[ot-1989]] · [[jupiter-1995]] · [[logoot-2010]]

### 时钟与一致性

[[lamport-1978]] · [[hlc-2014]] · [[fidge-1988]] · [[mattern-1989]] · [[gilbert-lynch-2002]]

### 可观测性与追踪

[[dapper-2010]] · [[xtrace-2007]] · [[pivot-tracing-2015]]

> 完整 75 篇见 [论文全景 · 分布式系统](/study/papers-atlas/#分布式系统)。

---

## 待写候选（深化专题）

> 候选表 60 篇多数已有对应站点笔记。以下为 research 表标注、尚未单独成篇或需深化的条目。

| slug | 论文 | 状态 |
|---|---|:---:|
| `skeen-3pc-1981` | 3PC 与阻塞分析 | 待核对 |
| `presumed-abort-1986` | 2PC 优化 | 待核对 |
| `craq-2009` | Chain Replication 读优化 | ✅ 在站 |

*维护时以 `research/papers-distributed-systems.md` 与 atlas  diff 为准。*

---

## 关联项目

| 项目 | 角色 |
|---|---|
| [[kafka]] | 日志型消息 / 流处理 |
| [[etcd]] | K8s 元数据；Raft 工业实现 |
| [[helm]] | K8s 应用打包与发布 |
| [[prometheus]] | Pull 模型监控 + PromQL |
| [[containerd]] | 节点容器运行时 |
| [[tensorflow]] | 分布式训练（数据并行邻域） |
| [[pytorch]] | 现代训练栈 |
| [[ray]] | 分布式 Python / ML 任务 |

数据库交叉：[[spanner]] 与 [数据库专题](/study/papers-atlas/#数据库) 的 `cockroachdb-2020` · `tidb-2020` 对照读。

---

## 里程碑

| 里程碑 | 目标 | 状态 |
|---|---|:---:|
| M1 共识可读 | 阶段 0–1 十篇在站 | ✅ |
| M2 工业三连 | chubby / spanner / dynamo | ✅ |
| M3 全库覆盖 | 75 篇一级主题「分布式系统」 | ✅ |
| M4 深化候选 | research 表 60 篇与站点 slug 对齐审计 | 🔄 |
| M5 形式化交叉 | 链 [[disel-2018]]（形式化方法） | ⏳ |

---

## 阅读路径图

```text
lamport-1978（时钟）
    ↓
flp / byzantine（不可能）
    ↓
paxos → raft → vr-revisited（共识三代）
    ↓
chubby / spanner / dynamo（工业三角）
    ↓
gfs / mapreduce（大数据栈）
    ↓
crdt / eventual（放松一致）
    ↓
dapper（可观测性闭环）
```
