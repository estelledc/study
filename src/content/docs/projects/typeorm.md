---
title: TypeORM — Decorator-based ORM
来源: https://github.com/typeorm/typeorm
日期: 2026-05-29
分类: ORM
难度: 中级
---

## 是什么

TypeORM 是 **Node.js 上的一种 ORM**（对象关系映射器）——你用 TypeScript 写 class，它帮你把 class 翻译成数据库表的增删改查 SQL。

它最大的特点是 **装饰器风格**：你不另开一个 schema 文件，直接在 class 字段上贴 `@Entity()` `@Column()` `@OneToMany()` 这种"小标签"，描述每列长什么样、和哪张表有关系。

日常类比：

- [[prisma]] 像"先写一份 schema.prisma 设计图，再让工具按图施工"
- TypeORM 像"在 class 旁边贴便利贴，每张便利贴说一件事——`这是表`、`这是主键`、`这一列对外键`"
- [[drizzle]] / [[kysely]] 像"我直接拼 SQL，但拼得有类型保护"

四种风格各有粉丝。TypeORM 的便利贴风格在 [[nest]] 早期是默认搭档，写起来像 Java 的 JPA / Hibernate。

## 为什么重要

不了解 TypeORM，下面这些事不太好理解：

- 为什么 [[nest]] 教程里 entity 都长成 `@Entity() class User { ... }`——那是 TypeORM 风格
- 为什么从 Java 转 Node 的工程师特别喜欢它——和 Hibernate / Spring Data JPA 几乎一个气味
- 为什么既能写 `repo.find()`（**Data Mapper**：仓库管存取，entity 只是数据）又能写 `user.save()`（**Active Record**：对象自己会存）——两种范式都收
- 为什么支持 PostgreSQL / MySQL / SQLite / MS SQL / MongoDB 等 10+ 库——driver 抽出来，换 DB 只换 type 字段
- 它和 [[prisma]] / [[drizzle]] / [[kysely]] 同属常见 Node ORM 选型，互相参考也互相竞争

## 核心要点

TypeORM 的工作方式可以拆成 **三块**：

1. **用装饰器定义 Entity**：在 class 上贴 `@Entity()`，在字段上贴 `@Column()` / `@PrimaryGeneratedColumn()` / `@OneToMany()`。启动时这些便利贴被收集成"这张表长什么样"的元数据。
2. **Migration（迁移）自动生成 + 手动写**：改完 entity 跑 `migration:generate`，对比"entity 想要的样子"和"数据库现在的样子"写出 SQL；生产再 `migration:run`。
3. **两种查询 API 共存**：Data Mapper 用 `dataSource.getRepository(User).find(...)`；Active Record 用 `User.find(...)` / `user.save()`。写法不同，底下同一套 SQL 生成。

## 实践案例

### 案例 1：定义一张表

```ts
import 'reflect-metadata'
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'

@Entity()
class User {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ length: 100 })
  name!: string

  @Column({ unique: true })
  email!: string
}
```

逐部分读：

- `@Entity()`：这个 class 对应一张表，表名默认是 class 名小写
- `@PrimaryGeneratedColumn()`：主键，自增
- `@Column({ length: 100 })` / `{ unique: true }`：普通列与唯一约束
- `import 'reflect-metadata'` 必须最先执行——装饰器靠它在运行时读字段类型

### 案例 2：查询和过滤

```ts
import { Like } from 'typeorm'
const userRepo = dataSource.getRepository(User)

const hits = await userRepo.find({
  where: { email: Like('%@example.com') },
  order: { id: 'DESC' },
  take: 10,
})

const list = await userRepo
  .createQueryBuilder('u')
  .where('u.name = :name', { name: 'Ada' })
  .getMany()
```

逐部分读：

- `getRepository(User)`：拿到 User 表的仓库（Data Mapper）
- `find` 的 `where` / `order` / `take`：过滤、排序、只取前 N 条；`Like` 是模糊匹配
- 复杂条件用 `createQueryBuilder`：自己写接近 SQL 的链式调用；新手先学 `find`，再学后者
- 前提：已有 `dataSource.initialize()`（把 host / 库名 / entities 配好）

### 案例 3：自动生成 Migration（0.3+）

```bash
# -d 指向 DataSource 文件；输出路径自己起名
npx typeorm migration:generate ./src/migrations/AddEmailToUser -d ./src/data-source.ts
npx typeorm migration:run -d ./src/data-source.ts
```

生成文件大致是：

```ts
export class AddEmailToUser1700000000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE "user" ADD COLUMN "email" varchar UNIQUE`)
  }
  async down(q: QueryRunner) {
    await q.query(`ALTER TABLE "user" DROP COLUMN "email"`)
  }
}
```

`up` 升级、`down` 回滚——成对出现是 migrations 的通用约定。

## 踩过的坑

1. **装饰器配置陡**：`tsconfig` 要开 `experimentalDecorators` + `emitDecoratorMetadata`，再 `import 'reflect-metadata'`；少一项就静默失效。
2. **多 entity 关联易 N+1**：默认 `find` 不 join；写 `relations: ['posts']` 又可能每人再查一次——改用 QueryBuilder 显式 `leftJoinAndSelect`。
3. **`synchronize: true` 生产危险**：开发可自动改表，生产可能默默 drop 列；**生产必须 `false`，走 migrations**。
4. **TS 5+ 新装饰器不兼容**：TypeORM 仍用旧 experimental decorator；`target` 过新时行为也可能不一致。

## 适用 vs 不适用场景

**适用**：

- [[nest]] 项目（`@nestjs/typeorm` 集成最成熟）
- 需要同时对接 ≥3 种数据库驱动，或多 DB 抽象是硬需求
- 团队从 Java Hibernate / Spring Data JPA 迁来，要熟悉写法
- 2018–2022 起家的 Node 后端，已有 TypeORM 历史包袱

**不适用**：

- Edge / serverless（reflect-metadata 抬高 cold start，[[drizzle]] / [[kysely]] 更合适）
- 极致 TypeScript 类型推导（[[prisma]] / [[drizzle]] 的 infer 更好）
- 想用 TypeScript 5+ 新装饰器（TypeORM 还在旧 decorator）
- 全新项目且无 TypeORM 包袱（社区新项目更常选 [[prisma]] 或 [[drizzle]]）

## 历史小故事（可跳过）

- **2016 前后**：Pleerock 开源 TypeORM，把 Hibernate 式装饰器 entity 带到 TypeScript / Node。
- **NestJS 早期**：官方数据库教程默认 `@nestjs/typeorm`，便利贴风格成为 Nest 教程标配。
- **0.3 大改**：DataSource 取代旧 Connection；CLI 改为 `-d` 指向 DataSource，迁移工作流更明确。
- **今天**：新项目份额被 [[prisma]] / [[drizzle]] 分流，但多 DB + Nest 存量里仍常见。

## 学到什么

1. **ORM 两种范式**：Data Mapper（仓库 + 纯数据）与 Active Record（entity 自带 CRUD），TypeORM 都收——灵活也易学乱
2. **装饰器 + reflect-metadata** 是这类 ORM 的钥匙，也是理解 [[nest]] 的钥匙
3. **Migrations 是生产必备**：`synchronize: true` 只给开发；生产靠 migrations 控 schema
4. **多 DB 抽象有代价**：10+ driver 方便，但各库行为有差异，不能完全无感切换

## 延伸阅读

- 官方文档：[typeorm.io](https://typeorm.io/)
- 官方仓库：[github.com/typeorm/typeorm](https://github.com/typeorm/typeorm)
- NestJS 数据库教程：[docs.nestjs.com/techniques/database](https://docs.nestjs.com/techniques/database)
- [[prisma]] —— schema-first 风格 ORM
- [[drizzle]] —— 低 bundle / Edge 友好 ORM
- [[kysely]] —— 纯 SQL builder 风格

## 关联

- [[prisma]] —— schema.prisma 文件 vs class 装饰器风格
- [[drizzle]] —— schema-as-code + 极小 bundle，Edge 场景首选
- [[kysely]] —— SQL builder 而非完整 ORM
- [[nest]] —— 通过 `@nestjs/typeorm` 深度集成
- [[zod]] —— 常配 class-validator，给输入做校验

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
