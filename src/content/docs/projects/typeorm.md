---
title: TypeORM — Decorator-based ORM
来源: https://github.com/typeorm/typeorm
日期: 2026-08-27
分类: ORM
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/typeorm/typeorm
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8748b1be17bf93fc9b62b3444e411e9055e9e017
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.1.0
---

## 是什么

TypeORM 是面向 TypeScript / ES2023 的 **Data Mapper ORM**，也同时提供 Active Record 入口。日常类比：你在 class 上贴 `@Entity()` / `@Column()` 便利贴，启动时这些便利贴被收成表元数据；真正发 SQL 的是 `DataSource` 选中的 driver，不是 class 自己。

```ts
import { DataSource } from "typeorm"
const ds = new DataSource({ type: "postgres", entities: [User] })
await ds.initialize()
await ds.getRepository(User).save(user)
```

固定 `1.1.0` 仍依赖 `reflect-metadata`，CLI `init` 生成的 tsconfig 继续打开 `experimentalDecorators` 与 `emitDecoratorMetadata`。包描述把自己写成 Data-Mapper ORM；`BaseEntity` 只是把同一套 Repository 挂到实例方法上。

## 为什么重要

不按固定 1.x 源码读 TypeORM，下面这些印象会对不上：

- 旧教程里的 `type: "sqlite"` 在 `DriverFactory` 里已经不是合法 type；桌面 SQLite 要写 `better-sqlite3` 或 `sqljs`
- `Connection` 只是历史名字；当前入口是 `DataSource.initialize()`
- `where: { email: null }` 默认会抛错，不会被静默当成 SQL NULL
- 写操作 QueryBuilder 若 WHERE 展开成空条件或 `1=1`，会被拒绝，而不是默默改全表

## 核心要点

固定 1.1.0 的主链可以拆成五步：

1. **装饰器写入全局 metadata**：`@Entity()` 把 class 推进 `getMetadataArgsStorage().tables`。这份存储挂在 platform global 上，避免 CLI 全局包与本地包各持一份。

2. **构造 DataSource 就选 driver**：构造函数立刻 `DriverFactory.create()`。`initialize()` 再 `driver.connect()` → `buildMetadatas()` → `afterConnect()`；然后按开关依次 `dropSchema`、`migrationsRun`、`synchronize`。后三者都是 opt-in，默认不会改表。

3. **Repository 与 BaseEntity 共用 EntityManager**：`getRepository(User).find()` / `save()` 走 Data Mapper；`user.save()` 只是 `BaseEntity.getRepository().save(this)`。

4. **Find 默认 join、where 默认 throw**：`relationLoadStrategy` 默认 `"join"`，也可改 `"query"`。`invalidWhereValuesBehavior` 未配置时，plain-object where 里的 `null` / `undefined` 都默认 `"throw"`。要匹配 SQL NULL 必须显式 `IsNull()`。

5. **写查询拒绝空 WHERE**：Update/Delete 等写 query type 若提供了 where 但渲染结果为空或 `1=1`，抛 `Empty criteria(s) are not allowed...`；真要影响全表必须故意不写 where。

## 实践示例

### 案例 1：DataSource + 装饰器 entity

```ts
import "reflect-metadata"
import { DataSource, Entity, PrimaryGeneratedColumn, Column } from "typeorm"

@Entity()
class User {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ length: 100 })
  name!: string

  @Column({ unique: true })
  email!: string
}

const ds = new DataSource({
  type: "postgres",
  host: "127.0.0.1",
  database: "app",
  entities: [User],
  synchronize: false,
})
await ds.initialize()
```

`synchronize` 只有显式 `true` 才会在 `initialize()` 末尾建/改表。生产路径应保持 `false`，改走 `migration:generate` / `migration:run`。

### 案例 2：find 与 QueryBuilder

```ts
import { Like, IsNull } from "typeorm"
const repo = ds.getRepository(User)

const hits = await repo.find({
  where: { email: Like("%@example.com") },
  order: { id: "DESC" },
  take: 10,
})

const one = await repo.findOneBy({ id: 1 })
const missing = await repo.findOneBy({ email: IsNull() })

const list = await repo
  .createQueryBuilder("u")
  .where("u.name = :name", { name: "Ada" })
  .getMany()
```

`find()` 默认不加载 relations，需要 `relations` 或 QueryBuilder `leftJoinAndSelect`。`findOneBy({ email: null })` 在默认行为下会抛错。

### 案例 3：生成 migration

```bash
npx typeorm migration:generate ./src/migrations/AddEmailToUser -d ./src/data-source.ts
npx typeorm migration:run -d ./src/data-source.ts
```

CLI 的 `-d` / `--dataSource` 是必填，指向导出 `DataSource` 的文件。`--check` 只验证“当前库是否已与 entity 对齐”，不写文件。

## 踩过的坑

1. **把 0.3 的 `type: "sqlite"` 抄到 1.1.0**：`DriverFactory` 合法 type 是 `postgres` / `mysql` / `mariadb` / `mssql` / `oracle` / `mongodb` / `better-sqlite3` / `sqljs` / `cockroachdb` / `sap` / `spanner` / `aurora-*` 以及若干移动端 driver，没有 `"sqlite"`。
2. **where 里写 `null` 当 IS NULL**：默认 throw；要 SQL NULL 用 `IsNull()`，或把 `invalidWhereValuesBehavior.null` 改成 `sql-null` / `ignore`。
3. **生产打开 `synchronize`**：它会按 entity 元数据改库，MongoDB 则只同步 index。固定源码自己标注不要用于生产。
4. **空 where 的 update/delete**：提供了但展开为空的 criteria 会被拒绝；这是 1.1.0 的保护，不是“没写 where 就更新 0 行”。

## 适用 vs 不适用场景

**适用**：

- 需要同一套装饰器 entity 对接多种 RDBMS / Mongo，并且接受 driver 语义差异
- 已有 Nest + `@nestjs/typeorm` 存量，或团队熟悉 Hibernate / Doctrine 式 metadata
- 需要 Data Mapper 与 Active Record 两种入口共存

**不适用**：

- 不能开 experimental decorator / `reflect-metadata` 的运行时
- 不满足 `engines.node`：`^20.19.0 || ^22.13.0 || >=24.11.0`
- 想要 schema-first 代码生成或纯 SQL builder——应看 [[prisma]] / [[drizzle]] / [[kysely]]，不要把它们的合同外推到 TypeORM
- 需要把静态阅读写成“已在目标库跑通”——本文没有这样做

## 固定版本边界

- 本文绑定 `typeorm/typeorm@8748b1be17bf93fc9b62b3444e411e9055e9e017`。annotated tag `1.1.0` 解引用到该提交；`package.json` 版本为 `1.1.0`。npm 未暴露 `gitHead`。
- v1.0（2026-05-19）起编译目标为 ES2023，并去掉 Node 16/18；1.1.0 是其后的修补/小功能版。
- 上游另有 `packages/codemod`，用于 0.3 → 1.x 机械改写；本文未运行该 codemod。
- 本文未安装依赖、未连库、未跑上游测试或 migration，状态保持 `UNVERIFIED`。

## 学到什么

1. **装饰器 ORM 的源真相是 metadata 表，不是 class 方法**——Active Record 只是 Repository 的语法糖。
2. **多 driver 抽象要按 type 枚举读，不能按旧文档猜 SQLite 字符串**。
3. **默认保护已经从“静默当 NULL / 静默全表更新”改成 throw**——升级 1.x 时这是行为变化，不是类型装饰。
4. **`synchronize` 与 migrations 是两条互斥生产策略**——`initialize()` 把它们都做成开关，默认全关。

## 应用型自测

1. `new DataSource({ type: "sqlite" })` 在固定 1.1.0 能否构造成功？
2. `repo.find({ where: { email: null } })` 默认会生成 `IS NULL` 吗？
3. `initialize()` 在未设置 `synchronize` 时会自动改表吗？

检查点：

1. 不能。`DriverFactory` 没有 `"sqlite"`，会抛 `MissingDriverError`。
2. 不会。未配置时 `null` 默认 throw，必须 `IsNull()`。
3. 不会。只有 `options.synchronize === true` 才调用 `synchronize()`。

## 延伸阅读

- 官方文档：[typeorm.io](https://typeorm.io/)
- 固定源码：[typeorm/typeorm](https://github.com/typeorm/typeorm) —— 本文绑定提交 `8748b1be17bf93fc9b62b3444e411e9055e9e017`
- v1.0 发布说明：[typeorm.io/docs/releases/1.0/release-notes](https://typeorm.io/docs/releases/1.0/release-notes)
- [[sequelize]] —— 同主题 Active Record / `define()` 对照
- [[mikro-orm]] —— 同装饰器风格，但强制 EntityManager + Unit of Work

## 关联

- [[sequelize]] —— Model.define / hooks / transaction 回调 vs DataSource + decorator metadata
- [[mikro-orm]] —— Identity Map / `em.flush()` 对照 TypeORM 的即时 `save()`
- [[prisma]] —— schema-first 代码生成，不是装饰器运行时
- [[drizzle]] —— schema-as-code + SQL-like 查询
- [[kysely]] —— 类型安全 SQL builder，不是完整 ORM
- [[nest]] —— 常见 `@nestjs/typeorm` 集成面；集成细节以 Nest 固定源码为准

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[codd-1979-extending]] —— Codd 1979 — 给关系模型补上"语义"
- [[django]] —— Django — 全功能 batteries-included 的 Python web 框架
- [[drizzle]] —— Drizzle ORM — 轻量 SQL-like ORM
- [[mikro-orm]] —— MikroORM — Data Mapper Identity Map ORM
- [[sequelize]] —— Sequelize — 老牌 Node ORM
