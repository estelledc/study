---
title: Lance — AI 数据列存格式
来源: https://github.com/lancedb/lance
日期: 2026-06-01
分类: 数据基础设施 / 列存格式
难度: 中级
---

## 是什么

Lance 是一种**面向 AI 工作负载的列式磁盘文件格式**，自我定位是 "Parquet for AI"。日常类比：Parquet 像图书馆按书架顺序借书，从第一本读到最后一本很快；Lance 像图书馆给每本书都贴了索书号，你想跳着借哪本就借哪本。

它由 LanceDB 公司主导，用 Rust 写，Apache 2.0 协议。一句话：**把列存从"批量扫描"改造成"AI 训练 + 向量检索"友好的随机访问基底**。

```python
import lance
import pyarrow as pa

# 把一张带 embedding 的表写成 Lance
table = pa.table({
    'id': [1, 2, 3],
    'text': ['hello', 'world', 'lance'],
    'embedding': [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]],
})
lance.write_dataset(table, 'mydata.lance')
```

写完磁盘上是一坨 fragment 文件 + 一个 manifest，跟 Parquet 完全不一样。

## 为什么重要

不理解 Lance，下面这些事都解释不通：

- 为什么 AI 团队不直接用 Parquet 存训练集，要再造一个新格式
- 为什么向量数据库（LanceDB / Milvus）要把"索引"和"数据"挤到同一个文件里
- 为什么 2023 年起"AI 数据格式"成了独立赛道——它不是 OLAP 也不是 OLTP，是第三种
- 为什么搞 RAG 的人开始关心"我这一行 embedding 改了，能不能不重写整张表"

简单说：**AI 工作负载的访问模式跟传统数仓不一样**。数仓查的是 "给我所有 2024 年订单的总和"（顺序扫一列），AI 查的是 "给我跟这个向量最像的 100 行的图片"（随机点访问）。Parquet 为前者优化，Lance 为后者优化。

## 核心要点

Lance 的设计可以拆成 **四个关键决策**：

1. **抛弃 row group**：Parquet 把数据切成 row group（默认 128MB），同一 row group 内跨页跳读慢。Lance 不分组，每列一个文件，列内自带细粒度索引页，随机访问 100 倍于 Parquet（官方 benchmark）。

2. **向量是一等公民**：固定长度的 float 列表（embedding）是原生类型，可以直接在文件里挂近似最近邻索引（常见如 IVF 分桶、PQ 压缩；具体种类随版本演进）。读 embedding 列 + 查最近邻可以走同一套存储。

3. **多版本与零拷贝**：写新数据不重写旧 fragment，只追加新 fragment + 新 manifest。可以 time-travel 回任何旧版本，也可以只更新某几列（叫 column-level update）。类比 git：每次 commit 是新 fragment，HEAD 是 manifest。

4. **多模态友好**：同一张表里图像 bytes、视频帧、文本、embedding 张量混着存。因为是列存，读"只要 caption 列"时不用解码图像。

底下还是 Apache Arrow 内存模型——Lance 只重做了**磁盘那一层**，跟 PyArrow / DuckDB / Polars 这些 Arrow 生态零成本互通。

## 与 Parquet 的细节对比

为了不把 "Parquet for AI" 当成口号，下面是几个**具体能感觉到**的差别。

| 维度 | Parquet | Lance |
|------|---------|-------|
| 数据组织 | row group + page | 每列独立文件 + 索引页 |
| 优化方向 | 顺序扫描 | 随机点访问 |
| 单点读延迟 | 几十毫秒（要解码整个 page） | 毫秒级 |
| 向量列 | 普通 list，无原生索引 | fixed_size_list + 内置 ANN |
| 多版本 | 不支持，要叠 Iceberg/Delta | 原生 manifest + fragment |
| 列级更新 | 不支持，必须全表重写 | 支持（写入新 fragment 即可） |
| 写入吞吐 | 高 | 中（要建索引） |
| 数仓引擎兼容 | Spark/Trino/Hive 全支持 | 仅 LanceDB / DuckDB / 部分 Polars |

记住 **"行组 vs 列文件"** 这一对差异，其它结论几乎都从这里推得出来。

## 实践案例

### 案例 1：训练集版本管理

用 PyTorch 训模型，每周清洗一次数据。传统做法是把整张 Parquet 重写一遍，几百 GB IO。Lance 只追加变化的 fragment，几秒钟搞定。回滚到上周版本只是切 manifest 指针。

```python
ds = lance.dataset('train.lance')
ds.versions()                    # 列出所有历史版本
old = lance.dataset('train.lance', version=5)  # time-travel 到版本 5
```

### 案例 2：RAG 的存储底座

LanceDB（基于 Lance 的向量数据库）把 embedding + 原文 + 元数据塞同一张表，建一个 IVF-PQ 索引就能查最近邻。对比 Pinecone / Weaviate 这种独立服务，Lance 只是文件——可以直接放 S3，没有服务器，**零运维**。

### 案例 3：多模态评估快照

跑大模型 eval，要存 "图像 + prompt + 模型回答 + ground truth + 各种打分"。Lance 一张表搞定，列存让你只读"打分"列做聚合时不用碰图像 bytes。

## 踩过的坑

1. **写入吞吐不如 Parquet**：Lance 为读优化，写时要建索引页，单线程批量写比 Parquet 慢 30%-50%。流式 ingestion 场景要谨慎。

2. **生态没 Parquet 广**：Spark / Hive / Trino 这些数仓引擎只认 Parquet。要在数仓里查 Lance 数据，要么转 Parquet，要么用 LanceDB 自己的查询层。

3. **小文件问题**：每次追加产生新 fragment，频繁小批量写会堆出几千个 fragment。要定期跑 `compact_files()` 合并，跟 Iceberg / Delta 一样的运维负担。

4. **ANN 索引非免费**：在 100 万行的 768 维向量上建 IVF-PQ 索引要几分钟到几十分钟。索引参数（nlist / nprobe）调不好，召回率会从 95% 跌到 70%。

5. **schema evolution 限制**：可以加列、删列、改列名，但**改列类型**还不稳——尤其涉及向量维度变化要小心。

## 适用 vs 不适用场景

**适用**：

- 训练数据集存储 + 版本管理（替代 Parquet + DVC 组合）
- RAG / 推荐系统的向量检索基底（替代独立向量数据库）
- 多模态数据湖（图像/视频/文本/embedding 混合）
- 模型评估和 A/B 测试快照——需要 time-travel

**不适用**：

- 传统 OLAP 数仓——Parquet + Iceberg 仍是主流，Spark/Trino 生态强
- 高频流式写入（Kafka 直灌）——单文件写入吞吐不够，要走 Iceberg
- 事务型负载——Lance 没有 ACID 行级事务，是 append-only + manifest 切换
- 不需要向量 / 多模态的纯关系型场景——用 Parquet 即可，无需新格式

## 历史小故事（可跳过）

- **2022 年**：Chang She（前 pandas 核心贡献者）和 Lei Xu 在 LinkedIn 见到 AI 团队用 Parquet 存训练集的痛苦，启动 Lance 项目。
- **2023 年**：发布 Lance v2，磁盘格式整体重写，砍掉 row group，加入列级随机访问索引页。同年 LanceDB（向量数据库）开源，把 Lance 当存储底座。
- **2024 年**：被 Character.ai、Midjourney、Hugging Face 等公司用于训练数据管理。
- **2026 年（今）**：成为 "AI 数据格式" 类目的代表项目，与 Apache Iceberg、Delta Lake 形成"传统数仓 vs AI 数据"的格局对照。

## 学到什么

1. **访问模式决定文件格式**：Parquet 为顺序扫描设计（OLAP），Lance 为随机点访问设计（AI）。同一份"列存"思想，落到不同负载上就要重新做格式。
2. **格式 vs 表 vs 服务**：Parquet 是格式，Iceberg 是表，Snowflake 是服务。Lance 占第一层（格式），LanceDB 占第三层（服务）。看清栈才不被名字骗。
3. **向量是新一等公民**：从 2022 年起，"向量列 + ANN 索引"从应用层下沉到存储层。这是过去 30 年列存格式罕见的根本变化。
4. **AI 工作负载不是 OLAP 也不是 OLTP**：是第三种——大批量随机访问 + 多版本 + 多模态。给它造专用基础设施是 2020s 的明显趋势。

## 延伸阅读

- 项目主页：[github.com/lancedb/lance](https://github.com/lancedb/lance)
- 设计文档：[lancedb.github.io/lance](https://lancedb.github.io/lance/)（含格式规范和 benchmark）
- 对比博客：["Why we built Lance"](https://blog.lancedb.com/) — 创始人讲为什么不直接用 Parquet
- 论文背景：[[cstore-2005]] —— 列存的奠基论文，理解为什么列存适合分析负载
- [[duckdb-2019]] —— DuckDB 用 Parquet 也能跑 AI 数据吗？看完两个文档对比就懂

## 关联

- [[lancedb]] —— LanceDB，构建在 Lance 文件格式之上的嵌入式向量数据库
- [[pyarrow]] —— Lance 的内存模型直接复用 Arrow，跨工具零拷贝
- [[duckdb]] —— 同样基于 Arrow 的分析引擎，可直接查 Lance 数据集
- [[polars]] —— Rust 数据帧库，与 Lance 共享 Arrow 内存生态
- [[pgvector]] —— Postgres 的向量扩展，对比 Lance "外挂表" vs "原生格式" 两条路线
- [[cstore-2005]] —— 列存范式起点，理解 Lance 重构的是哪一层
- [[duckdb-2019]] —— OLAP 列存代表，与 Lance 的 AI 列存形成对照
- [[monetdb-x100-2005]] —— 向量化执行引擎奠基，与 Lance 的 Arrow 向量化思路同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cstore-2005]] —— C-Store — 把数据按列存，分析查询直接快十倍
- [[duckdb]] —— DuckDB — 嵌入式列存 OLAP
- [[lancedb]] —— LanceDB — 嵌入式向量库（进程内 + 对象存储）
- [[monetdb-x100-2005]] —— MonetDB/X100 — 让数据库一次处理一向量行而不是一行
- [[pgvector]] —— pgvector — PostgreSQL 向量扩展
- [[polars]] —— Polars — Rust 写的列存 DataFrame
- [[pyarrow]] —— PyArrow — 让所有数据系统共用一块内存

