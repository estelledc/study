---
title: MonetDB/X100 — 让数据库一次处理一向量行而不是一行
来源: 'Boncz, Zukowski, Nes. "MonetDB/X100: Hyper-Pipelining Query Execution". CIDR 2005'
日期: 2026-05-30
分类: 数据库
难度: 中级
---

## 是什么

MonetDB/X100 是一套**让数据库引擎一次处理一小批数据（约 1000 行），而不是一行一行处理**的查询执行架构。日常类比：传统数据库像超市收银员一件一件扫码——每件都要开钱包、找零、装袋；X100 像批量结账——把购物车里 1000 件先扫完再统一收钱。

传统的"火山模型"（Volcano）每读一行都要跨多层算子调一次 `next()`：filter → project → aggregate。一行走完所有算子的成本巨大，CPU 大部分时间花在虚函数调用、解释执行、cache miss 上。X100 改成：算子之间传一段长度约 1024 的**向量**（一段连续数组），调一次 `next()` 干 1024 行的活。

这套架构现在是 DuckDB / ClickHouse / Photon / Velox / Snowflake 等所有现代分析引擎的共同祖先。

## 为什么重要

不理解 X100，下面这些事都没法解释：

- 为什么 DuckDB 嵌在你 Python 脚本里，跑分析查询比 MySQL 快几十倍
- 为什么 2005 年的 CPU 还在 GHz 战，OLAP 数据库的瓶颈却是 cache 不是磁盘
- 为什么 ClickHouse / Velox / Photon 文档里都在说 "vectorized execution"——它们都是 X100 的徒孙
- 为什么"列式存储"和"向量化执行"是两件事但常一起出现——X100 第一次把它们绑死

## 核心要点

X100 三个核心选择：

1. **向量而不是单行**：算子间传 ~1024 行的列数组，不传单行。类比：工厂从"流水线一件一件传"改成"小托盘一次传 1000 件"，搬运损耗摊薄到 1/1000。

2. **向量而不是整列**：MonetDB 旧版本一次跑一整列（中间结果可能上百万行），结果中间结果撑爆 cache，DRAM 反复 round-trip。X100 选 1024 这个 sweet spot——刚好塞进 L1/L2 cache，又足够长来摊薄解释开销。

3. **紧 loop 让编译器自动优化**：每个算子内部就是 `for (i=0; i<1024; i++) ...`，没有虚函数、没有分支跳转。编译器自动展开、自动超标量、有时还自动 SIMD。CPU IPC 从 Volcano 的 0.7 拉到 2+。

合起来叫 **hyper-pipelining**——CPU 流水线被填满，停顿（stall）极少。

## 实践案例

### 案例 1：Volcano 模型为什么慢

```c
// 传统火山模型：每行调一次链
while ((row = filter.next()) != NULL) {
    row = project.next(row);
    aggregate.consume(row);
}
```

**逐部分解释**：

- 每行触发 3 次虚函数调用（filter / project / aggregate），CPU 每次都要查 vtable
- 行内字段散布——读一个 int 要跳到下一个 cache line，cache miss 频繁
- 分支预测器永远在猜 `next()` 进哪条路，错预测惩罚 ~20 cycles

TPC-H Q1 在 2005 年主流数据库上跑出来 IPC 0.7，CPU 时间 90% 浪费。

### 案例 2：X100 怎么改

```c
// X100 向量化：每次处理 1024 行
typedef struct { int data[1024]; int n; } Vector;

void filter_int_gt(Vector *in, Vector *out, int threshold) {
    int j = 0;
    for (int i = 0; i < in->n; i++) {        // 紧 loop，无分支
        out->data[j] = in->data[i];
        j += (in->data[i] > threshold);      // 无分支条件累加
    }
    out->n = j;
}
```

**逐部分解释**：

- 一次调用处理 1024 行，虚函数开销摊到 1/1024
- 输入连续、输出连续——cache 利用率拉满
- 编译器看到这种 loop 自动 SIMD（一条指令同时处理 4-8 个 int）

TPC-H Q1 直接快 30 倍，IPC 提到 2+。

### 案例 3：DuckDB 把这套搬进 Python

```python
import duckdb
con = duckdb.connect()
con.sql("SELECT category, AVG(price) FROM 'sales.parquet' GROUP BY category").show()
```

DuckDB 内部就是 X100 那套：列式 Parquet 直读 → 向量化算子链 → tight loop 聚合。一台笔记本上扫 10 亿行只要几秒，而同样查询在 MySQL（行式 + Volcano）要分钟级。

## 踩过的坑

1. **vector size 不是越大越好**：超过 L1/L2 cache 就退化成"column-at-a-time"的中间结果膨胀问题。X100 实测最优在 1024 行上下，不同 CPU/cache 大小要重测。

2. **向量化不等于 SIMD**：X100 的主菜是 tight loop 让编译器自动展开 + 超标量调度。SIMD 是顺带福利——你即使关掉 SIMD，光靠 loop 优化也能拿大头收益。

3. **OLTP 强行套向量化反而慢**：单点查询、点更新每个 vector 只有 1 行，向量化的开销比省下的 next() 还多。X100 是 OLAP 专用引擎，别拿去做交易系统。

4. **向量化 vs 编译式（codegen）不是绝对优劣**：HyPer (Neumann 2011) 用 LLVM 把整条 query 编译成一个 loop，理论上更紧。两条路在不同 query 形状各有胜场，工业上常常混用（如 Photon = 向量化 + 部分 codegen）。

## 适用 vs 不适用场景

**适用**：
- OLAP 分析查询（聚合、扫描、join 大表）
- 列式存储 + 大批量数据扫描
- CPU-bound 工作负载——内存带宽和 cache 是瓶颈而不是磁盘
- 嵌入式分析（DuckDB）/ 数据湖查询引擎（Velox / Photon）

**不适用**：
- OLTP 单点查询、单行更新——向量化开销大于收益
- 行级强一致事务系统——X100 假设批处理友好
- 极小数据量（< 几千行）——next() 开销可忽略，行式简单更优
- 需要严格 row-at-a-time 流式处理（如某些 ETL pipeline）

## 历史小故事（可跳过）

- **1990s 末**：CWI（阿姆斯特丹）Martin Kersten 团队搞 MonetDB，主打 column-at-a-time——一次跑一整列，中间结果落物化数组。性能比行式快 10x，但中间结果爆 cache。
- **2005 年**：博士生 Marcin Zukowski + Peter Boncz 把 cache 问题修了——改成 vector-at-a-time，CIDR 2005 论文 12 页，叫 hyper-pipelining。同年 MIT Stonebraker 的 [[cstore-2005]] 从存储侧呼应。
- **2008 年**：Zukowski 离开 CWI 创办 VectorWise 商业化，2010 年被 Actian 收购。
- **2018 年起**：DuckDB（CWI 自家继任者）把 X100 搬进单机进程内；ClickHouse / Photon / Velox 接棒；20 年后整个 OLAP 行业都在跑 X100 的变种。

## 学到什么

1. **CPU 比磁盘更值得优化**——2000s 中期数据库性能瓶颈已经从 IO 移到 cache，但行业用了 10 年才接受这件事
2. **向量是单行和整列之间的甜蜜点**——批大小决定一切，太小（=1）摊不开开销，太大（=百万）爆 cache
3. **写紧 loop 让编译器替你优化**比手写汇编 SIMD 更可持续——这是 X100 区别于 GPU/SIMD 流派的关键
4. **架构创新 + 商业落地往往隔 5-10 年**——X100 论文 2005，DuckDB 主流 2020+，但行业基础设施现在都在抄它

## 延伸阅读

- 论文 12 页 PDF：[MonetDB/X100 CIDR 2005](https://www.cidrdb.org/cidr2005/papers/P19.pdf)（图表多，结构清晰）
- 视频：[Andy Pavlo CMU 15-721 Vectorization](https://www.youtube.com/watch?v=h3Z4hWqDpsQ)（CMU 数据库系统课，把 X100 讲透）
- 工程文章：[DuckDB — Vectorized Query Execution](https://duckdb.org/why_duckdb.html)（DuckDB 自己解释为什么继承 X100）
- 进阶：HyPer / Umbra 论文（Neumann 团队）——向量化 vs codegen 的另一条路线
- [[volcano-1994]] —— X100 要打的对手就是 Volcano 火山模型
- [[cstore-2005]] —— 同年 MIT 论文，从列式存储侧呼应

## 关联

- [[volcano-1994]] —— 火山模型 tuple-at-a-time 是 X100 要替换的旧范式
- [[cstore-2005]] —— C-Store 列式存储 + X100 向量化执行 = 现代 OLAP 双柱
- [[cascades-1995]] —— 查询优化器框架，与 X100 执行层正交，常组合使用
- [[clickhouse]] —— 把 X100 思路放大到 64K 行块的工业级实现
- [[snowflake]] —— 云原生 OLAP，执行层基本是 X100 派
- [[neumann-2015-large-joins]] —— 向量化的另一条路线 codegen，对照阅读
- [[selinger-1979]] —— 早一代查询优化经典，与 X100 执行层互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[duckdb-2019]] —— DuckDB — 把 OLAP 数据库塞进你的 Python 进程
- [[efficient-compile-2011]] —— Efficient Compile 2011 — 把 SQL 查询编译成贴近 CPU 的机器码
- [[fastlanes-compression]] —— FastLanes Compression Layout — 用标量代码解码千亿整数
- [[morsel-driven-2014]] —— Morsel-Driven Parallelism — 把 SQL 查询切成小口分给多核
- [[snowflake-2016]] —— Snowflake 2016 — 把数仓拆成 storage / compute / services 三层
- [[trill-2014]] —— Trill — 一个引擎同时跑流、批、交互三种分析
- [[vertica-2012]] —— Vertica 2012 — C-Store 论文走向产品的七年改造账
- [[wco-joins-relational-2020]] —— WCO Joins 2020 — 把最坏情况最优连接搬进关系数据库
- [[lance]] —— Lance — AI 数据列存格式
- [[polars]] —— Polars — Rust 写的列存 DataFrame
