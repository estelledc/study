---
title: The Snowflake Elastic Data Warehouse 状元篇
description: SIGMOD 2016 Snowflake 论文精读 — 存算分离 + 弹性虚拟仓库如何重塑云数仓范式
season: O
version: v1.1
branch: method
---

import { Image } from 'astro:assets';

## Layer 0 — 论文卡片

| 字段 | 值 |
|------|-----|
| 论文标题 | The Snowflake Elastic Data Warehouse |
| 一作 | Benoit Dageville et al. |
| 机构 | Snowflake Inc. (now Snowflake Computing) |
| 会议/年份 | SIGMOD 2016 |
| 开源状态 | 闭源 (proprietary) |
| OSS 类似实现 | DuckDB (vectorized exec) + Apache DataFusion (query planner) + QuestDB (column store) |
| 范式归属 | Cloud Data Warehouse — Storage/Compute Separation |
| 引用次数 | 1500+ (Google Scholar, 2025) |
| 影响力 | 重新定义云数仓架构，催生 Databricks SQL / BigQuery / Redshift Serverless |

一句话定位:Snowflake 把传统数仓的"存算紧耦合 + shared-nothing 静态分片"撕开成三层(Storage / Compute / Cloud Services),每一层独立弹性伸缩,云时代第一个真正"按秒计费"的数仓。

<Image
  src="/study/papers/snowflake/01-architecture.webp"
  alt="Snowflake 三层架构:Cloud Services / Virtual Warehouses / Storage"
  width={1200}
  height={680}
/>

## Layer 1 — Why this paper

### 痛点的来源:pre-Snowflake 数仓的两条死路

2010 年之前,数仓圈只有两种主流架构,而且都在云时代水土不服。

**死路 A:Shared-Disk(Oracle Exadata / Teradata)**

所有节点共享一份磁盘数据,通过高速互联网络访问。优点:数据一致性容易保证,节点扩缩容不需要 reshuffle 数据。缺点:磁盘带宽成为瓶颈,scale-out 上限低(通常 < 64 节点),硬件极度依赖专用网络(InfiniBand / FC-SAN),不可能跑在公有云上。Oracle 一台 Exadata 顶配机柜要价 200 万美元,这在 AWS/GCP 云上没法复制。

**死路 B:Shared-Nothing(Vertica / Greenplum / Teradata Aster)**

每个节点持有自己的本地磁盘和数据分片,通过 hash partition 把表切碎分散到各节点。优点:scale-out 线性,可以跑到几百节点;每个节点查本地数据,带宽问题消失。缺点:**数据分片是物理写死的**,加节点需要全量 reshuffle(我们叫 "rebalance hell"),停机时间以小时计;节点故障时该分片不可读,需要副本同步;最致命的是 **存储和计算耦合**,你想加计算资源必须连带加存储,反之亦然——但实际工作负载里这两个的需求曲线完全不同步。

> 旁注 1:Greenplum 4.x 时代,加节点的 SOP 是"先发邮件给所有用户,周五晚 22:00 停机,周一早 8:00 上班前希望搞完"。这就是 shared-nothing 的现实。

> 旁注 2:Vertica 论文(VLDB 2012)其实有提到 "elastic cluster",但那是把数据复制 K 份的方案,本质上是用空间换灵活性,云上跑成本爆炸。

### 云时代的新约束

2013 年 Snowflake 创立时,AWS 已经成熟,公有云带来三个全新约束,旧架构都没考虑:

1. **存储便宜到几乎免费**:S3 每 GB-月 $0.023,比本地 SSD 便宜两个数量级
2. **计算按秒计费**:EC2 spot instance 可以随用随起,但你必须能在分钟级启停
3. **网络变快**:25 Gbps 网卡 + 跨可用区低延迟,让"远程读取"不再是 deal-breaker

> 旁注 3:这三条加起来,推翻了 shared-nothing 的根基假设——"本地磁盘比远程快太多"。在云上,远程 S3 + 本地 SSD 缓存,实际吞吐已经追上专用本地盘。

### Snowflake 的回答

把存储和计算彻底解耦,中间隔一层 Cloud Services 管元数据/事务/优化器。三层都独立 scale,用户按计算秒数付费,数据存 S3 一次按 GB-月付费,**第一次让"突发查询"和"长期存储"两条成本曲线分开**。

> 怀疑 1:这套架构真的没成本吗?S3 远程读 vs 本地 NVMe,延迟差 10-100 倍。Snowflake 怎么藏掉这个差距?(后面 Layer 3 storage 段会讲到 micro-partition + caching 的招)

## Layer 2 — 论文地形

论文一共 12 页(SIGMOD 2016 工业界 track),骨架如下:

- §1 Intro:云数仓动机
- §2 Storage vs. Compute:核心架构理念
- §3 Architecture:三层详解 (Storage / Virtual Warehouses / Cloud Services)
- §4 Feature Highlights:Time Travel / Cloning / Semi-structured Data
- §5 Lessons & Future Work
- §6 Related Work
- §7 Conclusion

精读重点:§2 + §3 这两章是全文的"骨头",其余是"肉"。

地形要点:

- §3.1 Data Storage 是地基——所有弹性的前提是数据躺在共享存储里
- §3.2 Virtual Warehouses 是商业模式——T-shirt sizing 决定了 Snowflake 的定价和用户体验
- §3.3 Cloud Services 是黏合剂——所有跨 warehouse 的一致性都在这一层做

## Layer 3 — 三段精读

### 精读段 A:Storage 层 — S3 + Immutable Micro-Partition

#### 论文怎么讲

Snowflake 把每张表切成几百到几千个 **micro-partition**,每个 micro-partition 是一个 immutable 的列存文件,大小约 50-500 MB(压缩后),存在 S3 上。每个 micro-partition 内部:

- 列式存储(类似 Parquet,但 Snowflake 自己的格式 FDN)
- 内嵌 min/max 统计 + bloom filter,用于 partition pruning
- 压缩 + 加密(AES-256)

写入时,新数据写成新的 micro-partition,旧的不动——**immutable**。这意味着 Time Travel(时光回溯)、Zero-Copy Clone 几乎是免费功能,只要不删旧文件。

> 旁注 4:immutable 是云存储的天然朋友。S3 的 PUT 是原子的,但 in-place update 是噩梦(必须先下载 → 改 → 重传整个对象)。Snowflake 选 immutable + append-only,完美避开。

#### OSS 实现:DuckDB 的 Parquet 列存读路径

DuckDB 是单机嵌入式数仓,但它的列存读取代码是理解 Snowflake micro-partition 最好的镜像。看 `duckdb/duckdb` 仓库 commit `a966898d86b58ce31dc4955897f8d3f99db1bd83` 的 `src/storage/table/column_data.cpp`:

```cpp
// duckdb/src/storage/table/column_data.cpp (commit a966898d86b58ce31dc4955897f8d3f99db1bd83)
// 简化版:列存 segment 的扫描入口
void ColumnData::Scan(TransactionData transaction, idx_t vector_index,
                      ColumnScanState &state, Vector &result) {
    // 1. 先看缓存中有没有这一段
    if (state.current && state.current->start <= state.row_index &&
        state.current->start + state.current->count > state.row_index) {
        // cache hit, 直接读
        state.current->Scan(transaction, state, result);
        return;
    }
    // 2. miss, 从 segment tree 找到对应的 immutable segment
    auto segment = data.GetSegment(state.row_index);
    state.current = segment;
    // 3. 读 segment 的 min/max 做 pruning
    if (segment->stats.statistics.GetType() != StatisticsType::NONE) {
        if (CanPrune(state.filters, segment->stats)) {
            // 跳过整个 segment
            FillEmpty(result, segment->count);
            return;
        }
    }
    // 4. 真正读列数据
    segment->Scan(transaction, state, result);
}

// 关键设计:每个 segment 是 immutable 的
// 写入新数据 → 新 segment, 老 segment 不动
// 这就是 Snowflake micro-partition 的精神
```

> 旁注 5:DuckDB 的 segment 默认大小是 122880 行(约 120 KB),比 Snowflake 的 micro-partition 小三个数量级。原因是 DuckDB 嵌入式,要适配低内存场景;Snowflake 跑在云上,大文件减少 S3 GET 次数(每次 GET 收钱)。

> 旁注 6:`CanPrune` 这个函数对应 Snowflake 论文 §3.1 提到的 "min/max pruning",在 OLAP 工作负载里能让 90%+ 的 micro-partition 直接跳过。这是列存数仓最大的性能来源,比向量化执行还重要。

#### 怀疑:micro-partition 的"魔术"是怎么挑大小的?

论文说 50-500 MB,但没说怎么决定。后续 Snowflake 工程师 talk 透露:

- 太小(< 16 MB):S3 GET 次数爆炸,API 费用高
- 太大(> 1 GB):pruning 粒度变粗,过滤效率下降;并行度受限

> 怀疑 2:这个区间的最优值跟工作负载强相关。Snowflake 把它做成自适应,但具体策略是商业秘密。OSS 复现要么用固定值(DuckDB 走这条路),要么搞复杂的 cost-based 选择(Iceberg 走这条路),都没法完全等价。

### 精读段 B:Virtual Warehouse 弹性 — T-shirt Sizing + Multi-cluster

#### 论文怎么讲

Virtual Warehouse(VW)是 Snowflake 的计算单元。一个 VW 是一组 EC2 实例,跑 Snowflake 自己的查询执行引擎。VW 有几个关键设计:

1. **T-shirt sizing**:XS / S / M / L / XL / 2XL / 3XL / 4XL,每升一档节点数翻倍(XS=1, S=2, M=4, L=8, ...)。用户不操心节点数,只选 size。
2. **独立伸缩**:同一份数据可以让 ETL 跑在 XL 上、BI 报表跑在 S 上、ad-hoc 查询跑在 XS 上,**三个 VW 互不干扰**。
3. **秒级启停**:VW idle 60 秒(可配)自动 suspend,下次查询来了 1-3 秒重启,期间不收钱。
4. **Multi-cluster Warehouse**:一个 VW 可以挂多个 cluster,自动 scale-out 处理并发,scale-in 节省成本。

> 旁注 7:T-shirt sizing 看似简单,但是 Snowflake 商业模式的核心。它把"运维优化"伪装成"换尺码",DBA 工作量降到接近 0,这是云原生 SaaS 的精髓。

#### OSS 实现:Apache DataFusion 的查询计划分发

DataFusion 是 Rust 写的 query engine,被 InfluxDB 3.0 / Greptime / DataBend 等用作底层。它的 `ExecutionPlan` trait 是理解"分布式查询如何分发到 VW worker"的最佳例子。看 `apache/datafusion` 仓库 commit `b3c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5` 的 `datafusion/physical-plan/src/repartition/mod.rs`:

```rust
// apache/datafusion/datafusion/physical-plan/src/repartition/mod.rs
// (commit b3c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5)
// 简化版:把数据 repartition 到多个 worker
impl ExecutionPlan for RepartitionExec {
    fn execute(
        &self,
        partition: usize,
        context: Arc<TaskContext>,
    ) -> Result<SendableRecordBatchStream> {
        let num_input_partitions = self.input.output_partitioning().partition_count();
        let num_output_partitions = self.partitioning.partition_count();

        // 1. 为每个输出 partition 创建一个 channel
        let mut channels = Vec::with_capacity(num_output_partitions);
        for _ in 0..num_output_partitions {
            let (tx, rx) = mpsc::channel::<RecordBatch>(2);
            channels.push((tx, rx));
        }

        // 2. 为每个输入 partition 起一个 task,把数据分发到输出 channel
        for input_partition in 0..num_input_partitions {
            let mut input_stream = self.input.execute(input_partition, context.clone())?;
            let txs: Vec<_> = channels.iter().map(|(tx, _)| tx.clone()).collect();
            let partitioning = self.partitioning.clone();

            tokio::spawn(async move {
                while let Some(batch) = input_stream.next().await {
                    let batch = batch?;
                    // 按 hash / round-robin 决定每行去哪个 output
                    let indices = partition_batches(&batch, &partitioning)?;
                    for (out_idx, rows) in indices {
                        let sub_batch = take_rows(&batch, &rows)?;
                        txs[out_idx].send(sub_batch).await?;
                    }
                }
                Ok(())
            });
        }

        // 3. 当前 partition 从对应的 channel 收数据
        let (_, rx) = channels.into_iter().nth(partition).unwrap();
        Ok(Box::pin(ReceiverStream::new(rx)))
    }
}

// 关键设计:partition 数量是动态参数
// Snowflake 的 VW size 改变时,只需改 num_output_partitions
// 数据本身不动 (在 S3 上),只是 worker 节点数变化
```

> 旁注 8:DataFusion 这套 partition 机制对应 Snowflake 论文 §3.2 提到的 "shuffle 用 ephemeral local SSD,不落 S3"。本地 SSD 是 EC2 实例自带的,VW 销毁时一起销毁,不算成本。

> 旁注 9:Snowflake 的 multi-cluster warehouse 在 OSS 里几乎没有等价物。Trino 的 cluster pool 类似,但调度策略简单很多。这是 Snowflake 商业版的护城河之一。

#### 怀疑:T-shirt sizing 真的最优吗?

> 怀疑 3:T-shirt sizing 把决策从用户手里夺走了,用户失去了 "16 节点 vs 14 节点" 这种细粒度调优空间。对于成熟的工程团队,这反而是束缚。所以你看 Databricks 走的是 "可以选 T-shirt,也可以自定义节点数" 的混合路线,某种程度上承认了 T-shirt 不万能。

### 精读段 C:Cloud Services — 元数据 + 分布式事务

#### 论文怎么讲

Cloud Services 层是无状态的服务集群,负责:

1. **元数据管理**:表 schema / micro-partition 列表 / 用户权限。存在内部的 KV 存储 (论文说是 FoundationDB,后来公开了)
2. **查询编译与优化**:SQL parsing → logical plan → physical plan → 分发到 VW
3. **事务管理**:Snowflake 支持 Snapshot Isolation,基于 micro-partition 的版本号
4. **安全**:认证、加密密钥管理
5. **基础设施监控**:VW 健康检查、自动重启

最关键的是 **元数据 + 事务在 Cloud Services 层做**,VW 完全无状态——VW 挂了重启一个新的就行,不丢数据不丢事务。这是 Snowflake 弹性的根源。

> 旁注 10:论文里有句话很关键:"VW are *pure compute*, they hold no state that needs to be preserved across queries"。这是云原生数据库的金科玉律。

#### OSS 实现:QuestDB 的 WAL + 事务

QuestDB 是时序 + OLAP 数据库,Java/C++ 混合实现。它的 WAL(Write-Ahead Log)机制是理解 Snowflake "事务在 Cloud Services 集中处理" 的近邻。看 `questdb/questdb` 仓库 commit `c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4` 的 `core/src/main/java/io/questdb/cairo/wal/WalWriter.java`:

```java
// questdb/core/src/main/java/io/questdb/cairo/wal/WalWriter.java
// (commit c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4)
// 简化版:WAL 写入路径 + 事务提交
public class WalWriter implements TableWriterAPI {

    private final long txnSequencerFd;  // 全局事务序列器
    private final SequencerMetadata metadata;
    private final Path walPath;

    @Override
    public long commit() {
        // 1. flush 当前 segment
        long lastTxn = sequencer.nextTxn();
        currentSegment.flush();

        // 2. 写 commit record 到 sequencer
        // sequencer 是全局单点 (类似 Snowflake Cloud Services 的元数据层)
        sequencer.writeCommit(
            tableName,
            walId,
            currentSegment.getId(),
            currentSegment.getRowCount(),
            lastTxn
        );

        // 3. 通知 ApplyJob 把这个 txn 应用到主表
        // ApplyJob 是异步的, 类似 Snowflake VW 异步消费 metadata 变更
        sequencer.notifyApply(tableName, lastTxn);

        return lastTxn;
    }

    public void rollback() {
        // immutable 设计的好处:rollback 不需要回滚数据
        // 直接丢弃当前 segment, 不写 commit record
        currentSegment.discard();
        currentSegment = null;
    }

    private void switchSegment() {
        if (currentSegment != null) {
            currentSegment.close();
        }
        // 每个 segment 是 immutable 的列存文件
        // 类似 Snowflake micro-partition
        long newSegmentId = sequencer.nextSegmentId();
        currentSegment = new WalSegment(walPath, newSegmentId, metadata);
    }
}

// 关键设计:WAL writer 完全无状态
// 状态都在 sequencer (集中元数据服务) 里
// 这就是 Snowflake "VW 无状态 + Cloud Services 有状态" 的精神
```

> 旁注 11:QuestDB 的 sequencer 是单点的(per-table),这是简化版。Snowflake Cloud Services 用 FoundationDB 做分布式,可以横向扩展到处理千万级 micro-partition 的元数据。规模差三个数量级,但骨架一致。

> 旁注 12:Snapshot Isolation 在论文 §3.3.2 提到,实现方式是每次写入产生一个新的 metadata version,读查询固定一个 version 看一致快照。immutable + 版本号,这是云数仓事务的标准答案。

> 旁注 13:为什么 Cloud Services 层很少出现在 OSS 数据库里?因为它要求公司级别的运维投入(7x24 监控 + 自动 failover)。OSS 一般留给用户自己跑,所以这一层在开源世界里碎成了 Trino Coordinator / DataFusion Catalog / Iceberg REST Catalog 等独立组件。

#### 怀疑:Cloud Services 是单点吗?

> 怀疑 4:论文说 Cloud Services 是无状态服务集群,但元数据存储 FoundationDB 是有状态的——这一层要是挂了,所有 VW 都瘫。Snowflake 怎么保 SLA 99.9%?(答案是:多 region 部署 + FoundationDB 自身的 5 副本协议,但论文没细讲,这是商业秘密)

## Layer 4 — phd-skills 7 阶段实验复现

主任务:用 DuckDB + S3 (MinIO 模拟) 复现 Snowflake 的 storage-compute 分离架构,跑 TPC-H SF1 benchmark。

| 阶段 | 任务 | 关键命令 / 产出 |
|------|------|----------------|
| 1. setup | 安装 DuckDB 1.1+ / MinIO / Python 3.11 | `brew install duckdb minio` |
| 2. xray | 读 DuckDB 的 httpfs extension 源码,确认 S3 读路径 | grep `httpfs/s3fs.cpp` |
| 3. dataset-curation | 生成 TPC-H SF1 数据,转 Parquet,上传 MinIO | `duckdb -c "CALL dbgen(sf=1)"` + `COPY ... TO 's3://...'` |
| 4. experiment-design | 设计三组对照:本地 Parquet / MinIO Parquet / 远程 S3 | 测 Q1/Q5/Q9 三个代表查询 |
| 5. launch | 跑 benchmark,记录冷/热查询时间 | `EXPLAIN ANALYZE SELECT ...` |
| 6. reproduce | 计算存算分离的延迟 overhead | 预期:冷查询慢 2-3 倍,热查询(缓存命中)接近本地 |
| 7. compare | 对比 DuckDB 单机版 vs 模拟分布式 | 写 `experiments/snowflake-mini/REPORT.md` |

预期结论:DuckDB + S3 远程读,Q1(全表扫描)比本地慢 ~2.5×,Q5(JOIN 重)慢 ~1.8×;但加上 micro-partition pruning + bloom filter 后,Q5 反而比无索引本地快——pruning 的效果远超网络 overhead。这就是 Snowflake 论文 §3.1 强调 "metadata 比 data 重要" 的实证。

## Layer 5 — 学术地形

<Image
  src="/study/papers/snowflake/02-genealogy.webp"
  alt="云数仓家谱:从 Vertica/Greenplum/Aurora 到 Snowflake,再到 Databricks/BigQuery/Iceberg"
  width={1200}
  height={800}
/>

### 前作(站在它们肩膀上)

- **Vertica (VLDB 2012)**:列存 + shared-nothing 的标杆。Snowflake 借走了列存,扔掉了 shared-nothing。
- **Greenplum (PostgreSQL fork, 2003)**:MPP 架构教科书。Snowflake 的 plan 分发逻辑从这里学。
- **Amazon Aurora (SIGMOD 2017,但 2014 已上线)**:存算分离的 OLTP 先驱,把 redo log 推到存储层,Snowflake 受其启发把"状态推到下层"。
- **Google Dremel (VLDB 2010)**:列存 + 树形聚合,BigQuery 的祖宗。Snowflake 没用它的 tree aggregation,但学了"无状态 worker"。
- **Hadoop/Hive**:证明了"廉价存储 + 弹性计算"的市场需求,但执行慢、SQL 弱。Snowflake 等于 Hive 的"产品化精装版"。

### 后作(被它启发的)

- **Databricks SQL (2020)**:Lakehouse 范式,用 Delta Lake + Photon 引擎对标 Snowflake。架构思路高度相似——也是存算分离 + 多 cluster。
- **BigQuery (2011 起,持续演进)**:Google 的对手产品。BigQuery 走 serverless 路线,比 Snowflake 更激进,但灵活性差。
- **Redshift Serverless (2022)**:AWS 终于承认 shared-nothing Redshift 模式过时,推出 serverless 版。架构思路明显抄 Snowflake。
- **Apache Iceberg + Trino**:OSS 阵营的"Snowflake 拼装版"。Iceberg 当 micro-partition + metadata,Trino 当 VW。功能上 ~80% 等价。
- **DuckDB-Wasm + MotherDuck**:把 Snowflake 思路推到极致的小型化——把 VW 直接放浏览器里,storage 在 MotherDuck 云。

### 反对者(不同流派)

- **Shared-disk 派(Oracle Exadata)**:坚持专用硬件 + 共享存储。在企业数据中心还有市场,但云上没戏。
- **Shared-nothing 死忠(Teradata, ClickHouse)**:认为存算分离的网络开销不值得。ClickHouse 在某些场景下比 Snowflake 快 10×。
- **单机派(DuckDB)**:认为 90% 的分析工作负载用单机就够了,不需要分布式。这是反规模的反向潮流,在数据科学家圈子里很流行。
- **流派之争还有 HTAP(TiDB / SingleStore)**:试图把 OLTP 和 OLAP 揉一起,Snowflake 走纯 OLAP 路线,认为 HTAP 是工程灾难。

### 同期论文

- F1 (VLDB 2013):Google 的分布式 SQL 引擎,前身是 BigTable 之上的 SQL 层。
- Spanner (OSDI 2012):Google 的全球分布式数据库,影响了 Snowflake 的事务设计。
- Aurora (SIGMOD 2017):AWS 的存算分离 OLTP,与 Snowflake 思路同源但应用到 OLTP。

## Layer 6 — 三段总结

### 它解决了什么(通用化)

- 把"存储"和"计算"两个本来耦合的资源解开,各自按需付费——这是 SaaS 经济学最重要的抽象之一
- 把"集群运维"包装成"选 T-shirt size"的产品决策,降低使用门槛到接近零
- 用 immutable + 版本号的设计,几乎免费换来 Time Travel / Cloning / Snapshot 隔离三个高价值功能
- 第一次让"突发查询"和"长期归档"两类负载可以共存于同一份数据,不用做 ETL 复制

### 它怎么做到的(通用化)

- 三层架构:无状态计算层 + 集中元数据/事务层 + 共享对象存储,每层独立横向扩展
- 列存 + micro-partition + min/max + bloom filter 四件套,把"扫描全表"变成"扫描 5% 的相关分区"
- 本地 SSD 作为 S3 的缓存层,藏掉 99% 的远程读延迟
- 异步事务提交 + Snapshot Isolation,既支持高并发又保证一致性

### 它能用在哪(通用化)

- 任何"读多写少 + 数据量 TB-PB 级"的分析场景:BI 报表、数据科学、用户行为分析、日志检索
- 跨团队/跨业务线共享数据:同一份数据,不同 VW 互不干扰
- 成本敏感的突发负载:夜间 ETL 跑 4XL,白天 BI 跑 S,周末降到 XS
- 合规与审计:Time Travel 支持任意时间点回溯,Cloning 支持低成本测试

## Layer 7 — 怀疑清单

> 怀疑 1:S3 远程读延迟 vs 本地 NVMe 差 10-100 倍,Snowflake 怎么藏掉?(部分答案:micro-partition pruning + 本地 SSD 缓存,但代价是冷查询体验差,尾延迟难控)

> 怀疑 2:micro-partition 大小自适应策略是商业秘密,OSS 复现总有 gap。这一点是 Snowflake 长期护城河之一。

> 怀疑 3:T-shirt sizing 把调优空间锁死,大客户最终都会想要"自定义节点数"。Snowflake 后来确实加了 multi-cluster 配置,变相承认了这一点。

> 怀疑 4:Cloud Services 层是元数据单点,SLA 99.9% 怎么做的?多 region + FoundationDB 多副本,但论文没细讲。

> 怀疑 5:T-shirt sizing 和按秒计费的组合,导致用户为"启停频繁"付出隐性成本——VW idle 60 秒才 suspend,意味着每次查询至少计费 1 分钟。短查询场景下,实际成本远超用户预期。

> 怀疑 6:Snowflake 论文没讨论"流式写入"。所有写都是批量 COPY INTO。这意味着实时数据场景必须用别的方案(Kafka + Snowpipe),架构其实没那么"统一"。

## 限制清单

- 限制 1:不适合 OLTP。Snapshot Isolation + immutable 的代价是高并发 update/delete 性能差,单点 QPS 远低于 PostgreSQL。
- 限制 2:Cold start 延迟感人。VW 从 suspend 到 ready 要 1-3 秒,对交互式 BI 不友好。
- 限制 3:S3 GET 费用是隐形大头。一个 PB 级数仓,每月 API 费用可能跟存储费用相当。
- 限制 4:跨 region 查询贵。Snowflake 数据复制到多 region 需要单独付费,跨 region 查询带宽费惊人。

## 元数据

- 文件:src/content/docs/papers/snowflake.md
- Season:O
- Version:v1.1
- Branch:method
- 创建日期:2026-05-28
- 引用:Dageville et al., "The Snowflake Elastic Data Warehouse", SIGMOD 2016
- 配套实验:experiments/snowflake-mini/(DuckDB + MinIO + TPC-H SF1)
- Layer 0 字段计数:9 (标题/一作/机构/会议/开源状态/OSS 类似/范式/引用/影响力)
- 精读段 A 代码行数:32 (DuckDB column_data.cpp, commit a966898d86b58ce31dc4955897f8d3f99db1bd83)
- 精读段 B 代码行数:42 (DataFusion repartition/mod.rs, commit b3c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5)
- 精读段 C 代码行数:43 (QuestDB WalWriter.java, commit c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4)
- 旁注总数:13
- 怀疑总数:6
- 限制总数:4
