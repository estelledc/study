---
title: C-Store — 把数据按列存，分析查询直接快十倍
来源: 'Stonebraker, Abadi, Madden, et al. "C-Store: A Column-oriented DBMS", VLDB 2005'
日期: 2026-05-30
分类: 数据库
难度: 中级
---

## 是什么

C-Store 是一套**把数据按"列"而不是按"行"存**的数据库系统。日常类比：传统数据库像把每个学生的所有信息（姓名、年龄、成绩、班级）订成一个档案袋，要算全班平均分得拆开每个袋子；C-Store 把所有人的"成绩"放一个文件、"姓名"放另一个文件——你算平均分只读"成绩"那一个文件就够了。

一张销售表有 50 列、5 亿行，分析查询经常只看其中 3 列（比如"按地区算销售总额"）。行存得把整行 50 列都读上来才能挑出那 3 列，95% 的 I/O 全浪费了。

C-Store 把同一列的值连续摆在磁盘上，再单独压缩——同列的值类型一致、重复多，压起来比一团杂数据狠得多。一句话定位：**列存 = 为分析读而生的物理布局**。

## 为什么重要

不理解 C-Store，下面这些事都没法解释：

- 为什么 ClickHouse / Snowflake / Redshift 这些"现代数仓"扫百亿行只要几秒——靠的是列存 + 列内压缩 + 向量化
- 为什么数据分析师跑同一个 SQL 在 MySQL 上要 20 分钟、在 ClickHouse 上 2 秒——不是 SQL 写得不一样，是底层布局不一样
- 为什么 OLTP（在线交易）和 OLAP（在线分析）一直分两套系统——行存和列存是物理层面的根本分歧
- 为什么 Vertica（C-Store 的商业化）2011 年被 HP 收购——列存分析这条路线已被大厂当成战略资产

## 核心要点

C-Store 把"读快、写不能太慢"这个看似矛盾的需求拆成 **三个组件**：

1. **Read Store（RS）**：磁盘上的只读区，按列存、每列独立压缩、整体按某个 sort key 排序。类比：图书馆的"按出版年份排好的精装架"——查得飞快，但插一本新书会动到所有后续位置。

2. **Write Store（WS）**：内存里的小写入区，行式存储，吸收高频更新。类比：图书馆门口的"新书暂存柜"——写得快，但只装得下最近这阵子的书。

3. **Tuple Mover**：后台进程，定期把 WS 攒下来的数据批量合并进 RS。类比：图书管理员每周把暂存柜的书一次性归位到精装架。

这三件套上面再叠两个支柱：

- **多 Projection（投影）**：同一份逻辑数据存多份物理副本，每份选不同列子集 + 不同排序。查询路由到最合适的那份，相当于"为不同访问模式各建一套索引"
- **K-safety**：每条数据至少在 K+1 个节点上有副本，任何 K 个节点挂掉数据库还能正常跑——天生分布式高可用

事务用 snapshot isolation：读永远看一个一致快照，不阻塞写；写在 WS 加版本号，避免读写互锁。这套模型让分析查询和小批量写可以并行不打架。

## 实践案例

### 案例 1：行存 vs 列存的 I/O 对比

假设有 1 亿行用户表，10 列，每列 8 字节，总共 8 GB。

```sql
SELECT AVG(age) FROM users;
```

- **行存**：读全表 8 GB，CPU 从每行挑出 age（8/80 字节）→ 浪费 90%
- **列存**：只读 age 这一列文件 800 MB → 直接 10 倍 I/O 优势

如果 age 还能 RLE 压缩（很多人同岁），实际可能压到 80 MB，**100 倍**差距。SSD 时代 I/O 瓶颈下移到了内存带宽和 CPU cache，但列存的优势同样转化为"少读少传少解码"。

### 案例 2：每列选不同压缩方式

C-Store 论文里提了 4 种压缩，按列特性选：

```
列：性别（M/F，重复多）         → RLE：M×500, F×300, M×200
列：城市（重复但不连续）         → 字典：城市表 + 整数 ID
列：时间戳（连续递增）           → Delta：基准 + 增量
列：用户 ID（散开整数）          → 直接存（无压缩）
```

每列**根据自己的数据形状**挑最适合的编码——这是行存做不到的，因为行存一行混了 10 种类型。

### 案例 3：projection 物理设计

同一张 sales(customer_id, date, region, amount) 表存两份：

```
projection P1: (customer_id, amount) 按 customer_id 排序
projection P2: (date, region, amount) 按 date 排序
```

- 查"客户 A 总消费"→ 走 P1，连续读 customer_id=A 的所有 amount
- 查"2025 年各区销售"→ 走 P2，按 date 范围扫，再 group by region

存了 2 份多花 30% 空间，但两类查询都从"全表扫"降到"局部扫"。

## 踩过的坑

1. **当成万能数据库**：C-Store 是读优化的。OLTP 高频小更新即使有 WS 兜底，事务密集业务还是会把 WS 涨爆，Tuple Mover 跟不上就退化为内存数据库。写密集场景别用列存。

2. **忘了 projection 的代价**：多 projection 看起来"为每种查询定制"很美，但每次插入要同步写所有 projection，磁盘空间也线性增加。物理设计不是免费的，工业上一般 2-3 份就到上限。

3. **以为列存就是"把行转列"**：真正的胜利来自三件事叠加——列内压缩 + 向量化执行（一次处理一批值，CPU cache 友好）+ 延迟物化（尽量晚拼回行）。少一个就只有名义上的列存。

4. **误以为列存只适合 OLAP**：HTAP 系统（SAP HANA、TiDB、SingleStore）证明 WS+RS 混合架构可以同时跑 OLTP+OLAP——但要小心 WS 增长率，不然分析查询会一直读旧的 RS+大堆未合并的 WS。

## 适用 vs 不适用场景

**适用**：

- 数据仓库 / OLAP / BI 报表——列少、行多、聚合多的查询
- 时序数据 / 日志分析——天然按时间列排序，压缩比极高
- 读多写少、可接受分钟级批量合并的分析库（后世 HTAP 借了 WS+RS 思路，但 2005 原文是读优化列存）

**不适用**：

- 高频 OLTP 单行查询（"查用户 ID=42 的所有信息"）——列存得拼回行，反而慢
- SELECT * 满表扫——所有列都要读，列存优势消失
- 频繁单行更新——RS 不可变，WS 涨太快会拖累
- 行内 schema 经常变（半结构化）——列存要每列一个文件，加列代价高

## 历史小故事（可跳过）

- **1996 年**：Sybase IQ 已经实现了列存的早期版本，但被当成"特殊用途的奇怪数据库"
- **1999 年**：荷兰 CWI 实验室的 MonetDB 推出，把列存做到内存里，启发后来很多研究
- **2005 年**：Stonebraker（已经造过 Ingres 和 Postgres）带年轻博士生 Daniel Abadi 在 MIT 写 C-Store，论文拿下 VLDB 2005 best paper
- **2006 年**：项目商业化为 Vertica，主打"分析比 Oracle 快十倍"
- **2011 年**：HP 收购 Vertica（金额未公开）；同期 Amazon 推出 Redshift（基于 ParAccel，同属列存）
- **2016 年后**：Snowflake、ClickHouse、DuckDB 把这条路线做到云原生 / 单机极致 / 嵌入式三个方向
- **2020+**：Apache Parquet/ORC 文件格式让"列存"从数据库下沉到数据湖，Iceberg/Delta Lake 在其上做事务——C-Store 的物理布局思想现在跑在 S3 上

## 学到什么

1. **物理布局是性能的根**：同一个 SQL，按行存 vs 按列存，性能可以差 100 倍——优化器再聪明也救不回错的物理设计
2. **读写分离是规模化的常用手段**：WS/RS 这套思路后来也出现在 LSM-tree、CRDT、流批一体里——本质是"让两种相反需求各走各的路"
3. **多副本不只是为了高可用**：projection 让"多份数据不同排序"变成查询加速器，副本不是冗余而是资产
4. **理论 → 系统 → 商业**，2005 论文 → 2006 Vertica → 2011 HP 收购 → 2025 整条云数仓——每代列存系统都在还 C-Store 的债
5. **压缩是一等公民**：传统数据库把压缩当 add-on，C-Store 把"每列选最适合的压缩"做成架构核心，这也是为什么列存压缩比能做到 5-10 倍

## 延伸阅读

- 论文 PDF：[C-Store VLDB 2005](http://db.csail.mit.edu/projects/cstore/vldb.pdf)（14 页，写得很工程，不难读）
- Daniel Abadi 博客：[The Design and Implementation of Modern Column-Oriented Database Systems](https://www.cs.umd.edu/~abadi/papers/abadi-column-stores.pdf)（2013 综述，比论文更系统）
- ClickHouse 文档：[ClickHouse Architecture](https://clickhouse.com/docs/en/development/architecture)（看 C-Store 思想怎么落到现代系统）
- DuckDB In-Process OLAP：[DuckDB 论文](https://duckdb.org/docs/internals/overview)（嵌入式列存的新代表）
- [[snowflake]] —— 云原生列存数仓，存算分离
- [[stonebraker-2010-sqlnosql]] —— 同作者后来反思 SQL/NoSQL 之争

## 关联

- [[snowflake]] —— Snowflake — 把 C-Store 思想搬到云端 + 存算分离
- [[clickhouse]] —— ClickHouse — 单机极致列存，C-Store 思想的现代直系
- [[system-r-1976]] —— System R — 行存 OLTP 的奠基，C-Store 的对照面
- [[aries-1992]] —— ARIES — 行存恢复算法，列存的 WS 也借了 WAL 思想
- [[stonebraker-2010-sqlnosql]] —— Stonebraker 自己后来对"一种数据库打天下"的反思
- [[bigtable-2006]] —— Bigtable — 同期 Google 的列族存储，思路相近但场景不同
- [[codd-1970]] —— 关系模型为 C-Store 提供了"逻辑层"，物理层才是 C-Store 的创新点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[columnar-storage-formats-2023]] —— Columnar Storage Formats 2023 — Parquet/ORC 的体检报告
- [[dremel-2010]] —— Dremel 2010 — BigQuery 和 Parquet 背后的嵌套列式分析
- [[dremel-decade-2020]] —— Dremel 十年回顾 — BigQuery 背后的交互式云数仓路线
- [[duckdb-2019]] —— DuckDB — 把 OLAP 数据库塞进你的 Python 进程
- [[efficient-compile-2011]] —— Efficient Compile 2011 — 把 SQL 查询编译成贴近 CPU 的机器码
- [[fastlanes-compression]] —— FastLanes Compression Layout — 用标量代码解码千亿整数
- [[lakehouse-2021]] —— Lakehouse 2021 — 把数据湖和数仓合成一套开放平台
- [[monetdb-x100-2005]] —— MonetDB/X100 — 让数据库一次处理一向量行而不是一行
- [[snowflake]] —— Snowflake — 云数仓把存储和计算拆开
- [[snowflake-2016]] —— Snowflake 2016 — 把数仓拆成 storage / compute / services 三层
- [[trill-2014]] —— Trill — 一个引擎同时跑流、批、交互三种分析
- [[velox-meta-2022]] —— Velox — Meta 统一执行引擎
- [[vertica-2012]] —— Vertica 2012 — C-Store 论文走向产品的七年改造账
- [[arrow]] —— Apache Arrow — 内存列式标准
- [[duckdb]] —— DuckDB — 嵌入式列存 OLAP
- [[lance]] —— Lance — AI 数据列存格式
- [[pandas]] —— pandas — Python 表格数据事实标准
- [[polars]] —— Polars — Rust 写的列存 DataFrame
- [[pyarrow]] —— PyArrow — 让所有数据系统共用一块内存
