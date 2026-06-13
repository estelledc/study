---
title: sqlx — 编译期校验 SQL 工具包
来源: https://github.com/launchbadge/sqlx
日期: 2026-06-13
分类: 其他
子分类: rust-tools
provenance: pipeline-v3
---

# sqlx — 编译期校验 SQL 工具包

## 一、什么是 sqlx？

想象一下，你每天都要写一封信给朋友，信封上要写的地址格式有固定规则：收件人姓名、邮编、城市……如果写错一个字，信就会被邮局退回。

写 SQL 查询也是一样的——你需要写表名、列名、数据类型，如果列名拼错或者类型不对，程序跑起来就会报错。问题是：大多数 SQL 库要等你**跑起来之后**才发现错误，就像信已经寄出去了才被退回。

sqlx 做的事情是：**在你编译程序的时候，它就帮你检查 SQL 有没有写错**。如果列名拼错了，它根本不让你编译通过。这就好比邮局在你封信封的时候就检查了一遍，发现写错了当场告诉你。

sqlx 是 Rust 生态里最受欢迎的 SQL 工具包，GitHub 上有超过 17,100 个星标，支持 PostgreSQL、MySQL/MariaDB 和 SQLite 三种数据库。它最大的特色是"编译期校验"——用宏（`query!` 和 `query_as!`）在编译时连接你的数据库，让数据库自己来验证你的 SQL 对不对。

## 二、核心概念

### 1. 连接池（Connection Pool）

连接池就像你家的"电话线路"。你不能每次想跟朋友说话就重新拉一根电话线——太慢了。连接池会提前准备好多条连接，你需要查询数据库时从池子里拿一条用完再还回去。sqlx 内置了 `Pool`，一行代码就能创建。

### 2. 运行时查询（query / query_as）

这是最基础的查询方式。你写一个 SQL 字符串，用 `.bind()` 传入参数。sqlx 会在运行时检查参数数量和类型对不对。如果参数不对，程序会报错，但错误发生在**程序运行后**才被发现。

### 3. 编译期查询（query! / query_as!）

这是 sqlx 的杀手锏。你用 `query!` 或 `query_as!` 宏来写 SQL，编译时 sqlx 会连接你的数据库，验证 SQL 的语法、列名、参数类型。如果有任何问题，`cargo build` 直接报错，你连程序都跑不起来。

**编译期校验意味着**：改完 SQL 后不需要重新跑程序来确认对不对——编译器就是裁判。

### 4. DATABASE_URL

要让编译期校验工作，你需要设置 `DATABASE_URL` 环境变量，指向一个开发用的数据库。这个数据库里不需要有任何数据——只要有和线上数据库一样的表结构（schema）就行。

### 5. 离线模式（Offline Mode）

编译期校验有个小麻烦：每次编译时它都要连接数据库。如果你的电脑没网或者数据库关了，编译就会失败。离线模式解决了这个问题——它会把你查询校验的结果缓存到 `sqlx-data.json` 文件里。下次编译时直接读缓存，不用再连数据库了。

## 三、代码示例

### 示例 1：基础查询与连接池

这段代码展示了怎么创建数据库连接池，以及用运行时查询（`query_as`）从数据库取数据：

```rust
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    // 创建连接池，最多 5 个并发连接
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect("postgres://postgres:password@localhost/test")
        .await?;

    // 运行时查询：sqlx 在运行时检查参数
    let row: (i64,) = sqlx::query_as("SELECT $1")
        .bind(150_i64)
        .fetch_one(&pool)
        .await?;

    println!("返回值: {}", row.0);

    Ok(())
}
```

几个要点：
- `PgPoolOptions::new().max_connections(5)` — 最多保持 5 条数据库连接
- `.connect(...)` — 用数据库连接字符串连接，格式是 `协议://用户:密码@主机/数据库名`
- `query_as` — 返回一个元组 `(i64,)`，你可以用 `row.0` 拿到第一列的值
- `$1` — PostgreSQL 的参数占位符，MySQL 用 `?` 代替

### 示例 2：编译期校验查询（query_as!）

这段代码展示了编译期校验的威力。假设你有一个用户表，你想按国家分组统计人数：

```rust
use sqlx::FromRow;

// 定义一个结构体，字段名对应数据库查询结果的列名
#[derive(Debug, FromRow)]
struct CountryCount {
    country: String,
    count: i64,
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect("postgres://postgres:password@localhost/test")
        .await?;

    let organization = "Acme Corp";

    // query_as! 宏：编译时校验 SQL 是否正确
    // 注意：参数 organization 直接写在这里，而不是用 .bind()
    let results: Vec<CountryCount> = sqlx::query_as!(
        CountryCount,
        r#"
            SELECT country, COUNT(*) as count
            FROM users
            GROUP BY country
            WHERE organization = $1
        "#,
        organization
    )
    .fetch_all(&pool)
    .await?;

    for row in &results {
        println!("{}: {} 人", row.country, row.count);
    }

    Ok(())
}
```

编译期校验帮你检查了这些事：
- `users` 表是否存在
- `country` 和 `organization` 列是否存在
- `COUNT(*)` 返回的类型能否匹配 `i64`
- `$1` 参数的类型是否与 `organization`（`&str`）匹配
- `GROUP BY country` 语法是否合法

如果其中任何一步有问题，`cargo build` 就会报错，告诉你"第 XX 行：列 `coountry` 不存在"——注意，拼写错误 `coountry` 会被直接揪出来。

## 四、query() 与 query!() 的对比

| 特性 | `query()` | `query!()` | `query_as!()` |
|------|-----------|------------|---------------|
| 校验时机 | 运行时 | 编译时 | 编译时 |
| 返回类型 | `Row`（手动取值） | 匿名结构体 | 你定义的结构体 |
| 参数传法 | `.bind()` 链式 | 直接写在宏里 | 直接写在宏里 |
| 需要 DATABASE_URL | 不需要 | 需要 | 需要 |
| 性能 | 需要运行时解析 | 预编译优化 | 预编译优化 |
| 适用场景 | 动态 SQL、简单查询 | 静态 SQL、需要列名 | 静态 SQL、有结构体 |

选择建议：
- SQL 是写死的（不会根据条件拼接）→ 用 `query_as!()`，最安全
- SQL 需要根据条件动态拼接 → 用 `query()` + `.bind()`，灵活但少一层保障
- 只是想执行一条不返回数据的语句（INSERT / UPDATE）→ 用 `execute()`

## 五、为什么它叫"不是 ORM"？

ORM（对象关系映射）会给你一个"Rust API"来代替写 SQL，比如 `users.where(name="john").find_all()`。这样你不需要写任何 SQL。

sqlx 明确说"我不是 ORM"。它让你直接写 SQL，而不是用 API 代替 SQL。它只做一件事：在你写 SQL 的时候帮你检查它有没有问题。SQL 怎么写、用什么语法、要不要加索引，全部由你决定。

这带来了两个好处：
1. 你可以用数据库的所有功能（包括扩展插件），不会受限于 ORM 提供的 API
2. 你不需要学一套新的查询语言，直接用你熟悉的 SQL

## 六、工程实践建议

设置编译加速，在 `Cargo.toml` 里加这一段，能让 `cargo build` 快很多：

```toml
[profile.dev.package.sqlx-macros]
opt-level = 3
```

sqlx 的编译期校验会做不少工作，特别是第一次编译时。加上这行后，`sqlx-macros` 这个 crate 会用优化级别 3 编译（接近发布版的速度），显著缩短编译时间。

用 `.env` 文件管理 `DATABASE_URL`，不用每次手动设置：

```
DATABASE_URL=postgres://postgres:password@localhost/test
```

sqlx 会自动读取项目根目录下的 `.env` 文件。

## 七、一句话总结

sqlx 让 Rust 程序中的 SQL 查询像普通函数调用一样——写错了在编译时就报错，不需要等到运行时才发现。它不替你写 SQL，只帮你检查 SQL，是你写 Rust 后端时最可靠的那个"校对人"。
