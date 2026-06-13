---
title: Apache DataFusion 学习笔记
来源: https://github.com/apache/datafusion
日期: 2026-06-13
分类: 数据库
子分类: 现代数据库
provenance: pipeline-v3
---

# Apache DataFusion 学习笔记

## 什么是 DataFusion

DataFusion 是 Apache 基金会旗下的一个用 Rust 编写的高性能查询引擎。它有两个关键特点：

1. 使用 Apache Arrow 作为内存中的数据格式（列式存储）
2. 可以嵌入到你自己的程序里，也可以单独作为 SQL 引擎使用

先做一个日常类比：想象你有一个大厨房，里面有很多食材（数据文件）。传统做法是你每次想做菜就从头洗菜、切菜、炒菜。DataFusion 更像是一个预装好的标准化厨房——食材已经按类别分好（列式存储），你有现成的刀工模板（查询优化器），只需要告诉它你想做什么菜（SQL 查询），它就能高效地帮你完成。

核心目标是让开发者不必重复造轮子——不用自己写 SQL 解析器、查询优化器、并行执行引擎，直接嵌入 DataFusion 就能获得这些能力。

## 核心概念

### 1. SessionContext — 会话上下文

SessionContext 是整个 DataFusion 的入口，类似一个"厨房管家"。所有操作都围绕它展开：注册数据源、执行查询、管理配置。

### 2. Logical Plan — 逻辑计划

当你写一条 SQL 时，DataFusion 不会立刻去读文件。它先构建一个"逻辑计划"——相当于菜谱。这个计划描述了你要做什么（SELECT、WHERE、JOIN），但还没决定怎么做。

### 3. Query Optimizer — 查询优化器

在得到逻辑计划后，DataFusion 的优化器会对它进行各种变换和简化：把能提前做的过滤推下去、合并重复操作、自动重排 JOIN 顺序等。这是 DataFusion 高性能的关键之一。

### 4. Physical Plan — 物理计划

优化后的逻辑计划被翻译成"物理计划"——实际要执行的步骤，包括如何并行读取、如何内存排序、何时使用磁盘等。

### 5. Execution Engine — 执行引擎

最后，物理计划在多核 CPU 上执行，数据以 Arrow 列式格式在内存中流动，利用 SIMD 向量化指令达到高性能。

## 代码示例

### 示例一：用 SQL 查询 CSV 文件

这个例子展示最基础的使用方式：读取一个 CSV 文件，执行 SQL 查询，输出结果。

```rust
use datafusion::prelude::*;

#[tokio::main]
async fn main() -> datafusion::error::Result<()> {
    // 创建会话上下文（厨房管家）
    let ctx = SessionContext::new();

    // 注册一个 CSV 文件为名为 "sales" 的表
    ctx.register_csv("sales", "data/sales.csv", CsvReadOptions::new()).await?;

    // 执行 SQL 查询：按部门统计每个部门的平均工资
    let df = ctx.sql(
        "SELECT department, AVG(salary) as avg_salary \
         FROM sales \
         GROUP BY department \
         ORDER BY avg_salary DESC"
    ).await?;

    // 执行并打印结果
    df.show().await?;
    Ok(())
}
```

这里的关键是：你只需要写 SQL，DataFusion 自动处理文件读取、解析、执行等所有底层工作。

### 示例二：用 DataFrame API 编程式查询

如果你更喜欢写代码而不是 SQL，DataFusion 提供了类似 pandas 的链式 DataFrame API：

```rust
use datafusion::prelude::*;
use datafusion::functions_aggregate::expr_fn::avg;

#[tokio::main]
async fn main() -> datafusion::error::Result<()> {
    let ctx = SessionContext::new();

    // 读取 CSV 文件，得到一个 DataFrame
    let df = ctx.read_csv("data/sales.csv", CsvReadOptions::new()).await?;

    // 链式调用：过滤 -> 分组聚合 -> 排序 -> 限制
    let result = df
        .filter(col("salary").gt(lit(5000)))      // WHERE salary > 5000
        .aggregate(
            vec![col("department")],              // GROUP BY department
            vec![avg(col("salary")).alias("avg_salary")]  // AVG(salary)
        )?
        .sort(vec![col("avg_salary").sort(true, true)])  // ORDER BY avg_salary DESC
        .limit(0, Some(10))?;                    // LIMIT 10

    result.show().await?;
    Ok(())
}
```

注意 SQL 和 DataFrame API 两种方式是等价的——DataFusion 底层会生成相同的执行计划。

## DataFusion 支持什么数据格式

开箱即支持：

- **CSV** — 逗号分隔文本文件
- **Parquet** — 列式存储格式，适合分析型查询
- **JSON** — 半结构化数据
- **Avro** — 二进制序列格式

还支持自定义数据源（通过 TableProvider trait），可以对接数据库、API 等任意数据源。

## 为什么选择 DataFusion

DataFusion 的优势集中在三个方面：

- **性能**：Rust + Arrow 列式内存模型 + 向量化执行，性能表现与 Spark 等系统相当甚至更优
- **可嵌入**：作为一个 Rust crate 引入即可使用，不需要额外部署服务
- **可扩展**：可以在几乎每个环节做自定义——自定义函数、自定义数据源、自定义优化规则等

很多知名项目都基于 DataFusion 构建，比如 InfluxDB（时序数据库）、GreptimeDB、Cube Store、ParadeDB 等。

## 生态

DataFusion 有多种语言的绑定：

- **Python** — datafusion-python，可以用 Python 写 SQL 和 DataFrame 查询
- **Java** — datafusion-java
- **Ruby** — datafusion-ruby

还有一个基于 DataFusion 的分布式查询引擎叫 Ballista，以及一个加速 Apache Spark 的插件叫 Comet。
