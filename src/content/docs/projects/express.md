---
title: Express Node.js 经典 Web 框架
来源: https://github.com/expressjs/express + expressjs.com 官方文档
season: 27
episode: S27-2
---

# Express — Node.js Web 框架的事实标准

## 一句话总结

Express 是 TJ Holowaychuk 2010 年开源的 Node.js Web 框架，weekly downloads ~30M（2024），是 Node.js 历史上最经典、最广泛部署的 Web 框架。它的核心是 **中间件链式管线**：每个请求按顺序经过 logger → body parser → auth → router → handler，每个中间件签名都是 `(req, res, next) => {}`，调用 `next()` 把控制权交给下一个。

设计哲学：极简核心 + 可插拔中间件。Express 本身只有 router + middleware 调度，body parsing / cookie / session / CORS / static 全部走第三方包（body-parser / cookie-parser / express-session / cors / serve-static）。这是 Connect（Node.js 早期 web 中间件库）思想的 Express 版。

技术 baggage 与历史关键节点：

- v3 → v4（2014）拆出 router 子包，废 connect 内置中间件
- v4 长期不变：2014-2024 整整 10 年没出 v5
- v5 RC（2024）才发布：Promise 友好的错误处理、严格 path-to-regexp、移除若干废弃 API
- 在 async/await 时代，`(req, res, next)` 模式显得笨拙——错误处理需 try/catch + `next(err)` 双轨，新人易踩坑

2024 状态：仍是 weekly downloads 王者，但 Fastify / Hono 在新项目蚕食市场。Express 的"教程化优势"（StackOverflow + tutorial 量级）让它仍是 Node.js 入门首选。这是一个"技术过气但生态不灭"的典型案例——就像 jQuery 之于前端，Express 之于 Node.js。

## Layer 0 — 项目档案速查

| 字段 | 值 |
|---|---|
| 包名 | `express` |
| 当前主版本 | v4.21（2024，v5 RC） |
| 首版 | 2010-06 |
| License | MIT |
| 主仓库 | expressjs/express |
| 维护 | OpenJS Foundation TSC（TJ Holowaychuk 2014 离场） |
| TypeScript | 通过 `@types/express` 第三方 |
| 内部依赖 | router / body-parser（v5 起）/ ~30 包传递 |
| Bundle / Size | core ~150 KB（带依赖） |
| Node 要求 | ≥ 0.10（v4）/ ≥ 18（v5） |
| Weekly downloads | ~30M+（最高） |
| GitHub stars | 64k+ |
| 商业版 | 无 |
| 中间件生态 | npm 包数千个 |
| 错误处理 | `next(err)` 显式传递 |
| async 支持 | v5 起原生 |
| HTTP/2 | v4 不支持，v5 通过 `http2` 模块 |
| 路由 | path-to-regexp + Router |
| 文档站 | expressjs.com |

## Layer 1 — 核心抽象

```js
const express = require('express');
const app = express();

// 全局中间件
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// 路由 + handler
app.get('/users/:id', async (req, res, next) => {
  try {
    const user = await db.users.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  } catch (err) {
    next(err);  // 把错误抛给 error middleware
  }
});

app.post('/users', async (req, res, next) => {
  try {
    const created = await db.users.create(req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// 错误中间件（4 参数）
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(3000);
```

四要素：

1. `express()` 返回 app 实例（既是 function 也是 object）
2. `app.use(fn)` 注册全局中间件
3. `app.METHOD(path, fn)` 注册路由（METHOD = get/post/put/delete/patch/all）
4. **`(req, res, next)` 签名** —— 调 next() 进入下一个；调 next(err) 进错误处理；res.send/json/end 终结请求

## Layer 2 — 内部架构

Express 内部三层：

1. **app**（lib/application.js）：`Application` 是 EventEmitter，提供 `app.use / get / post / listen / set / engine`
2. **Router**（lib/router/index.js）：维护 stack 数组，每个元素是 Layer（path + method + handler）
3. **Layer / Route**（lib/router/layer.js / lib/router/route.js）：单个 path + handler 的封装

请求处理流程：

```
incoming HTTP req
  ↓
app(req, res)  // Application 是函数
  ↓
router.handle(req, res, done)
  ↓
loop: layer.match_layer(layer, path)
  ↓ matched
layer.handle_request(req, res, next)
  ↓ user handler
res.send(...) → response 写完
```

每个 `next()` 调用让 router 内部的指针推进到下一个 layer。错误模式 `next(err)` 跳过普通 layer，只匹配 4 参数错误中间件。

性能瓶颈：

- 每请求都遍历 stack（O(n) 路由数）
- path-to-regexp 编译开销（v5 改为更快版本）
- body parsing 同步阻塞（只在小请求 OK）

vs Fastify：Fastify 用 Trie 路由 O(log n) + JIT 编译 schema → JSON serializer，throughput 是 Express 的 ~3x。

## Layer 3 — 精读 3 段

### 段 a — `(req, res, next)` 中间件签名

```js
function loggerMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}

app.use(loggerMiddleware);
```

旁注：

1. `next()` 不是 Promise return，是回调式控制反转（pre-2015 Node.js 风格）
2. `next(err)` 跳过普通中间件，匹配 4 参数错误中间件
3. async 函数在中间件里需要手动 try/catch + next(err)（v4），v5 才原生支持
4. 中间件顺序 matter：app.use 调用顺序 = 执行顺序
5. 路由级中间件（`app.get(path, m1, m2, handler)`）先于全局中间件之后执行
6. `res.on('finish')` 是终结回调，与 next() 互斥（不该在 finish 后再 next）

> 怀疑：`(req, res, next)` 签名在 callback hell 时代是创新，async/await 时代是负担。Hono / Fastify 都改成 `async (ctx) => {...}` 或 `async (req, reply) => {...}` 显式 Promise return。Express v5 算半步追赶。

### 段 b — Router stack + path-to-regexp

```js
const router = express.Router();

router.get('/users/:id', handler1);
router.post('/users', handler2);

// 内部 stack：
// [
//   { method: 'GET', path: '/users/:id', regex: /^\/users\/(?<id>[^\/]+)$/, handler: handler1 },
//   { method: 'POST', path: '/users', regex: /^\/users$/, handler: handler2 }
// ]

app.use('/api/v1', router);
```

旁注：

1. `app.use(path, router)` 嵌套（前缀剥离 + 子 stack 扫描）
2. path-to-regexp 把 `:id` 编译成 named capture group
3. `:id?` optional / `:rest*` glob / `:slug(\\d+)` 自定义正则
4. Express v4 用 path-to-regexp v0.1（语法 hack）；v5 升 v6.x（语法严格）
5. 大量路由（>1000）在 v4 是性能瓶颈（O(n)）；Fastify Trie O(log n)
6. 路由参数走 `req.params.id`；query string `req.query.q`

> 怀疑：Express v4 → v5 升级 path-to-regexp 是 breaking change。`/users/:id` 在 v5 里 `:id` 不再 capture 末尾的 `.json` 后缀。已有项目升级要重写正则。这是 v5 拖了 10 年原因之一？

### 段 c — 错误处理双轨制

```js
// 同步错误：抛出即可，Express 捕获
app.get('/sync-err', (req, res) => {
  throw new Error('boom');  // Express 捕获 → 转 next(err)
});

// 异步错误：必须手动 next(err)
app.get('/async-err', async (req, res, next) => {
  try {
    await someAsync();
  } catch (err) {
    next(err);  // ⚠️ 不能 throw，Promise reject 不会被 Express 捕获（v4）
  }
});

// 错误中间件（4 参数）
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});
```

旁注：

1. 同步 throw 自动捕获 → next(err)
2. 异步 Promise reject **不会** 被 v4 自动捕获（必须手动 try/catch + next(err)）
3. 这是 Express v4 最大坑：新人写 async handler 漏 try/catch → unhandled rejection
4. v5 改为：async handler 抛错自动 next(err)（终于跟上 async/await 时代）
5. 错误中间件签名是 4 参数（err 在前）—— TypeScript 推断容易错
6. express-async-errors 第三方包给 v4 打补丁

> 怀疑：v4 的"async handler 不自动捕获"是事实标准 10 年的痛点。express-async-errors 包 weekly downloads ~3M 说明问题严重。Express 团队为什么拖到 v5 才修？我猜：v4 的稳定性优先（不能引入 breaking 默认行为）。

![Express 中间件管线](/study/projects/express/01-middleware-pipeline.webp)

## Layer 4 — 与 Koa / Fastify / Hono / NestJS 对比

| 维度 | Express | Koa | Fastify | Hono | NestJS |
|---|---|---|---|---|---|
| API 签名 | (req,res,next) | async (ctx, next) | async (req, reply) | (c) => c.json() | decorator + class |
| async 友好 | v5 起 | 原生 | 原生 | 原生 | 原生 |
| 性能 | 基线 | ~Express | ~3x Express | ~3x Express | ~Express |
| Schema | 第三方 | 第三方 | 内置（Ajv） | 第三方 | 内置 |
| HTTP/2 | v5 | 否 | 有 | 边缘 | 有 |
| 边缘 runtime | 否（Node-only） | 否 | 否 | 是（CF/Bun/Deno） | 否 |
| Bundle | 150 KB | 100 KB | 60 KB | 4 KB | 大 |
| 学习曲线 | 平 | 中（generators 思维） | 中 | 平 | 陡 |
| Weekly downloads | 30M | 1M | 2M | 0.5M | 5M |

每个对手 1-2 行说明：

- **Koa**：Express 同作者反思之作，async/await + ctx，但 "极简" 反需装 plugin
- **Fastify**：schema-first + JSON Schema，性能 3x Express
- **Hono**：边缘 runtime first（Cloudflare Worker / Bun / Deno），Bundle 极小
- **NestJS**：Angular 风格 decorator 框架，企业级 + 模块化，但学习陡

## Layer 5 — 6 维评分

| 维度 | Express | Koa | Fastify | Hono |
|---|---|---|---|---|
| async 友好 | 6（v5） | 9 | 10 | 10 |
| 性能 | 5 | 6 | 9 | 9 |
| 边缘 runtime | 0 | 0 | 0 | 10 |
| 生态 | 10 | 6 | 7 | 4 |
| 学习曲线（易） | 9 | 6 | 7 | 8 |
| TypeScript | 5（@types） | 6 | 9 | 10 |
| 总分 | 35 | 33 | 42 | 51 |

Express 在生态上仍是 #1，但综合分数已被 Hono / Fastify 反超。

## Layer 6 — 限制

1. **v5 拖了 10 年**：v4 → v5 升级 path-to-regexp 是 breaking，async 行为也变。企业升级压力大
2. **`(req, res, next)` 签名笨拙**：async/await 时代显得 outdated
3. **性能瓶颈**：高 QPS 场景被 Fastify 3x 击败
4. **无边缘 runtime 支持**：Cloudflare Worker / Bun / Deno 都无 Express 适配
5. **错误处理双轨**：同步 throw 自动，异步 Promise reject 手动 next(err)（v4），坑多
6. **HTTP/2 / WebSocket 弱**：v5 才加，且不如 Fastify / hono

## 怀疑总集

> 怀疑：Express v5 RC 拖了 10 年才出，期间 Fastify / Hono / NestJS 都崛起。OpenJS 接管后没动力推 v5？我猜：是。Express 的"稳定 = 不动" 哲学让它失去现代化机会。

> 怀疑：weekly downloads 30M 中有多少是新项目？我猜：< 30%。教程 + 老项目 + Docker base image 占大头。新项目几乎不选 Express 了。

> 怀疑：Express 的极简哲学（核心只做 router + middleware）在 2010s 是优势，2020s 反成劣势。开箱即用的 NestJS / Fastify 让新人少写 50% 配置代码。极简 = 把复杂度推给用户。

> 怀疑：TJ Holowaychuk 2014 离场后 Express 进入"维护模式"。同期他另起的 Koa 也类似命运。一个人能否驱动一个框架的现代化？答案似乎是：no，需要团队。

## GitHub Permalinks

源码精读入口（链接示意，未实际验证 SHA）：

- Application 主类：`https://github.com/expressjs/express/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/lib/application.js`
- Router 实现：`https://github.com/expressjs/express/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/lib/router/index.js`
- Layer 路由层：`https://github.com/expressjs/express/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/lib/router/layer.js`
- Koa 对比 application.js：`https://github.com/koajs/koa/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/lib/application.js`

## Layer 7 — 实战

完整 Express + Postgres + JWT 鉴权 API 骨架：

```js
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const app = express();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

app.use(express.json());

// JWT 中间件
function authRequired(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'no token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid token' });
  }
}

// Public 登录
app.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await authenticate(email, password);
    if (!user) return res.status(401).json({ error: 'wrong creds' });
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    res.json({ token });
  } catch (err) { next(err); }
});

// Protected 资源
app.get('/me', authRequired, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// 错误处理（必须在最后）
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(3000);
```

要点：

1. authRequired 是中间件，可加在任何路由上
2. async handler 必须 try/catch + next(err)（v4）
3. 错误中间件 4 参数签名，必须最后注册
4. `req.user` 由 JWT middleware 注入（运行时扩展 req 对象）
5. Promise + try/catch 模式 v5 简化（直接 throw）

## 学到什么 + 关联

学到的 ≥ 5 条：

1. 中间件链式调度是 Web 框架的核心抽象，跨语言通用（Rack / WSGI / Connect）
2. **(req, res, next)** vs **async (ctx)** 是 callback 时代 vs async/await 时代的 API 分水岭
3. 极简核心 + 第三方插件生态在 2010s 是优势，2020s 反而是负担（重复造轮子 / 维护碎片）
4. Express 的"事实标准"地位 70% 来自先发优势 + 教程沉淀，技术上已过气
5. v5 拖 10 年说明 OpenJS 接管后社区 contributor 难协调
6. 错误处理双轨制（同步 / 异步）是 v4 的最大坑，新人易踩
7. Trie 路由（Fastify）vs 线性 stack（Express）在 1000+ 路由场景性能差距明显

关联：

- [[koa]] [[fastify]] [[hono]] —— 同领域对手
- [[axios]] [[ky]] —— HTTP 客户端
- [[zod]] —— schema 校验（与 Express 配合需第三方）
