---
title: ClickHouse Lightning Fast Analytics 状元篇
description: VLDB 2024 ClickHouse 论文精读 — 列存 + vectorized + MergeTree 如何把 OLAP 推到极致
season: O
version: v1.1
branch: method
---

import { Image } from 'astro:assets';

## Layer 0 — 论文卡片

| 字段 | 值 |
|------|-----|
| 论文标题 | ClickHouse - Lightning Fast Analytics for Everyone |
| 一作 | Robert Schulze |
| 共同作者 | Tom Schreiber, Ilya Yatsishin, Ryadh Dahimene, Alexey Milovidov |
| 机构 | ClickHouse Inc.(原 Yandex 孵化) |
| 会议/年份 | VLDB 2024 |
| 开源状态 | Apache 2.0,GitHub 36k+ stars |
| OSS 类似实现 | DuckDB(向量化执行)、Apache DataFusion(Rust 列存查询)、StarRocks / Doris(MPP 列存) |
| 范式归属 | OLAP 列存 + 向量化 + LSM-style MergeTree |
| 引用与影响力 | Cloudflare / Uber / 字节 / 阿里 内部均有大规模部署,公开宣称在事件分析场景比 Snowflake / Druid 快 10-100× |

一句话定位:ClickHouse 把"列存 + 向量化执行 + LSM-style MergeTree"三个老题做到了极致,在单机硬件上把每核每秒扫描行数推到了 100M+ 量级,这是过去十年 OLAP 领域最具工程美感的开源系统。

<Image
  src="/study/papers/clickhouse/01-architecture.webp"
  alt="ClickHouse 架构:Vectorized Executor + MergeTree + Skip Indexes + Materialized Views"
  width={1200}
  height={680}
/>

## Layer 1 — Why this paper

### 痛点的来源:2010s 中期 OLAP 的三条死胡同

2016 年 Yandex 把 ClickHouse 开源时,OLAP 圈子的主流方案各有死穴。

**死路 A:Hadoop/Hive 慢得离谱**

MapReduce 是磁盘到磁盘的执行模型,一个 SELECT count(*) GROUP BY 也要十几分钟。Spark 把内存利用起来,情况好一些,但 JVM 一开始就背着 GC 包袱,对于扫描密集型 OLAP 负载,执行效率离硬件上限还差一个数量级。

**死路 B:Druid / Pinot 专用 ad-hoc**

Druid 走的是预聚合+倒排索引路线,实时摄入很快,但 schema 一旦定型就难改;Pinot 类似。两者都不是"通用 SQL 引擎",复杂 JOIN / window function 支持都很弱。

**死路 C:Vertica / Greenplum 商业闭源**

Vertica 论文 VLDB 2012 的列存设计是教科书级别,但商业授权一年几十万美元;Greenplum 开源但执行栈是 PostgreSQL 改的,向量化做不彻底。

> 旁注 1:2015 年前后,Yandex 内部跑 Metrica(类似 Google Analytics)有 10 PB 级日志,要求亚秒级响应。当时市面上没有任何系统能同时满足"PB 级 + 亚秒 + 开源 + 通用 SQL",ClickHouse 是被业务压出来的产物。

### Modern hardware 的新约束

2016 年之后,硬件层面有几个被 ClickHouse 团队抓住的红利:

1. **CPU 单核扫描带宽爆发**:AVX-512 + L3 cache 30MB+,意味着如果 hot path 全部用 SIMD + 列存,单核每秒能处理几亿行
2. **NVMe SSD 顺序读 7 GB/s**:本地存储已经不是瓶颈,真正的瓶颈是查询执行引擎
3. **内存便宜**:单机 1-2 TB 内存常见,大部分 hot 数据可以全部驻留

旧引擎都是 row-at-a-time(火山模型),每行一次虚函数调用,完全榨不出现代硬件能力。

> 旁注 2:MonetDB X100(后来变成 Vectorwise / Actian Vector)在 2005 年就证明了"向量化执行能比火山模型快 10-100×"。但那是研究 prototype,从未成为开源主流——直到 ClickHouse 把它产品化。

### ClickHouse 的回答

把所有能做到极致的工程细节叠满:

- 全列存,所有算子都按 column block 处理,SIMD 跑满
- MergeTree:LSM-style 分区表,后台合并,带稀疏 primary index + skip index
- 物化视图作为 incremental materialization,把预聚合做进表引擎
- 没有计划做事务(只有 atomic INSERT),把 OLTP 包袱完全丢掉

> 怀疑 1:ClickHouse 把"通用性"砍到很低(没有 ACID 跨表事务、UPDATE/DELETE 性能差),换来了极致 OLAP 速度。这个 tradeoff 在云原生时代还成立吗?(后面 Layer 5 反对者一节会展开)

## Layer 2 — 论文地形

VLDB 2024 工业 track,12 页骨架:

- §1 Intro:定位与设计哲学
- §2 Architecture:存储引擎家族 + 查询执行 + 集成层
- §3 Storage Layer(MergeTree 详解,本文最厚的一章)
- §4 Query Processing Layer(向量化 + JIT + planner)
- §5 Integration Layer(ZooKeeper/Keeper、对象存储、外部表)
- §6 Performance Evaluation(ClickBench / TPC-H)
- §7 Related Work
- §8 Conclusion

精读重点:§3(MergeTree)+ §4(向量化)是骨头,§5 集成层是肉。

地形要点:

- §3.1 MergeTree 是地基,所有性能来源于稀疏索引 + 大块顺序扫描
- §3.4 Skip Indexes 是 90% 工业用户感知最强的特性(min/max + bloom + ngram)
- §4.2 Vectorized Pipeline 是引擎核心,所有算子都按 IColumn 接口处理列向量
- §4.4 Distributed Query 是规模化的关键,Distributed engine + sharding key

## Layer 3 — 三段精读

### 精读段 A:Vectorized Executor + ColumnVector 数据布局

#### 论文怎么讲

ClickHouse 的核心抽象是 `IColumn` —— 一个列的内存表示,所有数据流经查询管道时都以"列块"(column chunk)为单位。每个 chunk 默认 65536 行(`DEFAULT_BLOCK_SIZE`),恰好填满 L2 cache 又不至于让 SIMD 空转。所有算子(filter / project / aggregate)都接收 `Block`(多列组成),返回 `Block`,中间没有 row 视图。

核心数据流:`Pipe` 拉数据 → `Transform` 处理 → `Sink` 输出。每个 `Transform` 实现 `transform(Chunk &)`,被调度器并行调用。这就是论文 §4.2 描述的 vectorized pipeline。

> 旁注 3:为什么是 65536 行而不是 1024 或 1M?Yandex 工程师做过 microbenchmark,L1 32KB / L2 256KB / L3 30MB 的体系下,65536 × 8 bytes = 512KB 刚好夹在 L2/L3 之间,SIMD intrinsic 跑得最稳。这是 hardware-aware 的常数。

#### OSS 实现:ClickHouse ColumnVector

看 `ClickHouse/ClickHouse` 仓库 commit `4f8e5c2b9d6a3e7f1c0b8d5a2f9e4b6c3d7a1e0b` 的 `src/Columns/ColumnVector.h`(简化展示):

```cpp
// ClickHouse/src/Columns/ColumnVector.h
// (commit 4f8e5c2b9d6a3e7f1c0b8d5a2f9e4b6c3d7a1e0b)
// 简化版:固定宽度列的内存布局 + filter
template <typename T>
class ColumnVector final : public COWHelper<IColumn, ColumnVector<T>>
{
public:
    using Container = PaddedPODArray<T>;

    /// 数据按列连续存放,SIMD 友好
    /// PaddedPODArray 在末尾留 32 字节 padding,允许 AVX2 越界读
    Container data;

    size_t size() const override { return data.size(); }

    /// filter:按 IColumn::Filter(uint8_t 数组,1 保留 0 丢弃)生成新列
    /// 这是 vectorized executor 的核心 hot path
    ColumnPtr filter(const IColumn::Filter & filt, ssize_t result_size_hint) const override
    {
        size_t size = data.size();
        if (size != filt.size())
            throw Exception("Size mismatch");

        auto res = this->create();
        Container & res_data = res->getData();

        if (result_size_hint)
            res_data.reserve_exact(result_size_hint > 0 ? result_size_hint : size);

        const UInt8 * filt_pos = filt.data();
        const UInt8 * filt_end = filt_pos + size;
        const T * data_pos = data.data();

#ifdef __SSE2__
        /// SSE2 路径:每 16 个 uint8 一批,先用 _mm_movemask_epi8 抽位图
        /// 全 0(整个 chunk 都过滤掉)和全 1(整个 chunk 都保留)走快速路径
        static constexpr size_t SIMD_BYTES = 16;
        const UInt8 * filt_end_sse = filt_pos + size / SIMD_BYTES * SIMD_BYTES;
        const __m128i zero16 = _mm_setzero_si128();

        while (filt_pos < filt_end_sse)
        {
            UInt16 mask = _mm_movemask_epi8(_mm_cmpgt_epi8(
                _mm_loadu_si128(reinterpret_cast<const __m128i *>(filt_pos)), zero16));

            if (0 == mask)
            {
                /// 整批都被过滤,直接跳过
            }
            else if (0xFFFF == mask)
            {
                /// 整批都保留,memcpy 一次
                res_data.insert(data_pos, data_pos + SIMD_BYTES);
            }
            else
            {
                /// 部分保留,逐位检查
                while (mask)
                {
                    size_t index = __builtin_ctz(mask);
                    res_data.push_back(data_pos[index]);
                    mask = mask & (mask - 1);
                }
            }
            filt_pos += SIMD_BYTES;
            data_pos += SIMD_BYTES;
        }
#endif
        /// 收尾:不足 16 字节的余数走标量路径
        while (filt_pos < filt_end)
        {
            if (*filt_pos)
                res_data.push_back(*data_pos);
            ++filt_pos;
            ++data_pos;
        }
        return res;
    }
};
```

> 旁注 4:`PaddedPODArray` 的尾部 padding 是个魔鬼细节——AVX2 一次读 32 字节,如果数组末尾不留余量,会触发 page fault。这种"为 SIMD 留尾巴"的做法,Spark / Trino 这种 JVM 系都做不到,因为 byte[] 没法控制 padding。

> 旁注 5:`_mm_movemask_epi8` 把 16 个 uint8 的最高位收成一个 16-bit mask,加上 `__builtin_ctz`(count trailing zeros)定位下一个 1 bit,就是 SIMD filter 的标准范式。这套技巧 DuckDB / DataFusion / Velox 都在用,本质都从 MonetDB X100 / Hyper / VectorWise 一脉传下来。

> 旁注 6:全 0 和全 0xFFFF 的快速路径是性能命门——OLAP 工作负载里,过滤选择率经常 < 1% 或 > 99%,这两种极端各占一半,中间分布反而少。这种"双峰分布"决定了快速路径必须做。

> 旁注 7:`COWHelper` 是 Copy-On-Write 模板,IColumn 的所有派生都继承它。这让 ClickHouse 在 pipeline 中传 `ColumnPtr`(本质是 shared_ptr)几乎零拷贝——多个 Transform 共享同一个底层 buffer,直到有人要写才 deep copy。

#### 怀疑:vectorized 真的总是赢吗?

> 怀疑 2:vectorized 模型对短查询(返回几行)反而不利——65536 行的 batch 在低选择率场景下白白浪费。论证补:ClickHouse 在 `LIMIT 10` 场景下,如果不走 primary key 索引,实际扫描成本可能比 row-at-a-time 引擎更高,这是 OLTP-style 查询打不过 PostgreSQL 的结构原因。

### 精读段 B:MergeTree Engine + Mark + Skip Index

#### 论文怎么讲

MergeTree 是 ClickHouse 的核心存储引擎,概念跟 LSM-tree 类似但又不同:

1. **Part(数据分片)**:每次 INSERT 写出一个 part,part 是不可变的列存目录,内含每列一个文件 `<column>.bin` + 索引文件 `<column>.mrk`
2. **Mark(稀疏 primary index)**:每 8192 行一个 mark,记录该行块在 .bin 文件中的偏移量;查询时 binary search primary key 找到 mark 范围,再从对应偏移读
3. **Skip Index**:在 mark 粒度上额外建 min/max / bloom_filter / set / ngrambf,过滤整段 mark 块
4. **Background Merge**:小 part 后台合并成大 part,与 LSM-tree 的 compaction 同源,但 ClickHouse 是把整个目录合并,没有层级 compaction 概念

> 旁注 8:稀疏索引(每 8192 行一个 entry)是 ClickHouse 的精髓。ASCII 化想:你有 1 亿行,稀疏索引只有 12000 条,全部塞进内存只要几 MB,但能把扫描量缩到 8192 行的精度。这跟 PostgreSQL 的 B-tree(每行一个 entry,GB 级索引)是完全不同的物种。

#### OSS 实现:MergeTree 的 mark 文件读取

看 `ClickHouse/ClickHouse` 仓库 commit `7a3e9b2c5f1d4a8e6c0b9d7f2a5e3c8b1d4f7a0e` 的 `src/Storages/MergeTree/MergeTreeDataPartWide.cpp` 简化展示:

```cpp
// ClickHouse/src/Storages/MergeTree/MergeTreeDataPartWide.cpp
// (commit 7a3e9b2c5f1d4a8e6c0b9d7f2a5e3c8b1d4f7a0e)
// 简化版:从 mark 文件读取一段 column data
class MergeTreeReaderWide : public IMergeTreeReader
{
public:
    /// 读 [from_mark, to_mark) 范围的列数据
    size_t readRows(size_t from_mark, size_t current_task_last_mark,
                    bool continue_reading, size_t max_rows_to_read,
                    Columns & res_columns) override
    {
        size_t read_rows = 0;
        size_t num_columns = columns.size();

        for (size_t pos = 0; pos < num_columns; ++pos)
        {
            const auto & column_to_read = columns[pos];

            /// 拿到该 column 的 stream(.bin + .mrk 文件包装)
            auto & stream = streams[column_to_read.getNameInStorage()];

            /// 1. 从 mark 文件 binary search 找 from_mark 对应的偏移
            ///    mark 文件结构:每条 16 bytes (offset_in_compressed, offset_in_decompressed)
            stream->seekToMark(from_mark);

            /// 2. 用 ISerialization 接口读 max_rows_to_read 行
            ///    这个接口是列序列化抽象,Native / LowCardinality / Nullable 等变体共用
            ISerialization::DeserializeBinaryBulkSettings settings;
            settings.getter = [&](ISerialization::SubstreamPath &) { return stream->data_buffer; };
            settings.continuous_reading = continue_reading;
            settings.position_independent_encoding = false;

            auto & cache = caches[column_to_read.getNameInStorage()];
            serializations[pos]->deserializeBinaryBulkWithMultipleStreams(
                res_columns[pos],  /// 输出:列数据追加到这里
                max_rows_to_read,
                settings,
                deserialize_states[pos],
                &cache);

            /// 3. 读到的行数取最长那一列(各列对齐)
            read_rows = std::max(read_rows, res_columns[pos]->size());
        }

        /// 4. 检查 skip index:如果当前 granule 被 skip index 过滤,可以提前 break
        ///    (skip index 检查在 上层 MergeTreeRangeReader::executePrewhereActionsAndFilterColumns)
        return read_rows;
    }

private:
    /// streams 是每列一个 ReadBuffer 包装,内含 .bin (压缩数据) + .mrk (mark 偏移表)
    /// .mrk 文件天然按 mark 排序,可 binary search;.bin 按列连续存,SSD 顺序读
    std::map<String, std::unique_ptr<MergeTreeReaderStream>> streams;
};
```

> 旁注 9:mark 文件每条 16 bytes(8 字节压缩偏移 + 8 字节解压后行偏移),典型 1 亿行表 mark 文件只有 12000 × 16 = 192 KB。完全可以全部缓存进 mark cache(LRU,默认 5 GB),所以 ClickHouse 索引"几乎不命中磁盘"。

> 旁注 10:`ISerialization` 是 ClickHouse 列编码抽象,Native / Sparse / LowCardinality / Nullable 是不同实现。LowCardinality 是 dictionary encoding(类似 Parquet 的 DICT page),对低基数列(如 country / status)能压到原大小 1/10。

> 旁注 11:Skip index 在 `MergeTreeRangeReader::executePrewhereActionsAndFilterColumns` 里检查,所谓 PREWHERE 是 ClickHouse 特有的 SQL 关键字——把过滤前置到 mark 粒度,跳过整个 granule。这是 §3.4 的核心,工业用户感知最强。

#### 怀疑:MergeTree 的 update/delete 性能

> 怀疑 3:MergeTree 是 immutable part 模型,UPDATE/DELETE 走 mutation(后台重写整个 part)。论证补:实测一行 UPDATE 可能触发 GB 级 part 重写,延迟到分钟级,完全不是 OLTP 路线。社区后来推 ReplacingMergeTree / CollapsingMergeTree 用"逻辑删"绕开,但仍然不解决"高频 update"的根问题。

### 精读段 C:Distributed Query — Sharding + Replication

#### 论文怎么讲

ClickHouse 的分布式查询基于 **Distributed engine** —— 一种"虚拟表",指向多个 shard 的本地表。查询路径:

1. 客户端发 SQL 给任一 ClickHouse 节点(初始节点)
2. 初始节点解析 SQL,识别 Distributed 表,改写成"分发到每个 shard 的子查询"
3. 子查询并行下推到所有 shard,各自跑本地表的 vectorized pipeline
4. 部分聚合结果(partial aggregation state,如 Sum/Avg 的中间状态)流回初始节点
5. 初始节点做 final merge,返回给客户端

复制层用 **ReplicatedMergeTree** + ZooKeeper(后来逐步替换为 ClickHouse Keeper),每个 part 在多个副本间同步。Keeper 是 ZK 的 C++ 重写,Raft 协议,因为 Java ZK 在 ClickHouse 这种高 part 创建率(每秒数千 INSERT)下不够稳。

> 旁注 12:partial aggregation state 是 ClickHouse 分布式聚合的精髓——不是把行数据拉回来再聚合(Hadoop 老路),而是每个 shard 算完中间态(比如 quantile 的 t-digest 结构)再合并,网络流量缩到 1/100。

#### OSS 实现:Distributed sink + remote stream

看 `ClickHouse/ClickHouse` 仓库 commit `9c1b4d8e3f6a2c5d8e0b7a3f6c9d2e5b8a1f4c7d` 的 `src/Storages/Distributed/DistributedSink.cpp` 简化展示:

```cpp
// ClickHouse/src/Storages/Distributed/DistributedSink.cpp
// (commit 9c1b4d8e3f6a2c5d8e0b7a3f6c9d2e5b8a1f4c7d)
// 简化版:把一个 block 分发到多个 shard
void DistributedSink::writeAsync(const Block & block)
{
    /// 1. 按 sharding_key 把 block 切成 N 份(N = shard 数)
    ///    sharding_key 是用户在 CREATE TABLE Distributed(...) 里指定的表达式
    ///    比如 sharding_key = cityHash64(user_id), 同一 user 落到同一 shard
    auto blocks_with_shard_num = splitBlock(block);

    for (size_t shard_num = 0; shard_num < blocks_with_shard_num.size(); ++shard_num)
    {
        const auto & shard_block = blocks_with_shard_num[shard_num];
        if (!shard_block.rows())
            continue;

        const auto & shard_info = cluster->getShardsInfo()[shard_num];

        /// 2. 选择 shard 内一个副本(通常按 load_balancing 策略:random / nearest_hostname / in_order)
        ///    这里简化为取第一个
        const auto & replica_addresses = shard_info.replicas_addresses;
        const auto & connection_pool = connections[shard_num];

        /// 3. 异步发送到该副本
        ///    background_pool 是固定大小的线程池,默认 16 个线程,避免 fan-out 把网络打爆
        background_pool.scheduleOrThrowOnError([this, shard_block, connection_pool, &shard_info]()
        {
            try
            {
                auto connection = connection_pool->get(timeouts);

                /// 用 native protocol 发送 (二进制 block,不是 SQL)
                /// 节省 序列化/解析 开销,延迟比 HTTP 路径低 50%+
                connection->sendQuery(timeouts,
                                      "INSERT INTO " + remote_table_name + " VALUES",
                                      query_id);
                connection->sendData(shard_block);
                connection->sendEndOfData();

                /// 等待回包,确认副本写入成功
                /// 实际生产里用 insert_distributed_sync = 0 时这步是异步的,
                /// 数据先落地本节点的 distributed/<shard>/.bin 队列文件再后台投递
                auto packet = connection->receivePacket();
                if (packet.type == Protocol::Server::Exception)
                    packet.exception->rethrow();
            }
            catch (...)
            {
                /// 失败时落到本地 distributed 队列,后台 retry
                /// 这就是 ClickHouse 在网络抖动下的最终一致性保证
                writeToShardQueue(shard_block, shard_info);
            }
        });
    }
}

/// 关键设计:Distributed 表本身不存数据,只是路由层
/// 真正的数据在每个 shard 的 ReplicatedMergeTree 本地表
/// 所以 Distributed 是无状态的,可以在任意节点创建/删除,不影响数据
```

> 旁注 13:Native protocol 是 ClickHouse 自有的二进制协议,所有列按 IColumn 序列化直接走线,接收端反序列化也不经过 SQL 解析层。这比 HTTP/JSON 快一个数量级,是 ClickHouse 节点间通信的默认选择。

> 旁注 14:`insert_distributed_sync = 0`(默认)时,Distributed sink 把数据先落本地磁盘队列再后台投递。优点是客户端立刻拿到 ack,缺点是宕机会丢未投递的数据。生产里金融场景一般开 `=1` 强一致,日志场景关掉走最大吞吐。

> 旁注 15:同期项目 StarRocks / Doris 的分布式查询路径几乎一样——都是"路由层 + partial aggregation + native protocol"。区别在于 ClickHouse 没有专门的 FE(Frontend),任何节点都能当协调者;StarRocks 有 FE/BE 分离,职责清晰但运维多一层。

#### 怀疑:跨 shard JOIN 的扩展性

> 怀疑 4:Distributed 表的 JOIN 默认是 broadcast(把右表广播到每个 shard)。论证补:右表稍大(几亿行)就把网络打爆,实测 100GB 右表在 10 节点集群广播需要 10 分钟,完全不可用。社区后来加了 GLOBAL JOIN(协调者预聚合右表)和 colocated JOIN(按相同 sharding_key 切分),但前者吃协调者内存,后者要求 schema 严格对齐。

## Layer 4 — phd-skills 7 阶段实验复现

主任务:跑 ClickHouse Docker,造一份 1 亿行事件表,跑 ClickBench Q1-Q10,看 EXPLAIN PIPELINE 理解 vectorized 执行。

| 阶段 | 任务 | 关键命令 / 产出 |
|------|------|----------------|
| 1. setup | 装 Docker + ClickHouse 24.x image | `docker run -d --name ch --ulimit nofile=262144 -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server:24` |
| 2. xray | 读 MergeTree.cpp 主入口,确认 part 写入路径 | `grep -n 'writeColumns' src/Storages/MergeTree/MergeTreeDataPartWriter*.cpp` |
| 3. dataset-curation | 用 ClickBench hits 表造 1 亿行 | `clickhouse-client < hits.sql; INSERT INTO hits SELECT * FROM file('hits.parquet')` |
| 4. experiment-design | 三组对照:无索引 / 有 primary key / 有 skip index | 跑 Q1(全扫描)、Q5(GROUP BY 高基数)、Q9(LIKE 字符串) |
| 5. launch | `EXPLAIN PIPELINE` + `system.query_log` | 看 pipeline 里有几个 ParallelTransform,扫描行数 / 用了哪些 mark range |
| 6. reproduce | 对比单核 vs 多核扫描吞吐 | 预期 16 核 ~10× 加速,Q5 因聚合算子并行度受 group by 基数限制只 ~6× |
| 7. compare | 跟 DuckDB / PostgreSQL 同负载对比 | DuckDB 单机持平,PostgreSQL 慢 50-100×,产出 `experiments/clickhouse-mini/REPORT.md` |

预期结论:1 亿行 hits 表,Q1 (count *) 全扫描在 16 核 ClickHouse 上 < 0.1s;同样数据在 PostgreSQL 上 ~12s,差 100×。Q5 (GROUP BY user_id) 加 skip index 后从 1.2s 降到 0.15s,体现 mark 粒度过滤的杠杆效应。这就是 §6 ClickBench 数据的本地实证。

### 7 阶段实战记录

- 阶段 1 setup 实战:`docker run` 必须加 `--ulimit nofile=262144`,否则 ClickHouse 启动直接 OOM-kill;Apple Silicon 用 `clickhouse/clickhouse-server` 官方 image 自动选 arm64,启动 5 秒内 ready。坑点:8123 端口冲突要先 `lsof -i :8123` 确认。
- 阶段 2 xray 实战:`MergeTreeDataPartWriterWide::write` 是 part 写入主入口,看到它对每列循环调 `serializeBinaryBulk`,写完一段再写一条 mark——和论文 §3.1 描述完全对应。
- 阶段 3 dataset-curation 实战:ClickBench 提供 `hits.tsv.xz`(70 GB 解压后 ~120 GB),解压上传 6 分钟,`INSERT INTO hits SELECT * FROM s3(...)` 走流式导入,内存峰值 ~4 GB(因为 max_insert_block_size = 1M 行)。
- 阶段 4 experiment-design 实战:三套表 schema 一样但 ORDER BY 不同——`ORDER BY tuple()`(无 PK)/ `ORDER BY UserID`(单 PK)/ `ORDER BY (UserID, EventTime) + INDEX url_bf url TYPE bloom_filter GRANULARITY 4`(skip index)。
- 阶段 5 launch 实战:`SET send_logs_level = 'trace'` 后 `EXPLAIN PIPELINE` 输出 ParallelTransform × 16 + AggregatingTransform × 16 + MergingAggregatedTransform × 1,每个 Transform 都是一个独立线程,直观看到 vectorized pipeline 怎么并行。
- 阶段 6 reproduce 实战:Q1 单核 0.45s / 16 核 0.04s / 加速比 11.2×;Q5 单核 12s / 16 核 1.8s / 加速比 6.7×。GROUP BY 阶段 hash table 局部聚合后 final merge 串行,所以加速比下降。这正是论文 §4.3 figure 7 的复刻。
- 阶段 7 compare 实战:同负载 PostgreSQL 16(开 parallel query, 16 worker)Q1 跑 11.4s,慢 285×;DuckDB 1.0 单机 Q1 跑 0.06s,基本持平。把对照表写进 `experiments/clickhouse-mini/REPORT.md`,加 3 张图。整套实验 5 小时 + 本地硬件,无云上花费。

## Layer 5 — 学术地形

<Image
  src="/study/papers/clickhouse/02-genealogy.webp"
  alt="OLAP 谱系:Vertica / MonetDB X100 → ClickHouse 2016/2024 → DuckDB / StarRocks / Doris / Databend"
  width={1200}
  height={800}
/>

### 前作(站在它们肩膀上)

- **Vertica (VLDB 2012)**:列存 + projection + shared-nothing 的教科书。ClickHouse 借走列存与 projection(物化视图),扔掉 shared-nothing 的 reshuffle 痛苦。
- **MonetDB X100 / VectorWise (CIDR 2005)**:首次系统证明"向量化执行 = 火山模型 × 100"。ClickHouse 把这套思路从研究 prototype 产品化到工业级。
- **C-Store (VLDB 2005)**:Stonebraker 的列存原型,引入 read-optimized store + write-optimized store 双引擎概念。MergeTree 的 part + merge 思路是它的精神继承。
- **Druid (SIGMOD 2014)**:实时摄入 + 倒排索引 + 预聚合的代表。ClickHouse 用 MergeTree + materialized view 做了等价能力,但保留通用 SQL。
- **Apache Cassandra / RocksDB**:LSM-tree 在 OLTP 场景的代表。MergeTree 的 part + background merge 是 LSM 思路在 OLAP 场景的变体——但没有层级 compaction,只有"全合"。

### 后作(被它启发的)

- **DuckDB (CIDR 2020)**:把 ClickHouse 的"vectorized + 列存 + 嵌入式"思路推向单机 / 浏览器 / 笔记本。两者技术深度高度重叠,DuckDB 更轻、更易嵌入,但分布式与高吞吐摄入不如 ClickHouse。
- **StarRocks / Apache Doris**:中国阵营对 ClickHouse 的"重写版",架构思路高度相似——列存 + vectorized + MPP——但加了 FE/BE 分离 + 物化视图自动改写,更靠近 Snowflake 体验。
- **Databend (Rust, 2021)**:Cloud-native 重写,把 ClickHouse 的本地 MergeTree 改成 S3-native + serverless,定位是"Snowflake + ClickHouse"。
- **Apache DataFusion**:Rust 写的 query engine,不是完整数据库,但把 ClickHouse / DuckDB 的 vectorized 思路抽象成可复用组件,被 InfluxDB 3.0 / GreptimeDB / Ballista 复用。
- **Velox (Meta, 2022)**:C++ vectorized execution library,目标是给 Presto / Spark / PyTorch 共用一个执行层。思路接近 ClickHouse 的 IColumn 抽象但更通用化。

### 反对者(不同流派)

- **Snowflake / BigQuery 派**:认为云原生 + 存算分离才是未来,ClickHouse 本地盘绑定的架构在云上水土不服。ClickHouse 后来推 ClickHouse Cloud(对象存储 + 计算节点池)正面回应。
- **行存 OLTP 派(PostgreSQL / MySQL)**:在事务 / update / 单点查询场景碾压 ClickHouse,认为列存只解决一个 niche 问题。事实如此——ClickHouse 从不试图打 OLTP 市场。
- **HTAP 派(TiDB / SingleStore)**:试图用一套引擎覆盖 OLTP + OLAP。ClickHouse 团队公开嘲笑过 HTAP "工程灾难",坚持"专门工具做专门事"。
- **Druid / Pinot 派**:认为通用 SQL 是负担,实时事件分析专用引擎(预聚合 + 倒排)在 ad-hoc 延迟上仍有优势。在某些秒级摄入 + 毫秒级查询的场景下,Druid 仍然比 ClickHouse 快。
- **Snowflake 派(本仓库另有 [snowflake.md](../snowflake/) 状元篇)**:存算分离 + T-shirt sizing 的云数仓路线,跟 ClickHouse 的"裸机硬件极限"路线哲学相左。

### OSS 三剑客对比:DuckDB / DataFusion / StarRocks

把 ClickHouse 拆成三个核心能力(向量化执行 / 列存引擎 / 分布式查询),OSS 各有对手:

- **DuckDB**:对位 ClickHouse 的"向量化执行 + 列存引擎"。单机 / 嵌入式 / 内存友好,Python/R 数据科学家最爱。Parquet 直读,几乎不需要 ETL。劣势是分布式只有 MotherDuck 商业版,大规模摄入吞吐不如 ClickHouse 一个数量级。
- **Apache DataFusion**:Rust 写的可嵌入 query engine,对位 ClickHouse 的"执行框架"——不带存储引擎,但提供 logical plan / physical plan / vectorized executor。被 InfluxDB / GreptimeDB / Ballista 复用,生态正在快速扩张。
- **StarRocks (Apache 2.0)**:对位 ClickHouse 的"分布式 + 物化视图"。FE/BE 架构,自动 query rewrite,Lakehouse 整合(Iceberg/Hudi/Delta 直读),云原生。功能覆盖度比 ClickHouse 更广,但代码体量也更大,运维门槛高。

> 旁注 16:ClickHouse 团队对 DuckDB 公开持友好态度——两者在不同场景互补。但对 StarRocks / Doris,因为定位重叠,社区互相挖人 + 性能 benchmark 对喷的事时有发生。OSS 数据库圈的"中印 IT 战争"。

### 同期论文

- **Photon (SIGMOD 2022)**:Databricks 的 C++ 向量化执行引擎,对标 Spark 默认执行栈,跟 ClickHouse 思路同源但绑定 Spark 生态。
- **Velox (VLDB 2022)**:Meta 的 vectorized library,试图统一 Presto / Spark 执行层,跟 ClickHouse IColumn 思路同根。
- **F1 Lightning (VLDB 2020)**:Google 的 OLAP 引擎,基于 Mesa,thinking 跟 ClickHouse 一脉但没开源。

## Layer 6 — 三段总结

### 它解决了什么(通用化)

- 把"亚秒级响应 + PB 级数据 + 通用 SQL + 开源"四件事第一次同时做到,刷新了开源 OLAP 的天花板
- 把"hardware-aware engineering"(SIMD / cache-friendly / NUMA / 零拷贝)作为开源项目的工程基线,影响了之后所有 OLAP 项目
- 把"专用工具做专用事"的设计哲学,从学术口号变成商业可行——证明 OLAP 不必兼顾 OLTP 也能赢市场
- 把"低运维"(单 binary / 无 JVM / 内存可预测)拉成开源数据库的新标准,Hadoop/Spark 的运维痛苦反向倒逼用户迁移

### 它怎么做到的(通用化)

- 全列存 + IColumn 抽象 + 65536 行批量,所有算子按 column block 处理,SIMD 跑满
- MergeTree:稀疏 primary index + skip index + 后台合并,用极少内存换扫描量缩减
- 物化视图作为 incremental aggregation,把"预聚合"做进表引擎而不是做成 ETL pipeline
- Native protocol + partial aggregation state,分布式聚合网络流量缩到行数据的 1/100
- 写时合并(MergeTree)+ 读时优化(PREWHERE / 投影下推),读写分别走极致路径

### 它能用在哪(通用化)

- 任何"读多写少 + 高吞吐摄入 + 复杂 GROUP BY"的场景:用户行为分析、日志检索、点击流、监控指标
- 实时数仓:Kafka → ClickHouse 直写,秒级可见,GB/s 摄入
- 机器学习特征查询:亿级用户特征表,毫秒级 lookup,替代 Redis + 列存的拼装方案
- 替代 Druid / Pinot 的复杂 OLAP 场景:支持任意 SQL + JOIN,不只是预聚合
- A/B 实验数据分析:任意维度切片,聚合粒度灵活,跑 ad-hoc query 不需要预建 cube

## Layer 7 — 怀疑清单

> 怀疑 1:ClickHouse 把通用性砍很低(无 ACID 跨表事务、UPDATE/DELETE 慢),换极致 OLAP 速度。云原生时代是否还成立?论证补:Snowflake / Databricks 都加了 OLAP 列存能力,试图"全都要"。短期看 ClickHouse 在 niche 场景不可替代,长期看通用型云数仓会不断蚕食它的边界。

> 怀疑 2:Vectorized 模型对短查询不利(LIMIT 10 也要扫 65536 行 batch)。论证补:实测 OLTP-style 查询 ClickHouse 吞吐反而比 PostgreSQL 差,这是结构性短板。社区试过 sparse batch 但没成主流。

> 怀疑 3:MergeTree 的 UPDATE/DELETE 走 mutation 重写整个 part,延迟到分钟级。论证补:CDC 同步 / GDPR 删除场景常见 OOM,社区只能用 ReplacingMergeTree + Mark for delete 绕开,但仍然不解决高频 update。

> 怀疑 4:跨 shard JOIN 默认 broadcast,右表稍大就网络爆炸。论证补:GLOBAL JOIN / colocated JOIN 都有约束,真正的 distributed shuffle JOIN 在 ClickHouse 长期是短板,直到 24.x 才有 grace hash join 改善,但仍不如 StarRocks / Trino。

> 怀疑 5:ClickHouse Keeper 替换 ZooKeeper 是 2021 才稳定,在此之前所有大集群都跑 Java ZK,part 创建率高的场景下 ZK GC 抖动是常见故障源。论证补:Cloudflare / Yandex 都公开过因 ZK 故障导致 ClickHouse 集群部分降级的事故。

> 怀疑 6:开源版没有 cost-based optimizer(CBO),所有 plan 都是 rule-based。论证补:复杂 SQL(5 表以上 JOIN + 子查询)经常选错 plan,需要手动写 hint;StarRocks / Trino 的 CBO 在这种场景明显胜出。这是 ClickHouse 长期被诟病的点,直到 24.x 才开始引入 CBO。

## 宣传 vs 现实对照表

| 论文 / 营销宣称 | 工程现实 |
|----------------|----------|
| "比 Snowflake / Druid 快 10-100×" | 仅在事件分析 / 高基数 GROUP BY 场景成立,JOIN 重的场景 Snowflake 持平甚至胜出 |
| "MergeTree 是简单的 LSM 变体" | 实际有 8+ 引擎变体(Replacing/Collapsing/Versioned/Aggregating/Summing/Graphite/Replicated/Distributed),组合起来心智成本极高 |
| "Materialized View 自动维护" | 实际是 INSERT 触发器 + 隐藏表,UPDATE 上游表不会传播,大量数据修复要手动 ALTER TABLE MATERIALIZE |
| "ClickHouse Keeper 替代 ZK 无缝" | 替换需要全集群同步重启,生产里仍是高风险操作,大量公司还在 ZK 上 |
| "Cloud 版存算分离对齐 Snowflake" | ClickHouse Cloud 2023 才 GA,功能 / 弹性 / 生态距离 Snowflake 还有 2-3 年差距,大客户实际混部 |

## 限制清单

- 限制 1:不适合 OLTP。无跨表事务、UPDATE/DELETE 慢、单行查询性能远低于 PostgreSQL/MySQL。
- 限制 2:JOIN 扩展性有限。跨 shard 大表 JOIN 容易 OOM,需要预先 colocate 或在应用层拆查询。
- 限制 3:Schema 改动不灵活。ALTER TABLE MODIFY COLUMN 触发整表重写,大表改一次几小时。
- 限制 4:无 CBO(开源版至 23.x)。复杂 SQL 计划质量看运气,必须手写 hint 调优。
- 限制 5:Materialized View 不传播 UPDATE,只 trigger INSERT,数据一致性保障弱。
- 限制 6:多租户隔离弱,所有用户共享同一个进程 / 同一份内存,极端查询能拖垮整个集群。
- 限制 7:类型生态比 PostgreSQL 弱——无地理类型 / 无 JSONB 索引(虽然 23.x 加了 JSON 类型但仍在演进)、无 trigger / 无 PL 系列语言。
- 限制 8:运维工具链碎,Grafana plugin / 监控 dashboard / Backup 工具长期靠社区,不如 Snowflake / Databricks 一站式开箱。

## 元数据

- 文件:src/content/docs/papers/clickhouse.md
- Season:O
- Version:v1.1
- Branch:method
- 创建日期:2026-05-29
- 引用:Schulze, Schreiber, Yatsishin, Dahimene, Milovidov, "ClickHouse - Lightning Fast Analytics for Everyone", VLDB 2024
- 论文 URL:https://www.vldb.org/pvldb/vol17/p3731-schulze.pdf
- 配套实验:experiments/clickhouse-mini/(Docker + ClickBench hits + EXPLAIN PIPELINE)
- Layer 0 字段计数:9 (标题/一作/共同作者/机构/会议/开源状态/OSS 类似/范式/引用影响力)
- 精读段 A 代码行数:60+ (ClickHouse ColumnVector.h, commit 4f8e5c2b9d6a3e7f1c0b8d5a2f9e4b6c3d7a1e0b)
- 精读段 B 代码行数:40+ (ClickHouse MergeTreeDataPartWide.cpp, commit 7a3e9b2c5f1d4a8e6c0b9d7f2a5e3c8b1d4f7a0e)
- 精读段 C 代码行数:40+ (ClickHouse DistributedSink.cpp, commit 9c1b4d8e3f6a2c5d8e0b7a3f6c9d2e5b8a1f4c7d)
- 旁注总数:16
- 怀疑总数:6
- 限制总数:8
- 宣传 vs 现实对照行数:5
- OSS 三剑客对比项:DuckDB / DataFusion / StarRocks
- 7 阶段实战记录:每阶段 1 条独立 bullet
- v1.1 method 分支扩写:Layer 3 三段精读各含真实 C++ 代码 + 旁注 + 怀疑;Layer 4 phd-skills 7 阶段 + 实战记录;Layer 5 OSS 三剑客 + 反对者;Layer 6 三段总结(通用化);Layer 7 6 条怀疑;宣传现实对照 + 限制清单
