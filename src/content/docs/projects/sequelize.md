---
title: Sequelize — 老牌 Node ORM
来源: https://github.com/sequelize/sequelize
日期: 2026-08-27
分类: ORM
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sequelize/sequelize
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: cb7f99ad05de56137672ab95586359ff6ceba004
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.37.8
---

## 是什么

Sequelize 是 Node 上的 **Active Record ORM**：一个 Model class 同时描述表结构、提供查询入口，并在实例上挂 `save()` / `destroy()`。日常类比：`User` 既是户口本格式，也是窗口柜员——`User.findAll()` 去查，`user.save()` 把眼前这份记录写回去。

```js
import { Sequelize, DataTypes } from "sequelize"
const sequelize = new Sequelize("postgres://localhost/app")
const User = sequelize.define("User", {
  email: { type: DataTypes.STRING, unique: true },
})
```

`define(name, attrs)` 的实现是：现场 `class extends Model {}`，再 `model.init(attributes, options)`。class-based `User.init(...)` 与 `define()` 最终走同一条 `Model.init`。

## 为什么重要

不按固定 v6 源码读 Sequelize，下面这些事会对不上：

- 为什么老 Express 项目里满是 `sequelize.define`，而较新代码改写成 `class User extends Model`
- 为什么默认会多出 `createdAt` / `updatedAt`，表名又常常被复数化
- 为什么 `transaction(async t => ...)` 成功就 commit、抛错就 rollback，而只调 `transaction()` 时要自己收尾
- 为什么字符串运算符别名已经被 deprecation 路径拦住，查询要写 `Op.like`

## 核心要点

固定 `6.37.8` 可以看成四层：

1. **构造期选定 dialect**：`new Sequelize(...)` 用 switch 静态 `require` dialect，避免打包器动态路径。实现支持 `mariadb` / `mssql` / `mysql` / `oracle` / `postgres` / `sqlite` / `db2` / `snowflake`。默认错误文案漏写了 `snowflake`，但 case 存在。

2. **Model.init 填默认选项**：`timestamps: true`、`freezeTableName: false`、`paranoid: false`、`underscored: false`、`whereMergeStrategy: 'overwrite'`。未给 `tableName` 时，表名是 `freezeTableName ? name : underscoredIf(pluralize(name))`。

3. **查询与关联挂在 Model 上**：`findAll` / `create` 是 static；`hasMany` / `belongsTo` / `hasOne` / `belongsToMany` 生成 getter。条件用 `Op.*` symbol，不是字符串 `'$like'`。

4. **Hooks 与 transaction 是副作用边界**：hooks 覆盖 validate/create/update/destroy/save/upsert/bulk/find/count/sync/query/connect 等阶段；`beforeSave` 会代理到 `beforeUpdate` + `beforeCreate`。`sequelize.transaction(fn)` 用 CLS 跑回调并自动 commit/rollback；不传回调则返回未结束的 `Transaction`。

## 实践示例

### 案例 1：define 一张表

```js
import { Sequelize, DataTypes, Model } from "sequelize"

const sequelize = new Sequelize("sqlite::memory:")

const User = sequelize.define("User", {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, unique: true },
})

class Post extends Model {}
Post.init(
  { title: DataTypes.STRING },
  { sequelize, modelName: "Post" },
)
```

两种写法都要求 Sequelize 实例进入 `init`；缺 `options.sequelize` 会直接抛 `No Sequelize instance passed`。默认 `timestamps: true`，所以同步后的表通常还有 `createdAt` / `updatedAt`。

### 案例 2：查询、关联与运算符

```js
import { Op } from "sequelize"

User.hasMany(Post)
Post.belongsTo(User)

const hits = await User.findAll({
  where: { email: { [Op.like]: "%@example.com" } },
  order: "id DESC",
  limit: 10,
  include: [Post],
})
```

`Op.like` 是 symbol。把 `operatorsAliases` 设成对象或布尔，固定源码会走 deprecation 辅助函数，不应再当新代码默认。

### 案例 3：回调式 transaction

```js
await sequelize.transaction(async (t) => {
  const user = await User.create({ name: "Ada", email: "ada@example.com" }, { transaction: t })
  await Post.create({ title: "Notes", UserId: user.id }, { transaction: t })
})
```

回调 resolve 后 `commit()`，reject 后尝试 `rollback()`。只调用 `await sequelize.transaction()` 时，调用方必须自己 `commit` / `rollback`；未传回调不会自动收尾。

## 踩过的坑

1. **以为 `define` 和 class `init` 是两套 ORM**：`define` 只是造匿名 subclass 再 `init`。
2. **忘了默认 timestamps / 复数表名**：`User` 默认表名是复数；`freezeTableName: true` 才钉死类名。
3. **字符串运算符**：`where: { email: { $like: '...' } }` 依赖已废弃的 alias；固定 v6 要 `Op.like`。
4. **把 `@sequelize/core` v7 alpha 当成 npm `sequelize` latest**：`npm view sequelize` 当前 latest 仍是 `6.37.8`；v7 是另一包且为 `7.0.0-alpha.48`，不能把 alpha 合同写进本页。

## 适用 vs 不适用场景

**适用**：

- 维护已有 Express / 早期 Nest 的 Sequelize v6 代码
- 需要 Active Record 实例方法，并接受运行时 schema
- dialect 落在上述 8 个 switch case 内，且能接受各 dialect 深浅不一

**不适用**：

- 新项目若要以编译期 schema 为唯一真相——对照 [[prisma]] / [[drizzle]] / [[typeorm]] 的固定源码，不要外推“谁更新”
- 需要 Identity Map / Unit of Work——那是 [[mikro-orm]] 的合同，不是 Sequelize v6
- 想把 v7 alpha 行为写进生产结论
- 需要本文未做的真实 dialect 联调或性能数字

## 固定版本边界

- 本文绑定 `sequelize/sequelize@cb7f99ad05de56137672ab95586359ff6ceba004`。lightweight tag `v6.37.8` 与 npm `sequelize@6.37.8` 的 `gitHead` 一致。
- 该提交根 `package.json` 的 `version` 是 `0.0.0-development`（发布流程占位）；对外版本以 npm `6.37.8` 与 tag 名为准。`engines.node` 为 `>=10.0.0`。
- `@sequelize/core@7.0.0-alpha.48` 不在本页绑定范围。
- 本文未安装依赖、未连库、未跑上游测试或 `sync()`，状态保持 `UNVERIFIED`。

## 学到什么

1. **Active Record 把 schema、查询、实例生命周期叠在同一个 class 上**——好读，也难单测。
2. **默认选项比文档印象更具体**：timestamps、复数表名、`whereMergeStrategy: overwrite` 都在 `Model.init`。
3. **transaction 的两种调用约定必须分开记**：有回调才自动收尾。
4. **多 dialect 的“支持”以 switch 为准**，错误文案和实现列表可以不一致。

## 应用型自测

1. `sequelize.define("User", attrs)` 和 `class User extends Model; User.init(attrs, { sequelize })` 是否走不同的持久化引擎？
2. 不设 `timestamps` 时，`User` 默认真的没有时间列吗？
3. `await sequelize.transaction()` 不传回调，抛错后会自动 rollback 吗？

检查点：

1. 不是。`define` 创建 subclass 后调用同一套 `Model.init`。
2. 不是。`Model.init` 默认 `timestamps: true`。
3. 不会。无回调只返回 `Transaction`，收尾由调用方负责。

## 延伸阅读

- 官方文档：[sequelize.org](https://sequelize.org/)
- 固定源码：[sequelize/sequelize](https://github.com/sequelize/sequelize) —— 本文绑定提交 `cb7f99ad05de56137672ab95586359ff6ceba004`
- [[typeorm]] —— 装饰器 metadata + DataSource，对照 Active Record
- [[mikro-orm]] —— Data Mapper + Identity Map
- [[prisma]] —— schema-first 生成客户端

## 关联

- [[typeorm]] —— 装饰器 entity / DataSource vs `define` / `Model.init`
- [[mikro-orm]] —— `em.flush()` 对照 Sequelize 实例 `save()`
- [[prisma]] —— 生成类型与 migration 工作流不同
- [[drizzle]] —— SQL-like schema-as-code
- [[postgresql]] —— 常见 dialect 之一；各 dialect 行为以对应 driver 为准

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[codd-1979-extending]] —— Codd 1979 — 给关系模型补上"语义"
- [[mikro-orm]] —— MikroORM — Data Mapper Identity Map ORM
