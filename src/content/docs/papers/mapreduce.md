---
title: MapReduce — 用户只写两个函数，框架替你扛千节点
来源: 'Jeffrey Dean, Sanjay Ghemawat, "MapReduce: Simplified Data Processing on Large Clusters", OSDI 2004'
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

MapReduce 是一种**让用户只写两个简单函数、框架替你扛分布式细节**的数据处理模型。日常类比：像工厂流水线——工人只负责一道工序（拧螺丝、贴标签），不用懂整条产线怎么调度，老板只要再加几个工人就能扩产。

具体地，用户只需要写：

```text
map(k1, v1)        -> list(k2, v2)        # 对每条输入产出若干 (键, 值)
reduce(k2, list(v2)) -> list(v3)          # 对同一个键的所有值合并
```

剩下的事——把数据切成几千份分给几千台机器跑、按 key 分到不同 reducer、某台机器突然死掉自动重算、慢节点自动启备份——全部由框架包办。

## 为什么重要

不理解 MapReduce，下面这些事都解释不清：

- 为什么 2004 年之后"大数据"突然成为词汇：Hadoop / Spark / Flink / Beam 这一票后辈都在抄这个范式
- 为什么 SQL、Pandas、Spark 的算子里都有 `groupBy + agg`——这就是 reduce
- 为什么千节点集群每天死几台机器还能跑出正确结果——容错被框架接管
- 为什么"限制用户写什么"反而能换来更强能力——这是工程美学的一个经典案例

## 核心要点

MapReduce 把分布式数据处理拆成 **3 个关键设计**：

1. **限制表达力 = 自动并行**：用户被强制只能写两个纯函数，框架就有信心说"我把它跑在 1 台或 2000 台上结果都一样"。类比：流水线工人只拧一种螺丝，老板才敢让 1000 个工人同时上阵。

2. **靠重算容错，不靠副本**：节点死了，把它的 task 派给另一台机器从头跑一遍。因为 map / reduce 是纯函数，重算结果一致。类比：菜谱写得够清楚，谁照着做都能复刻同一道菜。

3. **本地化 + backup task**：master 优先把 map 派到数据所在的机器（少走网络）；作业末尾对慢节点同时跑一份备份，谁先到谁算数。类比：让住在面粉厂旁的师傅做面、让最后一个慢工同时找一个快工备份。

这三件事合起来，让"千节点级别处理 TB 级数据"从一个工程团队几个月的项目变成几十行用户代码。

## 实践案例

### 案例 1：WordCount —— 大数据界的 Hello World

统计一堆文档里每个单词出现多少次：

```python
def map(filename, content):
    for word in content.split():
        emit(word, 1)             # 每见一次发一个 (词, 1)

def reduce(word, counts):
    emit(word, sum(counts))       # 同一个词的 1 全加起来
```

执行流：
- 1 TB 文档被切成上千个 split，map 函数在每台 worker 上并行跑，吐出大量 (word, 1)
- 框架按 `hash(word) % R` 把中间结果分发到 R 个 reducer
- 每个 reducer 收到自己负责的词后，把所有 1 加起来，写一份输出文件到 GFS

**用户代码 6 行，框架代码上万行**。这就是抽象的胜利。

### 案例 2：倒排索引 —— 搜索引擎的命脉

搜索引擎的离线建索引步骤，本质就是一个 MapReduce：

```python
def map(doc_id, content):
    for word in content.split():
        emit(word, doc_id)

def reduce(word, doc_ids):
    emit(word, sorted(set(doc_ids)))   # 该词出现在哪些文档里
```

reduce 的输出就是 `word -> [doc1, doc5, doc77]` 的倒排表，搜索时按词查表，返回文档列表。Google 早期的网页索引正是用 MapReduce 重写的——论文 Section 6 有专门的经验介绍。

### 案例 3：Web 日志聚合 —— 每天的 PV 与平均延迟

```python
def map(line_no, log_line):
    user_id, url, latency_ms = parse(log_line)
    emit(user_id, latency_ms)

def reduce(user_id, latencies):
    emit(user_id, {"pv": len(latencies), "avg": sum(latencies)/len(latencies)})
```

把 user 换成 url，就是按 URL 统计 PV / 平均延迟。运维和数据分析的常见姿势——所有按某个维度 groupBy + agg 的活儿，都能套这个模板。

## 踩过的坑

1. **迭代算法跑 MapReduce 是噩梦**：PageRank、机器学习、图算法每轮都要把 reduce output 写回 GFS 再读回来。100 轮迭代要好几小时甚至几天，Spark 把中间结果留在内存里只要分钟级——这是 Spark 取代 Hadoop MapReduce 的根本原因。

2. **combiner 必须满足结合律 + 交换律**：combiner 是 map 端的局部聚合，能减少网络流量。`sum / max / min` 都行，但 `average` 不行（部分平均不能再平均），`median` 也不行。新人常误把 reducer 直接当 combiner，结果结果错。

3. **数据倾斜 = 整个 job 卡在一个 reducer 上**：如果 key 分布严重不均（比如某个明星账号占了一半流量），那个 reducer 就成了瓶颈。需要加随机后缀打散，或者两阶段聚合。

4. **map output 没刷盘就丢了**：map 完成的 task 在 worker 死掉后必须**重做**——因为中间结果只在 worker 本地磁盘上，没写到 GFS。reduce 完成才算 commit point。这点反直觉，但是论文 Section 3.3 明确说的。

## 适用 vs 不适用场景

**适用**：
- 离线批处理：建索引、ETL、报表、离线机器学习特征
- 数据量大但每条记录处理简单（map 一条不依赖另一条）
- 可以容忍分钟到小时级延迟的作业
- 每天死几台机器是常态的廉价集群

**不适用**：
- 低延迟实时查询（秒级以下）→ 用流处理（Flink / Kafka Streams）
- 迭代算法（PageRank / 机器学习训练）→ 用内存计算（Spark / Ray）
- 需要随机访问点查 → 用 KV 存储（[[bigtable-2006]] / Cassandra）
- 强事务保证 → 用关系型数据库或 [[spanner-2012]]

## 历史小故事（可跳过）

- **1960 年**：McCarthy 在 LISP 里定义了 `map` 和 `reduce` 两个高阶函数原语，纯数学，单机用。
- **2003 年**：Google 内部已经写了几百个分布式数据处理任务，每个都自己处理 partitioning / 容错，重复劳动严重。Dean 和 Ghemawat 注意到大部分任务的结构都是"对每条记录做点事 + 按某个 key 聚合"，于是抽象出 MapReduce。
- **2004 年 OSDI**：论文发表，掀起业界震动。
- **2006 年**：Yahoo 的 Doug Cutting 用 Java 写了开源版 Hadoop，2008 年成 Apache 顶级项目。
- **2010-2014 年**：大数据热潮，Hadoop 生态遍地开花。
- **2014 年后**：Spark 凭内存计算 + RDD 范式逐步取代 Hadoop MapReduce，但"限制表达力换可扩展性"的思路至今活在 Flink / Beam / Dataflow 里。

## 学到什么

1. **限制比自由更值钱**：把用户能写的代码限制成两个纯函数，反而能自动获得并行、分布、容错——这是工程抽象的范式级胜利。
2. **重算 vs 副本是两条容错路线**：MapReduce 选重算（因为函数纯），Paxos / Raft 选副本（因为状态机有副作用），各有各的应用域。
3. **简单数据结构能 scale**：master 用 O(M+R) 的紧凑表就能调度 1800 节点，没炫技，反而更稳。
4. **抽象一旦立住就有 20 年红利**：MapReduce 论文 13 页，催生了一整代大数据生态，至今仍是"分布式计算"的标准入门第一课。

## 延伸阅读

- 论文 PDF：[research.google/pubs/mapreduce-simplified-data-processing-on-large-clusters/](https://research.google/pubs/mapreduce-simplified-data-processing-on-large-clusters/)（13 页，密度适中）
- Hadoop 源码 WordCount 例：[apache/hadoop WordCount.java](https://github.com/apache/hadoop/blob/rel/release-3.3.6/hadoop-mapreduce-project/hadoop-mapreduce-examples/src/main/java/org/apache/hadoop/examples/WordCount.java)
- 视频：[Jeff Dean — Building Software Systems at Google](https://www.youtube.com/watch?v=modXC5IWTJI)（讲他和 Sanjay 怎么想出 MapReduce）
- [[gfs]] —— MapReduce 的存储底座，先读它再读 MapReduce 顺得多
- [[bigtable-2006]] —— Google 三件套之一，常和 MapReduce 配合

## 关联

- [[gfs]] —— 提供分布式存储，MapReduce 用 GFS 存输入和输出
- [[bigtable-2006]] —— 同一团队，常作为 MapReduce 的输入或输出
- [[spanner-2012]] —— Google 后期的全球数据库，用 MapReduce 做大批量 ETL
- [[lamport-1978]] —— 分布式系统的基础理论，MapReduce 隐式依赖逻辑时钟思想
- [[paxos-1998]] —— MapReduce 选了重算路线，Paxos 走副本路线，对照阅读最有感
- [[dewitt-gray-1992]] —— 1992 年并行数据库论文，MapReduce 的远祖思想之一
- [[cassandra-2010]] —— 不同范式的分布式存储，与 MapReduce 配合做大规模数据分析

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-2014]] —— Apollo — 让两万台机器自己决定谁跑哪个任务
- [[bigtable]] —— Bigtable — 把巨大表格切到上千台机器上
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[bigtable-revisit-2024]] —— Bigtable 二十年回顾 — 从三维表到云数据库
- [[borg]] —— Borg — Google 把一万台机器假装成一台
- [[borg-2015]] —— Borg 2015 — Google 把一万台机器假装成一台
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[ciel-universal-execution-engine-distributed-data-flow-2011]] —— CIEL 2011 — 让分布式数据流会自己长出下一步
- [[dapper-2010]] —— Dapper — Google 大规模分布式系统链路追踪基础设施
- [[data-lake-management-2019]] —— Data Lake Management 2019 — 数据湖从文件堆变成可治理资产
- [[dremel-2010]] —— Dremel 2010 — BigQuery 和 Parquet 背后的嵌套列式分析
- [[dremel-decade-2020]] —— Dremel 十年回顾 — BigQuery 背后的交互式云数仓路线
- [[dryadlinq-system-general-purpose-distributed-data-parallel-2008]] —— DryadLINQ — 把普通 C# 查询变成集群作业
- [[dstreams-2013]] —— D-Streams — 把流处理伪装成一串很小的批
- [[f1-2013]] —— F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单
- [[fermi-architecture-2010]] —— NVIDIA Fermi — 把 GPU 从游戏卡推上超算
- [[flink-snapshots-2015]] —— Flink 异步快照 — 不停机给流处理拍一致照片
- [[gfs]] —— GFS — 为工作负载反向定制的分布式文件系统
- [[gfs-2003]] —— GFS 2003 — 把廉价机器拼成大文件仓库
- [[hdfs-2010]] —— HDFS — 把 GFS 用 Java 重写一遍并撑到 25 PB
- [[lakehouse-2021]] —— Lakehouse 2021 — 把数据湖和数仓合成一套开放平台
- [[mesos]] —— Mesos — 让多种计算框架共用一套集群
- [[millwheel-2013]] —— MillWheel 2013 — Google 给互联网级流处理装上不漏不重的发动机
- [[observability]] —— Dapper 可观测性 — 把一次请求走过的路画出来
- [[opencl-2010]] —— OpenCL 2010 — 一份代码同时跑 CPU/GPU/DSP/FPGA 的开放标准
- [[pagerank-1998]] —— PageRank — 用随机游走给整个网络的页面打分
- [[piccolo-building-fast-distributed-programs-with-partitioned-2010]] —— Piccolo — 用分区表写分布式迭代程序
- [[quincy-2009]] —— Quincy — 把"派活给机器"变成一道最小费用流题
- [[ray-2018]] —— Ray 2018 — 把任务和演员放进同一个分布式舞台
- [[red-1993]] —— RED — 让路由器在队列还没塞满时就提前丢包
- [[snowflake-2016]] —— Snowflake 2016 — 把数仓拆成 storage / compute / services 三层
- [[spark-rdd]] —— Spark RDD — 用血缘记录重建内存数据
- [[system-design]] —— The Datacenter as a Computer — 把机房当成一台巨型计算机
- [[tachyon-2014]] —— Tachyon — 把集群存储推到内存速度，丢了再算回来
- [[tesla-architecture-2008]] —— NVIDIA Tesla — 把显卡改造成通用并行计算机
- [[thrust-2010]] —— Thrust — 让 GPU 编程像写 STL 一样一行调用
- [[tradeoff-analysis]] —— The Tail at Scale — 尾延迟会被规模放大
- [[trustrank-2004]] —— TrustRank — 用一小撮可信种子把整张 Web 的信誉算出来
- [[papers/vllm]] —— vLLM — 把操作系统的分页搬进 GPU KV cache
- [[dask]] —— Dask — 让 pandas / NumPy 直接跑在比内存大的数据上
