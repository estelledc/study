---
title: MikroORM — Data Mapper、Identity Map 与 Unit of Work
来源: https://github.com/mikro-orm/mikro-orm
日期: 2026-05-29
分类: ORM
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/mikro-orm/mikro-orm
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: fb178b49c36586bc82fed16a8809e125a8c64ffe
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.1.14
---

## 是什么

MikroORM 是 TypeScript 的 **Data Mapper ORM**。日常类比：entity 只是货物标签，真正调度进出库的是 `EntityManager`——它记得“同一主键只有一个对象”（Identity Map），并在 `flush()` 时把脏变更打包写库（Unit of Work）。

```ts
import { MikroORM } from "@mikro-orm/postgresql";

const orm = await MikroORM.init({
  entities: [User],
  dbName: "app",
});
const em = orm.em.fork();
```

固定 `@mikro-orm/core@7.1.14` 是原生 ESM，要求 Node `>= 22.17.0`。`MikroORM.init(options)` 的 `options` 必填；`initSync` 已删除。装饰器不在 core 里，而在 `@mikro-orm/decorators`。

## 为什么重要

不读固定 7.1.14 源码，v6 教程会把你带到已经不存在的入口：

- 为什么 `user.save()` 或 `em.persistAndFlush(user)` 会找不到——entity 不负责持久化，后一个 API 已删除
- 为什么教程里的 `orm.em.find(...)` 在默认配置下会抛 `cannotUseGlobalContext`
- 为什么 `@mikro-orm/core` 不再默认给你 `ReflectMetadataProvider`
- 为什么 SQL 侧要找 `@mikro-orm/sql` / `em.getKysely()`，而不是旧的 Knex 入口
- 它和 [[mongoose]] 的差别：一个管关系表上的对象身份，一个管 Mongo 文档的 schema hydrate

## 核心要点

固定版本的主链可以拆成四层：

1. **启动**：`MikroORM.init` 先发现 metadata，再 `createEntityManager()`，并把 `orm.em.global = true`。无文件夹发现的同步路径是 `new MikroORM(options)`。

2. **请求上下文**：`allowGlobalContext` 默认 `false`。HTTP 请求应 `RequestContext.create(orm.em, next)` 或 `orm.em.fork()`。`getContext()` 的查找顺序是 TransactionContext → RequestContext → 当前 EM；校验失败就拒绝全局 EM。

3. **Identity Map + Unit of Work**：`persist` / `remove` 只把实体放进栈并返回 `this`。赋值改字段不会发 SQL。`flush()` 调用 `UnitOfWork.commit()`：算 changeset，必要时开隐式事务，再写库。

4. **查询与过滤**：`find` / `findOne` 先 `getContext()`，可能按 `flushMode` 自动 flush，再应用 Filter，然后走 driver。默认 `loadStrategy` 是 `BALANCED`（to-one join，to-many 另查）。软删除是 `@Filter({ default: true })`，不是单独的软删引擎。

## 实践示例

### 案例 1：v7 的创建 / 修改必须 `persist().flush()`

```ts
import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";

@Entity()
class User {
  @PrimaryKey() id!: number;
  @Property() name!: string;
}

const em = orm.em.fork();
const user = em.create(User, { name: "Ada" });
await em.persist(user).flush();   // persistAndFlush 已删除

user.name = "Ada Lovelace";
await em.flush();                 // 只 flush，UoW 自己 diff
```

`persist` 的 JSDoc 写明：入库发生在事务提交或 `flush()`。legacy 装饰器要显式从 `@mikro-orm/decorators/legacy` 引入；ES 装饰器走 `/es`。

### 案例 2：全局 EM 默认不能直接查

```ts
import { RequestContext } from "@mikro-orm/core";

function middleware(req, res, next) {
  RequestContext.create(orm.em, next); // 内部 fork，useContext: true
}

// 默认 allowGlobalContext: false
// await orm.em.find(User, {})  → ValidationError.cannotUseGlobalContext()
```

`fork()` 默认 `clear: true`，得到空 Identity Map。跨请求复用同一个 EM，会把上一请求的托管对象带到下一请求。

### 案例 3：Filter 是默认 WHERE，不是隐式删行

```ts
@Entity()
@Filter({ name: "notDeleted", cond: { deletedAt: null }, default: true })
class Post {
  @PrimaryKey() id!: number;
  @Property({ nullable: true }) deletedAt?: Date;
}

const posts = await em.find(Post, {});
const all = await em.find(Post, {}, { filters: { notDeleted: false } });
```

`applyFilters()` 把生效条件并进 `$and`。这能模拟软删除，但删除动作仍是你自己写 `deletedAt` 或 `em.remove()`。

## 踩过的坑

1. **继续调用 `persistAndFlush` / `removeAndFlush`**：升级文档写明已删除，应 `persist(entity).flush()`。
2. **把 `orm.em` 当请求单例**：默认全局上下文守卫会抛错；打开 `allowGlobalContext` 只是关掉警报。
3. **以为装饰器还从 `@mikro-orm/core` 出来**：v7 要装 `@mikro-orm/decorators`，legacy 反射还要自己挂 `ReflectMetadataProvider`。
4. **把 Filter 当成“框架替你做软删除”**：它只改查询条件。
5. **用字符串实体名 `em.find('User')`**：v7 要求 class 或 `EntitySchema` 引用。

## 适用 vs 不适用场景

**适用**：

- 长期运行的 Node 22.17+ 服务，需要 Identity Map 保持对象身份
- 已有 Doctrine / Hibernate 经验，能接受 `flush()` 才写库
- PostgreSQL / MySQL / SQLite / MongoDB 等官方 driver 包，并按 ESM `exports` 解析模块

**不适用**：

- Mongo 文档 + schema hydrate，且团队已在 [[mongoose]] 上
- Edge / 短生命周期函数，不想维护 per-request EM
- 只要 SQL builder，不要托管实体 → [[kysely]] / [[drizzle]]
- 还停在 Node 20 或 `moduleResolution: "node"` 的旧 Nest 默认配置

## 固定版本边界

- 本文绑定 `mikro-orm/mikro-orm@fb178b49...`，与 npm `@mikro-orm/core@7.1.14` 的 `gitHead` 一致。
- annotated tag `v7.1.14` 指向父提交 `cd79b2c3...`；两者之间只有版本/changelog/lockfile，无运行时 `.ts` / `.js` diff。
- Node `>= 22.17.0`；文档要求 TypeScript 5.8+ 与 `node20` / `nodenext` / `bundler`。
- SQL 底座是 `@mikro-orm/sql`（Kysely）；未审查 `@mikro-orm/nestjs` 或各 driver 的 SQL 方言细节。
- 未安装依赖、连接数据库或运行测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **Data Mapper 把“改字段”和“写库”拆开**——`flush()` 才是提交点。
2. **Identity Map 是一致性原语**——同一 EM 里同一主键不应出现两份对象。
3. **默认全局 EM 不安全**——v7 用 `allowGlobalContext: false` 把这件事变成硬错误。
4. **装饰器、反射、SQL 引擎都是可替换插件**——core 不再把它们藏成“装上就能用的默认值”。

## 应用型自测

1. 改了托管 entity 的 `name`，不调用任何方法。数据库会更新吗？
2. 默认配置下直接 `await orm.em.find(User, {})`，会怎样？
3. `em.persistAndFlush(user)` 在固定 7.1.14 还存在吗？

检查点：

1. 不会。变更只在内存，必须 `flush()`。
2. 抛 `cannotUseGlobalContext`，除非已有 RequestContext / TransactionContext 或打开 `allowGlobalContext`。
3. 不存在。应 `await em.persist(user).flush()`。

## 延伸阅读

- 官方文档：[mikro-orm.io](https://mikro-orm.io)
- 固定源码：[mikro-orm/mikro-orm](https://github.com/mikro-orm/mikro-orm) —— 本文绑定 `fb178b49c36586bc82fed16a8809e125a8c64ffe`
- 审查记录：仓库内 `docs/node-orm-source-review-20260827-dd.md`
- [[mongoose]] —— 文档 ODM，对照“对象身份 vs schema hydrate”
- [[typeorm]] —— 同装饰器路线，但 Active Record 与 Data Mapper 混用

## 关联

- [[mongoose]] —— MongoDB ODM；没有 Unit of Work flush 合同
- [[typeorm]] —— 装饰器 ORM，默认更偏 Active Record
- [[prisma]] —— 无状态 client，每次查询新对象
- [[kysely]] —— MikroORM v7 SQL 底座用的查询构建器
- [[drizzle]] —— 另一条 TS-first SQL 路线
- [[sequelize]] —— Active Record 老路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
