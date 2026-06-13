---
title: Neon — Serverless Postgres
来源: https://github.com/neondatabase/neon
日期: 2026-06-13
分类: 后端 API
子分类: databases-storage
provenance: pipeline-v3
---

# Neon — Serverless Postgres

## 一、日常类比：从"自己管机房"到"用水用电"

传统数据库就像自己在家打井喝水：你要买水泵、铺管道、做水处理，水费多少完全取决于你用了多少，而且哪怕今天不喝水，水泵也得占着地方。

Neon 的做法是把"井"交给自来水公司。你只需要拧开水龙头（写一行 SQL），水就来；关掉水龙头，水费就为零。而且 Neon 用的不是普通的"自来水"，而是**PostgreSQL**——全球最流行的开源关系型数据库，你以前怎么用它，现在还怎么用它。

Neon 的核心口号是 **Serverless Postgres**，意思是：不用管服务器、不用管扩缩容、用多少付多少，而且它的数据库还可以像 Git 代码一样"分支"。

## 二、它到底牛在哪里？三大核心特性

### 2.1 存算分离（Storage-Compute Separation）

传统 PostgreSQL 的存储（硬盘上的数据文件）和计算（运行 SQL 的进程）绑在同一台机器上。Neon 把它们拆开了：

- **计算节点（Compute）**：就是跑 PostgreSQL 的地方，无状态的，随时创建、销毁、缩放。
- **存储引擎（Pageserver）**：负责把所有数据存在云存储（比如 AWS S3）里，_compute_ 随时可以从这里拉数据。

类比：传统数据库就像一台台式电脑，CPU 和硬盘焊在一起；Neon 就像云游戏——游戏在远程服务器跑（compute），你只管看画面（发 SQL），数据存在云端硬盘（storage）里。

拆分的好处是：**计算可以随时缩放甚至缩到零**，存储独立增长，互不干扰。

### 2.2 数据库分支（Database Branching）

这是 Neon 最出圈的功能。就像 Git 可以 `git branch feature-x` 一样，Neon 可以让你在数据库层面做同样的事：

- 创建一个 `main` 的完全副本，叫 `feature-login`。
- 两个分支**共享底层数据**（采用 Copy-on-Write 机制），创建几乎是瞬时的，不需要复制整个数据库。
- 只有在某个分支上有写入操作时，才会真正复制被修改的数据。
- 两个分支的数据**互相独立**——在一个分支上 `INSERT` 不会影响另一个。

类比：就像视频剪辑软件里的"轨道分支"，你可以在一个轨道上试新的滤镜效果，而不必破坏原始视频。

### 2.3 自动缩放到零（Scale to Zero）

如果你的数据库 5 分钟没有连接请求，Neon 会自动把它"冻结"（suspend）。等到有新请求时，再自动"解冻"（唤醒）。这段时间不产生计算费用。

这对于开发环境、测试环境、或者低频使用的 SaaS 产品特别友好——再也不用为"放着不用也要付钱"的数据库烦恼了。

## 三、架构概览

Neon 的架构由三个核心组件组成：

1. **Compute Nodes**：无状态的 PostgreSQL 实例，负责执行 SQL 查询。随时可以创建多个，随时可以销毁。
2. **Pageserver**：存储后端。它读取 WAL（预写日志），把修改过的数据页面压缩后存到云存储（S3）。它是所有 compute 共享的。
3. **Safekeepers**：WAL 服务集群。compute 把 WAL 写入 safekeepers，通过 Paxos 保证数据持久化，即使 pageserver 或 compute 挂了，数据也不会丢。

```
[Compute A] ──WAL──> [Safekeepers Cluster] ──> [Pageserver] ──> [Cloud Storage (S3)]
[Compute B] ──WAL──> ^
[Compute C] ──WAL──> ^
```

## 四、核心概念一览

| 概念 | 说明 |
|------|------|
| **Project（项目）** | 一组分支、数据库、角色的集合，类似 GitHub 上的一个 repo |
| **Branch（分支）** | 数据隔离的副本，类似 Git 分支。每个项目默认有 `main` 分支 |
| **Compute / Endpoint** | 连接到某个分支的 PostgreSQL 实例，有唯一的 hostname |
| **WAL（Write-Ahead Log）** | Postgres 的预写日志，Neon 用它来实现存算分离和分支功能 |
| **History Window** | 数据变更历史的保留时长，决定了你能回滚到多久之前的状态 |
| **Read Replica** | 只读副本，分担主库的读取压力 |
| **Pooled Connection** | 通过 PgBouncer 连接池连接，适合高并发场景 |

## 五、代码示例

### 示例 1：创建项目、分支，连接数据库

在 Neon 的控制台或 CLI 中操作：

```bash
# 1. 创建一个新项目（在控制台创建后，会给你一个连接字符串）
# 连接字符串示例：
DATABASE_URL="postgresql://alex:AbC123dEf@ep-cool-darkness-a1b2c3d4.us-east-2.aws.neon.tech/neondb?sslmode=require"

# 2. 用 psql 连接
psql "postgresql://alex:AbC123dEf@ep-cool-darkness-a1b2c3d4.us-east-2.aws.neon.tech/neondb?sslmode=require"

# 3. 在 psql 里执行标准 SQL——和用普通 Postgres 完全一样
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (name, email) VALUES ('Jason', 'jason@example.com');
SELECT * FROM users;
```

输出：

```
 id | name  |       email       |         created_at
----+-------+-------------------+----------------------------
  1 | Jason | jason@example.com | 2026-06-13 10:00:00.000000
```

### 示例 2：用 Git 一样的方式做数据库分支

```bash
# 假设当前在 main 分支上，创建一个新的 feature 分支
# 这是 Neon CLI 的方式（neonctl）

# 创建分支（瞬间完成，因为用了 Copy-on-Write，实际不复制数据）
neon branches create feature-payment --project-id cool-forest-86753099

# 查看分支列表
neon branches list --project-id cool-forest-86753099

# 为新分支创建一个 compute endpoint，获取连接字符串
neon endpoints create ep-feature-payment --branch feature-payment --project-id cool-forest-86753099

# 现在你有两个独立的数据库连接：
#   main:     ep-cool-darkness-a1b2c3d4.us-east-2.aws.neon.tech
#   feature:  ep-bright-rain-a5b75h79.us-east-2.aws.neon.tech

# 在 feature 分支上安全地测试新功能——不影响 main！
psql "postgresql://alex:Pass123@ep-bright-rain-a5b75h79.us-east-2.aws.neon.tech/neondb?sslmode=require"

# 在 feature 分支上做 destructive 操作也没关系
ALTER TABLE users ADD COLUMN payment_tier TEXT;
INSERT INTO users (name, email, payment_tier) VALUES ('Alice', 'alice@example.com', 'premium');

# 回到 main 分支，完全看不到 feature 分支的改动
psql "postgresql://alex:Pass123@ep-cool-darkness-a1b2c3d4.us-east-2.aws.neon.tech/neondb?sslmode=require"
SELECT * FROM users;
-- 结果：payment_tier 列不存在，Alice 也不在其中
```

### 示例 3：在应用代码中连接 Neon

JavaScript / Node.js 示例：

```javascript
import { Pool } from 'pg';

// 从环境变量读取 Neon 连接字符串
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }  // Neon 要求 SSL 连接
});

// 创建表
await pool.query(`
  CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    done BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

// 插入数据
await pool.query(
  'INSERT INTO tasks (title) VALUES ($1, $2)',
  ['学习 Neon 数据库', '阅读文档']
);

// 查询数据
const result = await pool.query('SELECT * FROM tasks WHERE done = $1', [false]);
console.log('待办任务:', result.rows);
// 输出：[{ id: 1, title: '学习 Neon 数据库', done: false, ... }]

// 用完记得释放连接
await pool.end();
```

## 六、Neon 与传统 PostgreSQL 对比

| 特性 | 传统 PostgreSQL | Neon |
|------|----------------|------|
| 部署方式 | 自己买服务器/托管 | 完全 Serverless，注册即用 |
| 扩缩容 | 手动，需要停机或复杂配置 | 自动，秒级完成 |
| 分支功能 | 不支持（逻辑复制很重） | 原生支持，瞬时创建 |
| 空闲费用 | 服务器一直在跑，一直在花钱 | 缩到零，不用不花钱 |
| 回滚到历史 | 需要备份恢复，耗时久 | 基于 WAL 的历史窗口，瞬时回滚 |
| 兼容性 | 原生 | 100% 兼容 PostgreSQL 协议，任何 PG 驱动/ORM 都能用 |

## 七、什么时候该用 Neon？

**很适合的场景：**
- 初创团队 / 个人开发者：不用管运维，成本极低
- 开发 / 测试环境：每个开发者一个分支，互不干扰
- CI/CD 测试：为每次测试创建一个临时分支，跑完删除
- SaaS 产品：用户量少时零成本，用户多了自动扩容
- 需要数据隔离的多租户场景：每个租户一个分支

**不太适合的场景：**
- 需要极低延迟的实时交易系统（网络跳转多了一层）
- 需要直接使用某些 Postgres 内部特性的场景（Neon 替换了存储层）
- 数据量极大（PB 级别）且读压力极高（需要考虑更专业的方案）

## 八、总结

Neon 用三个词概括就是：**Serverless、Branching、Auto-scale**。

它本质上是对传统 PostgreSQL 做一次"云原生改造"——把存储和计算拆开，让数据库像代码一样可以分支、可以回滚、可以按需付费。对于学习 Postgres 的初学者来说，Neon 降低了门槛（不用装任何软件），也提供了传统 PG 给不了的新能力（分支和回滚）。

如果你正在学习 PostgreSQL，Neon 是一个很好的起点：免费额度慷慨，浏览器里就能写 SQL，而且你学到的所有知识在其它 Postgres 环境里都适用。
