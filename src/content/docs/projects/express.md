---
title: Express — Node.js 最经典的 Web 框架
来源: 'https://github.com/expressjs/express + expressjs.com'
日期: 2026-05-30
分类: projects
难度: 初级
---

## 是什么

Express 是 **Node.js 上的 Web 框架**，让你用几行代码就能写出一个 HTTP 服务器。日常类比：像一条工厂流水线——请求是产品，每个工位（中间件）做一件事，做完喊"下一个"，最后一个工位把产品包装好发出去。

不用 Express 时，你要直接面对 Node.js 原生 `http` 模块——只给一个 `(req, res)` 回调，路由要自己 if/else，参数要自己解析，错误处理全靠手撸。Express 把这些抽成一个统一签名：

```js
const express = require('express')
const app = express()
app.get('/hello', (req, res) => res.send('hi'))
app.listen(3000)
```

四行代码就跑起来了。这就是 Express 2010 年的爆火原因——TJ Holowaychuk 把 Ruby Sinatra 的路由 DSL + Connect 的中间件链思想移植到 Node.js，定义了之后 10 多年 Node.js 服务端的写法。

## 为什么重要

不理解 Express，下面这些事都没法解释：

- 为什么你工作的 Node.js 老项目大概率长得都像 Express（即便用的是 Koa / Nest）——它们的 API 形状是 Express 定义的
- 为什么 Koa / Fastify / Hono 这些"后辈"框架要花大段文档说明"我和 Express 的差异"——它们都是对 Express 的反思
- 为什么 `(req, res, next)` 这个三参数签名在所有 Node.js 框架里都眼熟——这是 Connect 中间件协议，Express 让它成事实标准
- 为什么 weekly downloads 30M+ 的"老古董"还没死——生态、教程、StackOverflow 答案累计太厚，新项目还在用

## 核心要点

Express 的全部精髓可以拆成 **三件事**：

1. **中间件链**：所有处理函数都是 `(req, res, next) => {}`。`next()` 把控制权交给下一个中间件；`next(err)` 跳过普通中间件直接进错误处理。类比：流水线传送带，每个工位做完按按钮放下一件。

2. **路由 = 一种特殊中间件**：`app.get(path, handler)` 相当于"只在请求路径匹配时才执行的中间件"。内部一切都是中间件 + 一个数组（router stack），按注册顺序遍历。

3. **极简核心 + 可插拔**：Express 自身只有 router + 中间件调度。body parsing / cookie / session / CORS / static 全部第三方包（body-parser / cookie-parser / cors / serve-static）。哲学：框架不要多管闲事，把选择权留给用户。

## 实践案例

### 案例 1：最小 Express app — 看懂中间件链

```js
const express = require('express')
const app = express()

app.use(express.json())                    // 中间件 1：解析 JSON body
app.use((req, res, next) => {              // 中间件 2：日志
  console.log(`${req.method} ${req.url}`)
  next()                                    // 别忘了调 next！
})

app.get('/users/:id', (req, res) => {      // 路由（也是中间件）
  res.json({ id: req.params.id })
})

app.listen(3000)
```

请求 `GET /users/42` 会依次经过 JSON 解析 → 日志 → 路由 handler → `res.json` 终结。中间件按 `app.use` 调用顺序执行，谁先注册谁先跑。

### 案例 2：自定义 logger — 体会 next() 的控制流

```js
function logger(req, res, next) {
  const start = Date.now()
  res.on('finish', () => {                  // 监听响应结束事件
    console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`)
  })
  next()                                    // 立刻放行，不等响应
}
app.use(logger)
```

这里 `next()` 在 `res.on('finish')` **之前**调——说明 logger 不阻塞流程，只是订阅了"响应完成"事件，等之后真正响应完了再打日志。

### 案例 3：async handler + 错误传递（v4 vs v5）

v4 写法（必须手动 try/catch）：

```js
app.get('/users/:id', async (req, res, next) => {
  try {
    const user = await db.find(req.params.id)
    if (!user) return res.status(404).json({ error: 'not found' })
    res.json(user)
  } catch (err) {
    next(err)                               // v4 不会自动捕获 async 错误
  }
})

app.use((err, req, res, next) => {          // 错误中间件：4 参数！
  res.status(500).json({ error: err.message })
})
```

v5 起 async 错误自动传给错误中间件，可以省略 try/catch——这是 v5 最重要的体感升级。

## 踩过的坑

1. **忘记调 `next()`**：请求挂起直到客户端超时。新人 #1 bug，老手也偶尔翻车（特别是写带条件分支的中间件时漏掉某个分支的 next）。

2. **错误中间件必须 4 参数**：`(err, req, res, next)`。少一个参数 Express 把它当普通中间件，错误被吞掉无声无息。Express 用函数 `length` 属性判断，TypeScript 没法救你。

3. **中间件顺序 matter**：`app.use(auth)` 写在 `app.use('/api', router)` 后面，则 `/api/*` 路由不走鉴权。先注册先执行，没有声明式优先级。

4. **async 在 v4 里要手动 catch**：v4 的 `(req, res, next)` 是 callback 时代设计，async 函数 throw 出去 Express 不接。要么 try/catch + next(err)，要么用 `express-async-errors` 包打补丁。v5 原生修了，但生态升级慢。

## 适用 vs 不适用场景

**适用**：

- Node.js 入门项目、教学场景——StackOverflow 答案最多
- 中小型 REST API、传统 SSR 应用、内部工具站
- 维护已有的 Express 老项目（市场上多数 Node 服务端代码）
- 需要海量第三方中间件（npm 上几千个 express- 包）

**不适用**：

- 极致性能敏感场景（粗量级：单机持续 QPS 上万且延迟预算很紧）→ 选 Fastify 或 Hono
- 需要类型安全的 RPC 风格 API → 选 NestJS / tRPC
- Edge Runtime / Cloudflare Workers → Express 依赖 Node API，跑不动；选 Hono / Itty Router
- 完整的"全栈框架体验"（路由 + ORM + 队列 + Auth）→ 选 NestJS / RedwoodJS / Next.js

## 历史小故事（可跳过）

- **2010-06**：TJ Holowaychuk 发布 Express v1，灵感来自 Ruby Sinatra（路由 DSL）+ Connect（中间件链）
- **2012**：v3 发布，引入 view engine、把 Connect 内置中间件直接打包
- **2014**：v4 拆出 router 子包、移除 Connect 内置中间件（推 body-parser 等独立包）；同年 TJ 把项目交给 StrongLoop / IBM，自己离场
- **2016**：项目移交给 OpenJS Foundation TSC 集体维护
- **2024**：v5 RC；随后 v5 稳定版落地——原生 async 错误处理、更严格的 path-to-regexp、移除若干废弃 API
- 这是个"技术过气但生态不灭"的范例，类比 jQuery 之于前端

## 学到什么

1. **中间件 = 抽象成一个统一签名的函数管线**，是 web 框架最普适的设计模式（Rack / WSGI / Connect / Express / Koa 都是这个思想的不同投影）
2. **极简核心 + 第三方插件** 是开源项目活 10 年的关键——核心稳定不动，扩展全交给生态
3. **API 形状会绑架后续 10 年**：Express 的 `(req, res, next)` 签名一锁，整个 Node.js 生态被它定型
4. 看不懂中间件链就读不懂任何 Node.js 后端代码，这是入行的最低门槛

## 延伸阅读

- 官方文档：[expressjs.com](https://expressjs.com)（最简洁的 web 框架文档之一）
- 源码：[expressjs/express](https://github.com/expressjs/express)，整个项目不到 5000 行 JS，一周读完
- 视频：[TJ Holowaychuk 早期 Express demo](https://www.youtube.com/results?search_query=tj+holowaychuk+express)（看 2011 年作者本人怎么讲）
- [[koa]] —— TJ 自己写的 Express 后继者，async-first
- [[fastify]] —— Express 的高性能替代品，schema 驱动
- [[sinatra]] —— Express 的 Ruby 鼻祖

## 关联

- [[koa]] —— 同一作者的下一代框架，用 generator/async 替代 callback
- [[fastify]] —— Trie 路由 + JSON schema JIT，throughput 是 Express 的 ~3 倍
- [[hono]] —— Edge Runtime 时代的 Express，跨 Cloudflare/Deno/Bun
- [[sinatra]] —— Ruby 路由 DSL 鼻祖，Express 直接借鉴
- [[nestjs]] —— 基于 Express（默认）的 TypeScript 全栈框架，加装饰器和 DI
- [[fastapi]] —— Python 的 Express 等价物（路由 + 中间件 + ASGI）
- [[axum]] —— Rust 的"中间件 + 路由"框架，Tower service 思想

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

