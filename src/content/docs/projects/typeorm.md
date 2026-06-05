---
title: TypeORM — Decorator-based ORM
来源: https://github.com/typeorm/typeorm
日期: 2026-05-29
子分类: ORM
分类: 数据库
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

- 为什么 [[nest]] 教程里 entity 都长成 `@Entity() class User { ... }` 的样子——那是 TypeORM 风格
- 为什么从 Java 转 Node 的工程师特别喜欢它——它和 Hibernate / Spring Data JPA 几乎一个气味
- 为什么同一个 ORM 既能写 `repo.find()`（Data Mapper）又能写 `user.save()`（Active Record）——它两种范式都收
- 为什么它支持那么多数据库（PostgreSQL / MySQL / SQLite / MS SQL / MongoDB 等 10+）——driver 是抽出来的，换 DB 只换 type 字段
- 它和 [[prisma]] / [[drizzle]] / [[kysely]] 一起组成现在 Node ORM 的 "四强"，互相参考也互相竞争

## 核心要点

TypeORM 的工作方式可以拆成 **三块**：

1. **用装饰器定义 Entity**：在 class 上贴 `@Entity()`，在字段上贴 `@Column()` / `@PrimaryGeneratedColumn()` / `@OneToMany()`。这些便利贴在程序启动时被收集起来，组装成"这张表长什么样"的元数据。

2. **Migration（迁移）自动生成 + 手动写**：你改了 entity（比如多加一个字段），跑 `typeorm migration:generate`，它对比"当前 entity 想要的样子"和"数据库现在的样子"，自动写出一份 SQL 迁移脚本。生产环境再跑 `migration:run` 把这份脚本应用到真实数据库。

3. **两种查询 API 共存**：
   - **Data Mapper**：`dataSource.getRepository(User).find(...)`，把 entity 当纯数据，仓库管增删改查
   - **Active Record**：`User.find(...)` / `user.save()`，entity 自己带 CRUD 方法

两种风格写法不同，但底下走的是同一套 SQL 生成。

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

- `@Entity()` 贴在 class 上：告诉 TypeORM "这个 class 对应一张表"，表名默认是 class 名小写
- `@PrimaryGeneratedColumn()`：这一列是主键，自增
- `@Column({ length: 100 })`：普通列，长度 100；`{ unique: true }` 加唯一约束
- `import 'reflect-metadata'` 必须放在最前——它是装饰器读取字段类型的运行时基础

### 案例 2：查询和过滤

```ts
const userRepo = dataSource.getRepository(User)

// 找年龄大于 18 的用户
const adults = await userRepo.find({
  where: { age: MoreThan(18) },
  order: { createdAt: 'DESC' },
  take: 10,
})

// 复杂查询用 QueryBuilder
const list = await userRepo
  .createQueryBuilder('u')
  .leftJoinAndSelect('u.posts', 'p')
  .where('u.age > :age', { age: 18 })
  .getMany()
```

简单查询用 `find`，复杂 join / 子查询用 `createQueryBuilder`——能力分两档，新手先学 `find`，碰到复杂场景再学后者。

### 案例 3：自动生成 Migration

```bash
# 改完 entity，让 TypeORM 对比 entity 和现有 DB schema，生成 SQL
typeorm migration:generate -n AddEmailToUser

# 运行迁移到数据库
typeorm migration:run
```

生成的文件大致是：

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

`up` 升级、`down` 回滚——两份成对，是 ORM migrations 的通用约定。

## 踩过的坑

1. **装饰器 + class-validator 配置陡**：要在 `tsconfig.json` 同时开 `experimentalDecorators` 和 `emitDecoratorMetadata`，再 `import 'reflect-metadata'`。少一项就报"找不到类型"或装饰器静默失效。

2. **多 entity 关联性能差**：默认 `find` 不会 join，relation 字段是 `undefined`；写 `relations: ['posts']` 又容易触发 N+1（每个 user 单跑一次 posts 查询）。要么用 `relations` + `take` 限量，要么改用 QueryBuilder 显式 `leftJoinAndSelect`。

3. **`synchronize: true` 在生产很危险**：开发期它会自动改表结构，方便。但生产开了就可能默默 drop 列、丢数据。**生产必须 `synchronize: false`**，所有 schema 变更走 migrations。

4. **TS 编译目标和 reflect-metadata 的细节**：`tsconfig.json` 里 `target` 太新（如 ESNext）有时与旧版 decorator 行为不一致；`emitDecoratorMetadata` 不是默认开。TypeScript 5+ 的新 stage 3 decorator 与 TypeORM 用的旧 experimental decorator 不兼容——长期看是包袱。

## 适用 vs 不适用场景

**适用**：

- [[nest]] 项目（社区集成最成熟）
- 需要支持多种数据库的项目（10+ driver 是 TypeORM 强项）
- 团队从 Java Hibernate / Spring Data JPA 迁移过来，找熟悉的写法
- 老项目（2018-2022 起家的 Node 后端，很多用 TypeORM）

**不适用**：

- Edge / serverless（reflect-metadata 增加 cold start 成本，[[drizzle]] / [[kysely]] 更合适）
- 极致 TypeScript 类型推导（[[prisma]] / [[drizzle]] 的 infer 更好）
- 想用 TypeScript 5+ 新装饰器（TypeORM 还在旧 decorator）
- 全新项目且没有 TypeORM 历史包袱（社区潮流偏向 [[prisma]] 或 [[drizzle]]）

## 学到什么

1. **ORM 的两种范式**：Data Mapper（仓库 + 纯数据）和 Active Record（entity 自带 CRUD），TypeORM 都收，是优点也是缺点——灵活但容易学乱
2. **装饰器 + 反射元数据** 是 TypeScript 装饰器风格 ORM 的核心机制，理解 `reflect-metadata` 是理解 [[nest]] / TypeORM 的钥匙
3. **Migrations 是生产必备**：`synchronize: true` 只能在开发用，生产必须靠 migrations 控制 schema 变更
4. **多 DB 抽象的代价**：driver 抽象层让 TypeORM 支持 10+ 数据库，但每个 driver 行为有微妙差异（如 SQLite 没有真正的 timestamp with timezone），跨 DB 不能完全无感切换
5. **生态会演进**：TypeORM 在 NestJS 早期是默认，但现在 [[prisma]] / [[drizzle]] 抢走新项目份额——选 ORM 时既要看现状也要看趋势

## 延伸阅读

- 官方文档：[typeorm.io](https://typeorm.io/)（覆盖装饰器 / Repository / QueryBuilder / Migrations 全部 API）
- 官方仓库：[github.com/typeorm/typeorm](https://github.com/typeorm/typeorm)
- NestJS 官方教程：[docs.nestjs.com/techniques/database](https://docs.nestjs.com/techniques/database)（@nestjs/typeorm 整合方式）
- [[prisma]] —— 同领域 schema-first 风格 ORM
- [[drizzle]] —— 同领域低 bundle / Edge 友好 ORM
- [[kysely]] —— 纯 SQL builder 风格

## 关联

- [[prisma]] —— 同领域，schema.prisma 文件 vs class 装饰器风格的对比
- [[drizzle]] —— 同领域，schema-as-code + 极小 bundle，Edge 场景首选
- [[kysely]] —— 同领域，但定位是 SQL builder 而非 ORM
- [[nest]] —— TypeORM 在 [[nest]] 生态里通过 `@nestjs/typeorm` 深度集成
- [[zod]] —— 配 class-validator 用，给 entity 做输入校验
