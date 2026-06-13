---
title: Photon — Databricks 为 Lakehouse 打造的向量化查询引擎
来源: https://people.eecs.berkeley.edu/~matei/papers/2022/sigmod_photon.pdf
日期: 2026-06-13
分类: 数据库
子分类: 现代数据库
provenance: pipeline-v3
---

## 先想成什么事

想象你经营一家**大型连锁超市集团**（这就是企业里的「数据湖 + 数仓」混合体）：

- **地下仓库**（S3 / ADLS / GCS）堆着成吨**未分拣的货**：有的箱子标签潦草、有的混装、有的超大件——这就是数据湖里**原始、未治理**的 Parquet / JSON / 日志。
- **楼上精品店**（传统数仓）只摆**精选、贴好价签、按过道分类**的商品，结账飞快，但只能卖一小部分库存，还要专人每天搬货上楼（ETL）。
- 老板想要的 **Lakehouse** 是：**只保留一个地下仓库**，但楼上要有精品店的体验——ACID、SQL、治理、回滚，全都直接开在对象存储上。

问题来了：顾客（分析师、数据科学家）拿着同一张**会员卡**（Spark DataFrame API / SQL）在店里逛，有人要「整箱扫条码做机器学习」，有人要「30 秒内出 BI 报表」。收银系统必须：

1. 对**精品陈列区**（Delta Lake + 聚类 + 统计信息）极快；
2. 对**地下乱堆区**（无统计、大字符串、稀疏 NULL）也不能崩；
3. **不能换会员卡**——现有 Spark 作业零改代码就要变快。

**Photon** 就是 Databricks 给这家「一仓两卖」超市换的**新一代收银内核**：用 C++ 写的向量化引擎，嵌在 Databricks Runtime（DBR）里，和 Spark 共用调度、内存、监控，SQL 和 DataFrame 都能走，不支持的操作再**优雅回退**到老 Spark SQL 引擎。

论文发表于 **SIGMOD 2022**，获 **Best Industry Paper**；Databricks 用 Photon 在 100TB TPC-DS 上拿过审计世界纪录。客户侧平均约 **3×** 加速，部分工作负载 **10×+**。

## 论文速览

| 维度 | 内容 |
|------|------|
| 标题 | Photon: A Fast Query Engine for Lakehouse Systems |
| 作者 | Alexander Behm 等（Databricks，Matei Zaharia 等） |
| 会议 | SIGMOD 2022，费城 |
| DOI | [10.1145/3514221.3526054](https://doi.org/10.1145/3514221.3526054) |
| 核心贡献 | Lakehouse 场景下的 C++ 向量化引擎；与 Spark 语义兼容；原始数据自适应执行 |
| 工程状态（论文撰写时） | 已执行数千万次客户查询；可部分 rollout |

## 为什么 Lakehouse 难做查询引擎

传统云数仓假设：数据已导入**专有格式**，有统计信息、聚类、索引。Lakehouse 引擎面对的是**光谱两端**：

| 数据形态 | 特征 | 引擎压力 |
|----------|------|----------|
| 治理良好的表 | Delta 聚类、合理文件大小、强类型 | 要和专用数仓拼 CPU 效率 |
| 原始湖数据 | 小文件、宽表、大字符串、占位符代替 NULL、无统计 | 不能假设「列大多非空」「字符串是 ASCII」 |

同时，组织已有大量 **Spark DataFrame / UDF** 作业。新引擎若不能**嵌入 Spark 执行框架**、不能保证**结果与 Spark SQL 一致**，就无法渐进替换——这是 Photon 集成设计的出发点。

## 核心概念

### 1. Lakehouse 四层架构（Databricks 语境）

论文用四层描述产品（与 Photon 位置相关）：

1. **对象存储**：S3 等，数据以 Parquet / Delta 等开放格式存放。
2. **自动数据管理层**：主要是 **Delta Lake**——ACID、time travel、元数据加速。
3. **弹性执行层**：DBR 集群；**Photon 在 executor 内做单线程分区任务**。
4. **用户界面**：Notebook、SQL、作业调度。

Photon 不替代 Spark 的 driver 调度、stage 划分、容错；它替换的是**每个 task 里「算子怎么跑」**的那一层。

### 2. 向量化解释执行（Vectorized Interpreted）

现代 OLAP 引擎常见两条路：

- **向量化**（MonetDB/X100、Vertica）：按**批**处理列数据，算子间用虚函数调度，易插桩、易自适应。
- **代码生成**（Spark SQL 默认、HyPer）：运行时拼出专用循环，减少分支，复杂表达式更强。

Photon **选向量化**，原因包括：

- Lakehouse 要在**运行时**根据每批数据选快路径（有无 NULL、是否全 ASCII、批次是否稀疏）。
- 算子边界保留 → **每算子独立 metrics**，客户现场排障友好。
- 团队原型对比：聚合算子向量化几周，代码生成路径数月。

不是否认代码生成——复杂表达式树仍可能用**融合算子**（如 `BETWEEN` 专用 kernel）弥补差距。

### 3. 列式 Column Batch 与 Position List

Photon 的基本单位是 **column batch**：

- 每列一个 **column vector**（连续值缓冲区 + NULL 位图）。
- 另有 **position list**：当前批次里**仍活跃**的行下标（过滤后未删物理行，只标记「关掉的灯」）。

过滤（Filter）通过**缩小 position list** 实现，而不是搬动整列数据。论文强调：对复杂查询，position list 往往优于「每行一字节 active 标记」的 SIMD 方案，因为可避免对大量已过滤行做无意义循环。

### 4. 执行 Kernel

底层热点逻辑写成 **kernel**——在向量上跑的紧凑循环，可模板特化、可手写 SIMD、也可靠编译器 auto-vectorize（配合 `RESTRICT` 等提示）。算子调用 kernel；kernel 之间传递列向量与 position list。

### 5. 自适应微批（Micro-adaptivity）

每个 batch 可探测：

- 是否存在 NULL；
- 是否有 inactive 行；
- 字符串是否全 ASCII；
- 批次是否稀疏（影响 hash join 探测时是否**压缩** position list）。

据此在运行时选择不同 kernel 实例——论文称为 batch-level adaptivity，与 Vectorwise 的 micro-adaptivity 思路相近。

### 6. 与 Spark 的「部分接入」（Partial Rollout）

不可能一次实现 Spark SQL 全部算子。策略：

- 从 **FileScan** 自底向上把支持的子树换成 Photon 算子；
- 遇到不支持的节点，插入 **Transition** 把列式转回 Spark 行式；
- Scan 与 Photon 之间用 **Adapter** 做**零拷贝**指针传递（`OffHeapColumnVector`）。

因此一条查询可能是：**Photon 段 → Transition → JVM Spark SQL 段**，对用户透明。

### 7. 统一内存与 Spill

Photon 通过 Spark **UnifiedMemoryManager** 做 reservation；Spark 可向 Photon 要 spill，Photon 也可逼其他算子 spill。Lakehouse 上 SQL 与 UDF 混跑，**固定预算式** spill 不够用，必须动态协调。

## 架构一图流

```text
用户 SQL / DataFrame
        ↓
Driver：Catalyst 优化器 → 物理计划
        ↓
Executor Task（多线程，每 task 单线程跑 Photon）
        ↓
┌─────────────────────────────────────┐
│  Photon C++（列批 HasNext/GetNext）   │
│  FileScan Adapter → Filter → Join …  │
│  必要时 Transition → Spark SQL JVM   │
└─────────────────────────────────────┘
        ↓
Delta / Parquet on S3（列式读，少一次 pivot）
```

## 代码示例 1：论文风格的 Photon Kernel（教学复现）

下面用 C++ 模板复现论文 Listing 2 的 `sqrt` kernel 思想：`kHasNulls` / `kAllRowsActive` 在编译期决定分支是否消除。

```cpp
// 简化教学版：Photon 对「无 NULL + 全行活跃」批次的特化路径
template <bool kHasNulls, bool kAllRowsActive>
void SquareRootKernel(
    const int16_t* RESTRICT pos_list,
    int num_rows,
    const double* RESTRICT input,
    const int8_t* RESTRICT nulls,
    double* RESTRICT result) {
  for (int i = 0; i < num_rows; ++i) {
  // 若 kAllRowsActive==true，row_idx 直接等于 i，省掉间接寻址
    const int row_idx = kAllRowsActive ? i : pos_list[i];
    if (!kHasNulls || !nulls[row_idx]) {
      result[row_idx] = std::sqrt(input[row_idx]);
    }
  }
}

// 运行时根据 batch 元数据派发：
void DispatchSqrt(const ColumnBatch& batch, double* out) {
  if (!batch.has_nulls && batch.all_rows_active) {
    SquareRootKernel<false, true>(nullptr, batch.num_rows,
        batch.col<double>(0), nullptr, out);
  } else if (!batch.has_nulls) {
    SquareRootKernel<false, false>(batch.positions, batch.num_rows,
        batch.col<double>(0), nullptr, out);
  } else {
    SquareRootKernel<true, false>(batch.positions, batch.num_rows,
        batch.col<double>(0), batch.nulls<double>(0), out);
  }
}
```

零基础要点：**同一段数学逻辑，按数据「脏不脏」编译出多条路径**；脏数据走通用路径，干净数据走无分支快路径——这是 Lakehouse 没有完备统计信息时，把性能找回来的办法。

## 代码示例 2：同一业务逻辑 — SQL 与 Spark API（Photon 双入口）

Photon 不发明新方言；下面两种写法在 DBR 上会进同一套优化器，物理计划里能 Photon 的算子会换成 C++ 实现。

```python
# PySpark DataFrame — 论文强调必须语义兼容的 API
from pyspark.sql import functions as F

df_customer = spark.table("customer")
df_orders = spark.table("orders")

result = (
    df_customer.join(df_orders, "c_orderid")
    .filter((F.col("o_shipdate") > "2021-01-01") & (F.col("c_age") > 25))
    .groupBy("c_name")
    .agg(F.sum("o_price").alias("total"))
    .select(F.upper("c_name"), "total")
)
result.show()
```

```sql
-- 等价的 SQL（论文 Listing 1 扩展版）
SELECT upper(c_name), sum(o_price)
FROM customer
JOIN orders ON customer.c_orderid = orders.o_orderid
WHERE o_shipdate > DATE '2021-01-01'
  AND customer.c_age > 25
GROUP BY c_name;
```

在 Photon 开启的集群上，典型路径是：**Delta 文件裁剪 + 列式 Scan → Photon 向量化 Join/Agg →（若含不支持的 UDF）Transition 回 JVM**。你不需要改查询文本；差异体现在 Spark UI 的 operator metrics 与耗时上。

## 代码示例 3：用 position list 理解 Filter（伪代码）

```python
# 逻辑行: index 0→10, 1→null, 2→"photon"
# 过滤 col0 IS NOT NULL 之后：
positions = [0, 2]          # 只保留活跃逻辑行
# col0.values[1] 可能仍是旧值，但 position list 不会指向 1

def filter_is_not_null(batch):
    new_pos = [p for p in batch.positions if not batch.nulls[0][p]]
    return batch.with_positions(new_pos)  # 列数据不搬，只改「哪些行参与后续 kernel」
```

这与火山模型「逐行 next()」不同：**过滤是改索引集合**，后续 kernel 循环次数 = 活跃行数，而不是物理批大小。

## 设计决策对照表

| 决策 | Photon 选择 | 主要理由 |
|------|-------------|----------|
| 语言 | C++ 原生库，JNI 进 JVM 进程 | JVM JIT 天花板、宽表 code cache 悬崖、大堆 GC、SIMD 可控 |
| 执行模型 | 向量化解释 | 自适应、可观测性、开发效率 |
| 内存布局 | 默认列式 | 贴合 Parquet、SIMD、shuffle 编码；hash 表等仍可能临时 pivot 成行 |
| 接入方式 | 部分替换 + 回退 | Spark SQL 特性持续演进，不可能 Big Bang 重写 |
| Scan 接口 | Adapter 零拷贝 | `OffHeapColumnVector` 指针交给 Photon，每批一次 JNI |

## 性能数字（论文实验，便于建立直觉）

| 场景 | 相对 DBR（旧 Spark SQL 引擎） |
|------|-------------------------------|
| 1GB 整数 hash join | Photon ~**3.5×** |
| `collect_list` 分组聚合 | 最高 ~**5.7×** |
| ASCII `upper()` 字符串 | ~**3×**（SIMD 路径） |
| Parquet 写入 2 亿行 | 端到端 ~**2×** |
| TPC-H SF=3000（Delta on S3） | 平均 ~**4×**，Q1 最高 ~**23×**（Decimal 向量化） |
| TPC-DS Q24 join compaction | 自适应压缩 ~**1.55×** vs 无压缩 |
| UUID shuffle 编码 | 数据量 ~**2×** 减少，端到端 ~**15%** |

Photon **帮不上忙**的情况：纯 IO / 网络 bound、几乎只做 scan 且无 CPU 重表达式——瓶颈不在执行内核。

## 语义一致性：为什么测试很重

同一表达式可能因计划切分跑在 Photon 或 Spark 上，**结果必须一致**。论文列举坑：

- Java vs C++ 整数转浮点差异；
- IANA 时区库版本不一致；
- Decimal 实现策略不同（Photon 可为性能少做某些 cast）。

测试三层：**表达式单测**、**端到端 SQL 对比**、**随机 fuzz**。这是「换引擎不换 API」的代价。

## 与相关系统 / 本仓库条目

| 系统 / 条目 | 关系 |
|-------------|------|
| Spark SQL | Photon 嵌入 DBR，替换物理算子实现 |
| Delta Lake | 开放表格式 + 聚类/裁剪，减少 IO，让 CPU 内核成为瓶颈 |
| MonetDB/X100 | 向量化 + kernel 思想的学术源头 |
| Apache Arrow | 类似列向量内存布局；Photon 自建内部格式 |
| Flare | 也在 Spark 内嵌原生引擎，论文强调 Photon 更深入讨论内存与 spill |
| [[seastar-shared-nothing-2014]] | 同属「为现代硬件重写执行层」；Seastar 面向通用服务器 shard，Photon 面向 OLAP 批处理 |
| [[mooncake-kvcache-2024]] | 另一维度的数据系统性能——LLM KV 缓存；Photon 解决的是分析型 SQL/ETL |

## 常见误解

1. **「Photon = 新查询语言」** —— 错。仍是 Spark SQL + DataFrame，只是物理执行换 C++。
2. **「Photon 替代 Spark」** —— 错。调度、shuffle 协议、容错、很多算子仍在 Spark；是**协同**。
3. **「向量化一定比代码生成快」** —— 错。稀疏批、极复杂表达式上，论文承认 codegen 有优势；Photon 用融合算子与 join compaction 补洞。
4. **「只服务数仓 SQL」** —— 错。设计目标包含 ETL、宽表、原始字符串、写 Parquet/Delta。

## 零基础学习路线

1. 先理解 **Lakehouse = 湖存储 + 仓能力**，读 Delta Lake 论文或文档建立表格式概念。
2. 用 PySpark 写一个小 join + agg，在 Databricks 打开 Photon，对比 Spark UI 的 **duration / scan metrics**。
3. 读论文 §3–§4：JVM vs Native、向量化 vs Codegen、Column Batch。
4. 读 §5：Adapter / Transition / 统一内存——理解「为什么不能一次全替换」。
5. 若继续深入：MonetDB/X100 原始论文、Spark Whole-Stage Codegen 博客（对比用）。

## 小结

Photon 回答的是一个**产品架构问题**，不只是微基准刷分：在**开放格式的数据湖**上，如何做出**数仓级 SQL 性能**，同时**不抛弃 Spark 生态**。技术抓手是 **C++ 列式向量化 + batch 级自适应 + 与 Spark 的渐进融合**。论文的价值在于把 Lakehouse 约束（脏数据、双 API、部分 rollout）写清楚，并给出可复现的工程权衡，而不是声称「又一个更快的列存」。

若你只做概念记忆，记住一句即可：**Photon 是嵌在 Spark 任务里的原生收银机，会员卡不变，货还是 S3 上的 Delta/Parquet，但结账按列、按批、按数据脏净选快车道。**
