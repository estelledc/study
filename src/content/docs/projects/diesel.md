---
title: Diesel — Rust ORM 与查询构建器
来源: https://github.com/diesel-rs/diesel
日期: 2026-06-13
分类: 编程语言
子分类: rust-tools
provenance: pipeline-v3
---

# Diesel — Rust ORM 与查询构建器

## 从日常类比开始

想象你有一个大柜子（数据库），里面有很多抽屉（表），抽屉里是卡片（行）。

在普通 Rust 中操作数据库，就像每次要找一张卡片时，你都手写一张"SQL 命令纸条"塞给柜员——灵活但容易出错。

Diesel 做的事情是：给你一套 **有形状的模具**。你必须先声明每个抽屉长什么样（列名、数据类型），之后所有操作都通过这个模具。模具会提前"检查"你的操作是否合法——拼错了列名？编译不通过！类型不对？还是编译不通过！好处是你**不需要等到程序跑起来才知道出错**。

## 核心概念

### 1. Schema 定义（`table!` 宏）

你先用宏告诉 Diesel 数据库里有哪些表、每列是什么类型：

```rust
table! {
    users (id) {
        id -> Int4,
        name -> Varchar,
        email -> Varchar,
        active -> Bool,
    }
}
```

这等同于告诉 Diesel："有个 `users` 表，主键是 `id`，有四列，各自对应 Rust 的 `i32`、`String` 等类型。"

### 2. Model 结构体

接下来定义对应的 Rust 结构体，用 `derive` 标记它和表的映射关系：

```rust
use diesel::prelude::*;

#[derive(Queryable, Selectable)]
#[diesel(table_name = users)]
pub struct User {
    pub id: i32,
    pub name: String,
    pub email: String,
    pub active: bool,
}
```

`Queryable` 表示 Diesel 能从数据库结果映射到这个结构体，`Selectable` 表示它能自动生成 `SELECT users.*` 的字段列表。

### 3. 插入数据（`Insertable`）

新记录需要一个特殊的结构体：

```rust
#[derive(Insertable)]
#[diesel(table_name = users)]
pub struct NewUser {
    pub name: String,
    pub email: String,
}
```

### 4. 关系（`Associations` + `belongs_to`）

如果有一个 `posts` 表，每个帖子属于一个用户：

```rust
#[derive(Identifiable, Associations, Queryable)]
#[diesel(belongs_to(User))]
pub struct Post {
    pub id: i32,
    pub user_id: i32,
    pub title: String,
    pub body: String,
}
```

`belongs_to(User)` 告诉 Diesel：`Post.user_id` 外键关联 `User.id`，这样你可以方便地查"某个用户的所有帖子"。

### 5. 连接与查询

```rust
use diesel::prelude::*;
use crate::schema::users;
use crate::models::User;

fn get_active_users(conn: &mut PgConnection) -> QueryResult<Vec<User>> {
    users::table
        .filter(users::active.eq(true))
        .load::<User>(conn)
}
```

链式调用：`table` → `filter` → `load`，读起来像英语。

### 6. 类型安全

Diesel 的查询构建器会在**编译期**做大量检查：

- 列名写错 → 编译错误
- 类型不匹配 → 编译错误
- 查询结果不能映射到结构体 → 编译错误

这意味着很多 Bug 在 `cargo build` 阶段就被拦截了。

## 完整示例

### 示例一：CRUD 基本操作

```rust
use diesel::prelude::*;
use diesel::sql_types::{Text, Bool};

// 插入
fn add_user(conn: &mut PgConnection, name: &str, email: &str) -> QueryResult<usize> {
    diesel::insert_into(users::table)
        .values((
            users::name.eq(name),
            users::email.eq(email),
            users::active.eq(true),
        ))
        .execute(conn)
}

// 查询：获取所有活跃用户
fn get_active_users(conn: &mut PgConnection) -> QueryResult<Vec<User>> {
    users::table
        .filter(users::active.eq(true))
        .load::<User>(conn)
}

// 更新
fn update_user_email(
    conn: &mut PgConnection,
    user_id: i32,
    new_email: &str,
) -> QueryResult<usize> {
    diesel::update(users::table.filter(users::id.eq(user_id)))
        .set(users::email.eq(new_email))
        .execute(conn)
}

// 删除
fn delete_user(conn: &mut PgConnection, user_id: i32) -> QueryResult<usize> {
    diesel::delete(users::table.filter(users::id.eq(user_id)))
        .execute(conn)
}
```

### 示例二：复杂查询 — 带联查

```rust
use diesel::prelude::*;

// 定义一个组合结构体，用于接收 JOIN 结果
#[derive(QueryableByName)]
#[diesel(table_name = posts)]
pub struct PostWithAuthor {
    pub id: i32,
    pub title: String,
    #[diesel(column_name = first_name)]
    pub author_first_name: String,
    #[diesel(column_name = last_name)]
    pub author_last_name: String,
}

// JOIN 查询
fn get_posts_with_authors(conn: &mut PgConnection) -> QueryResult<Vec<PostWithAuthor>> {
    posts::table
        .inner_join(users::table)
        .select((
            posts::id,
            posts::title,
            users::first_name,
            users::last_name,
        ))
        .order(posts::id.desc())
        .load::<PostWithAuthor>(conn)
}

// 按条件筛选 + 分页
fn get_users_by_name(
    conn: &mut PgConnection,
    search: &str,
    limit: i64,
    offset: i64,
) -> QueryResult<Vec<User>> {
    users::table
        .filter(users::name.like(format!("%{}%", search)))
        .limit(limit)
        .offset(offset)
        .load::<User>(conn)
}
```

## 工作流概览

```
cargo new my_app          # 创建项目
diesel setup              # 初始化数据库 & migrations 目录
diesel migration create create_users   # 生成迁移文件
diesel migration run       # 执行迁移
diesel print-schema        # 从数据库反向生成 schema 代码
```

## 关键特性总结

| 特性 | 说明 |
|------|------|
| 编译期查询检查 | 列名、类型、关系都在编译期验证 |
| 查询构建器 | 链式 API，不用手写 SQL 字符串 |
| 支持三种数据库 | PostgreSQL、MySQL、SQLite |
| 迁移工具 | `diesel CLI` 管理 schema 版本 |
| 零运行时开销 | 无反射，无动态查询，性能接近手写 SQL |
| 支持 Raw SQL | 必要时可用 `sql_query()` 退回原始 SQL |

## 与其他 ORM 的对比

- **vs SQLx**：SQLx 更轻量，把 SQL 当字符串处理，类型安全靠 `#[derive(Queryable)]` + 宏；Diesel 的查询构建器更强大，能链式组合复杂查询。
- **vs SeaORM**：SeaORM 是异步原生的；Diesel 传统上是同步的（但有 `diesel_async` crate 做异步支持）。
- **vs Prisma**：Prisma 是 TypeScript 生态的；Diesel 是 Rust 原生的，类型系统深度绑定 Rust 的 `Copy` / `Send` / `Sync` 等概念。
