---
title: Chain Replication — 把多副本排成流水线，简单且强一致
来源: van Renesse & Schneider, "Chain Replication for Supporting High Throughput and Availability", OSDI 2004
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

**链式复制**（Chain Replication）是一种让多台服务器保存同一份数据、且对外表现得像"一台服务器"的方法。日常类比：**工厂流水线**。

- 新订单从第一个工位（head）进，每个工人加工完传给下一个，最后一个工人（tail）封箱出货
- 客户来查"我的订单到货了吗"，只问最后一个工人——他手里全是已封箱的，绝不会拿半成品糊弄你

技术语言：

- 服务器排成一条单向链：`head → S1 → S2 → ... → tail`
- 写请求（write）发给 head，沿链一节一节往后传，tail 落盘后回 ACK
- 读请求（read）直接发给 tail，返回的就是已提交值

简单、强一致（线性化），论文 OSDI 2004 出自康奈尔 van Renesse 和分布式系统教父 Fred Schneider。

## 为什么重要

不理解链复制，下面这些事都没法解释：

- 为什么 Azure Storage 流层、Microsoft FAB、HyperDex、FAWN-KV 都选了"链"而不是 Paxos 做数据面
- 为什么有种说法是"chain replication 是最容易工程化的强一致方案"
- 为什么 CRAQ（2009）能在链复制基础上再把读吞吐翻倍
- 在 Raft / Paxos 主导对话的今天，chain 思想为什么还活在工业系统的存储引擎里

## 核心要点

链复制可以拆成 **三件事**：

1. **拓扑**：副本排成有序单向链，head 在头、tail 在尾，中间节点既是前驱的后继也是后继的前驱。

2. **协议**：
   - Write：client → head → ... → tail → client。每个节点收到就在本地应用，再转发。
   - Read：client → tail → client。tail 返回的状态保证已被链上所有节点见过。

3. **失败处理**（假设 fail-stop，节点要么正常要么停机）：外部 master（通常用 Paxos 维护）探测失败后 splice 链：
   - head 挂 → S1 升新 head
   - tail 挂 → tail 的前驱升新 tail
   - 中间节点挂 → 前驱后继直接对接

为什么 tail 永远是真理：任何 client 看到的 read 值，必然被链上所有前驱见过；任何 client 收到 ACK 的 write，必然已传到 tail。所以历史可线性化。

## 实践案例

### 案例 1：一次 write 沿链流动

3 副本链 `A → B → C`（A 是 head，C 是 tail）。client 发 `set x = 5`：

```
client --> A: set x = 5
A 本地应用：x = 5
A --> B: set x = 5
B 本地应用：x = 5
B --> C: set x = 5
C 本地应用：x = 5
C --> client: ACK
```

任意时刻 client read 都打到 C（tail）。C 看到的就是已提交值——绝无半成品。

### 案例 2：tail 挂了为什么不丢数据

C 挂了。看 master 视角：

- 在 C 挂之前，C 收到 `set x = 5` 的前提是 B 已经转发出去
- 也就是说 B 也已经把 `x = 5` 应用了
- master 通知 B 升为新 tail
- client 接下来 read 打到 B，看到 `x = 5`，**没丢**

这是链复制最优雅的地方：**前驱的状态总是新于或等于后继**，所以"砍掉尾巴"绝对安全。

### 案例 3：和 primary-backup 对比

经典 primary-backup（PB）做同样的事：

```
client --> primary: set x = 5
primary 同时广播给 backup1, backup2, backup3
等收齐 ack
primary --> client: ACK
```

PB 里 primary 是双重瓶颈——既要 fan-out 网络，又要 CPU 校验/落盘。链复制把这份负担**摊到链上每一节**：head 只转发给一个后继，每个中间节点只做"接收 + 应用 + 转发一份"。

代价：write 延迟随链长 O(N) 增加。3 节点链下，论文实测吞吐高 PB 约 25%，单次延迟略高。

## 踩过的坑

1. **以为 tail 挂会丢数据**：不会。tail 的前驱已持有相同状态（前驱已转发出去 = 已提交），升新 tail 安全。本质上"已转发"等价于"已提交"。

2. **把 chain replication 当 Paxos 替代**：错。链复制**依赖**一个可靠 master 做成员变更——节点谁挂、链怎么 splice，得有共识。master 本身往往用 Paxos。chain 不是替代 Paxos，是把 Paxos 用在控制面、把链用在数据面。

3. **以为链越长可用性越高**：错。链越长 write 延迟越长；任意节点挂都触发 reconfig（虽然只局部 splice）。可用性靠**快速 splice**，不靠堆长度。论文实测都是 3 节点。

4. **想横向扩展读**：原版做不到——所有 read 都打 tail，tail 是单点。CRAQ（2009）允许从任何节点读，用 dirty/clean 版本标记兜底，是"chain 改进版"的标准答案。

## 适用 vs 不适用场景

**适用**：

- 强一致 KV / 对象存储（Azure Storage 流层、FAWN-KV、HyperDex 都是）
- 写多读少，或读吞吐能容忍 tail 瓶颈
- 想要"比 Paxos 简单的 SMR 编排方式"——只要你愿意外包成员管理给 Paxos master

**不适用**：

- 读吞吐要随节点数线性扩展 → 用 CRAQ 或 quorum-read
- 地理跨区域部署 → write 延迟随链长增加，跨洲很慢
- Byzantine 故障模型 → chain 假设 fail-stop，不防恶意
- 没有可靠 master 的环境 → chain 不能脱离成员服务独立运行

## 历史小故事（可跳过）

- **1990**：Schneider 发表 "Implementing Fault-Tolerant Services Using the State Machine Approach"，把 SMR 框架立起来。从此分布式系统的容错都绕不开 SMR。
- **2004**：van Renesse + Schneider 在 OSDI 提出 chain replication，把 SMR 的"复制 log"换成"链式转发"，吞吐和工程复杂度都比 PB 好。
- **2009**：Terrace + Freedman 在 USENIX ATC 发表 CRAQ，给链复制加上"任意节点可读"，解决 tail 读瓶颈。
- **2011**：Microsoft Azure Storage 论文里描述其流层用 chain replication 的变种做存储复制。
- **2012**：HyperDex 把链复制扩展成"值依赖链"——按值哈希决定每个 key 用哪条链。

链复制没有 Raft 的明星光环，但它**安静地活在大型存储系统的引擎室里**。

## 学到什么

1. **流水线胜过广播**——把 fan-out 拆成 fan-1，每个节点只做一次转发，吞吐和负载都更平。这个思路在 stream processing、log replication 里反复出现。
2. **强一致可以很简单**——只要 read 永远只去最后一个见过所有更新的节点，线性化就成立。tail-only read 是个朴素但极强的不变量。
3. **控制面和数据面分开**——chain 把"成员管理"外包给 Paxos master，自己只做"数据传递"。这种**分层**让协议简单、好证、好实现。
4. **fail-stop 假设值多少**——它把"节点要么对要么停"变成可枚举的 case。一旦放松到 Byzantine，链复制就崩。模型假设是协议简单度的最大杠杆。

## 延伸阅读

- 论文 PDF：[Chain Replication for Supporting High Throughput and Availability (OSDI 2004)](https://www.cs.cornell.edu/home/rvr/papers/OSDI04.pdf)
- CRAQ 改进版：[Object Storage on CRAQ (USENIX ATC 2009)](https://www.cs.princeton.edu/~mfreed/docs/craq-usenix09.pdf)
- Schneider 1990 SMR 综述：[Implementing Fault-Tolerant Services Using the State Machine Approach](https://www.cs.cornell.edu/fbs/publications/smsurvey.pdf)
- [[paxos-1998]] —— chain 的 master 通常用 Paxos 实现
- [[raft]] —— 同时代主流的 SMR 协议，思路截然不同

## 关联

- [[paxos-1998]] —— chain replication 把成员管理外包给 Paxos master，是层叠关系不是替代
- [[raft]] —— Raft 走 leader + log replication 路线，与 chain 的"链式转发"是两条工程路径
- [[azure-storage-2011]] —— Azure Storage 流层使用链复制变种
- [[brewer-cap-2000]] —— chain 选 CP（强一致 + 可用性靠快速 splice），网络分区下倾向 stop
- [[bernstein-1981-cc]] —— 并发控制理论，chain 的线性化语义建立在这套框架上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/couchdb]] —— CouchDB — 把 HTTP + 多版本 + 多主复制揉成离线优先数据库
- [[craq-2009]] —— CRAQ — 让链复制每个节点都能读，吞吐线性扩展
- [[dynamo-2007]] —— Dynamo 2007 — 让购物车在机器故障时也能写入
- [[flat-datacenter-storage]] —— Flat Datacenter Storage — 把整机房磁盘当成一块大盘
