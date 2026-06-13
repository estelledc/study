---
title: Diesel - Rust 的类型安全数据库 ORM
来源: https://github.com/diesel-rs/diesel
日期: 2026-06-13
分类: 后端 API
子分类: rust-ecosystem
provenance: pipeline-v3
---

# Diesel - Rust 的类型安全数据库 ORM

## 什么是 Diesel？

Diesel 是 Rust 语言中最成熟的数据库访问库，被称为"类型安全的 ORM 和查询构建器"。

日常类比：如果把数据库操作比作去餐厅点菜，普通做法就是直接喊出你想吃的菜名（拼 SQL 字符串），喊错了没人管你。而 Diesel 像是给你一个智能点餐平板——你还没提交，平板就告诉你"这道菜今天没有食材了"或者"你把'红烧'拼成了'红焅'"。它在编译阶段就帮你发现绝大多数错误。

## 核心特性

- 编译期类型检查：字段类型不匹配会在编译时报错，而不是运行时崩溃
- 内置迁移系统：用 `diesel CLI` 管理数据库版本演进
- 支持三种数据库：PostgreSQL、MySQL、SQLite
- 链式查询 API：用 Rust 风格的流畅语法编写 SQL 查询
- 零成本抽象：最终生成的代码和手写 SQL 性能相当

## 核心概念

### 1. Schema 定义（`table!` 宏）

Diesel 通过 `table!` 宏从数据库表生成 Rust 代码，让你能用类型安全的方式引用表和列。这就像给数据库表建了一张"身份证"。

### 2. 模型派生（Queryable / Insertable / Selectable）

- `Queryable`：把数据库行映射到 Rust 结构体（读数据）
- `Insertable`：把 Rust 结构体变成可插入数据库的记录（写数据）
- `Selectable`：自动生成 SELECT 子句，确保字段顺序正确

### 3. 链式查询 DSL

Diesel 提供类似 SQL 的链式方法：`.filter()`、`.limit()`、`.order()`、`.load()`，在编译期验证查询合法性。

## 代码示例

### 示例一：定义模型和查询数据

```rust
use diesel::prelude::*;

// 模型定义：告诉 Diesel 这个结构体对应数据库中的 posts 表
#[derive(Queryable, Selectable)]
#[diesel(table_name = posts)]
pub struct Post {
    pub id: i32,
    pub title: String,
    pub body: String,
    pub published: bool,
}

// 查询：获取最近 5 篇已发布的文章
fn get_published_posts(conn: &mut PgConnection) -> Vec<Post> {
    use crate::schema::posts::dsl::*;

    posts
        .filter(published.eq(true))
        .order(id.desc())
        .limit(5)
        .select(Post::as_select())
        .load(conn)
        .expect("加载文章失败")
}
```

这段代码做了什么：

- `filter(published.eq(true))`：等价于 SQL 的 `WHERE published = true`
- `order(id.desc())`：等价于 `ORDER BY id DESC`
- `limit(5)`：等价于 `LIMIT 5`
- `load(conn)`：执行查询并将结果加载到 `Vec<Post>` 中

如果 `Post` 结构体的字段类型和数据库列类型不匹配，编译器会直接报错，不会等到运行才发现。

### 示例二：插入和更新记录

```rust
use diesel::prelude::*;

// 插入模型：只包含需要写入的字段（id 由数据库自动生成）
#[derive(Insertable)]
#[diesel(table_name = posts)]
struct NewPost<'a> {
    title: &'a str,
    body: &'a str,
}

// 创建新文章
fn create_post(conn: &mut PgConnection, title: &str, body: &str) -> Post {
    use crate::schema::posts;

    let new_post = NewPost { title, body };

    diesel::insert_into(posts::table)
        .values(&new_post)
        .returning(Post::as_returning())
        .get_result(conn)
        .expect("保存文章失败")
}

// 更新文章发布状态
fn publish_post(conn: &mut PgConnection, post_id: i32) -> Post {
    use crate::schema::posts::dsl::*;

    diesel::update(posts.find(post_id))
        .set(published.eq(true))
        .returning(Post::as_returning())
        .get_result(conn)
        .unwrap()
}
```

`returning(...)` 的作用：插入或更新后，直接把修改后的整条记录返回，不需要再查一次数据库。这在 PostgreSQL 和 SQLite 3.35+ 中可用。

## 典型工作流程

```
1. cargo new my_project          # 创建 Rust 项目
2. 添加 diesel 依赖到 Cargo.toml
3. diesel setup                  # 创建数据库 + 初始化迁移
4. diesel migration generate create_posts  # 生成迁移文件
5. 编辑 up.sql 写建表语句
6. diesel migration run          # 执行迁移
7. 写 Rust 代码：定义模型 + 查询
8. cargo run                     # 编译即验证
```

## 为什么选 Diesel？

| 对比项 | 手写 SQL | Diesel |
|--------|---------|--------|
| 类型安全 | 运行时才知道错 | 编译期拦截 |
| SQL 注入 | 容易遗漏参数化 | 自动参数化 |
| 数据库切换 | 改到处字符串 | 改 feature flag |
| 学习曲线 | 低 | 中等（需理解宏和 trait） |

对于 Rust 初学者来说，Diesel 最大的价值在于：它让数据库操作也能享受到 Rust 编译器的保护，把"不知道哪里写错了"的痛苦提前到"一眼就能看到编译报错"的阶段。
