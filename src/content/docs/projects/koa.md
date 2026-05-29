---
title: Koa async/await + ctx 对象 + 洋葱模型 极简 web 框架
来源: https://github.com/koajs/koa + koajs.com 官方文档
season: 27
episode: S27-3
---

# Koa — async/await + ctx 对象 + 洋葱模型 的极简 web 框架

## 一句话总结（≥ 14 行）

Koa 是 TJ Holowaychuk（Express 同作者）2013 年起在 koajs 组织下开源的 Node.js web 框架。它选了一条与 Express 完全相反的设计路线：**极简核心 + 中间件洋葱模型 + 单一 ctx 对象**——不内置 router、不内置 body-parser、不内置任何 view engine，整个 core 不到 600 行 JS，所有功能由 plugin 拼出来。

Koa 1.x 用 ES6 generators（2014）演示中间件控制流；Koa 2.x（2017+）改用 async/await，把 generator 那套 yield 变成自然的 try/finally。weekly downloads ~1M（2024），GitHub stars ~35k，仍是 Node.js web 框架长青之一，但定位逐渐被 Fastify / Hono / Elysia 等"既极简又高性能"的新一代分流。

设计哲学三个支柱：

1. **极简核心**：core 只负责 ctx/req/res 包装、中间件链编排、错误冒泡。router、body-parser、static serve、CORS 等全是独立 npm 包（`@koa/router`、`koa-bodyparser`、`koa-static`、`@koa/cors`）。
2. **洋葱模型中间件**：每个中间件是 `async (ctx, next) => { /* 上游 */ await next(); /* 下游 */ }`。`await next()` 之前是请求进入路径，之后是响应回流路径——同一个函数包住两个方向，try/catch 一处覆盖整链。
3. **ctx 取代 (req, res, next)**：Express 把 Node 原生 `req` / `res` 直接暴露给中间件；Koa 用一个 `ctx` 对象包装两者，提供 `ctx.body` `ctx.status` `ctx.set()` `ctx.throw()` 这套更高层的 API，同时 `ctx.request` `ctx.response` 仍能拿到底层。

关键差别（vs Express / Fastify / Hapi / Hono）：

- **Express**：2010 年同作者作品，无 await 概念，错误用 `next(err)` 显式传，回调风格 baggage 残留。
- **Koa**：2013 起用 generators，2017 改 async/await——把"中间件链异步控制流"这个问题从 callback hell 解出来。
- **Fastify**：2017 起，schema-first + plugin encapsulation + 编译期优化，比 Koa 快 ~2x。
- **Hapi**：2014 起，自带 router / validation / cache，重量级"配置驱动"，与 Koa 的"组合式"哲学相反。
- **Hono**：2022 起，TS-first + Edge runtime，bundle ~50KB，Koa 哲学的现代化重写。
- **Koa**：站在"Express 同源" + "新一代框架"中间，2013-2018 是它的高光期，2024 看更像"教学典范"而非"主力生产工具"。

支持运行环境：Node.js ≥ 18（v3 起），Deno 兼容（社区移植），Bun 直接跑（v2 起）。

## Layer 0 — 项目档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `koa` |
| 当前主版本 | v2.15.x（stable，长期维护）/ v3.x alpha（重写中） |
| 首版 | 2013-08 / v0.x（generators 时代起步） |
| License | MIT |
| 主仓库 | koajs/koa |
| 子仓库 | koajs/router（@koa/router）/ koajs/compose（中间件 dispatch 核心） |
| 维护 | TJ Holowaychuk（@tj，逐步退出）+ Jonathan Ong（@jonathanong）+ Imed Jaberi（@3imed-jaberi）+ contributors 250+ |
| Node 要求 | ≥ 18（v2 后期） |
| TypeScript 支持 | 中（`@types/koa` 社区维护，非官方一等） |
| 核心依赖 | koa-compose / koa-convert / accepts / content-disposition / content-type / cookies / debug / depd / destroy / encodeurl / escape-html / fresh / http-assert / http-errors / is-generator-function / koa-is-json / on-finished / only / parseurl / statuses / type-is / vary |
| Bundle | core ~50KB（极小） |
| 路由匹配 | 不内置；@koa/router 用 path-to-regexp（线性遍历） |
| Validator | 不内置 |
| Serializer | 不内置（默认 JSON.stringify） |
| Logger | 不内置（建议 koa-logger / pino） |
| 性能 | ~18-22k req/s（hello world，autocannon） |
| Weekly downloads | ~1M |
| GitHub stars | ~35k |
| 中间件数量 | ~600 行 core / koa-compose ~50 行 dispatch |
| Plugin 体系 | 无 encapsulation；纯函数式中间件 |
| 杀手特性 | 洋葱模型 + ctx 单一对象 + async/await 原生 |
| 同辈 | Express / Fastify / Hapi / Hono / Elysia |
| 商业版 | 无 |
| 文档站 | koajs.com（社区维护，长期未大改） |

## Layer 1 — 核心抽象（≥ 30 行）

最小可运行例：

```ts
import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';

const app = new Koa();
const router = new Router();

// 1. 全局中间件（洋葱模型最外层）
app.use(async (ctx, next) => {
  const start = Date.now();
  try {
    await next();              // 把控制权交给下游
  } catch (err) {
    // 任何下游中间件 throw 都会冒泡到这里
    ctx.status = (err as any).status || 500;
    ctx.body = { ok: false, message: (err as Error).message };
    ctx.app.emit('error', err, ctx);
  }
  const ms = Date.now() - start;
  ctx.set('X-Response-Time', `${ms}ms`);   // 下游 return 后回流到这里执行
});

// 2. body 解析（必须显式 register，core 不自带）
app.use(bodyParser());

// 3. 业务中间件
router.post('/users', async (ctx) => {
  const { name, email } = ctx.request.body as { name: string; email: string };
  if (!name || !email) ctx.throw(400, 'name and email required');
  const user = await db.user.insert({ name, email });
  ctx.status = 201;
  ctx.body = user;     // 直接赋值；Koa 在 response phase 自动 JSON.stringify
});

router.get('/users/:id', async (ctx) => {
  const u = await db.user.findById(ctx.params.id);
  if (!u) ctx.throw(404, 'user not found');
  ctx.body = u;
});

// 4. 挂载 router 到 app（router 是独立 npm 包）
app.use(router.routes()).use(router.allowedMethods());

// 5. error event（应用级 fallback）
app.on('error', (err, ctx) => {
  console.error('server error', err, ctx?.url);
});

app.listen(3000);
```

要点（每条都有"为什么这么设计"）：

1. `new Koa()` —— core 只构造一个 application 实例，**不带任何 router / parser**。这种"什么都没有"的初始状态是 Koa 极简哲学的入口。
2. `app.use(async (ctx, next) => ...)` —— 中间件签名是 `(ctx, next)` 而非 Express 的 `(req, res, next)`。`ctx` 包装了 req/res 并提供高层 API，`next` 是 `() => Promise<void>` 把控制交下游。
3. `await next()` —— **核心机制**。await 之前是上游（请求进入），await 之后是下游（响应回流）。同一个函数自然地处理两个方向，无需写两个 hook。
4. `try { await next() } catch` —— **错误统一冒泡**。下游任意中间件 throw，都会沿洋葱回流冒到这里。Express 的 `next(err)` 显式传错被这里的 try/catch 取代。
5. `ctx.body = user` —— 直接赋值即可，Koa 在 response phase 检测类型（string / Buffer / Stream / object）后选合适的序列化策略。这是和 Express `res.send()` 命令式写法的核心差别。
6. `ctx.throw(404, 'user not found')` —— 抛 http-errors 错误；会被上游 try/catch 捕获，转成对应 status + body。
7. `app.use(router.routes())` —— router 是独立中间件，挂回 app 上。`router.allowedMethods()` 自动处理 `OPTIONS` / 405 / 501。
8. `app.on('error', ...)` —— 应用级错误事件。中间件未捕获的错误最终冒到这里——是日志 / 告警的兜底点。

## Layer 2 — 内部架构（≥ 25 行）

Koa core 由四个文件构成（lib/）：

```
┌──────────────────────────────────────────────────────────────┐
│ User code: app.use / router / ctx.body / ctx.throw          │
├──────────────────────────────────────────────────────────────┤
│ lib/application.js  (~400 LoC)                               │
│   - class Application extends EventEmitter                  │
│   - .use(fn) → push 进 this.middleware[]                    │
│   - .listen() → http.createServer(this.callback())          │
│   - .callback() → 返回 (req, res) => handleRequest(...)     │
├──────────────────────────────────────────────────────────────┤
│ koa-compose  (~50 LoC, 独立包 koajs/compose)                 │
│   - 把 middleware[] 编译成单个 dispatch 函数                  │
│   - 实现洋葱模型: 每个 mw 调用 next() 进入 i+1 层            │
├──────────────────────────────────────────────────────────────┤
│ lib/context.js / request.js / response.js                    │
│   - ctx 是 Object.create(prototype) 出的对象                 │
│   - getter/setter 代理 req / res                            │
│   - ctx.req / ctx.res 是 Node 原生对象                      │
└──────────────────────────────────────────────────────────────┘
```

关键内部机制：

1. **koa-compose 是洋葱模型的核心**：把 `[mw1, mw2, mw3]` 数组编译成一个 dispatch 函数。dispatch(0) 调 mw1；mw1 内部 `await next()` 触发 dispatch(1) 调 mw2；以此类推。dispatch 内部用 `Promise.resolve().then(...)` 衔接，让每个 await 都不阻塞 event loop。
2. **dispatch 防多调用**：`koa-compose` 的 dispatch 用一个 `index` 变量记录已分发位置。如果某个中间件调用 next() 两次，第二次会 reject `Error: next() called multiple times`——这是 koa-compose 唯一的 sanity check。
3. **ctx 对象的构造**：每个 request 进来 `Object.create(this.context)`，然后 `ctx.request = Object.create(this.request)`，`ctx.response = Object.create(this.response)`。**用原型链，不是 new + class**——这是 Koa 老派 JS 风格。每个 request 创建对象有 GC 压力，但 v2 没像 Fastify 那样做对象池。
4. **error 冒泡 = Promise reject**：洋葱模型的错误处理本质是"任意 mw 抛错 → 当前 await next() reject → 上游 try/catch 捕获 → 一直冒泡到 application.callback() 的 onerror"。所以 Koa 错误处理不是显式 chain，而是 Promise rejection 的自然链。
5. **response 写出时机**：所有中间件跑完后，application 检查 `ctx.body`：是 string / Buffer / Stream / object 分别走不同 `res.end()` 路径。这一段在 application.js `respond()` 函数里，~80 行覆盖所有 body 类型的发送逻辑。

![Koa 中间件洋葱模型对比 Express 单向链](/projects/koa/01-onion-model.webp)

图：左侧 Express 单向链——logger → bodyParser → auth → handler → res.send()，每步 next() 推进，res.send() 之后无统一回流。右侧 Koa 洋葱模型——同一组件名（logger / auth / bodyParser / router）以 IN / OUT 双向出现：上游进入是请求路径，await next() 后下游执行 handler，再沿原路 OUT 回流，外层 try/catch 一处覆盖全链错误。

## Layer 3 — 精读 3 段（≥ 50 行）

### 段 a — koa-compose: 50 行实现洋葱模型

链接：`https://github.com/koajs/compose/blob/9a2a426b32c614835b812ecb8de5af06c6c87f6f/index.js`

整个 Koa 中间件机制最核心的代码不到 50 行，在独立 npm 包 `koa-compose`：

```js
function compose(middleware) {
  if (!Array.isArray(middleware)) throw new TypeError('Middleware stack must be an array!');
  for (const fn of middleware) {
    if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!');
  }

  return function (context, next) {
    let index = -1;
    return dispatch(0);
    function dispatch(i) {
      if (i <= index) return Promise.reject(new Error('next() called multiple times'));
      index = i;
      let fn = middleware[i];
      if (i === middleware.length) fn = next;
      if (!fn) return Promise.resolve();
      try {
        return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }
  };
}
```

工作机制拆解：

1. **`dispatch(i)` 是 driver**：外部调 `dispatch(0)` 启动；它调用 `middleware[0]`，把 `dispatch.bind(null, 1)` 作为 `next` 参数传给中间件。中间件内部 `await next()` 实际上是 `await dispatch(1)`——递归往下。
2. **每层 await next() = 递归调下一层**：mw0 等 mw1 等 mw2 等 ... 等 mwN 完成。一旦最深层 return，Promise 链开始 resolve，从内向外回流——这就是洋葱模型 OUT 阶段。
3. **`if (i <= index)` 防多调用**：变量 `index` 记录已分发位置。某中间件调 next() 两次，第二次 i = 上一次同样值 → 进入 reject 分支。这是 koa-compose 唯一的"防御式编程"。
4. **`Promise.resolve(fn(...))` 包装**：兼容中间件返回值是 sync / async / Promise / undefined 任一种。无论是不是 async fn，都被包成 Promise——这让外层可以一致地 await。
5. **`fn = middleware[i]` 越界处理**：当 i === middleware.length 时 fn 是 outer next（应用级 next，通常 undefined）；fn falsy 时 return resolve，链结束。

效果对比，假设 3 个中间件：

```js
async function mw1(ctx, next) { console.log('1 in');  await next(); console.log('1 out'); }
async function mw2(ctx, next) { console.log('2 in');  await next(); console.log('2 out'); }
async function mw3(ctx, next) { console.log('3 in');  ctx.body = 'ok';                   }
// compose([mw1, mw2, mw3])(ctx) 输出:
// 1 in
// 2 in
// 3 in
// 2 out
// 1 out
```

一进一出对称——这是"洋葱模型"名字的由来。

为什么这件事重要：

1. **错误处理统一**：mw3 抛错，mw2 的 `await next()` reject，mw2 自己也抛；mw1 的 try/catch 一次捕获即可处理全链错误。Express 的 `next(err)` 必须每个 mw 显式调，漏一个就跳过 errorHandler。
2. **资源清理自然**：mw1 上游创建 transaction，下游 commit / rollback 写在 await next() 之后，配合 try/catch 写出对称的 finally——比 Express 的 `res.on('finish', ...)` 异步事件更直观。
3. **中间件可独立测试**：每个 mw 是 `(ctx, next) => Promise<void>`，纯函数无副作用；测试时构造 fake ctx + fake next 即可。Express 的 `(req, res, next)` 测试要 mock res 的所有方法（status / send / json / ...）。

> 怀疑：50 行代码实现洋葱模型很优雅，但生产里大家发现"中间件链可以无限嵌套"反而成噪音。20 个中间件叠起来，await next() 嵌套深度 20，stack trace 全是 dispatch / dispatch / dispatch——debug 困难。Fastify 的固定 8 个 lifecycle hook 反而更清晰，每个阶段语义明确。Koa "纯函数式" vs Fastify "结构化"——前者优雅但易乱。

### 段 b — ctx 对象 vs Express (req, res, next) 三参数

链接：`https://github.com/koajs/koa/blob/480a4f064a4e8edb9e09be39355b3228ae4f4f9e/lib/application.js`

Express 中间件签名：`(req, res, next) => void`；req / res 直接是 Node http 模块的 `IncomingMessage` / `ServerResponse` 对象。Koa 包装了这两者，引入 `ctx`：

```ts
interface Context {
  // 直达 Node 原生
  req: IncomingMessage;
  res: ServerResponse;

  // Koa 包装
  request: Request;     // 包装 req
  response: Response;   // 包装 res
  app: Application;
  state: Record<string, any>;   // 用户自定义存放（per-request）

  // 高频 getter/setter（代理到 request / response）
  url: string;          // = ctx.request.url
  method: string;       // = ctx.request.method
  headers: object;      // = ctx.request.headers
  query: object;        // 解析后的 query
  body: any;            // setter: 自动判断 string/Buffer/Stream/Object → 选序列化策略
  status: number;       // setter: 200 / 404 / ...
  type: string;         // = ctx.response.type，自动设 Content-Type

  // 工具方法
  throw(status: number, message?: string): never;   // 抛 http-errors
  assert(value: any, status: number, msg?: string): void;
  set(name: string, value: string): void;
  redirect(url: string): void;
}
```

为什么用 ctx 包装而不是直接传 req / res：

1. **统一接口层**：`ctx.body = user` 比 `res.json(user)` / `res.send(JSON.stringify(user))` 更声明式。Koa 不要求中间件知道 "底层用 res.end 还是 res.json"——只赋值，application 在最后 respond() 阶段决定。
2. **per-request 状态容器**：`ctx.state` 是给中间件挂数据的标准位置（auth 中间件挂 `ctx.state.user`，下游能拿）。Express 没有约定，大家有的挂 `req.user`，有的挂 `req.app.locals`，混乱。
3. **getter / setter 代理统一**：`ctx.url` 是 getter 代理到 `ctx.request.url`，但写起来短一截。Koa 把"高频 access"做成 ctx 顶层属性，"低频 access"沉到 ctx.request / ctx.response。
4. **Throw 友好**：`ctx.throw(400, 'bad input')` 抛一个带 status 的 http-errors 实例；上游 try/catch 一接，自动转成 400 响应。Express 抛错不带 status，要手写 `res.status(400).send(...)` 或 next(err)。

代价：

1. **抽象损耗**：每个 ctx 属性 access 都走 getter，频繁场景下有微小性能 cost。Fastify 用 request 对象池 + 直接属性访问，省掉这层。
2. **TypeScript 支持复杂**：`ctx.state` 是 `Record<string, any>`，写多了要用 `declare module 'koa'` 或自定义 `interface MyContext extends Koa.Context`。Express 的 `req.user` 同样要 `declare module 'express-serve-static-core'`，但生态成熟度远超 Koa。
3. **Stream 处理需懂内部**：`ctx.body = stream` 时 application.respond() 会 `stream.pipe(res)`，但要自己 `stream.on('error', ...)`——文档讲不清，新人遇到 stream 错误时 confused。
4. **mock 友好但也只是表面**：测试时 `ctx = { request: {...}, response: {}, throw: jest.fn() }`，结构看似简单，但实际 ctx 是 EventEmitter 子类的实例 + 原型链，深度依赖时（比如调用 `ctx.app.emit(...)`）容易暴露 mock 不全。

> 怀疑：Koa 把 (req, res, next) 包装成 ctx，看似清晰其实增加一层间接性。Express 直接给原生 req/res，新人入门"我能控制 res，因为 res 就是 Node 标准对象"——心智负担更低。Koa 的 ctx 抽象在 2013 年是 forward-thinking，但 2024 年看：Hono 用 `c.json()` `c.text()` 这种**方法式**而非**赋值式**，比 Koa `ctx.body = ...` 更明确"我现在要响应"。Koa 的赋值式 API 让"什么时候真正发响应"在代码里看不到。

### 段 c — application.callback / handleRequest 的写出时机

链接：`https://github.com/koajs/koa/blob/480a4f064a4e8edb9e09be39355b3228ae4f4f9e/lib/application.js`

Koa application 的核心方法 `callback()` 返回一个 `(req, res) => void` 函数，给 `http.createServer()` 用：

```js
callback() {
  const fn = compose(this.middleware);
  if (!this.listenerCount('error')) this.on('error', this.onerror);
  const handleRequest = (req, res) => {
    const ctx = this.createContext(req, res);
    return this.handleRequest(ctx, fn);
  };
  return handleRequest;
}

handleRequest(ctx, fnMiddleware) {
  const res = ctx.res;
  res.statusCode = 404;                      // 默认 404，下游可改
  const onerror = err => ctx.onerror(err);
  const handleResponse = () => respond(ctx); // 真正写 socket 的地方
  onFinished(res, onerror);                  // res finish 事件兜底
  return fnMiddleware(ctx).then(handleResponse).catch(onerror);
}
```

`respond(ctx)` 是 ~80 行的写出逻辑（伪码）：

```js
function respond(ctx) {
  if (!ctx.writable) return;
  const res = ctx.res;
  let body = ctx.body;
  const code = ctx.status;

  // 1. 204/304/HEAD 等无 body 状态
  if (statuses.empty[code]) {
    ctx.body = null;
    return res.end();
  }
  // 2. HEAD 只发 header
  if (ctx.method === 'HEAD') { /* 设 length，不发 body */ return res.end(); }
  // 3. body == null
  if (body == null) { /* 自动设 text body 为 status text */ return res.end(body); }
  // 4. body 是 Buffer / string
  if (Buffer.isBuffer(body)) return res.end(body);
  if (typeof body === 'string') return res.end(body);
  // 5. body 是 Stream
  if (body instanceof Stream) return body.pipe(res);
  // 6. body 是 object → JSON.stringify
  body = JSON.stringify(body);
  if (!res.headersSent) ctx.length = Buffer.byteLength(body);
  res.end(body);
}
```

要点：

1. **res.statusCode = 404 默认值**：进入中间件链前先设 404，让"没人 set status / body"的请求自动是 404。这是 Koa 极简的体现——core 替你处理"完全空的请求"。
2. **respond() 在中间件链全部完成后才执行**：handleRequest 中 `fnMiddleware(ctx).then(handleResponse)`——所有 mw await 完，最后才进 respond。这意味着在中间件里赋值 `ctx.body = ...` 不立即写 socket，而是等 respond 阶段统一处理。
3. **Stream body 是 `body.pipe(res)`**：流式响应不需要手动调 res.write；Koa 帮你 pipe。但 stream error 要中间件自己 `body.on('error', ctx.onerror)`——这个坑文档隐晦。
4. **JSON.stringify 是默认 serializer**：没有 fast-json-stringify 这种编译期优化。性能瓶颈在大 payload 序列化时显著，Koa benchmark ~18-22k req/s 主要被这一步拖累。
5. **ctx.writable 检查**：response 已 close（客户端断开 / 提前发完）时跳过 respond。避免向已关闭的 socket 写。

> 怀疑：respond() 把所有 body 类型分支放在 80 行里，看似全面但每条 branch 是 if-else 走通用 path，无 type 编译优化。Fastify 用 schema 编译出 stringify(fn) 直接调；Koa 还在判断 `Buffer.isBuffer(body)`——这种通用化是性能损失的直接来源。Koa "极简核心"在 2013 年是优势（小、可读），但代价是无法做"为特定 schema 生成代码"这类编译期优化。是不是哲学正确，但工程上输给 Fastify？

## Layer 4 — 与 Express / Fastify / Hapi / Hono / Elysia 对比

| 维度 | Koa | Express | Fastify | Hapi | Hono | Elysia |
|---|---|---|---|---|---|---|
| 出现年份 | 2013 | 2010 | 2017 | 2014 | 2022 | 2023 |
| 同作者 | TJ（Express 同作者） | TJ（早期）| 否 | Eran Hammer | 否 | 否 |
| 核心抽象 | 洋葱中间件 + ctx | 中间件链 + req/res | Plugin tree + schema | 配置驱动 + plugin | Handler chain + ctx (`c`) | Handler chain + ctx |
| async/await 原生 | **是**（v2+） | 否（callback） | **是** | 是 | **是** | **是** |
| Schema 优先 | 否 | 否 | **是**（JSON Schema） | 是（Joi） | **是**（zod） | **是**（自带 t.Object） |
| 路由 | 不内置（@koa/router） | 内置 | 内置（radix tree） | 内置 | 内置（radix tree） | 内置（radix tree） |
| 中间件签名 | `(ctx, next) => Promise` | `(req, res, next) => void` | hook 8 段 | `request lifecycle` | `(c) => Response` | `(c) => Response` |
| 性能（hello world） | ~18-22k req/s | ~10k | ~30k | ~12k | ~50k+（Edge） | ~50k+（Bun） |
| TypeScript 一等 | 中（社区 types） | 弱 | 中 | 中 | **强** | **强** |
| Bundle | ~50KB | ~600KB | ~600KB | ~1MB | ~50KB | ~100KB |
| Plugin 隔离 | 无 | 无 | encapsulation | 无（全局 plugin） | 无 | 无 |
| Weekly downloads | ~1M | ~30M | ~3M | ~400k | ~500k | ~50k |
| 维护节奏 | 慢（v3 alpha 多年） | 慢（10.x 慢慢出） | 活跃 | 慢 | 活跃 | 活跃 |

观察：

1. **Koa 的 "极简核心 + 洋葱模型" 哲学被 Hono 继承并 TS 化**。Hono 的 `c.json()` `c.html()` 几乎是 Koa `ctx.body = ...` 的方法版。
2. **Express 同源 + 哲学相反**：TJ 同作者，但 Koa 拒绝 Express 的"内置一切"路线。这是设计反思的产物，不是无关项目。
3. **Fastify 是 Koa 的"加 schema 加 encapsulation 加性能"版**：和 Koa 站在相反的"重核心"那端。
4. **Hapi 是另一极端**：Eran Hammer 当年 fork OAuth 标准的人，框架风格也是"配置驱动"，与 Koa 的"组合式"针锋相对。

## Layer 5 — 6 维对比

| 维度 | Koa | Express | Fastify | Hono | Elysia |
|---|---|---|---|---|---|
| 性能 | 中 | 低 | 高 | **极高**（Edge） | **极高**（Bun） |
| DX | 中（极简但要装东西） | 高（开箱即用） | 中（schema 繁琐） | 高（c. API） | 高（自带 schema） |
| TS 体验 | 中（社区） | 弱 | 中 | **强** | **强** |
| 生态 | 中（@koa/* + 一堆社区） | **巨大**（10 年沉淀） | 大（200+ plugin） | 中 | 小 |
| 学习曲线 | **低**（核心 600 LoC） | **低** | 中 | 低 | 低 |
| 创新性 | 高（2013 年的 forward-thinking） | 历史遗产 | 高（schema-first） | 高（Edge-first） | 高（Bun-first） |

## Layer 6 — 限制 ≥ 4

1. **核心极简反成入门负担**：开箱什么都没有——要做 REST API 至少装 `@koa/router` + `koa-bodyparser` + `@koa/cors` + `koa-helmet` + `koa-static`。每个包的版本兼容、维护质量、配置风格都要单独学。Express 一行 `express()` 就能起；Koa 要拼 5-10 个包。"极简"在哲学上正确，在新人体验上反成负担。
2. **TypeScript 支持是二等公民**：`@types/koa` 由 DefinitelyTyped 社区维护，不是 koajs 官方一等。`ctx.state` 类型扩展靠 `declare module`；`Application<StateT, CustomT>` 双泛型嵌套深；router 的 params / query 类型推不出来。Hono 把"schema 一写 TS 类型自动推"做成默认；Koa 远没到这步。
3. **维护节奏放缓**：v3 alpha 在 koajs/koa 仓库里挂了好几年（2019 起），主要差别是 ESM 优先 + 部分 API 调整，但稳定版迟迟没出。TJ Holowaychuk 多年没活跃 commit，社区 maintainer 接手但节奏不快。Fastify / Hono 在同一时间快速迭代——Koa 在新一代框架竞争里失速。
4. **错误处理"洋葱式"听起来美但调试难**：上游 try/catch 一处覆盖很优雅，但当 50 个中间件层叠时，stack trace 全是 dispatch → dispatch → dispatch，找不到具体哪个中间件抛的错。`Error.captureStackTrace` 在 koa-compose 里没特殊处理；prod 环境定位异常代价高。
5. **plugin 生态参差**：`@koa/router` 是官方 router，但仍是线性遍历（path-to-regexp），不是 radix tree——新增路由数线性影响匹配性能。社区路由如 `koa-tree-router` 用 radix 但维护一般。同样的"参差"在 body-parser（`koa-bodyparser` vs `koa-body` vs `@koa/multer`）也存在。
6. **bus factor 由 maintainer 数量补救但不解决根因**：TJ 退场后是 Jonathan Ong + Imed Jaberi 等 contributor 维护；250+ contributor 看起来多，但核心决策（major release / 大改 API）需要 BDFL 角色，缺位时进度卡死。v3 卡在 alpha 多年的根因正是"决策瓶颈"。
7. **Stream body 错误处理隐晦**：`ctx.body = stream` 时 stream 出错不会自动冒到 ctx.onerror，要自己 `stream.on('error', ctx.onerror)`。文档讲了但隐藏在角落，新人第一次踩到 stream 错误时连"socket hang up"原因都看不到。
8. **生态被 Express 兼容层稀释**：很多 Koa 中间件实际是 Express 中间件用 `koa-connect` 或 `koa2-connect` 适配的。这种"借 Express 中间件"实际上违反洋葱模型语义——Express 中间件 `(req, res, next)` 在 Koa 里跑时 next 行为微妙不同。"兼容性"换来"语义混乱"。

## 怀疑总集

1. Koa "极简核心"反而需要装 10 个 plugin 才能用——`@koa/router`、`koa-bodyparser`、`@koa/cors`、`koa-helmet`、`koa-static`、`koa-session`、`koa-logger`...每个包独立维护、版本独立升级、配置风格各异。"极简"是对核心说的，对用户其实是"组装负担"。Express 一站式开箱即用反而对新人友好。
2. async/await 时代 Koa 的优势被 Fastify / Hono / Elysia 抹平。当年（2013）generators 是 Koa 的杀手锏，2017 改 async/await 之后，Express 也在 wrapper 里支持了 async（async-express、express-async-errors），新一代 Hono / Elysia 直接 async 原生 + 性能更高。Koa 的"async 中间件"独占性消失。
3. TJ Holowaychuk 离场后 Koa 维护节奏放缓——v3 alpha 卡了好几年没出稳定版。BDFL 模式在框架成熟期是优势（决策快），衰退期是瓶颈（无人拍板）。Fastify 双核心 maintainer + 商业化（Platformatic）的模式更可持续。
4. ctx 抽象在 2013 年是 forward-thinking，但 2024 年看是不是已被超越？Hono 用 `c.json()` `c.html()` 这种方法式 API，比 Koa `ctx.body = ...` 更明确"现在要响应"。Koa 的赋值式 API 让"什么时候真正发响应"在代码里看不到——延迟到 respond() 阶段才统一处理，调试 response 时机困难。
5. 洋葱模型对称很优雅，但生产里 50+ 中间件叠起来 stack trace 一片 dispatch / dispatch / dispatch，调试地狱。Fastify 8 段固定 lifecycle hook 反而清晰：每段语义明确，错误定位快。Koa 的"无结构"在小项目优雅，在大项目反成噪音。
6. Koa 性能 ~18-22k req/s 比 Express 的 ~10k 快 2x 是事实，但 Fastify ~30k 又比 Koa 快 1.5x，Hono on Bun ~50k+ 直接领先一个数量级。Koa 站在"中间地带"——不够极简（Hono 50KB bundle），不够高性能（Fastify schema-first），不够 TS-first（Elysia）。每个维度都被新一代超越。
7. Koa 不内置 router 的哲学决策——"router 不是 framework 责任"。但实际项目 100% 都装 @koa/router；这种"硬要让用户做选择"是不是教条？Express 内置 router 让 99% 用户开箱即用，剩 1% 高级用户还能 `app.use(...)` 装自己的路由——同时满足两种人。
8. koa-compose 50 行实现洋葱很优雅，是教学典范，但生产里"中间件链可以无限嵌套"反而成 footgun。每一层都付出 Promise resolve / await 微开销，性能不如 Fastify 的 hook 数组直接遍历。优雅 vs 性能的取舍在 Koa 选了优雅。
9. Koa 的 ctx 状态容器（`ctx.state`）没有类型约束——`ctx.state.user = ...` 在 TS 里类型是 `any`。要类型安全必须 `declare module 'koa' { interface Context { state: { user?: User } } }`，但这破坏了"per-request 不同 mw 挂不同 state"的灵活性。Fastify 用 decorator + 装饰器风格反而更类型友好。
10. Koa 文档站（koajs.com）多年未大改，新一代框架（Hono / Elysia / Fastify）文档都在交互式 playground / 类型推导演示这一层卷。Koa 文档还停留在"列出所有 API + 简单 example" 的 2013 年水平。文档体验直接影响新人留存。
11. Koa Stream 支持是核心特性（`ctx.body = readableStream` 自动 pipe），但 stream error 处理 / backpressure 在文档里只是一句话。生产里大文件下载、SSE 流式响应踩坑很多，靠社区博客和 stackoverflow 攒经验——这种"核心特性二等公民对待"是 Koa 文档常态。
12. `koa-compose` 是独立包但只 koa 在用——意味着这 50 行代码 = Koa 的核心抽象 = 没有别人复用。Fastify 的 AVVIO（plugin loader）虽然也是配套包，但理论上能独立用在任何 plugin-heavy 应用。Koa 的"模块化"看起来彻底但实际不被别人用。

## GitHub permalinks（40-char hex）

1. `https://github.com/koajs/koa/blob/480a4f064a4e8edb9e09be39355b3228ae4f4f9e/lib/application.js` —— Koa 主入口，class Application extends EventEmitter；定义 use / listen / callback / handleRequest / respond。
2. `https://github.com/koajs/koa/blob/480a4f064a4e8edb9e09be39355b3228ae4f4f9e/lib/context.js` —— ctx 对象的原型链定义；getter/setter 代理到 request / response。
3. `https://github.com/koajs/koa/blob/480a4f064a4e8edb9e09be39355b3228ae4f4f9e/lib/request.js` —— Request 包装；提供 query / headers / ip / accepts 等高层 getter。
4. `https://github.com/koajs/koa/blob/480a4f064a4e8edb9e09be39355b3228ae4f4f9e/lib/response.js` —— Response 包装；body / status / type setter，负责 body 类型路由。
5. `https://github.com/koajs/compose/blob/9a2a426b32c614835b812ecb8de5af06c6c87f6f/index.js` —— koa-compose 全部源码 ~50 行；洋葱模型 dispatch loop。
6. `https://github.com/koajs/router/blob/67fafbcaa6d546743a2beb3a898742777baca6d1/lib/router.js` —— @koa/router 核心；基于 path-to-regexp 的路由匹配。
7. `https://github.com/koajs/router/blob/67fafbcaa6d546743a2beb3a898742777baca6d1/lib/layer.js` —— Layer 类，每条路由记录的 path + method + middleware。
8. `https://github.com/expressjs/express/blob/dae209ae6559c29cfca2a1f4414c51d89ea643d5/lib/application.js` —— 对照参考，Express 的 application；`use(fn)` push 到内部 router stack；和 Koa 中间件机制根本差别在这里。

## 实战 Walkthrough（≥ 25 行）

模拟一个"博客 API：用户、文章、JWT 鉴权"的最小 Koa 服务，对照 Fastify 版本看哲学差异：

```ts
import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import jwt from 'koa-jwt';
import compose from 'koa-compose';

const app = new Koa();

// === 全局中间件 ===

// 1. 错误捕获洋葱最外层
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err: any) {
    ctx.status = err.status || 500;
    ctx.body = {
      ok: false,
      code: err.code || 'INTERNAL',
      message: ctx.status < 500 ? err.message : 'oops',
    };
    ctx.app.emit('error', err, ctx);
  }
});

// 2. 请求日志（上游记开始，下游记耗时）
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.method} ${ctx.url} - ${ctx.status} (${ms}ms)`);
});

// 3. cors / body parse（plugin 拼装）
app.use(cors({ origin: '*' }));
app.use(bodyParser());

// === 鉴权中间件（可选 path 跳过） ===
const authMW = jwt({ secret: process.env.JWT_SECRET! }).unless({
  path: [/^\/users\/signup$/, /^\/users\/login$/],
});
app.use(authMW);

// === 路由（router 是独立包） ===
const router = new Router();

// 用户注册（不需要 JWT，被 unless 跳过）
router.post('/users/signup', async (ctx) => {
  const { name, email, password } = ctx.request.body as any;
  if (!name || !email || !password) ctx.throw(400, 'missing fields');
  if (password.length < 8) ctx.throw(400, 'password too short');
  const user = await db.user.create({ name, email, passwordHash: hash(password) });
  const token = signJWT({ id: user.id });
  ctx.status = 201;
  ctx.body = { ...user, token };
});

// 用户登录
router.post('/users/login', async (ctx) => {
  const { email, password } = ctx.request.body as any;
  const user = await db.user.findByEmail(email);
  if (!user || !verifyHash(password, user.passwordHash)) ctx.throw(401, 'bad credentials');
  ctx.body = { token: signJWT({ id: user.id }) };
});

// 当前用户（需 JWT，jwt 中间件已挂 ctx.state.user）
router.get('/users/me', async (ctx) => {
  const u = await db.user.findById(ctx.state.user.id);
  if (!u) ctx.throw(404, 'user gone');
  ctx.body = u;
});

// 文章列表
router.get('/posts', async (ctx) => {
  ctx.body = await db.post.list({ limit: 50 });
});

// 创建文章
router.post('/posts', async (ctx) => {
  const { title, content } = ctx.request.body as any;
  if (!title || !content) ctx.throw(400, 'missing fields');
  const post = await db.post.create({
    title, content, authorId: ctx.state.user.id,
  });
  ctx.status = 201;
  ctx.body = post;
});

app.use(router.routes()).use(router.allowedMethods());

// === 应用级 error 兜底 ===
app.on('error', (err, ctx) => {
  // 这里挂日志 / 告警；中间件 try/catch 漏掉的或写 socket 后才报的错冒到这里
  console.error('app error:', err.message, ctx?.url);
});

app.listen(3000, () => {
  console.log('koa listening on :3000');
});
```

注意：

1. **错误中间件必须放在最外层**：洋葱模型上游 = 最外层 → 最内层；try/catch 在第一层意味着所有下游错误都能冒上来。这是 Koa 错误处理的标准模式。
2. **plugin 全部 npm 装**：cors、bodyparser、jwt、router 都是独立包。版本管理、CHANGELOG、breaking change 各自独立——大型项目升级时这是负担。
3. **`ctx.throw(400, ...)`**：抛 http-errors 实例；上游中间件 try/catch 接到，根据 err.status 设响应。比 Express 的 `next(new Error(...))` 显式得多。
4. **`ctx.state.user`**：jwt 中间件挂 user 到 state；下游 handler 直接读。这是 Koa 跨中间件共享数据的标准位置。
5. **`router.allowedMethods()`**：自动处理 OPTIONS / 405 / 501——访问 `OPTIONS /posts` 会自动返回 `Allow: GET, POST`，这是路由层的"礼貌"。
6. **`unless` 跳过路径**：jwt 中间件的常见用法——signup / login 路径跳过 token 校验。比 Fastify 的 "decorator + per-route preHandler" 灵活但不够结构化。

测试：

```bash
# 注册
curl -X POST http://localhost:3000/users/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"alice","email":"a@x.com","password":"hunter222"}'
# → 201 { id:1, name:'alice', email:'a@x.com', passwordHash:'***', token:'eyJ...' }

# 登录
curl -X POST http://localhost:3000/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@x.com","password":"hunter222"}'
# → 200 { token: 'eyJ...' }

# 鉴权失败
curl http://localhost:3000/users/me
# → 401 { ok:false, code:'INTERNAL', message:'Authentication Error' }

# 用 token
TOKEN=eyJ...
curl http://localhost:3000/users/me -H "Authorization: Bearer $TOKEN"
# → 200 { id:1, name:'alice', email:'a@x.com', ... }
```

对照 Fastify 同构服务：

1. Fastify 用 `register` + plugin scope；Koa 用 `use` + 全局栈。Koa 任意 mw 都全局生效，要"局部"需用 `compose([...])` 自己拼子链。
2. Fastify 用 schema 校验 body；Koa 用 `ctx.throw(400)` 手写校验，或装 `koa-joi-router` / `koa-swagger-decorator` 等。
3. Fastify 错误统一走 `setErrorHandler`；Koa 的洋葱最外层 try/catch 是约定俗成。
4. 性能：Fastify ~30k req/s，Koa ~18-22k——主要差距在 schema 编译 + radix tree router。

## 学到（≥ 12 行）

1. **同作者反思自己的设计是技术演进的良性信号**：TJ Holowaychuk 写 Express（2010），三年后写 Koa（2013）作为 Express 的"反面"。这种"我亲手做的东西我亲手革命掉"在 OSS 领域少见但极有价值——说明作者真的在思考问题本身，而不是抱着自己的产品不放。
2. **洋葱模型 = async/await 与中间件的自然结合**：在 Promise 时代之前，中间件链是 callback hell（`next(() => next(() => ...))`）。async/await 让 `await next()` 这一句话同时具备"递交控制" + "等待完成" 双语义——这才让洋葱模型从概念变成代码。
3. **极简核心是哲学不是产品**：Koa core 600 LoC 看起来漂亮，但用户视角是"我要装 10 个包"。"哲学正确" vs "用户体验正确" 在框架领域不总一致。Express 一站式赢在 onboarding，Koa 极简赢在思想纯洁，两者各有市场。
4. **50 行代码的复杂度承载量是有限的**：koa-compose 50 行实现洋葱模型很优雅，但任何想加 "lifecycle hook 区分 onRequest / preHandler" 的需求都要从根本改 dispatch 函数。Fastify 选了 8 段固定 hook 牺牲了"任意中间件"的自由度，换来"结构化语义"的清晰度。这是设计的权衡。
5. **ctx 抽象是 leak-free 但有性能成本**：`ctx.url` getter 代理到 `ctx.request.url`，每次 access 走原型链查找。微观看是损失，但宏观上换来"用户不需要懂 Node 原生 req/res"——这个 trade-off 在 2013 年是值得的，今天 V8 优化也基本抹平这点开销。
6. **错误冒泡 = Promise rejection 的自然链**：洋葱模型的错误处理本质是"任意层 throw → 当前 await reject → 上游 try/catch 接"。这套机制和"显式调 next(err)"在表面看都能工作，但前者更符合"语言原生"——async/await 时代的错误传播本来就该靠 try/catch + Promise rejection。Express `next(err)` 是 callback 时代残留。
7. **不内置 router 是哲学决策，不是疏忽**：TJ 在 koa README 里明确说"router 是应用层关切，不是 framework 责任"。这种"force user to choose"在小型项目是负担，在大型架构是优势——比如 GraphQL server 项目根本不用传统 router，Koa 不强加。Express 内置 router 是 onboarding 友好的选择，但锁定了"REST + RESTish" 的思维。
8. **maintainer 节奏决定框架命运**：Koa v3 alpha 卡几年没出稳定版，主要原因是 TJ 离场后没强决策者。Fastify 双核心 + 商业化（Platformatic）有持续的"必须发版"动力。OSS 框架成熟后，"维护者激励"变成第一生产力。
9. **同期框架对比 = 设计哲学对比**：Express 内置主义、Koa 极简主义、Fastify schema 主义、Hono Edge 主义、Elysia Bun 主义——每个框架都是某种"工程理念"的浓缩。看一个框架要看它"反对什么"，比看它"支持什么"信息量更大。
10. **TS 一等支持是新一代分水岭**：Koa / Express 的 `@types/*` 社区维护方式在 2024 年看是过时的；Fastify v5 把 types 并主仓库；Hono / Elysia 直接 TS 写 + 类型推导是核心卖点。"TS 友好度" 已经从加分项变成基础项。
11. **stream 是中间件框架的难点**：`ctx.body = stream` 的语义看起来简单（pipe 到 res），但 backpressure / error / range request / cancel 一堆边缘 case。Express / Koa / Fastify 各家文档都写得不够，靠社区博客攒经验。这种"核心特性文档不够" 是框架普遍现象。
12. **`koa-compose` 是教学典范**：50 行代码读完能彻底理解"中间件链异步执行"的本质。这种"小而完整"的库是学源码的最佳起点——比读 Express 1500 行 router stack / Fastify 几万行 plugin tree 更高效。
13. **plugin 命名空间约定（@koa/* vs koa-*）**：`@koa/router` 是官方维护，`koa-router` 是早期社区版本（已 deprecated 但 npm 仍在）；`@koa/cors` 是官方，`koa-cors` 是社区。新人装包要看 npm 维护者是 `koajs` org 还是个人——这种"官方 / 社区"分野在生态成熟期常见。
14. **Bun on Koa 兼容性意外好**：Koa 不依赖 Node 特定 internal API，Bun 直接跑 Koa 服务无修改。这是"极简核心"的隐性收益——少 Node 特性绑定 = 跨 runtime 兼容性更好。Fastify 因深度依赖 Node http internals，Bun 兼容性反而费劲。
15. **状态容器没类型 = TS 重灾区**：`ctx.state` 在 TS 里默认 `Record<string, any>`，挂用户 / 关联 entity 时类型完全丢失。补救方式 `interface DefaultState { user?: User }`，但跨 plugin 时 state 类型扩展要 `declare module`——这种"补丁式" TS 支持远不如 Hono 的 `Variables: { user: User }` 泛型直接传。

## 关联

- [[express]] —— TJ 同作者的上一代框架；2010 起，Koa 是它的反思版
- [[fastify]] —— 2017 起，schema-first + plugin encapsulation；Koa 的"加结构化"版本
- [[hono]] —— 2022 起，TS-first + Edge runtime；Koa 哲学的现代化重写
- [[elysia]] —— 2023 起，Bun-first + 自带 schema；新一代代表
- [[hapi]] —— 2014 起，配置驱动 + 内置 plugin；与 Koa 哲学相反
- [[nestjs-overview]] —— 重量级 DI 框架，可底层跑 Koa adapter
- [[koa-compose]] —— Koa 中间件 dispatch 的独立包，50 行教学典范
- [[koa-router]] —— @koa/router，路由独立包，path-to-regexp 实现
- [[koa-bodyparser]] —— body 解析，Koa 生态最常用 plugin
- [[ajv]] —— Koa 不内置 validator，常和 ajv / joi 搭配做请求校验
- [[zod]] —— TS-first schema 库，Koa 项目里手动校验时常用
- [[bun]] —— Koa 直接能跑 Bun，跨 runtime 兼容性优势

## 附录 A — Koa v1 (generators) vs v2 (async/await) 对照

Koa v1（2014）用 ES6 generators 写中间件：

```js
// v1 generators 风格
app.use(function* (next) {
  const start = Date.now();
  yield next;                        // 把控制权交下游
  const ms = Date.now() - start;
  this.set('X-Response-Time', ms + 'ms');   // this == ctx
});
```

Koa v2（2017+）改 async/await：

```js
// v2 async/await 风格
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();                      // await 替代 yield
  const ms = Date.now() - start;
  ctx.set('X-Response-Time', ms + 'ms');   // ctx 显式参数
});
```

差别：

1. **`this` → 显式 `ctx`**：generators 用 `this` 上下文绑定，async fn 显式传参。后者对 TS 类型推导友好。
2. **`yield next` → `await next()`**：语法等价，async/await 是 generator + Promise 的语法糖。
3. **错误处理一致**：try/catch 在 v1 / v2 都能捕获 yield / await 的异常——这是 generator 时代就有的好处。
4. **迁移成本**：v1 → v2 用 `koa-convert` 包装老中间件能跑，但官方推荐重写。生产 Koa 项目几乎都已迁 v2。

## 附录 B — Koa 与 Express 中间件互通

Koa 不能直接用 Express 中间件（签名不同），但有适配层：

```ts
import compose from 'koa-compose';
import { koaConnect } from 'koa-connect';
import morgan from 'morgan';      // Express 中间件

// 用 koa-connect 包装 Express 中间件
app.use(koaConnect(morgan('combined')));
```

注意事项：

1. **next 行为微妙**：Express 中间件调 next() 是同步进入下一个；Koa 是 await Promise。包装层用 callback shim 模拟，绝大多数情况能工作但**长链路 + 错误**有边缘 case。
2. **不能用 Express router**：Express router 调用 res.send 后链结束；Koa 期望 ctx.body 设完后中间件 return。语义不兼容。
3. **生态稀释问题**：很多"Koa 中间件"实际是 Express 中间件 + adapter——namespace 看起来 Koa 但语义是 Express。这种隐性兼容层让 Koa 生态实际上不如纸面广。

## 附录 C — Koa v3 alpha 关键变化（截至 2024）

Koa v3 在 koajs/koa 仓库挂着 alpha 版本（多年没发稳定），主要变化：

1. **ESM 优先**：`import Koa from 'koa'` 是 ES Module，CommonJS 需要 dynamic import。
2. **drop Node < 18**：去掉对老 Node 的兼容代码，core 进一步精简。
3. **`ctx.cookies` 改用 `cookies` 4.x**：底层 cookies 包升级，API 表面无大变化。
4. **types 整合**：`@types/koa` 仍然外置，没像 Fastify 那样并主仓库——TS 一等支持仍是痛点。

为什么稳定版迟迟不出？社区猜测：

1. ESM 迁移破坏性大，许多老 plugin 还是 CJS 单导出。
2. TJ 离场后无强决策者拍板"这就是 v3"。
3. 同时期 Fastify / Hono / Elysia 抢走"现代 Node web 框架"心智份额，maintainer 投入回报率下降。

## 附录 D — 学到补充（≥ 5 行）

16. **`ctx.app` 是 Application 实例**：在中间件里通过 `ctx.app.emit('error', ...)` 发应用级事件，是 Koa 错误兜底的标准模式。`ctx.app.context` 是所有 ctx 的共同原型——加全局 helper 可以挂这里。
17. **`ctx.assert` 是隐藏宝石**：`ctx.assert(user, 404, 'not found')` 等价于 `if (!user) ctx.throw(404, 'not found')`。来自 http-assert 包，写起来更简洁，适合做 invariant 检查。
18. **`koa-compose` 不止 Koa 在用**：理论上任何"async 中间件链"项目都能用，但实际生态里几乎只有 Koa 调用。`koa-compose` 是好设计，但作为通用基础设施没起来——OSS 复用不只看代码质量，还看 marketing。
19. **request 不可序列化**：`JSON.stringify(ctx)` 会爆栈或抛错（ctx 有循环引用 + EventEmitter）。日志库通常只 log `ctx.url` `ctx.method` `ctx.status`——避免整体 dump。
20. **`koa-static` 性能差**：Koa 静态文件服务用 `koa-send` / `koa-static`，性能远不如 Nginx。生产环境强烈建议反向代理（Nginx / CDN）处理静态资源，Koa 只跑动态接口。

关联补充：

- [[koa-compose]] —— 50 行洋葱模型核心，独立包但只 Koa 在用
- [[koa-router]] —— @koa/router 官方路由
- [[http-errors]] —— `ctx.throw` 抛的错误类
- [[http-assert]] —— `ctx.assert` 底层
- [[express]] —— 同作者上一代框架
- [[hono]] [[elysia]] —— 新一代 TS-first 框架
- [[fastify]] —— schema-first 高性能替代
- [[bun]] —— Koa 直接能跑的新 runtime
