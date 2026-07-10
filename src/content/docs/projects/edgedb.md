---
title: EdgeDB / Gel — 在 Postgres 上长出图风查询语言，让类型系统替你做 ORM
来源: 'EdgeDB Documentation, https://docs.edgedb.com/ ；项目主页 https://geldata.com/'
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

EdgeDB（2024 年起改名 Gel）是一套**坐在 PostgreSQL 之上、用一种叫 EdgeQL 的图风查询语言代替 SQL，并把类型系统做进数据库引擎本身**的开源数据库。

日常类比：像在地基不动的老房子上重盖一层装修——**地板、承重墙、水电（事务、MVCC、索引、复制）**全用 Postgres 现成的；**墙面、家具、动线（schema 写法、查询语言、客户端）**全部重做，让住进来的人（应用代码）用起来更顺手。

写起来是这样：

```edgeql
# schema.esdl
type Movie {
    required title: str;
    multi actors: Person;
}
type Person {
    required name: str;
}

# query
select Movie {
    title,
    actors: { name }
}
filter .title ilike '%matrix%';
```

第二段读作"选电影，每部带上标题和演员名字，标题里包含 matrix 的"。**没有 JOIN 关键字**，链接（link）顺着箭头走就行。

## 为什么重要

不理解 EdgeDB，下面这些事就解释不通：

- 为什么 2022 年之后突然有一波"在 Postgres 上重做查询层"的项目（EdgeDB / PRQL / Malloy）——大家都在回答同一个问题：**SQL 写应用层不顺手怎么办**
- 为什么 Prisma / Drizzle 这些 ORM 永远在跟"类型边界"较劲，而 EdgeDB 一招就绕开——**它把类型推到数据库引擎里，而不是放在应用层映射层**
- 为什么 GraphQL 一直在尝试"shape 化查询"但停在 API 网关，没下沉到数据库——EdgeDB 把 shape 直接做进了 DB
- 为什么 2024 改名 Gel 这件事在数据库圈引起讨论——**"我们不只是 graph DB"** 这个定位转向背后是商业策略问题

## 核心要点

EdgeDB 的世界由六个部件咬合：

1. **底层是 Postgres**：每个 EdgeDB 实例内嵌一个 Postgres，对象类型编译成 Postgres 表，链接编译成外键或连接表。事务、复制、备份全继承 Postgres。
2. **schema 用 .esdl 文件写**：声明对象类型（替代表）、属性（标量字段）、链接（带类型的指针，可单可多）、约束、索引、计算字段。**改完 schema 跑迁移**，引擎自己 diff 出 DDL。
3. **EdgeQL 是查询语言**：查询返回 shape（嵌套结构），不是平的行。链接顺着 `.field` 走，不用 JOIN。聚合、过滤、分组都是表达式可组合的。
4. **类型推导端到端贯穿**：写 schema 后跑代码生成器，TypeScript / Python / Go 客户端会得到**带返回类型的查询函数**——查询字符串在编译期被解析、返回类型自动推出。
5. **声明式迁移**：你改 .esdl，CLI 比对当前数据库状态，生成迁移脚本让你 review。比传统"手写 up/down 链"省心。
6. **访问策略 (access policy)**：行级权限直接写在 schema 里，编译进每条查询。比 Postgres RLS 更可组合。

**一句话总结**：把 schema、查询、类型、迁移、权限**全部用一个声明式定义**串起来，引擎负责把它编译到 Postgres 上跑。

## 实践案例

### 案例 1：典型的 ORM 困境 vs EdgeDB

旧 ORM（Prisma 风格）的痛点：

```ts
const movies = await prisma.movie.findMany({
  include: { actors: { include: { agent: true } } }
});
// movies 的类型靠 Prisma 推；嵌套 3 层后类型推断常常掉链子
```

EdgeDB 写法（需先 `edgedb generate` 出 query builder，再 `import e from './edgeql'`）：

```ts
const q = e.select(e.Movie, m => ({
  title: true,
  actors: { name: true, agent: { name: true } },
}));
const movies = await q.run(client);
// movies 的类型是 EdgeQL 编译器算出来的，跟 schema 一致
```

差异：**Prisma 是应用层 TS 库映射 SQL**，EdgeDB 是**查询语言原生支持嵌套**，类型推断走查询语义而不是 ORM 元编程。

### 案例 2：迁移流程

假设你在 `Movie` 上新加 `required year: int32`：

1. 改 `dbschema/default.esdl`，保存声明式目标状态（不是手写 ALTER）。
2. 跑 `edgedb migration create`：CLI 对比**当前库状态**和 **.esdl 目标**，生成带注释的迁移脚本供 review。
3. 确认无误后 `edgedb migrate` apply；库里出现新列，旧数据若缺 year 会按迁移策略报错或回填。

和"手写 up.sql + down.sql"比，少维护半条链；代价是你必须读懂生成的 diff，不能盲点 apply。

### 案例 3：访问策略

```edgeql
type BlogPost {
    required title: str;
    required author: User;

    access policy author_can_edit
        allow update, delete
        using (.author = global current_user);
}
```

逐步看：

1. `global current_user` 由客户端会话注入（登录后 set global），不是应用里临时变量。
2. 任何人 `update BlogPost` 时，引擎把策略编译进 SQL；`.author ≠ current_user` 的行直接不可见/不可改。
3. 对比应用层 `if (post.authorId !== me)`：规则和 schema 同文件，漏写 if 的窗口被关掉。

## 踩过的坑

1. **生态比 Postgres 小**：pgAdmin / pgbouncer / pg_dump 这套工具链都用不上 EdgeDB 的封装（虽然能直连底层 Postgres，但破坏抽象）。BI 工具、ETL 工具大多只懂 SQL，对 EdgeQL 是空白。
2. **基数（cardinality）规则严格**：`select User filter .id = $id` 你以为返回 0 或 1 个，EdgeDB 类型系统会逼你写 `assert_single()` 或 `assert_exists()` 显式声明你的预期。新人常被"cardinality mismatch"卡住。
3. **代码生成器要勤跑**：schema 一改，TS 客户端的生成代码就过时；如果忘了重跑，下次写查询时编译期类型对不上，错误很难一眼看出。
4. **不能完全替代 Postgres SQL**：跑分析、写复杂窗口函数、用 PostGIS 这类扩展，还得直连底层 Postgres，混用两套语言会让代码库分裂。
5. **改名 Gel 带来的搜索污染**：2024 之前的博客、Stack Overflow 答案都用 EdgeDB；2024 之后官网叫 Gel；新手搜资料常分不清。

## 适用 vs 不适用

**适用**：
- 全新项目、自己控制 schema、想要类型贯穿 DB → 客户端
- 嵌套读多的应用（社交、内容平台、知识图谱）
- 想让迁移成为一等公民、不想手写 up/down 链
- TypeScript 重栈、追求"写查询和写函数一样"

**不适用**：
- 重 OLAP / BI 场景 → 用数仓（BigQuery / Snowflake / DuckDB）
- 已有大体量 Postgres schema 的迁移 → 重写代价高
- 需要 Postgres 完整生态（PostGIS / pg_partman / 各种 extension）→ EdgeDB 抽象会挡路
- 团队全是 SQL 老手且没重新学习意愿 → EdgeQL 学习曲线非零

## 历史小故事（可跳过）

- **2019 年**：Yury Selivanov 和 Elvis Pranskevichus（CPython 异步生态作者，asyncpg / uvloop 作者）创立 EdgeDB Inc.
- **2022 年 2 月**：1.0 stable 发布，定位"graph-relational database"
- **2023 年**：4.0 加入 access policy、global、改进 UI
- **2024 年底**：项目改名 Gel（公司也叫 Gel Data），淡化"graph"标签，强调"应用数据库新范式"
- **思想源头**：Codd 关系模型 + Stonebraker 1986 年 Postgres 项目本身就是"object-relational research DB"——EdgeDB 在某种意义上是把 Stonebraker 当年的研究方向重新做一遍

## 学到什么

1. **数据库抽象层可以不在应用代码里**——把 schema、类型、权限、迁移全做进引擎，应用层就薄了
2. **shape 是比 row 更高一级的查询单位**——GraphQL 在网关层证明了这个抽象有用，EdgeDB 把它下沉到 DB
3. **不重新发明存储是聪明的**——Postgres 已经把存储引擎做到工业级，新数据库的发力点在**接口、类型、查询语义**，不在 fsync
4. **改名背后是定位选择**——叫 EdgeDB 时说"graph"，叫 Gel 时说"应用数据库"，名字定义市场

## 延伸阅读

- 官方文档：[EdgeDB / Gel docs](https://docs.edgedb.com/)（schema、EdgeQL、客户端三部分都需要读）
- 创始人讲座：[Yury Selivanov - EdgeDB at PyCon](https://www.youtube.com/results?search_query=edgedb+yury+selivanov)（讲设计动机最清楚）
- 对比阅读：Prisma / Drizzle 的 ORM 路线 vs EdgeDB 引擎内置类型路线
- [[postgres]] —— EdgeDB 的存储底座
- [[graphql]] —— shape 化查询的思想源头之一

## 关联

- [[postgres]] —— EdgeDB 内嵌 Postgres，所有存储和事务都走它
- [[prisma]] —— ORM 路线代表，跟 EdgeDB 的"引擎内置类型"形成对照
- [[graphql]] —— shape 查询思想的网关层先驱
- [[supabase]] —— 同样基于 Postgres 但选择"管理面 + SQL 不动"路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[prisma]] —— Prisma — 类型安全 ORM
- [[risingwave]] —— RisingWave — Postgres 兼容的流式数据库，用物化视图替代 Flink + KV 组合
- [[supabase]] —— Supabase — Firebase 的开源替代
- [[surrealdb]] —— SurrealDB — 一种语法吃下 SQL 图 文档 向量

