---
title: 列式存储格式实证评估 — Parquet 与 ORC 谁更适合 2020 年代？
来源: https://www.vldb.org/pvldb/vol17/p148-zeng.pdf
日期: 2026-06-13
子分类: 存储与查询
分类: 数据库
provenance: pipeline-v3
---

## 从日常类比开始：超市货架 vs 仓库打包方式

想象你在经营一家**大型连锁超市**，每天要处理海量商品销售记录。

**行式存储**像把「一整笔购物小票」卷起来塞进抽屉：小票上每一行是 `(顾客, 商品, 数量, 价格, 日期)` 全部绑在一起。你要统计「本月所有 `价格` 的总和」时，必须把每张完整小票都展开，把无关字段（顾客名、商品名）也一起读出来——浪费带宽。

**列式存储**像把同一种信息单独装箱：所有 `价格` 放一箱、所有 `日期` 放一箱。做聚合分析时只搬需要的箱子，还能对整箱数据做**字典编码**（把「苹果/香蕉」映射成 0/1）、**游程编码**（连续 100 个相同值只存一次）——省空间、CPU 向量化友好。

Parquet（Twitter/Cloudera，2013）和 ORC（Meta，2013）就是数据湖/数仓里两种最流行的「打包规范」。它们诞生于 Hadoop 时代，默认开着 Snappy 块压缩，为 MapReduce 生态设计。十年过去，NVMe 带宽从 MB/s 涨到 GB/s，工作负载从 BI 报表扩展到 ML 特征表、向量检索、GPU 解码——**当年的默认选项还合理吗？**

这篇 **VLDB 2023** 论文（Tsinghua + CMU + Voltron Data 的 Wes McKinney 等）不比较 Spark vs Presto 谁更快，而是**把格式本身拆开**，用真实数据分布驱动的 benchmark 逐项压测 Parquet 与 ORC，给出面向下一代格式的设计清单。开源代码：https://github.com/XinyuZeng/EvaluationOfColumnarFormats

---

## 是什么

**目标**：在隔离格式内部设计的前提下，系统评估 Parquet 与 ORC 在**空间效率**、**解码速度**、**谓词下推**、**宽表投影**、**ML 工作负载**、**GPU 解码**上的表现，并提炼可复用的设计原则。

**不评估什么**：Apache Arrow（内存列式交换格式，非长期磁盘存储）；Delta Lake / Iceberg / Hudi（表格式元数据层，不改底层 Parquet/ORC 文件布局）。

**核心贡献**：

1. 建立 Parquet/ORC **特性分类法**（布局、编码、压缩、类型系统、索引、嵌套模型）。
2. 从 Tableau BI、ClickHouse 样例、UCI-ML、Yelp、SEC 日志、Geonames、IMDb 等真实数据集提取列属性，构建可配置 benchmark。
3. 在 AWS i3（NVMe）、S3、GPU（cuDF）上跑对照实验，总结 8 条面向未来的 Lesson。

---

## 为什么重要

如果你已经在用 Spark、DuckDB、Snowflake 外部表或 Hugging Face Parquet 数据集，底层几乎一定是 Parquet 或 ORC。格式层面的一个默认（比如「所有列开 Snappy」「RLE 阈值硬编码为 8」）会在**每一张表、每一次扫描**上被放大。

论文的关键语境变化：

| 2013 年假设 | 2023 年现实 |
|-------------|-------------|
| 磁盘 I/O 是瓶颈 | NVMe / 云存储带宽极高，**CPU 解码**常成瓶颈 |
| BI 宽表扫描为主 | ML 需要**数千列特征**的子集投影 |
| 结构化 OLAP | 向量 embedding、图片二进制、top-k 相似度检索 |
| CPU 单线程解码 | GPU（RAPIDS cuDF）需要**可并行**的编码块 |

论文结论之一：**Parquet 与 ORC 没有绝对赢家**——Parquet 文件略小、解码更快；ORC 在细粒度 zone map 下选择性查询更强。选格式不如理解 trade-off，并在写入时调参。

---

## 核心概念

### 1. PAX 混合列存布局

两种格式都采用 **PAX（Partition Attributes Across）**：

```
表
 └── Row Group / Stripe（水平切分）
      ├── Column Chunk 1（整列的一段）
      ├── Column Chunk 2
      └── ...
           └── Page（Parquet 最小压缩/zone map 单元）
```

- **Parquet**：Row Group 按**行数**切（实验默认 100 万行）→ 宽表时单个 Row Group 内存 footprint 大。
- **ORC**：Stripe 按**物理大小**切（默认 64 MB）→ 宽表时每个 Stripe 行数变少，向量化 batch 可能不够大。

文件末尾有 **Footer**（schema、Row Group 偏移、zone map 统计），读文件往往要先读 footer——在 S3 上意味着多次 round-trip。

### 2. 轻量编码 vs 块压缩（两层压缩）

**第一层 — 轻量编码**（按列、感知类型）：

| 技术 | 直觉 |
|------|------|
| Dictionary | 低基数列：存「值→整数 ID」字典 + ID 序列 |
| RLE | 连续重复值：存 `(值, 重复次数)` |
| Bit-packing | 小整数 ID 按 bit 宽度打包 |
| Delta / FOR | 有序或近似有序整数：存差分或帧参考 |

**第二层 — 块压缩**（Snappy/zstd 等，把已编码列块当字节流再压）：

论文 **5.4 节**核心发现：在现代 NVMe 上，列已被轻量编码后，Snappy/zstd **空间收益有限**，解码开销可达 **4.2×**；只有慢速 EBS（st1）或带宽极贵的场景才划算。**默认开 Snappy 可能是 2013 年的最优，不是 2023 年的最优。**

### 3. Parquet vs ORC 编码策略差异

| 维度 | Parquet | ORC |
|------|---------|-----|
| 字典编码 | **默认对所有列**（含整数、浮点），字典满 1MB 回退 plain | 主要对字符串；整数列看 **NDV 比例**（默认 >0.8 不用字典） |
| 整数二次编码 | Dictionary → **RLE（重复≥8）+ Bitpack** | **四种算法贪心切换**：RLE(≥3)、Delta、Bitpack、PFOR |
| 解码复杂度 | 低，分支预测友好 | 高，论文测得分支误判约为 Parquet 的 **3×** |
| 浮点 | 字典编码（NDV 低时极有效） | 通常 **plain 存原始 float** → 文件大但解码快 |

**真实数据关键事实**（论文 Figure 5）：超过 **80% 整数列**、**60% 字符串列** 的 NDV 比例 < 0.01——字典编码对绝大多数列都值回票价。

### 4. Zone Map 与 Bloom Filter

**Zone map**：每个 zone 存 `(min, max, null_count)`。查询 `WHERE price < 100` 时，若 zone 的 min > 100，整段跳过。

| | Parquet | ORC |
|---|---------|-----|
| 最细 zone | Page（~1MB，可选 PageIndex） | Row Index（默认 **每 1 万行**） |
| Bloom Filter 粒度 | 列块级（PageIndex 可选时更细） | 与最小 zone 对齐 |

**geo 工作负载**（高 NDV、低选择性）：ORC 选择性查询优于 Parquet，正因 zone 更细。但 ORC 的 zone map 分散在各 Stripe footer，在 **S3 上 top-k 检索**会发约 **4× GET** 于 Parquet（元数据集中 vs 分散）。

### 5. 嵌套数据：Dremel vs Length/Presence

JSON 风格的嵌套结构两种建模：

- **Parquet（Dremel）**：每个**原子字段**一列，附带 **Repetition Level / Definition Level** 两个整数流描述 list/struct/null。
- **ORC**：每个 optional 字段有 **presence 位图**，每个 repeated 字段有 **length 列**。

Parquet 读 leaf 列更少；ORC 对 struct/list 中间节点显式建列。深度嵌套时 Parquet 文件更小，ORC 转 Arrow 更慢。

### 6. Benchmark 工作负载（论文 §4）

从真实数据提取五类预设 workload：

| 名称 | 来源倾向 | 特点 |
|------|----------|------|
| bi | Tableau 公开 BI | 高选择性扫描 |
| classic | IMDb, Yelp | 字符串多、Zipf 长尾 |
| geo | Geonames | 低选择性、细 zone map 受益 |
| log | SEC 日志 | 浮点多、排序度高 |
| ml | UCI-ML | 宽表、特征投影 |

列属性参数：**NDV 比例**、**NULL 比例**、**值域**、**局部有序度**、**Zipf 偏斜**。用户可通过配置文件 + 生成器复现实验（Figure 4 流程）。

---

## 主要实验发现（速览）

### 总体：没有单一赢家

- **文件大小**：互有胜负。Parquet 在 log/ml（低 NDV 浮点）更小；ORC 在 classic/geo（字符串为主）更小。
- **全表扫描**：Parquet 普遍更快（轻量整数编码）。
- **选择性查询**：geo 上 ORC 更快（细 zone map）。

### 编码与解码

- 低 NDV 整数：Parquet 字典 + bitpack 压缩更好。
- 高有序度整数：ORC 的 Delta/FOR 更好。
- **RLE 阈值**：Parquet 硬编码 **8**，ORC **3**；短游程时 RLE 解码比 bitpack 慢，但压缩更好（Figure 9）。
- 浮点全表扫描：ORC 不解码字典，**解码时间**反而优于 Parquet——I/O 在现代 SSD 上已不是瓶颈。

### ML 与向量

- **宽表投影**（Figure 11）：特征列从 200 增到 8000，**元数据解析时间线性涨**，即使只投影 10 列——Footer 里 Thrift/Protobuf schema 只能顺序解析。
- **向量 embedding**（Figure 16）：Parquet/ORC 压缩比接近 1（几乎压不动）；Zarr 扫描开销更小（网格 chunk 并行）。
- **Top-k + 回表**（LAION-5B，Figure 17）：本地 SSD 上 ORC 选择快；**S3 上 Parquet 胜**（更少小范围 GET）。

### GPU（cuDF，§5.9）

- CPU 上「少压缩、快解码」；GPU 上 **PCIe + 磁盘 I/O 主导**，**zstd 块压缩反而提升吞吐**。
- Parquet/ORC 的变长 RLE+bitpack 子序列 **难以在 warp 内并行**——GPU 利用率低。未来格式需要**块内可并行**的编码。

---

## 八条面向未来的 Lesson（论文 §6 浓缩）

1. **字典编码应继续作为默认策略**（含浮点）——真实列 NDV 普遍很低。
2. **解码路径保持简单**——运行时在多 codec 间切换有显著开销。
3. **块压缩不应默认开启**——除非存储成本或网络带宽是真正瓶颈（GPU 场景例外）。
4. **元数据应集中、可随机访问**——服务 ML 宽表与云对象存储的低延迟读取。
5. **可嵌入更丰富的索引**（column index、range filter）——存储便宜，用空间换 CPU。
6. **嵌套模型应贴近内存格式（Arrow）**——减少转码开销。
7. **ML 需要：宽表投影、低选择性检索、大二进制与结构化数据分区存放、向量专用浮点压缩。**
8. **GPU 友好 = 文件级并行块 + 块内可并行编码。**

---

## 代码示例 1：用 PyArrow 写入 Parquet 并观察编码选择

下面演示**同一列数据**在「低 NDV（适合字典）」与「高 NDV（字典失效回退 plain）」下的文件大小差异——对应论文关于 Parquet 默认字典编码的核心论点。

```python
import pyarrow as pa
import pyarrow.parquet as pq
import os

n = 1_000_000

# 低 NDV：只有 10 个 distinct city，NDV ratio = 10/n
low_ndv = pa.table({"city": pa.array(["Beijing"] * (n // 10) + ["Shanghai"] * (n // 10) +
                                     [f"C{i}" for i in range(8) for _ in range(n // 80)])})

# 高 NDV：每行唯一 UUID 风格字符串，NDV ratio ≈ 1
high_ndv = pa.table({"id": pa.array([f"user-{i:08d}" for i in range(n)])})

for name, table in [("low_ndv", low_ndv), ("high_ndv", high_ndv)]:
    path = f"/tmp/{name}.parquet"
    pq.write_table(
        table,
        path,
        compression="SNAPPY",           # 论文：默认 Snappy 在现代硬件上常不划算
        use_dictionary=True,            # Parquet 默认对各类列尝试字典
        write_statistics=True,          # 写入 zone map（min/max）供谓词下推
        row_group_size=1_000_000,       # 论文实验默认 1M 行 / row group
    )
    print(f"{name}: {os.path.getsize(path) / 1024 / 1024:.2f} MB")

# 读取 metadata，查看实际采用的编码
meta = pq.read_metadata("/tmp/low_ndv.parquet")
rg = meta.row_group(0)
col = rg.column(0)
print("low_ndv encoding:", col.statistics)  # 可进一步用 col.encodings() 查看
```

**预期直觉**：`low_ndv` 文件应远小于 `high_ndv`；后者字典页填满后大量值以 plain 存储，体积接近原始字符串长度。生产环境可尝试 `compression="NONE"` 或 `ZSTD` 级别 1，对照论文 Figure 8 在 NVMe 上的扫描延迟。

---

## 代码示例 2：用 DuckDB 对 Parquet 做选择性扫描（zone map 下推）

DuckDB 读取 Parquet 时会利用 **footer 中的列统计信息**跳过 Row Group，对应论文 §5.6 的 select + late materialization 讨论。需先 `pip install duckdb pyarrow`。

```python
import os
import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import datetime

# 生成 100 万行 BI 风格数据：date 列有一定有序度（利于 zone map）
n = 1_000_000
base = datetime.date(2020, 1, 1)
dates = pa.array([base + datetime.timedelta(days=i % 365) for i in range(n)])
amounts = pa.array([i % 1000 for i in range(n)])
table = pa.table({"dt": dates, "amount": amounts})
path = "/tmp/bi_sample.parquet"
pq.write_table(table, path, compression="SNAPPY")

con = duckdb.connect()
con.execute(f"CREATE VIEW sales AS SELECT * FROM read_parquet('{path}')")

# 高选择性：扫描大部分 row group
high_sel = con.execute("""
    SELECT SUM(amount) FROM sales
    WHERE dt BETWEEN DATE '2020-06-01' AND DATE '2020-12-31'
""").fetchone()

# 低选择性：仅匹配极少数 row（zone map 可跳过更多块）
low_sel = con.execute("""
    SELECT SUM(amount) FROM sales
    WHERE dt = DATE '2020-01-01'
""").fetchone()

print("high selectivity sum:", high_sel[0])
print("low selectivity sum:", low_sel[0])

# EXPLAIN 可查看是否 pushdown（版本不同输出略有差异）
print(con.execute("EXPLAIN SELECT * FROM sales WHERE dt = DATE '2020-01-01'").fetchdf())
```

**论文启示**：低选择性查询在 Parquet 上能否加速，取决于 **PageIndex / Row Group 统计**是否启用、**date 列是否在文件中有序聚簇**。若 date 完全随机，zone map 几乎无效——这与 Lesson 5「索引要匹配数据分布」一致。

---

## 代码示例 3（补充）：对比「开/关块压缩」的扫描成本

```python
import os
import pyarrow as pa
import pyarrow.parquet as pq
import time

n = 1_000_000
table = pa.table({
    "k": pa.array([i % 500 for i in range(n)]),      # 低 NDV 整数
    "s": pa.array([f"tag-{i % 50}" for i in range(n)]),
})

for comp in ["NONE", "SNAPPY", "ZSTD"]:
    path = f"/tmp/core_{comp}.parquet"
    pq.write_table(table, path, compression=comp, row_group_size=n)
    size_mb = os.path.getsize(path) / 1024 / 1024

    t0 = time.perf_counter()
    _ = pq.read_table(path)
    elapsed = time.perf_counter() - t0
    print(f"{comp:6s}  size={size_mb:5.2f}MB  read={elapsed:.3f}s")
```

在 NVMe 上你往往会看到：**NONE 读最快、体积未必最大**（因轻量编码已压缩）；ZSTD 体积最小但解码最慢——复现论文 Figure 8 的 CPU vs I/O trade-off。

---

## 与 Lakehouse / Arrow 的关系

- **Lakehouse**（Delta/Iceberg/Hudi）在 Parquet 之上加**事务日志、快照、分区演进**——解决的是「哪几个文件组成表 version N」，不是「列块如何编码」。
- **Arrow** 是进程间**零拷贝/少拷贝**内存列格式；Parquet → Arrow 解码是分析查询的常规路径。论文刻意分开测「格式原生扫描」，避免 Parquet 与 Arrow 紧耦合造成 ORC 对比不公平。

读 Lakehouse 笔记时把本文当作**底层文件格式层**的补充：表格式选 Iceberg 不改变「仍建议默认字典、谨慎 Snappy」的结论。

---

## 实践建议（写 Parquet/ORC 的生产 checklist）

1. **先看列 NDV**：BI/日志列多数低 NDV → 保持字典；高基数 ID 列考虑 ORC 式 NDV 阈值或关闭字典。
2. **块压缩**：NVMe / 本地 SSD 分析集群可试 **`compression=NONE` 或 ZSTD level 1** 做 A/B；S3 冷数据、带宽贵时可保留 zstd。
3. **Row Group 大小**：窄表用大 row group（100 万行）；**含大 blob（图片）** 时用较小 row group 提高并行读（论文 Figure 18），结构化列与 blob **分区存放**更好。
4. **谓词列**：低选择性查询靠 **PageIndex（Parquet 2.x）** 或 ORC Row Index；确保写入时 `write_statistics=True`。
5. **ML 宽表**：数千特征列时，关注 **footer 解析**成本；考虑按特征组分文件、或等 F3 等下一代格式。
6. **向量列**：Parquet list<float> 非最优；大规模 embedding 可评估 **Zarr / 专用向量库 + 外表 Parquet 元数据**。
7. **GPU 管道**：若走 RAPIDS/cuDF，**更 aggressive 的块压缩**可能反而有利——与 CPU 结论相反。

---

## 局限与后续工作

- 实验主要基于 **Arrow 9.0 / ORC 1.8 / 2023 年**实现；Parquet PageIndex、Bloom Filter 在 C++ 侧支持仍在演进。
- 未涵盖 **BtrBlocks、Capacitor、Alpha、F3** 等新格式（作者后续 SIGMOD'26 有 F3 工作）。
- 对比 ORC 时未测「ORC 原生 reader 最优路径」，部分结论针对 **转 Arrow / 通用扫描** 场景。

---

## 一句话总结

Parquet 和 ORC 都是 2013 年 Hadoop 时代的杰作；在 **NVMe + ML + 云对象存储 + GPU** 的今天，**没有格式全胜**——真实列普遍低 NDV 使**字典编码仍应是默认**，**简单解码胜过复杂压缩**，**块压缩不应无脑默认**，**元数据与索引粒度**要匹配工作负载（BI 扫描 vs geo 点查 vs ML 宽表 vs 向量 top-k）。这篇论文的价值在于：用可复现 benchmark 把「格式迷信」变成「可度量 trade-off」，为 F3 等下一代开放格式铺路。

---

## 延伸阅读

- 论文扩展版：https://arxiv.org/pdf/2304.05028
- Artifact：https://github.com/XinyuZeng/EvaluationOfColumnarFormats
- 同团队后续：**F3**（SIGMOD 2026 Best Paper Honorable Mention）、**NULLS!**（DaMoN 2024）、**LeCo** 学习型压缩（SIGMOD 2024）
- 表格式层：本仓库 [Lakehouse 2021 笔记](./lakehouse-2021.md)
