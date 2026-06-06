---
title: Tachyon — 把集群存储推到内存速度，丢了再算回来
来源: 'Li et al., "Tachyon: Reliable, Memory Speed Storage for Cluster Computing Frameworks", SoCC 2014'
日期: 2026-05-30
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Tachyon 是一个**跑在集群节点内存里的分布式文件系统**，专门给 Spark / MapReduce 这类计算框架存"中间结果"。日常类比：餐厅厨房之间传半成品，本来要送到楼下冷库（HDFS 落盘 + 三副本），现在直接放在每个灶台旁边的保温台（内存）上，下一个厨师抬手就能拿。

它最聪明的地方在容错：保温台没冷库可靠，菜可能掉了。Tachyon 不复制三份（那等于跑回冷库），而是**记下"这盘菜是由哪两份食材按什么菜谱做的"**——丢了就照菜谱重做一遍。这条菜谱叫 **lineage（血缘）**。

后来 2016 年改名 **Alluxio**，今天还在很多公司的数据湖中间层跑着。如果你听过"内存级数据编排"这种说法，源头就是这篇论文。

## 为什么重要

不理解 Tachyon，下面这些事都没法解释：

- 为什么 2014 年之后"内存级数据层"突然遍地开花（Alluxio / Arrow Flight / Ray Object Store 都是它的徒孙）
- 为什么 Spark 的 RDD 思路能从"计算"扩展到"存储"——Tachyon 就是把 RDD 的 lineage 容错搬到了文件系统层
- 为什么大公司明明有 HDFS 还要再搭一层缓存——HDFS 写吞吐被三副本死死卡在网络带宽上
- 为什么"重算"在分布式系统里第一次变得比"复制"便宜

它打破了一个隐式假设：**容错只能靠空间冗余（多复制几份）**。Tachyon 证明，在某些场景下，**时间冗余（出事再算）**更划算——只要你能记下"怎么算的"。

## 核心要点

Tachyon 的设计可以拆成 **三步**：

1. **内存写、不复制**：写文件直接落到本机内存。对比 HDFS 写一次要走网络复制三份（吞吐被网卡和远端磁盘卡死），Tachyon 的写吞吐直接顶到内存带宽，**比 HDFS 快约 110 倍**。

2. **Lineage 容错**：每个文件登记自己是"哪段程序 + 哪些上游文件"算出来的。节点挂了、内存清了，调度器照着 lineage 把上游拉回来、重新跑一遍算子，就能复原这个文件。这一步借自 Spark RDD。

3. **异步 checkpoint + Edge 算法**：lineage 链不能无限长（不然恢复要重算几小时）。Tachyon 后台**异步**把内存数据落到底层 HDFS，截断 lineage。优先 checkpoint 谁？**叶子节点**——这叫 Edge 算法，能保证最坏重算时长有上界。

三件事合起来回答了一个问题：**怎么在不放弃可靠性的前提下，把写延迟降到内存级**。答案是把"复制成本"换成"重算成本"，再用 checkpoint 给重算成本设上限。

## 实践案例

### 案例 1：写吞吐为什么能差 100 倍

HDFS 写一个 1GB 文件：网卡发 3GB（三副本），远端两个节点还得各写一次磁盘。本机网卡是 1Gbps（约 100MB/s），3GB ÷ 100MB/s ≈ **30 秒**。

Tachyon 写同一个 1GB：直接 memcpy 到本机内存，内存带宽 10GB/s 量级，**0.1 秒搞定**。

差距来自一句话：**"复制"必须走网络，"重算"只在出事时才发生**。平时跑得飞快，挂了再付代价。

这个 trade-off 看起来是显然的——"挂了的概率小"，但要论证它合理，得回答两个问题：

- 重算时间是不是有界？→ 异步 checkpoint + Edge 算法把它封顶
- 重算会不会拖垮线上？→ 调度器层为重算预留 CPU quota

### 案例 2：lineage 怎么救回丢失的数据

```
fileA --[map算子f]--> fileB --[reduce算子g]--> fileC
```

正常运行：A、B、C 都在内存里，g 用 B 算出 C，飞快。

某节点崩了，B 没了。怎么办？

- 不去找 B 的副本（没有，故意不复制）
- 查 lineage：B = f(A)
- 调度器把 f 重新派到一个有 A 的节点上跑，B 就回来了
- 然后 g 继续，C 也回来

整个过程**对上层程序透明**——你 `read("fileC")` 阻塞几十秒后拿到正确数据。

注意：这要求 f 和 g 是**确定性**的——同样的输入必出同样的输出。如果 f 里偷偷读了一次系统时钟或者随机数生成器，重算就会拿到不一样的字节，等于"骗"了上层。Tachyon 让框架层声明算子是否确定；不确定的，老老实实复制兜底。

### 案例 3：为什么必须异步 checkpoint

如果只靠 lineage：链越长，恢复越慢。100 个算子串起来，挂一次要重跑 100 步。

Tachyon 后台守护进程默默把"叶子文件"（最新产物）落到 HDFS 上。下次某节点挂了，调度器先看 checkpoint：如果 fileC 已经 checkpoint 过，直接读 HDFS，**lineage 不再往上追**。

为什么先 checkpoint 叶子而不是根？因为根（最早的输入）通常已经在 HDFS 上了，叶子才是"内存独有"的危险数据。这种"截断 lineage"的策略让重算的最坏代价被一个固定常数封顶——这是 Edge 算法的核心证明。

直觉记忆：**叶子 checkpoint** 类似于"做完一道菜先拍个照存档"，下次哪怕忘了菜谱中间步骤，也能从照片这一刻继续往下做，不必从买菜开始重头来。

## 踩过的坑

1. **lineage 假设算子确定**：随机算子（如 sample、shuffle 带随机种子）重算结果不一样——文件系统会"复原"出和原版不同的字节。Tachyon 让框架自己声明"我是确定的"，否则降级到复制。

2. **Master 单点没解决干净**：lineage 元数据存在 master，论文给的方案是主备 + ZooKeeper，但论文也承认这是工程上的让步，不是设计上的优雅解。后来 Alluxio 做了 Raft 化的元数据存储，但那是论文之外的事。

3. **重算会跟在线作业抢 CPU**：节点挂了之后，重算流量打过来可能把当前作业也拖垮。Tachyon 在调度器层给重算预留 quota，但调参依赖经验——quota 太小恢复慢，太大正常作业被挤。

4. **不是所有应用都能用**：黑盒应用（不暴露算子 DAG 给 Tachyon）拿不到 lineage 收益，只能走传统 cache + WAL 模式。

5. **写后立刻挂 = 数据丢**：lineage 还没登记到 master 时如果整个集群断电，那段输入就没了。Tachyon 的容错保证是"写完成 + lineage 注册完成"之后的故障，不是"写到一半"的故障。

6. **内存吃紧时的驱逐策略**：内存满了要踢谁？踢得不好下次重算成本爆表。Tachyon 用 LRU + lineage 长度的复合策略——长 lineage 的优先 checkpoint 而不是直接踢。

## 适用 vs 不适用场景

**适用**：

- 集群计算框架的中间结果（Spark shuffle、MapReduce 中间文件）——天生有 lineage
- 迭代式工作流（机器学习、图算法）——同一份数据被反复读，内存命中收益巨大
- 多框架共享数据——Spark 算出来给 Presto 用，不必再走 HDFS
- 短生命周期的临时数据——挂了重算成本可控

**不适用**：

- 强一致性的元数据存储——Tachyon 不是 Paxos，写不是同步复制
- 黑盒应用没有可登记的 lineage——只能当普通缓存
- 写后立刻必须持久（如交易日志）——异步 checkpoint 有窗口期，崩了 lineage 也救不回外部副作用
- 算子带随机或外部副作用——重算结果对不上，必须降级到复制

## 历史小故事（可跳过）

- **2009 年**：Berkeley AMPLab 的 Matei Zaharia 做出 Spark + RDD，证明 lineage 在"计算层"管用。
- **2012 年**：博士生 Haoyuan Li 想：lineage 既然能容错"算出来的数据"，为什么不能容错"存下来的数据"？
- **2013 年**：Tachyon 第一版开源，挂在 Spark 之上当内存层。
- **2014 年**：SoCC 论文发表，正式给 lineage 在存储层一个理论框架（Edge 算法 + 资源分配）。
- **2016 年**：Haoyuan Li 创业，Tachyon 改名 **Alluxio**，公司至今活跃。

一个有意思的细节：Tachyon 当年的"内存比磁盘快很多"是论文核心论据，但 2014 年 SSD 已经在普及。论文也专门讨论了 SSD 对结论的影响——结论是 SSD 让差距缩小但不消失，因为远端复制的网络开销才是 HDFS 的真正瓶颈。十年之后看，这个判断仍然成立：现代对象存储仍然在受网络限制。

## 学到什么

1. **复制不是容错的唯一答案**——能记录"怎么算出来的"，就能用 CPU 换网络带宽。这是 Spark RDD 给整个分布式系统社区的一记重锤。
2. **同步 vs 异步**：Tachyon 把"写路径同步"和"持久化异步"分开，写吞吐顶到硬件极限，可靠性靠后台慢慢补。这种"快 path / 慢 path 分离"是高性能存储的通用模式。
3. **元数据与数据分层**：内存放数据走快路径，磁盘存元数据 + checkpoint 走慢路径。Aurora、Spanner、TiKV 都是这种分层思想的不同变种。
4. **抽象的层级跨越**：lineage 从计算层（RDD）跨到存储层（Tachyon）再跨到对象存储层（Ray Object Store），同一个想法换不同载体。
5. **设计要交代清楚什么是边界**：Tachyon 老老实实承认"非确定算子降级到复制"、"master 是工程妥协"。这种把假设写出来的态度比给出"完美方案"的论文更有用——读者能判断它适合哪些场景。
6. **同一个想法的"换载体"价值**：lineage 从 RDD（计算）→ Tachyon（存储）→ Ray（对象池）三跳，每跳都不只是搬运，而是回答"在新载体上 trade-off 是什么样"。看论文学一招"换层"思维，比记十个 API 名字有用得多。

## 延伸阅读

- 论文 PDF：[Tachyon SoCC 2014](https://people.eecs.berkeley.edu/~alig/papers/tachyon.pdf)（14 页，比想象中好读）
- Alluxio 官网：[alluxio.io](https://www.alluxio.io/)（Tachyon 的现代版，看工程化的样子）
- Ray Object Store：[Ray 文档](https://docs.ray.io/en/latest/ray-core/objects.html)（同样思路在 ML 系统里的体现）
- Haoyuan Li 博士论文（2018）：把 lineage 在存储层的所有 trade-off 讲透
- [[spark-rdd]] —— Tachyon 的思想直系祖先
- [[hdfs]] —— Tachyon 在它之上做内存层

## 关联

- [[spark-rdd]] —— RDD 把 lineage 用在计算层；Tachyon 把同样思路搬到存储层
- [[hdfs]] —— Tachyon 的底层 checkpoint 通常落到 HDFS，两者互补不互斥
- [[bigtable-2006]] —— 同样是分布式存储，但 Bigtable 走"复制 + 强一致"路线，恰好对照
- [[brewer-cap-2000]] —— Tachyon 在 CAP 里偏 AP，靠 lineage 在 P 时尽量恢复 C
- [[aries-1992]] —— 单机 WAL 的恢复思路；Tachyon 用 lineage 替代 WAL
- [[gfs]] —— GFS 的"chunk + 三副本"代表了"复制路线"的极致
- [[mapreduce]] —— Tachyon 早期就是给 MapReduce/Spark 做 shuffle 加速
