---
title: Tantivy — Rust 版 Lucene
来源: https://github.com/quickwit-oss/tantivy
日期: 2026-06-01
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Tantivy 是 Paul Masurel 2016 年用 **Rust** 写的**嵌入式全文搜索库**（library/crate），用同一类算法重新实现 Apache Lucene 的能力。

日常类比：

- [[elasticsearch]] 像一整套快递公司——服务器、车队、网点都打包好，你只能从外面调它的 API
- Tantivy 像快递公司的"分拣机零件"——不能直接寄快递，但你可以把它装进自己的产品里，定义自己的运输规则

它不是 server，没有 HTTP 接口，没有内置集群。你 `cargo add tantivy`，在 Rust 程序里 `new Index → add_document → commit → search`，所有数据写在你指定的目录里，靠 mmap 读。

## 为什么重要

不理解 Tantivy，下面这些事看不清：

1. **现代 Rust 搜索栈的地基**：[[quickwit]] / ParadeDB（Postgres 全文搜索扩展）/ lnx / nucliadb 都把 Tantivy 当核心引擎，自己只加分布式、对象存储、SQL 接口
2. **为什么 Rust 重写 Lucene 是合理的**：Lucene 受限于 JVM——堆外内存难管、GC 抖动影响 p99、启动慢。Rust 没这些包袱
3. **library 和 server 的边界**：[[meilisearch]] 是 server 路线（开箱即用，schema 自动），Tantivy 是 library 路线（自己拼 server，schema 显式）
4. **嵌入式搜索复兴**：SQLite FTS5 太朴素、Lucene 必须开 JVM，Tantivy 填了"单机/单进程也要 BM25 + tokenizer + ranking"的空缺

## 核心要点

Tantivy 的"为什么这么快、为什么和 Lucene 像"，可拆成四件事。

### 1. Lucene 风格的 segment 模型

每次 `commit()` 写出一个**不可变 segment**（一个目录 + 几个文件）。后台 merger 合并小段成大段。删除文档不是真删，而是在段上写一张墓碑位图，搜索时跳过。

好处：**写入只 append、读取无锁、崩溃恢复简单**。代价：删除/更新会留垃圾，靠 merge 回收。

### 2. 倒排索引 + FST 词典

倒排索引：词 → 包含它的文档列表（postings list）。Tantivy 用 **FST**（Finite State Transducer，有限状态转换器）压缩词典，查词典本身就是常数级 mmap 读。

**整张倒排表都 mmap**，操作系统自动管热数据，不用自己写缓存层。

### 3. BM25 + 多字段评分

默认评分函数是 **BM25**（信息检索 30 年的标准），考虑词频、文档长度、稀有度三项。多字段查询可以加权——比如 title 权重 3、body 权重 1。

要改排序逻辑，写一个 `Collector` trait 实现，自己定义"看到一条命中怎么打分"。

### 4. 三种字段存储模式

定义 schema 时每个字段选三个独立开关：

| 选项 | 干什么 | 例子 |
|---|---|---|
| `INDEXED` | 进倒排索引，可被搜索 | title / body |
| `STORED` | 原文回存，命中后能取回 | title（要回显） |
| `FAST` | 列存，可做排序/聚合/范围过滤 | timestamp / price |

三个开关独立组合。一个字段可以"不索引但存"（只显示），也可以"索引不存"（只能搜不能取回，省盘）。

## 实践案例

### 案例 1：最小可跑的索引器

```rust
use tantivy::{schema::*, Index, doc};

let mut sb = Schema::builder();
let title = sb.add_text_field("title", TEXT | STORED);
let body  = sb.add_text_field("body",  TEXT);
let schema = sb.build();

let index = Index::create_in_dir("./idx", schema)?;
let mut writer = index.writer(50_000_000)?;
writer.add_document(doc!(title => "Matrix", body => "Neo wakes up..."))?;
writer.commit()?;
```

`50_000_000` 是写入器的 RAM 预算（50 MB）；超过就 flush 一个 segment。

### 案例 2：搜出来 + 高亮

```rust
use tantivy::{collector::TopDocs, query::QueryParser};

let reader = index.reader()?;
let searcher = reader.searcher();
let parser = QueryParser::for_index(&index, vec![title, body]);
let query = parser.parse_query("matrix")?;
let top = searcher.search(&query, &TopDocs::with_limit(10))?;
for (score, addr) in top {
    let doc = searcher.doc(addr)?;
    println!("{score} {doc:?}");
}
```

API 设计很直白：parse → search → 拿命中地址 → 取回文档。

### 案例 3：中文分词外挂

Tantivy 内置只有英文 / whitespace / raw。中文搜索要自己接 **jieba-rs** 或 **Lindera**：

```rust
let cn_tokenizer = LinderaTokenizer::new(/* CC-CEDICT 字典 */);
index.tokenizers().register("cn", cn_tokenizer);
// schema 里 .set_tokenizer("cn")
```

字典几十 MB，第一次加载慢，之后 mmap 常驻。

## 踩过的坑

1. **schema 不能改**：上线后想加字段必须 reindex。早期项目建议把 `extras: JsonObjectField` 留好，省得回头重建
2. **commit 会卡住**：commit 是同步 fsync。每条写一次 commit 性能炸；正确做法是攒一批（几千条或几秒）再 commit
3. **段太多 → 搜索慢**：merger 跟不上写入时段数会爆。监控 `segment count`，必要时手动 `merge_policy` 调激进
4. **删除是软删**：墓碑位图占内存，长期高频改写要定期 `garbage_collect_files` 回收
5. **fast field 类型受限**：u64 / i64 / f64 / date / bytes，文本用不了 fast。要按文本排序得先转 ord（字典序整数）
6. **没有分布式**：单机库。要分片要复制要选主，自己拼或用 [[quickwit]]。别在 Tantivy 层硬解

## 适用 vs 不适用场景

**适用**：

- Rust 应用想内嵌搜索（桌面应用、CLI、单机服务、Tauri 应用）
- 自己造搜索后端，要 BM25 + tokenizer + 自定义排序，但不想搬 Java
- 嵌入到现有数据库当全文索引扩展（ParadeDB → Postgres 走的就是这条路）

**不适用**：

- 想要"装上就能用、不写代码"——选 [[meilisearch]] / [[opensearch]]
- 需要 SQL 接口 / 时序聚合 / 对象存储 / 集群——选 [[quickwit]]（构在 Tantivy 之上）
- 向量搜索为主，文本只是辅助——选 Qdrant / LanceDB
- 不会 Rust——Tantivy 没有官方 Python / Go binding（社区有 tantivy-py 但功能子集）

## 历史小故事（可跳过）

- **2016 年**：法国工程师 Paul Masurel 开始写 Tantivy。动机是"Lucene 很好但 JVM 让我用不爽"
- **2017 年**：Quickwit 团队发现 Tantivy 是分布式日志搜索的理想嵌入引擎，开始反向贡献
- **2021 年**：Quickwit 公司成立，Tantivy 收归 quickwit-oss 组织，发展节奏跟 Quickwit 同步
- **2024+**：ParadeDB（Postgres 全文搜索扩展）选 Tantivy 当引擎，把它推进了数据库内核生态

## 学到什么

1. **library 和 server 是两种世代取舍**：server 优先开箱体验，library 优先可嵌入性。Lucene / Tantivy 选 library，Elasticsearch / MeiliSearch 选 server——同一份算法两种产品形态
2. **mmap + 不可变段**是过去 20 年搜索/存储引擎的默认底座，Tantivy 用 Rust 重新走一遍这条路
3. **BM25 至今没被神经网络打败**：在多数文本搜索场景，BM25 + 良好 tokenizer 比向量搜索又快又准。向量是补充不是替代
4. **Rust 重写老 Java 项目的范式**：不是逐行翻译，而是借 Rust 的内存模型重新设计数据布局（堆外、mmap、零拷贝），性能跃升来自这层重构

## 延伸阅读

- 仓库：[quickwit-oss/tantivy](https://github.com/quickwit-oss/tantivy)（README 有 quickstart）
- 官方 examples：[examples/](https://github.com/quickwit-oss/tantivy/tree/main/examples)（10+ 个可跑示例，从 basic 到 facet）
- 作者博文：[Of tantivy, a search engine in Rust](https://fulmicoton.com/posts/behold-tantivy/)（2017 年创世帖，讲设计动机）
- [[quickwit]] —— 构在 Tantivy 之上的分布式搜索引擎
- [[meilisearch]] —— 同样 Rust 写的，但是 server 路线对照

## 关联

- [[elasticsearch]] —— Java/Lucene 的工业级 server 标杆，Tantivy 是它的 Rust library 对照
- [[meilisearch]] —— 同语言不同形态：MeiliSearch = 开箱即用 server，Tantivy = 显式可嵌入 library
- [[quickwit]] —— 把 Tantivy 当核心，再补分布式 + 对象存储 + 时序
- [[opensearch]] —— Elasticsearch 的开源分叉，和 Tantivy 是另一种"绕开许可证"路线
- [[the-silver-searcher]] —— 同样追求"快"，但定位是命令行 grep，不是索引引擎

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[elasticsearch]] —— Elasticsearch — 分布式搜索引擎
- [[meilisearch]] —— MeiliSearch — 开发者友好的搜索引擎
- [[the-silver-searcher]] —— the_silver_searcher (ag) — 比 grep/ack 快一个数量级的代码搜索
- [[vespa]] —— Vespa — Yahoo 检索 + 排序引擎
- [[zincsearch]] —— ZincSearch — 单二进制 Go 写的 ES 替代

