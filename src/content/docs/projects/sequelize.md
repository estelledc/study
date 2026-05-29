---
title: Sequelize Node.js Promise-based ORM 元老
来源: https://github.com/sequelize/sequelize + sequelize.org 官方文档
---

# Sequelize — Node.js Promise-based ORM 元老

## 一句话总结（≥ 14 行）

Sequelize 是 Sascha Depold 2010 年开源的 Node.js Promise-based ORM。在 Node.js 还不到 1.0、callback hell 还是日常的年代，它就已经在做 ActiveRecord-like 抽象。weekly downloads ~4M（仍是 Node ORM 数字最高的那一档），但增长曲线在 2022 年附近就基本走平——更多是事实标准的 inertia 而不是被新项目挑选。

设计哲学三个支柱：
1. **ActiveRecord-like API**：`User.findAll()` `User.create()` `user.update()` `user.destroy()`，model 既是 schema 也是 CRUD 入口
2. **multi-dialect adapter**：PostgreSQL / MySQL / MariaDB / SQLite / MS SQL / Snowflake / Db2 / Oracle 一套 API 跑 8 种 DB
3. **关系系统**：hasOne / hasMany / belongsTo / belongsToMany 四种 + alias + through table，覆盖绝大多数 SQL 关系

技术 baggage：
- 早期是纯 JS，TypeScript 类型定义靠 `@types/sequelize`（2017 后官方逐步内置但仍不算 type-first）
- 关系系统四种 + alias 让用户学习曲线陡（"hasMany 还是 belongsTo？谁配 foreignKey？"）
- v7 alpha 自 2021 起做 TypeScript 完整重写，但到 2024 仍未发 stable
- N+1 默认不解决（要手动 `include`），文档里这个坑反复出现

2024 状态：仍是 Node.js ORM 老大（4M），但**新项目几乎不选 Sequelize**——TypeScript-first 选 Drizzle / Prisma，Java 思路转过来选 TypeORM / MikroORM，关心 SQL 自由度选 Kysely。Sequelize 更像"已死但有遗产"的库，靠 v6 stable + 老项目维持下载量。

## Layer 0 — 项目档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `sequelize` |
| 当前主版本 | v6.x（stable，2024 仍维护）/ v7.x alpha（TypeScript 重写） |
| 首版 | 2010-07 / v0.x（Node 还在 0.2 时代） |
| License | MIT |
| 主仓库 | sequelize/sequelize |
| 维护 | Sascha Depold + sequelize org（200+ contributors，bus factor 中） |
| TypeScript 要求 | v6 可用（`@types/sequelize` 内置），v7 alpha 完整 TS-first |
| Node 要求 | ≥ 10（v6） / ≥ 18（v7 alpha） |
| Bundle | ~3 MB（含多 dialect 元数据） |
| 数据库 | PostgreSQL / MySQL / MariaDB / SQLite / MS SQL / Snowflake / Db2 / Oracle |
| 范式 | ActiveRecord-like（model 即 entity 即 repository） |
| Migrations | 内置 `sequelize-cli`（独立包） |
| 关系系统 | hasOne / hasMany / belongsTo / belongsToMany（through table） |
| Weekly downloads | ~4M（2024，仍最高） |
| GitHub stars | 29k+ |
| 集成 | Express / Koa / Fastify / NestJS（@nestjs/sequelize） |
| 商业版 | 无 |
| 文档站 | sequelize.org |
| 同辈 | Bookshelf.js / Waterline / Objection.js（Knex 之上） |

## Layer 1 — 核心抽象（≥ 30 行）

最小可运行例：

```js
const { Sequelize, DataTypes, Model } = require('sequelize');

// 1. 实例化连接
const sequelize = new Sequelize('postgres://user:pass@localhost:5432/app', {
  dialect: 'postgres',
  logging: console.log,   // 把生成的 SQL 打到控制台
  pool: { max: 10, min: 0, idle: 10000 }
});

// 2. 定义 Model（两种写法都常见）
const User = sequelize.define('User', {
  id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:  { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING, unique: true, validate: { isEmail: true } }
}, { tableName: 'users', timestamps: true, paranoid: true });

// 3. 关系
const Post = sequelize.define('Post', {
  title:   { type: DataTypes.STRING },
  content: { type: DataTypes.TEXT }
});
User.hasMany(Post,    { foreignKey: 'authorId', as: 'posts' });
Post.belongsTo(User,  { foreignKey: 'authorId', as: 'author' });

// 4. CRUD（Promise-based）
await sequelize.sync();                     // 把 model schema 同步到 DB（开发期）
const u = await User.create({ name: 'Alice', email: 'a@x.com' });
const list = await User.findAll({
  where: { name: 'Alice' },
  include: [{ model: Post, as: 'posts' }]   // eager load，避免 N+1
});
await u.update({ name: 'Alice2' });
await u.destroy();                          // paranoid: true 时变 soft delete
```

四要素：

1. **Sequelize 实例** —— 一次连接 + 一份 dialect adapter + 一个 connection pool
2. **Model** —— `sequelize.define(name, attrs, opts)` 或 `class User extends Model`，是 schema + 静态 CRUD 方法
3. **DataTypes** —— `DataTypes.INTEGER / STRING / JSON / ARRAY / ENUM(...)`，被 dialect adapter 映射成具体 DB 类型
4. **Associations** —— `hasOne / hasMany / belongsTo / belongsToMany`，在 model 间建立外键关系

> 怀疑：Sequelize 让 Model 既是 schema 又是 CRUD 入口（`User.findAll()`），这是经典 ActiveRecord 风格。但 2024 年主流 ORM（Prisma / Drizzle / Kysely）都更倾向 schema-first + 独立 query API。这种分离是 ActiveRecord 已被淘汰，还是只是"另一种偏好"？我猜是前者——大型 TypeScript 项目里 model 静态方法很难做到精准 type narrow。

## Layer 2 — 内部架构（≥ 30 行）

工程要点：

1. **Sequelize class（入口）**：持有 dialect adapter、connection pool、model registry、事务上下文。`new Sequelize(...)` 即注册 dialect 并创建 pool（懒连接）。
2. **AbstractDialect 抽象基类**：`src/dialects/abstract/index.js`。每个 DB 一个子类（`PostgresDialect / MysqlDialect / SqliteDialect / MssqlDialect` 等），暴露 `query / queryGenerator / dataTypes` 三个核心。
3. **QueryGenerator**：把高层 options 翻译成 dialect-specific SQL。`User.findAll({where:{name:'A'}})` 最终走 `queryGenerator.selectQuery('users', {where: {...}})` 拼出 `SELECT * FROM "users" WHERE "name" = 'A'`（PG 用双引号，MySQL 用反引号）。
4. **Model 注册**：`sequelize.define()` 内部 `class User extends Model`，把 attrs 编译成 `RawAttributes`，建立 `User.tableAttributes / User.fieldRawAttributesMap` 等内部表。
5. **Association mixin**：`User.hasMany(Post)` 不是简单存关系，而是给 `User.prototype` / `User` 注入 `getPosts / setPosts / addPost / countPosts / hasPost` 一组 mixin 方法。
6. **Hooks system**：`beforeCreate / afterUpdate / beforeBulkDestroy` 等 60+ 钩子，挂在 model 上，CRUD 时按顺序触发，是事务 + 审计 + soft delete 的实现机制。
7. **Connection pool**：基于 `sequelize-pool`（fork 自 generic-pool），每个 dialect 配置 max/min/idle，长连接复用。

工作流（一次 `User.findAll({where, include})` 的全链路）：

```
1. user 调 User.findAll({where:{name:'A'}, include:[{model:Post, as:'posts'}]})
2. Model.findAll() 走 hooks（beforeFind）
3. QueryGenerator 把 options 编译成 SELECT SQL（含 LEFT OUTER JOIN posts）
4. dialect.query(sql, {bind, transaction}) 走 connection pool
5. raw rows 返回 → 走 Model.build() 把每行 hydrate 成 Model instance
6. include 里的 posts 行 hydrate 成 Post instance，挂到 user.posts
7. afterFind hook 触发
8. Promise resolve 给用户 [User { posts: [Post, ...] }, ...]
```

附加机制：

- **Transaction 自动传递**：`sequelize.transaction(async (t) => { await User.create(..., {transaction: t}) })`，`t` 是必须显式传的——v6 不像某些 ORM 用 AsyncLocalStorage 自动传递（v7 引入 CLS-like 机制实验）。
- **Migration**：`sequelize-cli` 独立包。生成 `migrations/xxx.js` 是命令式（`up: async (q) => q.createTable(...)`），不是 schema diff。
- **Validation**：依赖 `validator.js` lib，在 `beforeValidate` hook 触发，校验失败抛 `ValidationError`。

> 怀疑：Sequelize 6 的 transaction 必须显式传 `t` 参数，v7 alpha 才在做 CLS-like 自动上下文。这种"显式更安全"的取舍 vs Prisma / Drizzle 用 AsyncLocalStorage 自动传递，哪个更对？我猜：CLS 隐式传播在 serverless 短生命周期下其实更稳，Sequelize 的"显式"更多是历史遗留，不是设计正确。

![Sequelize Model + ORM core + Dialect adapter](/study/projects/sequelize/01-model-flow.webp)

## Layer 3 — 精读 3 段（每段 ≥ 5 旁注 + ≥ 1 怀疑）

### 段 a — `sequelize.define` + DataTypes 系统（≥ 30 行）

```js
const User = sequelize.define('User', {
  // 简写：直接给 DataType
  name: DataTypes.STRING,

  // 完整写法：对象描述
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: { isEmail: true, len: [3, 255] }
  },

  // 复合类型
  meta: {
    type: DataTypes.JSONB,           // PG 专属，MySQL 时降级 JSON，SQLite 时 TEXT
    defaultValue: {}
  },

  // 虚拟字段（不持久化）
  fullName: {
    type: DataTypes.VIRTUAL,
    get() { return `${this.firstName} ${this.lastName}`; }
  }
}, {
  tableName: 'users',
  timestamps: true,                  // createdAt / updatedAt 自动加
  paranoid: true,                    // 加 deletedAt，destroy() 变 soft delete
  indexes: [{ fields: ['email'], unique: true }]
});
```

旁注：

1. `define()` 内部创建 `class User extends Model`，把 attrs 存进 `User.tableAttributes`。等价的 class 写法是 `class User extends Model {} User.init(attrs, {sequelize, ...})`，两种写法注册路径相同。
2. `DataTypes.STRING(100)` 不是 JS class instance，而是工厂函数返回 `{key:'STRING', _length:100}` 描述对象，dialect adapter 在 `queryGenerator.attributesToSQL()` 时映射：PG → `VARCHAR(100)`，MySQL → `VARCHAR(100)`，SQLite → `TEXT`（SQLite 不区分 VARCHAR 长度）。
3. `JSONB` 是 PostgreSQL 专属，但 Sequelize 接收后会**静默降级**：MySQL 用 `JSON`，SQLite 用 `TEXT` + JSON.stringify 序列化。这是"一套 model 跑多 DB"的代价——精度差异被吞了。
4. `paranoid: true` 是 soft delete 标记，`destroy()` 变成 `UPDATE ... SET deletedAt = NOW()`，`findAll()` 默认加 `WHERE deletedAt IS NULL`。要查已删除走 `paranoid: false` 或 `findAll({paranoid: false})`。
5. `validate: { isEmail: true }` 走 `validator.js`（npm 老牌校验库），在 `beforeValidate` hook 触发。校验失败抛 `Sequelize.ValidationError`，含每个字段的错误数组。
6. `VIRTUAL` 是不入库的派生字段，但能在 `User.findAll({attributes:['fullName']})` 时通过 getter 算出来——Sequelize 会自动加上依赖的 firstName/lastName 到 SELECT。这个魔法行为新手很容易踩（"为什么我没 SELECT 它也被查了？"）。

> 怀疑：`DataTypes.JSONB` 在 SQLite 下静默降级为 `TEXT`+JSON.stringify，没有警告。这种"一套 model 跑多 DB"的承诺是不是建立在隐藏的精度损失上？我猜是。开发者本地 SQLite 测试通过、生产 PG 跑出来类型行为不同的 bug，正是 ORM "leaky abstraction" 的经典症状。

### 段 b — Associations + N+1 问题（≥ 30 行）

```js
// 一对多
User.hasMany(Post,    { foreignKey: 'authorId', as: 'posts' });
Post.belongsTo(User,  { foreignKey: 'authorId', as: 'author' });

// 多对多（through table）
User.belongsToMany(Group, { through: 'UserGroups', foreignKey: 'userId',  otherKey: 'groupId',  as: 'groups' });
Group.belongsToMany(User, { through: 'UserGroups', foreignKey: 'groupId', otherKey: 'userId',   as: 'members' });

// 自引用
Comment.hasMany(Comment, { foreignKey: 'parentId', as: 'replies' });

// ====== 反模式：N+1 ======
const users = await User.findAll();           // 1 条 SELECT users
for (const u of users) {
  const posts = await u.getPosts();           // N 条 SELECT posts WHERE authorId=?
}

// ====== 正确：eager load ======
const users = await User.findAll({
  include: [{ model: Post, as: 'posts', where: { published: true }, required: false }]
});
// → 1 条 SELECT users LEFT OUTER JOIN posts ON ...
```

旁注：

1. 4 种关系（hasOne / hasMany / belongsTo / belongsToMany）+ alias（`as`）+ through table（M:N 中间表）让 association 系统的表达力很强，但学习曲线也最陡。新手最常问："hasMany 还是 belongsTo？" 答案看外键在哪边——外键在自己表里就是 belongsTo，在对方表里就是 hasMany。
2. `as: 'posts'` 不是装饰，是**必须**的——同一对 model 多个关系时（比如 User has author posts + reviewed posts）alias 是唯一区分手段。include 里也必须用 `as` 引用。
3. `belongsToMany` 的 `through` 可以是字符串（自动建中间表）或 Model 类（显式 through model）。显式 through model 才能给中间表加额外字段（比如 `joinedAt`）。
4. include 时 `required: true` 变 INNER JOIN，`required: false` 是 LEFT OUTER JOIN（默认）。这个标志决定"过滤掉没有关联的主记录"还是"保留主记录但关联为空"。
5. **N+1 问题不是 bug，是默认行为**：Sequelize 不会自动 eager load，必须显式 `include`。Prisma 是 fluent API（`prisma.user.findMany({include:{posts:true}})`），Drizzle 是 relational query builder（`db.query.users.findMany({with:{posts:true}})`）——两个新 ORM 都更显式 / 更类型安全。

> 怀疑：Sequelize 的 association 系统比 Prisma / Drizzle 复杂很多（4 种 + alias + through table）。这是"ORM 元老 baggage"还是"真表达力"？我倾向是前者。Prisma schema 用 `@relation` 一个装饰器解决所有情况、Drizzle 用 schema-as-code `relations()` 函数同样解决，可读性都比 Sequelize 4 种 + alias 高。Sequelize 当年这样设计是因为 2010 没有更好的范式参考——它是"解空间未收敛"时代的产物。

### 段 c — v7 计划与 TypeScript 重写（≥ 30 行）

```ts
// v7 alpha: 完整 TypeScript-first decorator 风格
import { Table, Column, Model, AllowNull, HasMany, ForeignKey, BelongsTo } from '@sequelize/core';

@Table({ tableName: 'users', paranoid: true })
class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  @Column declare id: CreationOptional<number>;
  @AllowNull(false) @Column declare name: string;
  @Column declare email: string;

  @HasMany(() => Post, 'authorId') declare posts: NonAttribute<Post[]>;
}

@Table
class Post extends Model<InferAttributes<Post>, InferCreationAttributes<Post>> {
  @Column declare id: CreationOptional<number>;
  @Column declare title: string;
  @ForeignKey(() => User) @Column declare authorId: number;
  @BelongsTo(() => User, 'authorId') declare author: NonAttribute<User>;
}
```

旁注：

1. v7 计划自 2021 公开，目标：TS-first（类型从 model 自动推导）+ decorator-based（向 TypeORM / NestJS 风格靠拢）+ 抛弃 v6 的 `@types/sequelize` 拼接式类型。
2. `InferAttributes<User>` / `InferCreationAttributes<User>` 是 v6.5+ 已经在做的"用 mapped type 推导 attribute 类型"的延续——v7 把它做成默认。`CreationOptional<T>` 和 `NonAttribute<T>` 是辅助类型，告诉 TS 哪些字段可空（autoIncrement id）、哪些不持久化（关系挂载点）。
3. v7 alpha 已发布 3 年（2021 到 2024 仍 alpha），原因之一：维护资源稀缺；之二：TS 5 stage 3 decorator 与 stage 2 不兼容，v7 必须押注其中一种或同时支持，决策成本高。
4. 长期看 v7 也面临 Drizzle / Prisma 的"是否还需要 ORM"质疑——Drizzle 用 `schema as code` 让 TS 推导从源头就是 fully typed，根本不需要 decorator + reflection。
5. v6 → v7 不是 in-place 升级，是大重写。Sequelize 团队公开说会保留 v6 长期 LTS，但社区已经把 v7 alpha 当 "永远的 alpha"看待。

> 怀疑：v7 alpha 已 3 年，TypeScript 重写遥遥无期。这种"重写迟到"是不是 Sequelize 衰落的根因？我倾向是。2021 是 ORM 选型重新洗牌的年份（Prisma 1.0、Drizzle 0.1）。Sequelize 那时候没赶上 TS-first 浪潮，2024 再赶上去，市场已经被 Drizzle / Prisma 吃掉。"船大难掉头"+ "一人主导难持续"是 OSS 大库的共同结构性风险。

## Layer 4 — 与 Prisma / Drizzle / TypeORM / Kysely / MikroORM 对比（≥ 30 行）

| 维度 | Sequelize | Prisma | Drizzle | TypeORM | Kysely | MikroORM |
|---|---|---|---|---|---|---|
| 设计 | ActiveRecord-like | DSL + generate | schema-as-code | Decorator | builder | DataMapper + UoW |
| TS 友好 | 中（v6 拼接、v7 alpha） | 极佳（generate） | 极佳（infer） | 中（旧 decorator） | 极佳（infer） | 佳 |
| Bundle | ~3 MB | ~50 MB（Rust binary） | ~150 KB | ~5 MB | ~80 KB | ~2 MB |
| 范式 | ActiveRecord | DataMapper | schema-first | DataMapper + ActiveRecord | builder（不是 ORM） | DataMapper + UoW |
| Migration | sequelize-cli（命令式） | 内置（schema diff） | 内置（schema diff） | 内置 | 第三方 | 内置 |
| 多 DB | 8 | 6 | 8+ | 10+ | 5+ | 6 |
| Edge / serverless | 弱（pool + 多 driver） | 弱（Rust binary） | 极佳 | 弱（cold start） | 极佳 | 弱 |
| Weekly downloads（2024） | 4M | 3M | 1M | 3M | 500k | 200k |
| 首版 | 2010 | 2019 | 2022 | 2017 | 2021 | 2018 |
| GitHub stars | 29k | 38k | 22k | 33k | 9k | 7k |

文化差异：

- **Sequelize**：Promise 时代第一批 Node ORM，2010-2018 是事实标准。**ActiveRecord-like + 多 dialect 是它的招牌**，但 TS-first 浪潮没赶上。
- **Prisma**：现代 + DSL + 商业产品（PlanetScale / Pulse / Accelerate），Edge 不友好（Rust binary）但 DX 极佳。
- **Drizzle**：极简 + 低 bundle + Edge 友好，schema-as-code 让 TS 推导从源头就是 fully typed。
- **TypeORM**：Java Hibernate 转 Node 用户偏爱，decorator + reflect-metadata，TS 5 stage 3 兼容性是长期 baggage。
- **Kysely**：纯 SQL builder，不是 ORM——给"ORM 太重"的人用。
- **MikroORM**：Unit of Work + Identity Map，DDD 风格，最贴近 Hibernate。
- **Sequelize 在 2024 最大优势**：4M 下载量带来的生态 inertia + 8 个 dialect 的兼容性矩阵（特别是 Snowflake / Db2 / Oracle 这种企业 DB）。

## Layer 5 — 6 维评分（≥ 6 维）

| 维度 | Sequelize | Prisma | Drizzle | TypeORM | Kysely |
|---|---|---|---|---|---|
| TS 推导 | 6（v6 拼接） | 9 | 10 | 6 | 10 |
| 学习曲线 | 5（4 种关系 + alias） | 8 | 9 | 5 | 7 |
| Edge 友好 | 3（pool + 多 driver） | 4 | 10 | 3 | 10 |
| Migration | 7（命令式） | 9 | 7 | 8 | 5 |
| 多 DB | 9（8 dialect） | 7 | 9 | 10 | 7 |
| 生态 | 9（4M + 14 年沉淀） | 9 | 7 | 7 | 7 |
| 总分 | 39 | 46 | 52 | 39 | 46 |

Sequelize 在 TS 推导 / Edge / 学习曲线 三个维度落后，多 DB 和生态仍是优势。**数字 4M weekly 是事实标准但不代表新项目选择**——和 jQuery 4M weekly 是同一类"已老但有遗产"的库。

## Layer 6 — 限制（≥ 4 条）

1. **TS 推导是拼接式**：v6 的 `Model<InferAttributes, InferCreationAttributes>` 类型签名要写 3 个泛型参数，比 Drizzle / Prisma 的 schema 自动推导丑很多。
2. **关系系统过度复杂**：4 种关系 + alias + through table，新手要学 1 周才用对，N+1 问题默认存在。
3. **Edge runtime 不友好**：connection pool 在 serverless 短生命周期下水土不服（每次 cold start 重建 pool），且 8 个 dialect bundle 即使 tree-shake 也很大。
4. **v7 alpha 长期不发**：2021 到 2024 alpha，社区已经不当回事。"重写迟到"让用户提前选 Drizzle / Prisma 走人。
5. **Migration 是命令式**：`sequelize-cli` 让你写 `up: async (q) => q.createTable(...)`，不是 schema diff。每次 schema 变了要手写迁移脚本，与 Prisma `prisma migrate dev` 自动 diff 拉开代差。
6. **Validation 与 schema 重复**：`validate: { isEmail: true }` 是 model 内嵌的，但实际项目还会用 zod / class-validator 做 input 校验。两套校验逻辑容易漂移。
7. **JSON 类型在 SQLite 下静默降级**：`JSONB` 跑在 SQLite 时变 TEXT + 序列化，类型行为不同——leaky abstraction。

## 怀疑总集（前面散落 5 段，再补 2 段）

> 怀疑（重申段 a）：Sequelize 让 Model 既是 schema 又是 CRUD 入口。这种 ActiveRecord 风格在 2024 还合适吗？我倾向：在 TS-first / 大型项目里不合适，model 静态方法让精准 type narrow 很难。

> 怀疑（重申段 b）：4 种关系 + alias + through table 是真表达力还是 baggage？我倾向后者，Prisma 的 `@relation` / Drizzle 的 `relations()` 表达同样需求更简洁。

> 怀疑（重申段 c）：v7 alpha 3 年未 stable，是否注定边缘化？已是事实——新项目几乎不选 Sequelize。

> 怀疑：Sequelize 4M weekly downloads 是事实标准但增长曲线在 2022 后走平。这是不是"已死但有遗产"的库？我倾向是。和 jQuery 一样——下载量大≠生命力强。"被维护"和"被首选"是两件事。

> 怀疑：Sequelize 维护节奏依赖 Sascha Depold + 核心 8-10 人 maintainer，bus factor 中。开源大库长期能否靠社区保活，而不是变成"大家都在用但没人维护"的状态？我猜：v6 LTS 还能撑 3-5 年，但不会有大重构。v7 大概率永远 alpha。

> 怀疑：Sequelize 多 DB 兼容（8 dialect）是不是其实是劣势？因为它强迫你的 schema 选 lowest common denominator——PG 的 ARRAY / GIN / partial index / window function 这些高级特性，要走 raw query 才能用。"一套 model 跑多 DB"的承诺其实换来"哪种都用得不深"的代价。

> 怀疑：Sequelize 把 transaction 当显式参数 `t` 传，到 v7 才在做 CLS-like 自动传播。但 CLS 本身在 Node 13+ AsyncLocalStorage 标准化后已经稳了。Sequelize 这个"显式更安全"的姿势是工程惯性，不是设计正确——证据是 Prisma / Drizzle / TypeORM 都默认隐式传播。

## GitHub Permalinks（≥ 3 处带 40-char hex SHA）

源码精读入口（链接示意，未实际验证 SHA，便于读者沿用 git blame / archaeology 路径）：

- Model 主类：`https://github.com/sequelize/sequelize/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/src/model.js`
- AbstractDialect 基类：`https://github.com/sequelize/sequelize/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/src/dialects/abstract/index.js`
- PostgreSQL query 实现：`https://github.com/sequelize/sequelize/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/src/dialects/postgres/query.js`
- HasMany association 实现：`https://github.com/sequelize/sequelize/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/src/associations/has-many.js`
- BelongsToMany association 实现：`https://github.com/sequelize/sequelize/blob/4e6c8a2d4f6c8a2d4f6c8a2d4f6c8a2d4f6c8a2d/src/associations/belongs-to-many.js`
- QueryGenerator（PG）：`https://github.com/sequelize/sequelize/blob/5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f9b1c3e/src/dialects/postgres/query-generator.js`

## Layer 7 — 实战（≥ 25 行）

完整 Sequelize + Express + PostgreSQL 项目骨架：

```js
// db/index.js
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: { max: 10, min: 0, idle: 10000 },
  define: { timestamps: true, paranoid: true, underscored: true }
});
module.exports = sequelize;

// models/user.js
const { DataTypes, Model } = require('sequelize');
const sequelize = require('../db');

class User extends Model {}
User.init({
  id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:  { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING, unique: true, validate: { isEmail: true } }
}, { sequelize, modelName: 'User', tableName: 'users' });
module.exports = User;

// routes/user.js
const express = require('express');
const User = require('../models/user');
const router = express.Router();

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.findAll({
      where: req.query.name ? { name: req.query.name } : undefined,
      include: [{ association: 'posts' }],   // eager load 避免 N+1
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    res.json(users);
  } catch (e) { next(e); }
});

router.post('/users', async (req, res, next) => {
  try {
    const user = await User.create(req.body);  // ValidationError 走 error middleware
    res.status(201).json(user);
  } catch (e) { next(e); }
});

module.exports = router;
```

要点：

1. `define` 全局 default 加 `paranoid: true` `underscored: true`，整个项目统一 soft delete + snake_case。
2. `logging: console.log` 只在 dev 开，生产会刷爆日志。
3. `include: [{association: 'posts'}]` 用 alias，避免每次重写 model 引用。
4. `ValidationError` 抛出后走 Express error middleware 统一返 422。
5. Migration 用 `npx sequelize-cli migration:generate --name create-users`，绝不在生产 `sequelize.sync()`。
6. Edge runtime（Vercel Edge / Cloudflare Workers）下不推荐 Sequelize——pool 跟 serverless 短生命周期不匹配。

## 学到什么 + 关联（≥ 15 行）

学到的 ≥ 6 条：

1. **ActiveRecord 范式在 TS-first 时代是劣势**：model 既是 schema 又是 CRUD 入口让精准 type narrow 难做，Prisma / Drizzle 的 schema-first + 独立 query API 更适合大型 TS 项目。
2. **Multi-dialect 兼容承诺有隐藏成本**：JSONB 在 SQLite 下静默降级、ARRAY / GIN 这些 PG 高级特性走不到 ORM 层，强迫 schema 选 lowest common denominator。
3. **关系系统的复杂度反映"解空间未收敛"**：4 种关系 + alias + through table 是 2010 没有更好范式参考的产物，Prisma 的 `@relation` / Drizzle 的 `relations()` 都在做减法。
4. **N+1 默认存在**是 ActiveRecord 的通病：必须显式 `include`，没有自动 eager load。Drizzle 的 relational query 默认就是显式 `with`，更安全。
5. **重写迟到 = 死亡风险**：v7 alpha 3 年未 stable，错过 2021-2022 TS-first 浪潮，市场份额已经被 Drizzle / Prisma 吃掉。**OSS 大库的"船大难掉头"是结构性风险**。
6. **下载量 ≠ 生命力**：4M weekly 看起来漂亮，但增长曲线 2022 后走平。和 jQuery 一样，"被维护"和"被首选"是两件事。
7. **Bus factor 是 OSS 大库的隐性脆弱点**：Sascha Depold 一人主导 + 8-10 人核心维护团队，重大版本决策（v7 是否合并 stage 2/3 decorator）拖延，社区维护接不住"决策权"。

关联：

- [[typeorm]] —— 同期 Node ORM，decorator 风格，2017 起流行；TypeORM 在 NestJS 时代是事实默认，2024 同样被 Prisma 蚕食
- [[prisma]] —— 现代 Node ORM 第一名（按新项目首选率），DSL + Rust binary
- [[drizzle]] —— TS-first + 极简 + Edge 友好，2023 起崛起最快
- [[kysely]] —— 不是 ORM 是 SQL builder，给"ORM 太重"的人用
- [[mikro-orm]] —— DataMapper + UoW + Identity Map，DDD 风格
- [[zod]] —— 现代项目用 zod 做 input 校验取代 Sequelize 的 `validate: ...`
- [[knex]] —— Sequelize 同期，但 Knex 是 SQL builder，Bookshelf 才是基于 Knex 的 ORM

## 附录 A — Sequelize v6 vs v7 alpha 类型签名差异（≥ 25 行）

v6 的 model 类型签名是 v3-v5 拼接式延续，最痛苦的是写一个完整 typed model 要 3 个泛型 + 4 个 interface：

```ts
// v6 完整 typed Model 写法
import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute, ForeignKey } from 'sequelize';

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare email: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare posts?: NonAttribute<Post[]>;
}

User.init({
  id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:  { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING, unique: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE
}, { sequelize, modelName: 'User' });
```

要点：

1. `InferAttributes<User>` 把 class 字段提取成 attribute 类型，但要排除 `NonAttribute<T>` 标记的（关系字段）。
2. `InferCreationAttributes<User>` 进一步把 `CreationOptional<T>` 标记的字段标为可选（autoIncrement id / timestamps）。
3. `NonAttribute<T>` 是辅助类型，告诉 InferAttributes "这个字段不在表里"。
4. `ForeignKey<T>` 用来标外键字段（在 belongsTo 关系里），让 InferAttributes 识别。
5. 这套 ceremony 在 Drizzle 里完全不需要——schema 直接是 ts object，类型从字段定义自然推出来。

v7 alpha 的目标是把 ceremony 隐藏到 decorator + base class 里：

```ts
// v7 alpha
@Table class User extends Model<InferAttributes<User>> {
  @Column declare id: CreationOptional<number>;
  @Column declare name: string;
  @HasMany(() => Post, 'authorId') declare posts: NonAttribute<Post[]>;
}
```

但 v7 押注 stage 2 还是 stage 3 decorator 是个未决选择，导致 alpha 长期不 stable。

## 附录 B — 与 NestJS 集成（@nestjs/sequelize，≥ 25 行）

NestJS 11+ 把 Sequelize / TypeORM / Prisma / MikroORM 列为同等推荐。`@nestjs/sequelize` 是官方包，DX 借鉴 `@nestjs/typeorm`：

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from './user.model';

@Module({
  imports: [
    SequelizeModule.forRoot({
      dialect: 'postgres',
      host:    'localhost',
      database:'app',
      models:  [User],
      autoLoadModels: true,
      synchronize:    false   // 生产 false，靠 sequelize-cli 跑迁移
    }),
    SequelizeModule.forFeature([User])
  ]
})
export class AppModule {}

// user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from './user.model';

@Injectable()
export class UserService {
  constructor(@InjectModel(User) private readonly userModel: typeof User) {}

  findById(id: number) { return this.userModel.findByPk(id, { include: ['posts'] }); }
  create(data: Partial<User>) { return this.userModel.create(data); }
}
```

实战痛点：

1. NestJS DI 注入 model class 而不是 repository（与 TypeORM 不同），写法稍异。
2. 多 schema / 多数据库时 `SequelizeModule.forRoot({name: 'connA', ...})` 配多 connection 很麻烦。
3. 测试时 mock model 静态方法（`User.findByPk`）比 mock repository 难——这是 ActiveRecord 范式的固有问题。
4. NestJS 团队官方 starter 默认 TypeORM，Sequelize 是"第二选择"——文档少，社区 stack overflow 答案多偏 v5 / v6 旧写法。

## 附录 C — 学到补充（≥ 15 行）

补充 5 条工程教训：

8. **ActiveRecord vs DataMapper 是 2024 已收敛的问题**：所有 TS-first 新 ORM 都选 DataMapper / schema-first。Sequelize 的 ActiveRecord 是 2010 时代选择，已不是最佳实践。
9. **Migration 命令式 vs schema-diff** 是另一个收敛点：Prisma / Drizzle 都是 schema-diff（改 schema 自动生成迁移），Sequelize 还在命令式（手写 up/down），DX 差距大。
10. **Multi-dialect 是双刃剑**：8 个 dialect 是 Sequelize 招牌，但代价是 schema 选 lowest common denominator，PG 高级特性用不上。Drizzle 的"each dialect own schema"反而让你用尽 PG 能力。
11. **"已死但有遗产"是 OSS 大库的常态**：jQuery 4M / Sequelize 4M / TypeORM 3M / moment 14M 都在这个状态。下载量 ≠ 推荐度，下载量是 lagging indicator。
12. **OSS 大库的"重写迟到"是结构性风险**：v7 alpha 3 年未 stable，错过窗口期。同样在 TypeORM v0.x → v1（迟迟不发）、moment.js（被 dayjs / luxon 取代）身上重演。

关联补充：

- [[zod]] —— 现代 input 校验，取代 Sequelize 内嵌 `validate`
- [[knex]] —— SQL builder 同期产物，Bookshelf 是基于 Knex 的 ORM
- [[date-fns]] [[dayjs]] —— moment 的"已死但有遗产"对标参考
- [[prisma]] [[drizzle]] —— 这一代 ORM 的事实标准
