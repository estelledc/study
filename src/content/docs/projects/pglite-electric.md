---
title: PGlite — 浏览器里的 PostgreSQL：零基础学习笔记
来源: https://github.com/electric-sql/pglite
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

# PGlite — 浏览器里的 PostgreSQL：零基础学习笔记

## 一、什么是 PGlite？先想一个问题

你用过 PostgreSQL 吗？如果没有，没关系。你只需要知道：

> PostgreSQL 是世界上功能最强大的开源关系型数据库之一。它需要安装在服务器上，应用程序通过网络连接去查询它。

PGlite 做的事很简单：**把整个 PostgreSQL 数据库塞进一个 WebAssembly 模块里，让你能在浏览器中直接运行它，不需要安装任何服务器。**

日常类比：

- 传统的 PostgreSQL 就像一台商用餐厅的后厨——食物（数据）在专门的厨房里做，顾客（你的网页）只能在外面点餐。
- PGlite 就像给每个顾客发了一个微型折叠厨房——你的浏览器就是厨房，数据在你自己的浏览器里处理，不需要去餐厅。

## 二、核心概念

### 2.1 Postgres in WASM，不是虚拟机

很多"浏览器里跑数据库"的项目（比如以前的 pg.js）是用了整个 Linux 虚拟机。PGlite 不一样：它是把 PostgreSQL 用 Emscripten 编译成 WASM 格式，直接在浏览器的 JavaScript 引擎里跑。

类比：虚拟机就像在电脑里又开了一台完整的电脑（又慢又大）；WASM 就像把厨房的工具直接折成纸模型（只有 3MB 压缩后）。

### 2.2 单一连接

PGlite 只有一个用户/连接。就像你家的水龙头只有一个——可以同时用一个，但不能两个人同时拧。这个限制对前端场景通常不是问题，但如果有多个 tab 需要共享同一个数据库，PGlite 提供了 Multi-tab Worker 方案。

### 2.3 存储后端

PGlite 支持三种存储方式：

| 存储类型 | 代码前缀 | 在哪用 | 特点 |
|---------|---------|-------|------|
| 内存 | `memory://` | 所有平台 | 页面刷新就没了，像随手记 |
| 文件系统 | `file://` 或不写前缀 | Node/Bun | 存在硬盘上，持久化 |
| IndexedDB | `idb://` | 浏览器 | 存在浏览器里，刷新还在 |

### 2.4 两种查询方式

PGlite 提供了两种查询方法，功能类似但各有用途：

- **`.query()`** — 支持参数化查询，适合动态 SQL（防止 SQL 注入）
- **`.exec()`** — 支持多条 SQL 语句一起执行，适合建表、导入数据

## 三、代码示例

### 示例 1：创建数据库、建表、查询

这是最基础的用法。无论浏览器还是 Node.js，代码几乎一样：

```javascript
import { PGlite } from '@electric-sql/pglite'

// 创建实例（使用 memory 模式，刷新就没了）
const db = await PGlite.create()

// 用 .exec() 建表 + 插入数据（可以同时写多条 SQL）
await db.exec(`
  CREATE TABLE IF NOT EXISTS todo (
    id SERIAL PRIMARY KEY,
    task TEXT,
    done BOOLEAN DEFAULT false
  );
  INSERT INTO todo (task, done) VALUES ('Install PGlite', true);
  INSERT INTO todo (task, done) VALUES ('Write a query', false);
  INSERT INTO todo (task) VALUES ('Learn PGlite');
`)

// 用 .query() 查询数据（支持参数化）
const result = await db.query('SELECT * FROM todo WHERE done = $1', [true])
console.log(result.rows)
// -> [{ id: 1, task: 'Install PGlite', done: true }]
```

拆解一下这段代码：

1. `PGlite.create()` — 异步创建数据库实例，返回一个 Promise
2. `db.exec()` — 执行任意多条 SQL，不传参数，返回所有语句的结果数组
3. `db.query()` — 执行单条 SQL，`$1` 是占位符，第二个参数 `[true]` 会安全地替代 `$1`
4. `result.rows` — 查询结果以 JavaScript 对象数组的形式返回

### 示例 2：带持久化的任务列表 + 实时通知

这个示例展示了更多特性：持久化存储、参数化更新、以及 PostgreSQL 的通知机制：

```javascript
import { PGlite } from '@electric-sql/pglite'

// 用 IndexedDB 持久化，刷新页面数据还在
const db = await PGlite.create('idb://my-todo-app')

// 建表
await db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name TEXT,
    quantity INTEGER DEFAULT 0
  );
`)

// 插入数据
await db.query('INSERT INTO items (name, quantity) VALUES ($1, $2)', ['苹果', 5])
await db.query('INSERT INTO items (name, quantity) VALUES ($1, $2)', ['香蕉', 3])

// 更新数据 — 把苹果数量改成 10
await db.query(
  'UPDATE items SET quantity = $1 WHERE name = $2',
  [10, '苹果']
)

// 查全部
const allItems = await db.query('SELECT * FROM items')
console.log(allItems.rows)
// -> [{ id: 1, name: '苹果', quantity: 10 }, { id: 2, name: '香蕉', quantity: 3 }]

// PostgreSQL 的通知机制：监听 + 发送
// 先订阅一个频道
const unsub = await db.listen('item_updated', (payload) => {
  console.log('收到通知:', payload)
})

// 在更新数据时发通知
await db.query("NOTIFY item_updated, '苹果数量已更新'")

// 不用时取消监听
await unsub()
```

### 示例 3（进阶）：Live Queries — 数据变了自动更新

PGlite 有一个 live 扩展，能让查询结果自动响应数据变化：

```javascript
import { PGlite } from '@electric-sql/pglite'
import { live } from '@electric-sql/pglite/live'

// 创建时加载 live 扩展
const db = await PGlite.create({
  extensions: { live }
})

// 建表 + 插入数据
await db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id SERIAL PRIMARY KEY,
    player TEXT,
    score INTEGER
  );
  INSERT INTO scores (player, score) VALUES ('Alice', 95), ('Bob', 82);
`)

// 订阅一个"活的"查询 — 数据变了，回调自动触发
await db.live.query(
  'SELECT * FROM scores ORDER BY score DESC',
  [],
  (result) => {
    console.log('当前排行榜:')
    result.rows.forEach(row => {
      console.log(`  ${row.player}: ${row.score} 分`)
    })
  }
)
// 输出：
//   Alice: 95 分
//   Bob: 82 分

// 插入一条新数据 — 上面的回调会自动再触发一次！
await db.query("INSERT INTO scores (player, score) VALUES ('Charlie', 100)")
// 输出：
//   Charlie: 100 分
//   Alice: 95 分
//   Bob: 82 分
```

## 四、PGlite 能做什么？

基于上面的概念，PGlite 的典型使用场景：

1. **本地优先（Local-first）应用** — 数据存在用户浏览器里，离线也能用
2. **快速原型** — 不需要配数据库服务器，npm install 就能跑
3. **前端直接跑 SQL** — 不再需要后端 API 做简单查询，前端直连
4. **AI/向量搜索** — 支持 pgvector 扩展，可以在浏览器里做向量检索
5. **开发工具** — 内置 REPL 组件，可以在网页里嵌入一个数据库操作界面

## 五、限制与注意事项

- **单连接** — 同一时间只能有一个连接，多 Tab 共享需要 Worker
- **内存占用** — 虽然 WASM 只有 3MB，但数据库内容存在内存中，数据量大时会变慢
- **不是完整的 PostgreSQL** — 缺少某些服务器端特性（比如存储过程、触发器的高级功能）
- **alpha 阶段** — 功能还在快速迭代中

## 六、总结

PGlite 的核心思想一句话概括：**把数据库变成前端的一等公民。**

它不需要你安装任何东西，不需要配服务器，`new PGlite()` 一行代码就能得到一个完整的 PostgreSQL。对于想在前端直接操作数据的场景，PGlite 提供了一个非常轻量的答案。
