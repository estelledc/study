---
title: Chubby — 给凡人用的分布式锁服务
来源: 'Mike Burrows, "The Chubby Lock Service for Loosely-Coupled Distributed Systems", OSDI 2006'
日期: 2026-05-29
子分类: 分布式系统
分类: 分布式系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

Chubby 是 Google 在 2006 年公开的一个**分布式协调服务**：你可以把它当成「机房里所有服务都信得过的公共保管箱 + 公共抢锁柜」。日常类比：办公室里有一个挂在墙上的"值班牌"——谁拿到牌子谁是今天的值班经理；牌子只有一块，所以不会有两个值班经理；值班经理走了或失联超过一定时间，牌子自动归还。

Chubby 把这块"值班牌"做成了一个 5 台机器组成的小集群，对外暴露两类操作：**抢锁**（Acquire / Release）和**读写小文件**（GetContents / SetContents）。Google 内部 GFS / Bigtable / MapReduce / DNS / 配置广播全都靠它选 leader、存元数据。

Mike Burrows 在论文第一段就说过一句很实在的话：「我们的目的不是发明新算法，而是把已有的 Paxos 一致性算法，包装成一个工程师 30 分钟能学会的服务」。

## 为什么重要

不理解 Chubby，下面这些事都没法解释：

- 为什么 GFS / Bigtable / Kubernetes 这些"自己也要选 leader"的系统，都会再依赖一个外部协调服务，而不是自己实现 Paxos
- 为什么后来的 ZooKeeper / etcd / Consul 几乎照抄它的接口（lock + 小文件 + watch），连"5 个节点最常见"这条惯例都继承下来
- 为什么"分布式锁"这件事在生产里反复出 bug——Redis SETNX 抢锁经常被批"不是真锁"，根因就在 Chubby 论文 §6 早讲过的 GC pause 写脏数据
- 为什么云原生时代选 etcd 不选 ZooKeeper：watch + 版本号 抽象赢了 lock + cache 抽象

## 核心要点

Chubby 把一个看起来朴素的服务，靠**三件套**做成了 20 年没被替代的基建：

1. **5 节点 cell + Multi-Paxos**：5 台机器互相同步日志，写入需要 3 票同意才算 commit。类比：合伙人公司开会，过半数签字才生效；这样最多两个合伙人同时缺席，公司也照常运转。

2. **lock + sequencer + lease 三联**：lock 是抢锁；lease 是有期限的承诺（默认 12 秒），到期不续就自动还锁；sequencer 是抢到锁后拿到的"凭证编号"，下游服务可以用它验证"你到底还是不是当前 leader"。

3. **client 端 cache + 主动失效**：每个 client 把读过的小文件缓存在本地，master 写新值之前会先广播作废通知，所有 client ack 完了才真正写。类比：图书馆借出书前先打电话告诉所有持有目录卡片的人"这本书要换位置了"。

整个产品哲学：**抽象层级是核心竞争力**。Paxos 算法 1989 年就有，没人愿意自己手撸；Chubby 把它包成一个 RPC 接口，价值瞬间释放。

## 实践案例

### 案例 1：GFS master 选举

GFS 同时启动多台 master 候选，谁先抢到那把锁谁就是 master：

```c
handle = Open("/ls/global/gfs-master", EXCLUSIVE_LOCK);
if (TryAcquire(handle, EXCLUSIVE)) {
    SetContents(handle, my_address);   // 把自己地址写进锁节点
    serve_as_master();
} else {
    addr = GetContentsAndStat(handle).data;  // 别人已是 master，读出地址
    follow_leader(addr);
}
```

**逐部分解释**：

- `Open` 是打开 Chubby 的一个路径节点（像打开 Unix 文件）
- `TryAcquire` 不阻塞，抢不到就直接返回 false
- 抢到后把自己 IP 写进节点内容，所有 follower 都 watch 这个节点，写入广播给它们
- 老 master 死掉 → session 过期 → 锁自动释放 → 新候选 Acquire 成功

### 案例 2：sequencer 防 GC pause 写脏

最典型的故障模式：老 master 进入 30 秒 JVM full GC，醒来时锁已易主，它却还以为自己是 master 在写元数据。

```c
seq = GetSequencer(handle);  // 拿到当前 lock 的凭证 (path, generation)
chunkserver_rpc.Append(file_id, data, seq);  // 下游 RPC 带上 seq
// chunkserver 收到后向 Chubby 验证：
// chubby.CheckSequencer(seq) → 如果 generation 已老，返回 false → 拒绝写
```

精髓：**Chubby 自己做 source of truth，把锁状态打成 token，让下游异步校验**。

### 案例 3：Bigtable root tablet 地址查找

Bigtable 找用户表数据要先找元数据，找元数据要先找 root tablet。**root tablet 的地址就存在 Chubby 一个小文件里**：

```
client → Chubby (读 small file: /ls/global/bigtable/root-tablet-loc)
       → root tablet → metadata tablet → user tablet
```

每个 Bigtable client 把这个地址 cache 在本地，cache lease 12 秒；只有 root tablet 迁移时 Chubby 才广播失效。这是 Chubby 的**第二种用法**——不抢锁，只当一个高可用强一致的"地址簿"。

## 踩过的坑

1. **lock 是 advisory 不是 mandatory**：服务端不强制只有锁持有者才能改文件，靠用户代码自觉。Google 内部多次出现"忘了 Acquire 直接 SetContents"的 bug。

2. **lock 不能替代真正的容错设计**：很多人以为抢到锁就万事大吉，但 GC pause 30 秒锁可能已经被别人拿走，老进程醒来继续写就双写污染。**只有加 sequencer / fencing token 才真正安全**——20 年来这条反复被忽视。

3. **被当成 KV store 滥用**：Chubby 写一次要 quorum Paxos commit + 全 cache invalidation，每写几十到几百毫秒，比 Redis 慢 100 倍。但因为它强一致 + 高可用「太好用」，Google 内部仍然有项目把它当 KV store。

4. **DNS-as-Chubby 把 cell 流量打飞**：内部一度把 Chubby 当 DNS 用，每次 RPC 都查，单 cell 服务 10 万 client 撑不住，最后被迫拆出来用专门的命名服务。

## 适用 vs 不适用

**适用**：

- 粗粒度锁（持有秒级 / 分钟级）：leader 选举、配置广播、互斥任务调度
- 关键元数据高可用强一致存储：服务地址簿、版本号、全局开关
- 跨服务协调点（QPS 不高，但可用性要求极高）

**不适用**：

- 细粒度高频锁（毫秒级争抢） → Chubby 写延迟太高，用 Redis / 内存锁
- KV store / 大文件存储 → 文件 cap 256KB，写慢，用真正的 KV
- 需要跨 region 强一致 → Chubby 是 datacenter 内部部署，跨 region 用 [[spanner]]
- 完全不能容忍写阻塞窗口 → master fail-over 期间写要暂停 ~30 秒

## 历史小故事（可跳过）

- **1989 年**：Lamport 投出 "The Part-Time Parliament"（Paxos）被 ACM TOCS 拒，理由是"看不懂"
- **1998 年**：Lamport 终于把 Paxos 发表出来
- **2001 年**：Lamport 写 "Paxos Made Simple" 重新解释
- **2003 年**：Google GFS 论文发表，里面已经用了一个 Chubby 雏形选 master
- **2006 年**：Chubby 与 [[bigtable]] 同在 OSDI '06 发表
- **2008 年**：Yahoo! 开源 ZooKeeper，用 Zab 协议（简化 Multi-Paxos）
- **2013 年**：CoreOS 开源 etcd，用 Raft 替代 Paxos
- **2014 年**：Kubernetes 选 etcd 作为唯一元数据存储，把 Chubby 的精神延续到云原生

从 Paxos 算法到 Chubby 产品隔了 17 年，从 Chubby 到开源后继隔了 2 年。**算法可以早 17 年，产品化才决定影响力**。

## 学到什么

1. **抽象层级是产品力的核心**：把一个学术算法包成"凡人能用 5 分钟"的 API，比发明新算法更有商业价值。
2. **粗粒度 > 细粒度**：协调服务主动放弃高频锁场景，换来不会被打成性能瓶颈。
3. **lock 不替代 fencing**：任何共享资源写入都要问"如果持有者 GC pause 30 秒会怎样"，答案不是"加锁"而是"加 token 让下游校验"。
4. **简单 API 必然吸引超出设计意图的使用方式**：DNS-as-Chubby、Chubby-as-KV 都是论文 §6 反思的反例——API 越简单，误用越多。

## 延伸阅读

- 论文 PDF：[The Chubby Lock Service for Loosely-Coupled Distributed Systems](https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/)（OSDI 2006，13 页，§6 是精华）
- 经典反思博客：[Martin Kleppmann — How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)（2016，把 Chubby sequencer 教训用 Redis 例子重新讲一遍）
- ZooKeeper 论文：["ZooKeeper: Wait-free coordination"](https://www.usenix.org/legacy/event/usenix10/tech/full_papers/Hunt.pdf)（USENIX ATC 2010，开源版的 Chubby）
- [[paxos]] —— Chubby 复制层用的就是 Multi-Paxos
- [[raft]] —— 后继者 etcd / Consul 选用的协议，可读性远高于 Paxos
- [[bigtable]] —— Bigtable 用 Chubby 选 master + 存 root tablet 地址

## 关联

- [[paxos]] —— Chubby 把 Multi-Paxos 包装成产品的典型案例
- [[raft]] —— Raft 在后继者 etcd 中替代 Paxos 的地位
- [[bigtable]] —— 同会议姊妹论文，Bigtable 重度依赖 Chubby
- [[gfs]] —— GFS master 选举是 Chubby 最经典用例
- [[spanner]] —— 把 Chubby 的"datacenter 内强一致"扩展到全球的后继者
- [[mapreduce]] —— MapReduce job 协调也靠 Chubby 锁
- [[etcd]] —— Chubby 在云原生时代的精神继承者

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[borg]] —— Borg — Google 把一万台机器假装成一台
- [[dapper-2010]] —— Dapper — Google 大规模分布式系统链路追踪基础设施
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[dynamo]] —— Dynamo — 让购物车永远能写入的分布式存储
- [[ebpf]] —— eBPF — 用户写小程序，内核证明安全后再跑
- [[etcd]] —— etcd — 分布式键值数据库
- [[gfs]] —— GFS — 编译器决定不做哪些事
- [[hdfs-2010]] —— HDFS — 把 GFS 用 Java 重写一遍并撑到 25 PB
- [[kafka-2011]] —— Kafka NetDB 2011 — 把消息中间件砍成"会写文件的水管"
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[lsm-tree-1996]] —— LSM-Tree 1996 — 写优化存储引擎
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[paxos]] —— Paxos — 分布式共识算法
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[paxos-simple-2001]] —— Paxos Made Simple — Lamport 用平直英语把共识协议推导一遍
- [[raft]] —— Raft — 易理解的共识算法
- [[smr-1990]] —— SMR 1990 — 把"容错服务"还原成"多副本一起跑同一台状态机"
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[vr-1988]] —— VR 1988 — 用"主备 + 换届"做共识的另一脉
- [[vr-revisited-2012]] —— VR Revisited 2012 — VR 协议的"工程化重写版"
- [[zab-2011]] —— Zab — ZooKeeper 怎么把客户端写入按顺序复制到所有副本

