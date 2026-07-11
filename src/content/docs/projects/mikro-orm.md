---
title: MikroORM — Data Mapper Identity Map ORM
来源: https://github.com/mikro-orm/mikro-orm
日期: 2026-05-29
分类: ORM
难度: 中级
---

## 是什么

MikroORM 是 Martin Adámek 在 2018 年开始写的 TypeScript ORM，目标是把 PHP 的 Doctrine（一个非常成熟的 ORM）思路搬到 Node.js——所以社区也常叫它"Node 版 Doctrine"。

技术定位的一句话：**Data Mapper 模式 + Identity Map + Unit of Work**。这三个名词听起来吓人，但拿同生态的 [[typeorm]] 一对照就清楚了：

- [[typeorm]] 默认是 **Active Record** 风格——每个 entity 类自带 `save()` / `remove()` 方法，对象自己管自己的持久化
- MikroORM 是 **Data Mapper** 风格——entity 类只描述数据结构，CRUD 全部走一个叫 `EntityManager` 的统一入口

日常类比：

- Active Record 像**自己开车**——每个人开自己的车，方向自己掌握
- Data Mapper 像**滴滴调度**——你只说"我要去哪"，平台统一派车、统一管理路线

这种"统一管理"带来一个关键能力：**Identity Map**——同一行数据在内存里只存一份对象，下次再查直接复用，不会出现"u1 和 u2 是同一个用户但在内存里是两个对象"这种诡异情况。

## 为什么重要

不理解 MikroORM 的存在价值，下面几件事都没法解释：

- 为什么有人放着 [[typeorm]] / [[prisma]] 不用，专门选这个下载量明显小于头部 ORM 的选项——**因为它把 PHP Doctrine 用了 10 多年的成熟模式带到了 Node 生态**
- 为什么 NestJS 官方推荐的 ORM 列表里它能和 [[typeorm]] / [[prisma]] / [[sequelize]] 并列——**它在"复杂领域模型"场景里有独特价值**
- 为什么"Identity Map"这个概念值得专门记一笔——**它解决的不是性能问题，是一致性问题**：避免同一条数据被加载两次后，改 A 不影响 B 的诡异 bug
- 为什么从写第一行就强制 TypeScript——**MikroORM 没有"JS-first 然后兼容 TS"的历史包袱**，类型推导从设计开始就是一等公民

## 核心要点

理解 MikroORM 只需要抓住三个核心抽象：

1. **EntityManager**：所有数据操作的统一入口。你不会调用 `user.save()`，而是 `em.persist(user)` + `em.flush()`。类比："去前台办理"——前台是唯一的对接窗口

2. **Identity Map**：每个 EntityManager 内部维护一张"主键 → 对象"的表。同一个 PK 第二次查询时直接返回已有引用，不创建新对象。类比："户口本"——一个身份证号只对应一个人，多次查户口拿到的都是同一份记录

3. **Unit of Work**：你改 entity 字段时不会立刻发 SQL，而是攒着；调用 `em.flush()` 时，框架对比"快照 vs 当前值"算出 dirty 字段，**一次性**把所有 INSERT / UPDATE / DELETE 包在一个 transaction 里发出去。类比："购物车"——逛的时候只往车里加，最后结账一次性付款

## 实践案例

### 案例 1：定义 entity（Data Mapper 风格）

```ts
import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class User {
  @PrimaryKey() id!: number;
  @Property() name!: string;
  @Property({ unique: true }) email!: string;
}
```

注意：**class 里没有任何 `save()` / `update()` 方法**——这就是 Data Mapper：entity 只管描述自己长什么样。

### 案例 2：完整的"创建 + 修改 + 删除"流程

```ts
const em = orm.em.fork();   // 每个请求拿一个独立的 EM

// 创建
const user = em.create(User, { name: 'Alice', email: 'a@x.com' });
await em.persist(user).flush();
// 实际 SQL：INSERT INTO users (...) VALUES (...)

// 修改（注意：没调任何方法，只是改字段）
const u = await em.findOne(User, { email: 'a@x.com' });
u!.name = 'Alice Renamed';
await em.flush();
// 实际 SQL：UPDATE users SET name = ? WHERE id = ?
// Unit of Work 自动 diff 出 name 字段被改了

// 删除
em.remove(u!);
await em.flush();
// 实际 SQL：DELETE FROM users WHERE id = ?
```

最反直觉的是**修改流程**——你只是赋了一下值，框架居然知道要发 UPDATE。这是 Identity Map 配 Unit of Work 的魔法：进 Identity Map 时框架拍了张快照，flush 时对比快照得出 dirty 字段。

### 案例 3：Filter / Soft Delete 是一等公民

很多 ORM 把"软删除"当成扩展插件，MikroORM 把它做进核心：

```ts
@Entity()
@Filter({ name: 'notDeleted', cond: { deletedAt: null }, default: true })
export class Post {
  @PrimaryKey() id!: number;
  @Property({ nullable: true }) deletedAt?: Date;
}

// 默认查询自动加 WHERE deleted_at IS NULL
const posts = await em.find(Post, {});
// 想看已删除的，临时关 filter
const all = await em.find(Post, {}, { filters: { notDeleted: false } });
```

写一次 filter，全项目所有查询自动带上——这种"横切关注点"的能力是 Doctrine 风格 ORM 的强项。

## 踩过的坑

1. **学习曲线**：从 Active Record 习惯（[[sequelize]] / [[typeorm]] AR 模式）转过来，会一直问"我改了字段怎么没自动 save？"——你忘了调 `em.flush()`。反过来 Hibernate / Doctrine 的老用户上手丝滑。第一次学 MikroORM 比学 [[prisma]] 痛苦得多

2. **Strict mode vs allowGlobalContext**：默认配置下，跨请求共享同一个 `orm.em` 会抛错（因为 Identity Map 跨请求会串味）。教程里图省事直接用 `orm.em` 跑得通，上生产立刻爆——必须用 `em.fork()` 给每个请求一份独立 EM，或者打开 `allowGlobalContext: true`（**不推荐**）

3. **多 Connection / 多请求场景**：在 Express 里要写中间件 `RequestContext.create(orm.em, next)`，在 NestJS 里要装 `@mikro-orm/nestjs`（自动处理）。新手 90% 第一次会忘，表现是"某个请求查到的数据是上个请求改过的"——典型的 Identity Map 跨请求污染

4. **Dynamic schema (multi-tenancy) 配置复杂**：多租户场景下每个租户连不同 schema / 不同库，需要 per-request 切换 connection + 切换 metadata。MikroORM 支持，但配置比 [[prisma]] 麻烦得多——要自己管 connection pool + 自己处理 fork 时机

## 适用 vs 不适用场景

**适用**：

- 复杂领域模型（DDD 风格的项目）——Data Mapper + Identity Map 是这类项目的天然朋友
- NestJS + 长生命周期 server 项目——`@mikro-orm/nestjs` 集成丝滑
- 已有 Java Hibernate / PHP Doctrine 经验的团队——概念无缝迁移
- 需要"软删除 / 多租户 filter / 乐观锁"这些企业级特性的场景

**不适用**：

- Edge / Serverless 场景——Identity Map + 长连接 pool 哲学和 Edge 短生命周期不匹配，选 [[drizzle]] / [[kysely]]
- 简单 CRUD 项目——杀鸡用牛刀，[[prisma]] 心智负担更低
- 团队完全没接触过 Data Mapper / Unit of Work 概念，又赶项目交付——学习成本会拖进度

## 历史小故事

- **2018 年**：Martin Adámek 开始写 v0.x，初心很朴素——"我用过 PHP Doctrine，搬到 Node 怎么没人做过？"
- **2020-2022 年**：v3 → v4 → v5，逐步把 NestJS 集成、TypeScript decorator metadata、ts-morph 编译期方案做完整
- **2024 年**：v6 stable，加入 MS SQL 支持，metadata 方案趋稳。和 [[prisma]] / [[drizzle]] 各占细分市场，没打算抢 CRUD 用户

## 学到什么

1. **ORM 不是只有一种风格**——Active Record（自己管自己） vs Data Mapper（统一管理）是两种哲学，没有谁更先进，看项目复杂度
2. **Identity Map 是"对象一致性"原语**——它解决的不是性能问题，是逻辑一致性问题；同一行数据在内存里只有一份引用，省掉一大堆"我改了 A 怎么 B 没变"的 bug
3. **Unit of Work 把"自动 vs 手动"推到极端**——你只改字段，flush 时框架自己知道。这是省心，但代价是"为什么没改的字段也被 UPDATE 了？"这种调试问题
4. **TypeScript 一等公民比"兼容 TS"重要得多**——MikroORM 从设计起就只考虑 TS，没有 JS-first 历史包袱，类型推导深度远超半路出家的 ORM

## 延伸阅读

- 官方文档：[mikro-orm.io](https://mikro-orm.io)（章节"Identity Map"和"Unit of Work"是核心，先读这两个）
- 概念前置：Martin Fowler 《Patterns of Enterprise Application Architecture》中的 Data Mapper / Identity Map / Unit of Work 三章——所有现代 ORM 的理论源头
- [[typeorm]] —— 同样 decorator 风格，但走 Active Record 路线，对照学最直观
- [[prisma]] —— 无状态 client 风格，和 MikroORM 是两条不同道路
- [[drizzle]] —— TS-first SQL builder，"不要 ORM"的另一个答案

## 关联

- [[typeorm]] —— 同 decorator 但 Active Record 风格，没有 Identity Map
- [[prisma]] —— 无状态 client，每次查询返回 plain object，无对象一致性
- [[drizzle]] —— Query builder 风格，根本没有 entity 概念，Edge 友好
- [[sequelize]] —— ActiveRecord 老前辈，和 MikroORM 走相反路线
- [[kysely]] —— 纯 SQL builder，"不要 ORM"的代表
- [[zod]] —— 现代 input 校验，取代 ORM 内置 validate 函数

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
