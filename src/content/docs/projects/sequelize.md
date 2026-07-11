---
title: Sequelize — 老牌 Node ORM
来源: https://github.com/sequelize/sequelize
日期: 2026-05-29
分类: ORM
难度: 中级
---

## 是什么

Sequelize 是 Node.js 世界**最早一批** ORM（Object-Relational Mapper，把数据库表映射成 JS 对象的桥）里最有名的那一个，2010 年开源。Node.js 自己也才 2009 年出生——几乎是 Node 一有，它就有了。

日常类比：

> [[prisma]] 是新潮装修房——强类型、规整、所有水电图纸都对得上。
> Sequelize 是老市政房——功能齐全、住过几代人，但电路是后期改的，TypeScript 类型贴在墙上，仔细看会发现接缝。

API 风格是 **Active Record**——你定义一个 `User` 类，类本身既是表结构，又是查询入口：`User.findAll()` 直接就能查。这种风格被 Ruby on Rails 带火，Sequelize 把它搬到了 Node。

## 为什么重要

不知道 Sequelize，下面这些事都会一头雾水：

- **Node.js ORM 鼻祖级存在**：2010 年代 Express + Sequelize 是常见后端组合，地位接近今天的 Next.js + Prisma
- **文档极厚 + 社区极大**：Stack Overflow / 老博客里大量 Node ORM 问答仍以 Sequelize 为主，踩坑资料最好找
- **ORM 三代演进的第一代**：Sequelize（2010）→ [[typeorm]]（2016 装饰器风）→ [[prisma]]（2019 schema-first 强类型），代代解决前一代的痛点
- **大量历史项目仍在跑**：跳进 5 年以上的 Node 后端，遇到 Sequelize 并不稀奇——迁移成本高，很多人选择继续维护

## 核心要点

Sequelize 的能力可以浓缩成 **三块**：

1. **Model 定义 + 实例方法**
   一个 class 同时是表结构 + 查询接口 + 实例数据。`User.create()` 插入，`user.save()` 保存修改，`user.destroy()` 删除——动词全挂在对象上。

2. **Associations（关系）**
   `hasMany` / `belongsTo` / `hasOne` / `belongsToMany`，把外键关系翻译成对象图。写完 `User.hasMany(Post)`，你就能 `user.getPosts()` 直接拿到所有帖子。

3. **Hooks + Transaction**
   - Hooks：`beforeCreate` / `afterUpdate` 等钩子，在数据库动作前后插自己的逻辑（比如自动加密密码）
   - Transaction：`sequelize.transaction(async (t) => { ... })`，里面所有操作要么全成功，要么全回滚

加上 `sequelize-cli` 工具做迁移（migration），就是一套完整的后端数据层。

## 实践案例

### 案例 1：定义一个 Model

```js
import { Sequelize, DataTypes, Model } from 'sequelize'

const sequelize = new Sequelize('sqlite::memory:')

class User extends Model {}
User.init({
  name: DataTypes.STRING,
  age: DataTypes.INTEGER,
}, { sequelize, modelName: 'user' })

await sequelize.sync()  // 建表
await User.create({ name: 'Jason', age: 25 })
```

**逐部分解释**：

- `Model` 是 Sequelize 给的基类，继承它就有了所有 CRUD 方法
- `User.init({...}, {...})` 第一个参数是字段定义，第二个是配置（连哪个 sequelize 实例、表名等）
- `sequelize.sync()` 把所有 Model 的结构同步成数据库表（生产环境别用，要用 migration）

### 案例 2：带条件查询

```js
import { Op } from 'sequelize'

const adults = await User.findAll({
  where: {
    age: { [Op.gt]: 18 },
  },
})
```

`Op.gt` 是 "greater than"。Sequelize 用 Symbol 包装运算符，避免和字段名冲突。这种 API 在 [[prisma]] 看来很啰嗦，[[prisma]] 直接写 `age: { gt: 18 }`——但 Sequelize 选择了更明确的方式。

### 案例 3：Migration（迁移）

```bash
npx sequelize-cli migration:generate --name add-email-to-user
npx sequelize-cli db:migrate
```

生成的迁移文件长这样：

```js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'email', Sequelize.STRING)
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'email')
  },
}
```

`up` 是升级，`down` 是回滚。Sequelize 的 migration 和 Model **是两套文件**——这正是后面要说的坑之一。

## 踩过的坑

1. **TypeScript 支持是后期补的**
   Sequelize 2010 年生于纯 JS 时代，TS 类型是后来贴上去的。Model 的字段在 TS 里不会自动有类型，得自己写一份 interface 或用 `Model<UserAttributes>` 泛型。对比 [[prisma]] 的 schema-first 全自动生成、[[drizzle]] 的 ts-first 一体化，Sequelize 体验明显落后一代。

2. **N+1 查询要自己防**
   写 `users.forEach(u => u.getPosts())` 会触发 N 次查询。要显式 `User.findAll({ include: [Post] })` 让 Sequelize 生成 JOIN。新人最常见的性能问题。

3. **Bulk operation API 不友好**
   批量插入要用 `User.bulkCreate([...])`，但更新一批不同数据要循环 `update`，没有像 [[prisma]] 的 `updateMany` 那么顺手。批量改不同字段时尤其痛。

4. **Migration 与 Model 分离**
   表结构在 Model 里写一遍，建表脚本在 migration 里写一遍——**两边要手动同步**。改了 Model 字段忘了写 migration，本地 `sync()` 跑得好好的，部署一上生产数据库报错。[[prisma]] 通过 `prisma migrate dev` 从 schema 自动生成 migration，省掉这层心智负担。

## 适用 vs 不适用场景

**适用**：
- 维护已有 Sequelize 代码库（例如存量 >1 万行 Model/migration，整库迁 Prisma 成本通常高于继续学）
- 需要 Oracle / Db2 / Snowflake 等方言——官方/社区 dialect 覆盖面仍比多数新 ORM 宽
- 团队以 JS 为主、已熟悉 Active Record，且查询以中等复杂度 CRUD 为主

**不适用**：
- 全新项目 + TypeScript-first 团队 → 直接 [[prisma]] 或 [[drizzle]]
- 强类型安全要求（编译期就要查出字段/SQL 形状错误）→ [[drizzle]] 或 Kysely
- 极致性能 / 想直接写 SQL → Kysely（query builder，不是 ORM）

## 历史小故事（可跳过）

- **2010 年**：Sequelize 开源，赶上 Node 早期浪潮；Express + Sequelize + MySQL/Postgres 成了那十年常见后端三件套
- **Active Record 路线**：把 Rails 那套「类既是表又是查询入口」搬进 JS，新人上手快，也埋下 Model 职责过重的种子
- **TypeScript 补丁时代**：社区与官方陆续补类型；字段要手写 interface / 泛型，体验明显落后 schema-first 一代
- **v6 → v7**：大版本想做更彻底的 TS 重写，破坏面大，稳定版推进慢，许多生产项目仍停在 v6

## 学到什么

1. **ActiveRecord 风格的代价**：动词挂对象上读起来自然，但 Model 既是 schema 又是查询又是数据，单元测试时三件事缠在一起
2. **ORM 演进的方向**：从 Sequelize（运行时拼 SQL）→ [[typeorm]]（装饰器声明 schema）→ [[prisma]]（schema 文件 + 代码生成器），核心趋势是**类型信息往编译期推**
3. **API 设计的稳定性 vs 进化**：Sequelize 在 v6 → v7 之间憋了 4 年想做 TS 重写，但因为破坏性太大一直没敢发 stable，老用户被困在 v6
4. **"功能全 ≠ 体验好"**：8 种数据库都支持，但每种都不深；强类型要后补；migration 要双写——这是元老级库的通病

## 延伸阅读

- 官方文档：[Sequelize Docs](https://sequelize.org/) —— v6 文档详尽，有完整 Tutorial
- 教程视频：[Sequelize Tutorial - Node.js with PostgreSQL](https://www.youtube.com/results?search_query=sequelize+tutorial)
- 对比文章：搜 "Prisma vs Sequelize vs TypeORM" —— 几乎每年都有新文章重新比一次
- [[prisma]] —— 强类型、schema-first 的下一代 ORM
- [[drizzle]] —— TypeScript-first 的轻量 ORM / query builder

## 关联

- [[prisma]] —— 同代竞品；解决了 Sequelize 的类型 + migration 双写痛点
- [[typeorm]] —— 中间一代；用 TypeScript 装饰器风，思路接近 Java Hibernate
- [[drizzle]] —— 最新一代；ts-first + 接近裸 SQL 的 query builder
- [[postgresql]] —— Sequelize 最常配的数据库；多 dialect 适配器里支持最完整

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[codd-1979-extending]] —— Codd 1979 — 给关系模型补上"语义"
- [[mikro-orm]] —— MikroORM — Data Mapper Identity Map ORM
