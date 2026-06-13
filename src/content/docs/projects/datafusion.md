---
title: Apache DataFusion — Rust 查询引擎
来源: https://github.com/apache/datafusion
日期: 2026-06-13
分类: 数据库
子分类: databases-storage
provenance: pipeline-v3
---

# Apache DataFusion — Rust 查询引擎

## 一句话介绍

DataFusion 是一个用 Rust 写的**嵌入式查询引擎**，你可以把它理解为一个"可嵌入到你程序里的微型数据库内核"。

## 日常类比

想象你有一堆 CSV 文件，像超市每天的销售记录、网站日志、传感器数据。你想对这些数据做分析：筛选、分组、聚合、排序。

传统做法是你写一堆 `for` 循环，或者把数据导入 MySQL/PostgreSQL，然后写 SQL 查询。

DataFusion 的做法是：**不用建数据库、不用装服务、不用写循环**。你在自己的 Rust 程序里 `use datafusion;` 一行，就能直接对 CSV 文件执行 SQL 查询。

它的核心思路是：把"解析 SQL → 生成执行计划 → 优化计划 → 并行执行"这一整套流程，打包成一个库，嵌入到你的应用里。

这就像你不再需要开一家餐厅，而是直接雇了一个厨师团队住在你家里——你想做菜的时候，他们随时待命。

## 核心概念

### 1. SessionContext（会话上下文）

每个查询都需要一个 `SessionContext`，它是整个引擎的入口。你可以把它理解为"数据库连接对象"。所有操作（注册数据源、执行 SQL、创建 DataFrame）都从它开始。

### 2. Logical Plan（逻辑计划）

DataFusion 不会拿到 SQL 就直接跑。它会先把 SQL 翻译成一棵"逻辑计划树"，这棵树描述的是**你要做什么**，而不是**怎么执行**。

比如 `SELECT name FROM users WHERE age > 18` 会被翻译成：

```
Projection: name
  └─ Filter: age > 18
      └─ TableScan: users
```

然后引擎会对这棵树做各种优化（比如把 Filter 推到离数据源最近的地方），最后才生成物理执行计划。

### 3. DataFrame API

和 SQL 对应的，DataFusion 还提供了一种编程式的 DataFrame API，用法类似 Pandas 或 Spark DataFrame。它的优势是**延迟执行**——每次调用 `filter()`、`select()`、`aggregate()` 只是在构建计划，不调用 `collect()` 或 `show()` 时实际不执行任何操作。

### 4. Arrow 内存格式

DataFusion 底层使用 Apache Arrow 列式内存格式。列式存储意味着数据按列而不是按行存放，这样在做聚合或筛选某几个列时，只需要读取需要的列，大幅减少内存带宽消耗。

### 5. 执行引擎特点

- **矢量化执行**：每次处理一批数据（比如 4096 行），而不是一行一行处理
- **多线程并行**：充分利用多核 CPU
- **流式处理**：大数据集不需要全部加载到内存
- **零拷贝**：数据在不同处理阶段之间不需要复制

## 代码示例

### 示例 1：用 SQL 查询 CSV 文件

这是最简单的入门方式。注册一个 CSV 文件作为"表"，然后直接执行 SQL：

```rust
use datafusion::prelude::*;

#[tokio::main]
async fn main() -> datafusion::error::Result<()> {
    // 创建会话上下文
    let ctx = SessionContext::new();

    // 注册 CSV 文件为 "sales" 表
    ctx
        .read_csv(
            "sales.csv",
            CsvReadOptions::new(),
        )
        .await?
        .create_cte("sales_table".to_string(), None)?;

    // 执行 SQL 查询：按部门统计销售额
    let df = ctx.sql(
        r#"
        SELECT
            department,
            COUNT(*) as order_count,
            SUM(amount) as total_sales,
            AVG(amount) as avg_order_value
        FROM sales_table
        WHERE amount > 100
        GROUP BY department
        ORDER BY total_sales DESC
        LIMIT 10
        "#,
    ).await?;

    // 执行并打印结果
    df.show().await?;

    Ok(())
}
```

上面的代码等价于你在 SQL 里写的：

```sql
SELECT
    department,
    COUNT(*) as order_count,
    SUM(amount) as total_sales,
    AVG(amount) as avg_order_value
FROM sales_table
WHERE amount > 100
GROUP BY department
ORDER BY total_sales DESC
LIMIT 10;
```

### 示例 2：用 DataFrame API 编程式查询

如果你更喜欢在代码里用链式调用的方式构建查询：

```rust
use datafusion::prelude::*;
use datafusion::functions_aggregate::expr_fn::sum;

#[tokio::main]
async fn main() -> datafusion::error::Result<()> {
    let ctx = SessionContext::new();

    // 注册数据源
    let df = ctx
        .read_csv("sales.csv", CsvReadOptions::new())
        .await?;

    // 链式调用构建查询
    let result = df
        // 过滤：金额 > 100
        .filter(col("amount").gt(lit(100)))?
        // 分组聚合
        .aggregate(
            vec![col("department")],  // 按部门分组
            vec![
                count(lit(1)).alias("order_count"),       // 订单数
                sum(col("amount")).alias("total_sales"),  // 总销售额
            ],
        )?
        // 排序 + 限制
        .sort_by_exprs(col("total_sales").sort(false, true))?
        .limit(0, Some(10))?;

    result.show().await?;
    Ok(())
}
```

注意 `col()` 表示列引用，`lit()` 表示字面量值，`filter()`、`aggregate()`、`limit()` 都是在**构建计划**，只有在 `show()` 时才真正执行。

## 生态与子项目

DataFusion 不只是单个引擎，它是一个生态系统：

| 子项目 | 用途 |
|--------|------|
| DataFusion Python | Python 绑定，可以直接在 Python 里调用 |
| DataFusion Java | Java 绑定 |
| DataFusion Comet | Apache Spark 的 DataFusion 加速器 |
| DataFusion Ballista | 分布式查询引擎 |

很多知名项目都基于 DataFusion 构建，比如 InfluxDB、GreptimeDB、Cube Store、dbt Fusion 等。

## 为什么选择 DataFusion

- **性能**：Rust 的零开销抽象 + Arrow 列式存储 + 矢量化执行，性能对标甚至超过传统引擎
- **可嵌入**：不是一个需要部署的服务，而是一个库，嵌入即用
- **可定制**：几乎每个环节都能扩展（自定义函数、自定义数据源、自定义优化规则）
- **Apache 2.0 协议**：商业友好
- **Rust 安全**：编译期保证内存安全，无数据竞争

## 下一步

- 官方用户指南：https://datafusion.apache.org/user-guide/index.html
- 更多代码示例：https://github.com/apache/datafusion/tree/main/datafusion-examples
- crates.io 包：https://crates.io/crates/datafusion
