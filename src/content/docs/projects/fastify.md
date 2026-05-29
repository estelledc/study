---
title: Fastify schema-first Node 高性能 web 框架
来源: https://github.com/fastify/fastify + fastify.dev 官方文档
---

# Fastify — schema-first Node.js 高性能 web 框架

## 一句话总结（≥ 14 行）

Fastify 是 Matteo Collina（Node.js Technical Steering Committee 成员，nodejs/node 核心 maintainer）和 Tomas Della Vedova 在 2017 年开源的 Node.js web 框架。它选了一条与 Express / Koa 完全相反的设计路线：**schema-first + plugin encapsulation + 编译期优化**——把 JSON Schema 抬到一等公民的位置，让 validator 和 JSON serializer 在 listen 之前就被编译成纯函数，运行期零反射零判断。

weekly downloads ~3M（2024），GitHub stars 30k+，是 Node.js 性能榜上几乎稳定的第一名（autocannon hello-world ~30k req/s vs Express ~10k vs Koa ~18k vs Hapi ~12k）。

设计哲学三个支柱：

1. **schema 先**：所有 route 强烈推荐配 JSON Schema。validator 走 Ajv，response 走 fast-json-stringify——两者都在 startup 阶段把 schema 编译成 `function(input){...}` 纯函数。运行期不再做"判断 type"那种通用反射。
2. **Plugin encapsulation**：每次 `register()` 出一个独立 scope。decorators / hooks / 子路由都被关在自己的 scope 里，不污染兄弟。这套模式把"全局 middleware 链"换成了"嵌套的 instance 树"。
3. **极致性能优先**：路由用 find-my-way（基于 radix tree）/ JSON 编解码用 fast-json-stringify / logger 用 pino——一整条链路上每个组件都是为 throughput 优化的。

关键差别（vs Express / Koa / NestJS / Hono / Elysia）：

- **Express**：2010 年的中间件抽象，无 schema 概念，validation 全靠 express-validator 这类外挂；性能 ~10k req/s。
- **Koa**：async / await 原生（async middleware），但仍是中间件链思维，无 encapsulation；性能 ~18k req/s。
- **NestJS**：Angular 风格 DI 容器 + 装饰器，可以底层跑 Fastify adapter；DX 重，性能取决于底层。
- **Hono / Elysia**：2023 起的 TypeScript-first 新秀，主打 Edge runtime + zod schema 推 TS 类型；Fastify 的 schema-first 想法被它们 TS 化。
- **Fastify**：站在"老牌 Node 生产力" 与"新一代 TS framework" 中间——比 Express 现代 5 年，比 Hono / Elysia 保守 3 年。

支持运行环境：Node.js ≥ 20（v5），有官方 deno 兼容尝试，Edge runtime 不是 Fastify 的主战场（bundle 偏大）。

## Layer 0 — 项目档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `fastify` |
| 当前主版本 | v5.x（2024，stable） |
| 首版 | 2017-04 / v0.x（社区起步），2018-08 / v1.0 |
| License | MIT |
| 主仓库 | fastify/fastify |
| 维护 | Matteo Collina（@mcollina，Node.js TSC）+ Tomas Della Vedova（@delvedor）+ 100+ contributors |
| Node 要求 | ≥ 20（v5），≥ 18（v4） |
| TypeScript 支持 | 一等（官方 `@types/fastify` 已并仓库内） |
| 核心依赖 | find-my-way / avvio / ajv / fast-json-stringify / pino / light-my-request |
| Bundle | core ~600KB（gzipped ~150KB） |
| 路由匹配 | find-my-way（radix tree） |
| Validator | Ajv（编译 JSON Schema 到 fn） |
| Serializer | fast-json-stringify（编译 schema 到 fn） |
| Logger | pino（fastify 默认内置） |
| 性能 | ~30k req/s（autocannon hello-world） |
| Weekly downloads | ~3M |
| GitHub stars | 30k+ |
| Plugin 体系 | `register()` + AVVIO 启动编排 |
| Plugin scope | 每 register 独立 encapsulation；fastify-plugin (fp) 可绕过 |
| 杀手特性 | schema-first：validator + serializer 编译期生成 |
| 同辈 | Express / Koa / Hapi / NestJS / Hono / Elysia |
| 商业版 | 无，但有 Platformatic（Matteo 的公司，基于 Fastify 的 backend platform） |
| 文档站 | fastify.dev |

## Layer 1 — 核心抽象（≥ 30 行）

最小可运行例：

```ts
import Fastify from 'fastify';

const app = Fastify({
  logger: true,        // 默认接 pino
});

// 1. 定义 route + schema
app.post('/users', {
  schema: {
    body: {
      type: 'object',
      required: ['name', 'email'],
      properties: {
        name:  { type: 'string', minLength: 1 },
        email: { type: 'string', format: 'email' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          id:    { type: 'integer' },
          name:  { type: 'string' },
          email: { type: 'string' },
        },
      },
    },
  },
  handler: async (req, reply) => {
    // 进入 handler 时 req.body 已 100% 通过 schema 验证
    const { name, email } = req.body as { name: string; email: string };
    const user = await db.user.insert({ name, email });
    return user;   // return 的对象会被 fast-json-stringify 按 response schema 序列化
  },
});

// 2. plugin（带 encapsulation）
app.register(async (instance) => {
  // 这里 instance 是子 scope；decorators / hooks 不影响外层
  instance.decorate('helper', () => 42);
  instance.get('/internal', async () => instance.helper());
});

// 3. hooks（lifecycle）
app.addHook('onRequest', async (req) => {
  req.log.info({ url: req.url }, 'incoming');
});

// 4. 启动
await app.listen({ port: 3000 });
```

要点（每条都有"为什么这么设计"）：

1. `Fastify({ logger: true })` —— logger 是一等公民。每个 request 自带 `req.log`，内部用 pino，async 风格不阻塞。
2. `schema.body` —— **写完 schema 就同时获得了 validator + 文档（OpenAPI 由它反推）**。这是 schema-first 的核心收益：单源真相，避免代码和文档双写。
3. `schema.response[200]` —— 不是装饰，是约束。响应对象只会输出 schema 列出的字段，多余的字段在序列化时被 **裁掉**。这同时是性能优化（fast-json-stringify 跳过通用 path）和安全优化（防止意外字段泄漏）。
4. `handler` 必须 async（v3+ 推荐）。`return` 的值被自动 serialize；想直接控制 status / header 用 `reply.code(201).send(obj)`。
5. `app.register(...)` —— **不是 `app.use()`**。register 出一个独立 instance（scope），里面 decorate / addHook / get 都只影响这个 scope。要想注册全局 plugin 用 `fastify-plugin` (fp) 包装。
6. `addHook('onRequest', ...)` —— 8 个 lifecycle hook 之一。这是 Fastify 替代 Express middleware 的方式，但比 middleware 更有结构（顺序固定、各自语义清晰）。
7. `app.listen({ port })` —— 启动前 AVVIO 跑完整个 plugin tree、把 schema 编译成 fn、绑定 radix tree。listen 之后运行期几乎没有动态判断。

## Layer 2 — 内部架构（≥ 25 行）

Fastify 内部分五层：

```
┌────────────────────────────────────────────────────────────┐
│ User code: app.get / app.post / register / addHook / decorate
├────────────────────────────────────────────────────────────┤
│ AVVIO（plugin loader / 启动编排）                           │
│   - 维护 plugin tree                                       │
│   - 处理 register / after / ready                          │
│   - 全树 ready 之后才允许 listen                            │
├────────────────────────────────────────────────────────────┤
│ schema compile（startup 一次性，运行期不再跑）              │
│   - Ajv: body/params/query/headers schema → validate(fn)    │
│   - fast-json-stringify: response schema → stringify(fn)    │
├────────────────────────────────────────────────────────────┤
│ find-my-way（radix tree route 匹配）                       │
│   - O(log n) URL → handler 查找                            │
│   - 支持参数、wildcard、版本约束                            │
├────────────────────────────────────────────────────────────┤
│ Lifecycle runner（per-request）                            │
│   - onRequest → preParsing → preValidation → preHandler   │
│     → handler → preSerialization → onSend → onResponse    │
│   - throw 时进入 onError → setErrorHandler                 │
└────────────────────────────────────────────────────────────┘
```

关键内部机制：

1. **AVVIO 启动编排**：用户 register 的 plugin 形成树。AVVIO 拓扑排序整棵树，依次调用 plugin 函数。每个 plugin 可以 `app.after(...)` 等待自己 register 的 child plugin 完成。这套机制让 plugin 可以"先 register Mongo，再 register 用 Mongo 的业务路由"。
2. **schema 编译时机**：用户 `app.post('/x', { schema, handler })` 时，schema 不立刻编译。等到 `app.ready()`（或 `listen()` 内部调用）时，AVVIO 跑完所有 plugin，进入 schema compile 阶段——**全部 schema 一次性 Ajv compile / fast-json-stringify compile**，结果挂到 route 对象上。运行期 request 进来直接调 fn，没有 "看一眼 schema 然后判断" 这种动态步骤。
3. **find-my-way radix tree**：Fastify 路由不是数组遍历也不是正则匹配，而是 radix tree。URL `/users/:id/posts/:pid` 被拆成节点，匹配是 O(log n) 而非 O(n)。这是 Fastify 比 Express 快 3x 的最大单点。
4. **Plugin encapsulation 实现**：`app.register()` 内部 `Object.create(parentApp)` 出一个 child instance，`decorate` 加属性时挂到 child 上。child 上的 `addHook` 也只影响 child。fastify-plugin (fp) 包装的函数会被 AVVIO 标记 "no scope"，让 plugin 注册到父 instance。
5. **request / reply 对象池**：v3+ 起 Fastify 复用 request / reply 对象（不是每次 new 一个），通过 `reset` 方法清理状态。这避免了高 QPS 下 V8 的对象 allocation / GC 压力。

![Fastify 架构：plugin tree + schema compile + lifecycle hooks](/projects/fastify/01-architecture.webp)

图：Fastify 的三层架构。顶层是 plugin tree（每 register 出独立 scope）；中层是 JSON Schema 编译（Ajv 出 validator + fast-json-stringify 出 serializer）；底层是 8 个 lifecycle hook 的固定执行顺序。右侧柱图对比 Fastify ~30k req/s vs Express ~10k 的 throughput 差距。

## Layer 3 — 精读 3 段（≥ 50 行）

### 段 a — JSON Schema → fast-json-stringify 编译期生成 serializer

链接示意：`https://github.com/fastify/fastify/blob/<40hex>/lib/handleRequest.js`

fast-json-stringify 是 Fastify 性能优势的最大单点。常规 `JSON.stringify(obj)` 不知道 obj 的结构，只能一边走一边判断 type；fast-json-stringify 拿到 schema 之后，**在 startup 阶段直接生成一段 JavaScript 源码**，然后 `new Function(...)` 编译成 fn：

```ts
// 用户 schema
const schema = {
  type: 'object',
  properties: {
    id:    { type: 'integer' },
    name:  { type: 'string' },
    email: { type: 'string' },
  },
};

// fast-json-stringify 在 startup 时大致生成下面这段代码（简化）
function stringifyUser(input) {
  let out = '{';
  out += '"id":' + (input.id | 0);            // integer 直接位运算
  out += ',"name":' + JSON.stringify(input.name);
  out += ',"email":' + JSON.stringify(input.email);
  out += '}';
  return out;
}
```

对比通用 `JSON.stringify`：

```ts
// 通用 stringify 大致行为
function stringifyAny(input) {
  // 1. 判断 type（object / array / string / number / null）
  // 2. 如果是 object，遍历所有 key
  // 3. 每个 value 递归判断 type
  // 4. 所有字段都要走通用 path
}
```

差距核心：**fast-json-stringify 的代码生成把 "判断 type" 这个动作从运行期移到了 startup 期**。生成的 fn 是直线代码（straight-line code），V8 能 inline + JIT 优化得很好。

行为后果（这是 Fastify 性能优势的真实来源）：

```ts
// benchmark: 序列化 1M 次同一个 user 对象
// JSON.stringify:        ~480ms
// fast-json-stringify:   ~190ms（~2.5x faster）
```

但代价：

1. **schema 必须准确**。schema 说字段是 string，运行期实际是 number——生成的 fn 直接拼接，输出是错误 JSON。Fastify 在 dev 模式下加了 sanity check，但 prod 假设你 schema 写对了。
2. **schema 不写 = 不能用 fast-json-stringify**。没 response schema 的 route 走通用 JSON.stringify，性能跌回 Express 水平。
3. **多余字段被裁掉**。schema 没列的字段不会出现在响应中。新人第一次写 schema 漏字段，会发现 "我 return 的对象有 7 个字段，客户端只收到 3 个"。

> 怀疑：Fastify schema-first 让性能高，但 schema 写起来繁琐——每个字段类型、format、required 都得手写。Hono / Elysia 用 zod schema 同时校验 + 推 TS 类型，schema 一次写出双收益。Fastify 的 JSON Schema 是 2017 年的最佳选择，但 2024 年看起来是不是 baggage？官方 `@fastify/type-provider-typebox` 试图补救，但生态不如 zod 厚。

### 段 b — Plugin encapsulation 模式（封装 vs Express 全局污染）

链接示意：`https://github.com/fastify/fastify/blob/<40hex>/lib/server.js`

Express 的 middleware 机制：所有 `app.use(...)` 注册的中间件挂在同一个数组上，按 register 顺序执行。无法做到"这个中间件只对 /api/v1 生效"——只能用 `app.use('/api/v1', mw)` 这种 path mounting，但 mw 内部还是全局 visible 的。

Fastify 的 register 机制：每次 `register()` 出一个**子 instance**。在子 instance 里 decorate / addHook / 注册路由，**不影响兄弟和父**。

```ts
const app = Fastify();

// 全局插件（挂在 root）
app.decorate('rootHelper', () => 'I am global');

// 子 plugin A
app.register(async (a) => {
  a.decorate('inA', () => 'A-only');
  a.addHook('onRequest', (req, reply, done) => {
    req.log.info('A hook');
    done();
  });
  a.get('/in-a', async () => a.inA());        // 'A-only'
  a.get('/global-from-a', async () => a.rootHelper());  // 'I am global'，能访问父
});

// 子 plugin B
app.register(async (b) => {
  // b 里看不见 a 的 decorator
  // b.inA  → undefined
  // b 的 onRequest hook 也不会触发 a 的 hook
  b.get('/in-b', async () => 'no A pollution');
});

// 想全局注册 plugin —— 用 fastify-plugin (fp) 包装
import fp from 'fastify-plugin';
const cors = fp(async (instance) => {
  instance.addHook('onRequest', corsHandler);
}, { name: 'cors' });
app.register(cors);   // fp 让 cors hook 注册在 root，所有子 instance 都受影响
```

为什么这件事重要：

1. **避免命名冲突**：plugin A 和 plugin B 都想 `decorate('user', ...)`，在 Express 里会互相覆盖；在 Fastify 里互不可见。
2. **明确 hook 作用域**：`/api/v1/*` 的 auth hook 不会跑到 `/api/v2/*`。这套语义在 Express 里要靠 path-mounted Router 模拟，且 hook 顺序常出错。
3. **plugin 的可重用性**：写一个 `auth-plugin` 只关心自己 scope 内的事，复用到不同项目没有 "全局污染" 风险。

代价（这是 plugin encapsulation 的暗面）：

1. **学习曲线陡**：新人不懂"为什么我在 plugin 外 decorate 的东西，plugin 里访问得到，反过来不行"。这个不对称性在文档里讲了，但读者第一次踩到才真正理解。
2. **fastify-plugin 反模式蔓延**：很多人不理解 encapsulation 后，干脆把所有 plugin 都 fp 包装绕开 scope。结果 encapsulation 完全不起作用——这种代码满 GitHub 都是，但失去了 encapsulation 的所有好处。
3. **debug 困难**：跨 scope 调用排查 "为什么 hook 没触发" "为什么 decorator undefined"——必须画出 plugin tree 才能想清楚。Fastify 提供 `app.printPlugins()` 帮助，但也只是辅助。

> 怀疑：Plugin encapsulation 是良好工程实践，但学习曲线陡，新人不懂"plugin scope" → 排查 bug 困难。Express 的全局 middleware 简单粗暴但所有人秒懂。Fastify 是不是在用工程纯洁性换取入门门槛？或者反过来说，2017 年这个设计 ahead of time，今天 NestJS 的 Module + Provider 抽象更主流，Fastify 的 encapsulation 看起来反而像是"低配版 DI 容器"。

### 段 c — Lifecycle hooks 顺序与 NestJS interceptor 对比

链接示意：`https://github.com/fastify/fastify/blob/<40hex>/lib/route.js`

Fastify 的 8 个 lifecycle hook 按固定顺序执行：

```
onRequest          ← 进入路由前。此时 body 还没解析。适合做 rate-limit / 提前拒绝。
preParsing         ← raw body 拿到，还没解析。适合包 transform stream（解密、解压）。
preValidation      ← schema validate 前。适合动态改 body（比如默认值填充）。
preHandler         ← validate 完，handler 前。适合注入 user / 关联 entity。
handler            ← 用户业务函数。
preSerialization   ← handler return 后，序列化前。适合改 response shape。
onSend             ← 写 socket 前，已经 serialize 过。适合包 gzip / 加 header。
onResponse         ← socket 写完。埋点 / metrics 在这一段。
```

错误路径独立：

```
任何阶段 throw / reject  →  onError hook  →  setErrorHandler  →  reply with statusCode + serialized error
```

每个 hook 都是 `(req, reply, done)` 形式（v3 起也支持 async）；done 接 `(err)` 表示是否进入 error path。

关键差别（vs NestJS interceptor）：

```ts
// Fastify hook（轻量）
app.addHook('preHandler', async (req, reply) => {
  req.user = await loadUser(req.headers.authorization);
});

// NestJS interceptor（重量）
@Injectable()
export class AuthInterceptor implements NestInterceptor {
  constructor(@Inject(USER_SERVICE) private userService: UserService) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    return from(this.userService.load(req.headers.authorization)).pipe(
      tap(user => { req.user = user; }),
      switchMap(() => next.handle()),
    );
  }
}
```

差距：

1. **Fastify hook = 纯函数**。没有 DI 容器、没有 RxJS observable、没有 ExecutionContext 抽象。开销几乎为零（一次 fn 调用）。
2. **NestJS interceptor = ExecutionContext + Observable**。可以拿到 controller / handler 的 metadata，可以包装 next.handle() 做 around advice，但每次 request 多一层 RxJS subscription。
3. **共享状态机制不同**：Fastify 跨 hook 共享靠 `request.decoratedKey`（自己挂属性）；NestJS 靠 ExecutionContext + 反射 metadata。

实战要点：

1. **hook async 化**：v3+ 推荐 async hook。Fastify 内部用 promises 串起来，性能没明显下降，DX 大幅提升。
2. **顺序冲突**：`onRequest` hook 在子 plugin 注册的也跑得到（因为继承），但子 hook 不会回流父。要全局生效必须在 root 注册或用 fp。
3. **错误处理覆盖**：默认的 errorHandler 会 serialize Error 对象到 `{ statusCode, error, message }`。生产环境要 `setErrorHandler` 自定义，避免泄漏 stack trace。
4. **避免 hook 链过深**：每个 hook 都是 await 串行。极端 throughput 场景（>50k req/s），10 个 hook 的链路开销可见。

> 怀疑：lifecycle hook 8 段抽象是不是过度精细化？实际项目 90% 只用 onRequest（auth）+ preHandler（注入）+ onResponse（metrics）三个。其他 5 个 hook 文档里都有，但生产代码里几乎没人用。这个"完整覆盖" vs "实用最小集"——是不是 framework 提供太多反而让 user 选择困难？

## Layer 4 — 与 Express / Koa / NestJS / Hono / Elysia 对比

| 维度 | Fastify | Express | Koa | NestJS | Hono | Elysia |
|---|---|---|---|---|---|---|
| 出现年份 | 2017 | 2010 | 2013 | 2017 | 2022 | 2023 |
| 核心抽象 | Plugin tree + schema | Middleware 链 | Async middleware 链 | Module + Provider (DI) | Handler chain | Handler chain |
| 路由匹配 | radix tree (find-my-way) | 数组遍历（path-to-regexp） | 数组遍历 | 取决于 adapter | radix tree | radix tree |
| Schema 优先 | **是**（JSON Schema） | 否（外挂） | 否 | 否（外挂 class-validator） | **是**（zod） | **是**（自带） |
| TypeScript 一等 | 中（type-provider 补） | 弱 | 中 | **强**（装饰器） | **强** | **强** |
| 性能（hello world） | ~30k req/s | ~10k | ~18k | ~12-25k（看 adapter） | ~50k+（Edge） | ~50k+（Bun） |
| Edge runtime 友好 | 中（bundle 偏大） | 弱 | 弱 | 弱 | **强** | **强**（Bun） |
| Plugin 隔离 | **encapsulation** | 无 | 无 | Module 隔离 | 无 | 无 |
| Bundle | ~600KB | 600KB | ~300KB | ~3MB | ~50KB | ~100KB |
| Weekly downloads | ~3M | ~30M | ~3.5M | ~3M | ~500k | ~50k |

观察：

1. Fastify 是 6 个里**唯一**有 plugin encapsulation 的——这是它的工程纯洁性。
2. Express 的 30M 下载是历史惯性。新项目首选已经迁移到 Fastify / NestJS。
3. Hono / Elysia 是 2022-2023 的新势力，主打 Edge + TS，schema 用 zod / 自带，Fastify 的 schema-first 想法被它们 TS 化。
4. NestJS 的 DI + 装饰器是另一种重量级抽象——Fastify 是"轻框架"，NestJS 是"框架+应用结构"。

## Layer 5 — 6 维对比

| 维度 | Fastify | Express | Koa | NestJS | Hono | Elysia |
|---|---|---|---|---|---|---|
| 性能 | 高 | 低 | 中 | 中 | **极高**（Edge） | **极高**（Bun） |
| DX | 中（schema 繁琐） | 高（极简） | 中 | 高（DI） | 高（zod） | 高（zod 风格） |
| TS 体验 | 中（type-provider） | 弱 | 中 | 强 | **强** | **强** |
| 生态 | 大（plugin 200+） | **巨大**（10 年沉淀） | 中 | 大（NestJS 生态） | 中 | 小 |
| Plugin 模型 | encapsulation | middleware | middleware | Module | handler | handler |
| 学习曲线 | 中（encapsulation 概念） | 低 | 低 | 高（DI） | 低 | 低 |

## Layer 6 — 限制 ≥ 4

1. **Schema 写起来繁琐**：JSON Schema 是 2017 年的最佳选择，但今天看是 baggage。`{ type: 'string', minLength: 1 }` 这种声明又长又不能给 TS 推类型。`@fastify/type-provider-typebox` / `@fastify/type-provider-json-schema-to-ts` 试图补救，但都是"贴上去"的二次抽象，不如 Hono + zod / Elysia 自带 schema 一次写双收益。
2. **Plugin encapsulation 学习曲线陡**：新人不理解"为什么我在外面 decorate 子里看得见，反过来不行"。Stack Overflow 上 "fastify decorator undefined" / "fastify hook not running" 类问题占 plugin 相关问题的 60%+。fastify-plugin (fp) 反模式蔓延正是因为 encapsulation 反直觉。
3. **Edge runtime 不是主战场**：core 600KB + 各 plugin 加起来轻松 1-2MB，Cloudflare Workers 1MB 限制下根本塞不进去。Edge 场景 Hono / Elysia 是更合适的选择。Fastify 锁定在 "传统 Node.js server" 这一个场景。
4. **TypeScript 一等支持仍是痛点**：v4 之前 `@types/fastify` 一直是社区维护，类型推导经常和实际行为对不上。v5 把 types 并进主仓库，但 type-provider 系统仍是 "添加式" 而非 "原生式"——和 Hono / Elysia 那种"schema 一写 TS 类型自动推"的体验差一个代际。
5. **bus factor 过度集中**：Matteo Collina + Tomas Della Vedova 双核心，contributor 100+ 但绝大多数 commit 集中在两人手上。两人的关注度（Platformatic 公司、Node.js TSC 工作）对 Fastify 演进有直接影响。
6. **错误处理设计偏复杂**：8 个 lifecycle hook + onError + setErrorHandler + plugin 树继承——出错时排查"我的 errorHandler 为什么没生效" 需要画出 plugin tree。文档讲清楚了，但实际生产经常踩。
7. **logger 强绑定 pino**：Fastify 默认 pino。想换 winston / bunyan 要传 `logger: customLogger` 实现 `info/warn/error/...` 接口——能换但生态全是 pino-based 的（pino-pretty / pino-tee 等）。这个绑定不算大坑，但属于"框架的偏见"。
8. **MongoDB / GraphQL / WebSocket 都靠 plugin**：core 不内建。这是好事（瘦核心）也是坏事（搭整套 backend 要装一堆 plugin）。对比 NestJS 一站式的 `@nestjs/graphql` / `@nestjs/mongoose` 体验差。

## 怀疑总集

1. Fastify schema-first 让性能高，但 JSON Schema 写起来繁琐——每个字段类型、format、required 都得手写。Hono / Elysia 用 zod schema 同时校验 + 推 TS 类型，schema 一次写出双收益。Fastify 是不是 baggage？
2. Plugin encapsulation 是良好工程实践，但学习曲线陡，新人不懂"plugin scope" → 排查 bug 困难。Express 的全局 middleware 简单粗暴但所有人秒懂。是不是过度抽象？或者说 NestJS 的 Module + Provider 已经是更主流的"工程化抽象"，Fastify encapsulation 看起来像低配版 DI 容器？
3. Fastify 性能优势在 microbenchmark 显著，但实际应用瓶颈在数据库 / IO，框架层差别在生产环境感知少。"30k vs 10k" 这种数字在 hello-world 才有意义，真实业务每个 request 100ms+ DB 查询的场景下框架开销几乎被淹没。性能优势是不是被过度营销？
4. lifecycle hook 8 段抽象是不是过度精细化？实际项目 90% 只用 onRequest + preHandler + onResponse 三个。其他 5 个 hook 文档里都有，但生产代码里几乎没人用。framework 提供太多反而让 user 选择困难？
5. Fastify 把性能压到极致，但今天 Bun / Deno / Edge runtime 才是性能新前线。Bun 自带的 server / Hono on Bun 性能 50k+ req/s，Fastify 30k 在 2024 反而是中等水平。Fastify 是不是被自己定位的"Node.js 高性能"卡住，错过了 runtime 革命？
6. fast-json-stringify 把 JSON 序列化做到 2.5x faster，但代价是"schema 必须准确"——schema 错了运行期生成错 JSON 不报错。这种"为性能牺牲安全网"在金融 / 医疗等强合规场景接受度多少？
7. AVVIO 启动编排让 plugin 顺序由依赖图自动算，但调试 "为什么我的 plugin 没启动" / "为什么顺序不对" 时只能 `printPlugins()` 看树。复杂项目 50+ plugin 时这棵树根本看不过来，问题排查靠经验。
8. Fastify 的"register encapsulation" vs NestJS 的"Module + DI"——本质都在解决"代码组织"，但 NestJS 提供 controller / service / provider 三件套语义，Fastify 只给 instance 树。设计哲学差别是 "framework 给你框架" vs "framework 给你 primitive"，后者灵活但需要团队自定 convention。
9. v4 → v5 升级 `Reply.send()` 行为有微妙变化（chained calls 强制 return）。一个框架在 major version 改语义会逼使大量已有代码迁移——是不是太激进？
10. Fastify ecosystem plugin 200+，但质量参差。`@fastify/cors` `@fastify/jwt` 等核心 plugin 是官方维护，质量好；社区 plugin 不少 v3 时代写完没更新，对 v4 / v5 hook async 改造不彻底。生态广度有，深度参差。

## GitHub permalinks（链接示意）

> 注：以下 SHA `<40hex>` 处实际须用某次具体 commit 的 40 位 hash 替换；本文档不锁定特定版本。

1. `https://github.com/fastify/fastify/blob/<40hex>/lib/server.js` —— 服务器主入口，build 顶层 instance、注册 default route handler
2. `https://github.com/fastify/fastify/blob/<40hex>/lib/route.js` —— route 注册逻辑，schema 编译触发点，hook 链编排
3. `https://github.com/fastify/fastify/blob/<40hex>/lib/handleRequest.js` —— 单 request 的核心循环，调度 8 个 lifecycle hook，序列化 reply
4. `https://github.com/fastify/fastify/blob/<40hex>/lib/validation.js` —— Ajv compile 入口，schema → validator(fn) 的桥接
5. `https://github.com/fastify/fastify/blob/<40hex>/lib/reply.js` —— Reply 类，封装 `send` `code` `header` `redirect`
6. `https://github.com/fastify/fastify/blob/<40hex>/lib/request.js` —— Request 类，封装 raw req + 解析后的 body / params / query
7. `https://github.com/fastify/fastify/blob/<40hex>/lib/hooks.js` —— 8 个 hook 名称定义 + register / dispatch 实现
8. `https://github.com/fastify/fastify/blob/<40hex>/lib/pluginUtils.js` —— register / decorate 的 encapsulation 实现，AVVIO 集成

## 实战 Walkthrough（≥ 25 行）

模拟一个"博客 API：用户、文章、JWT 鉴权"的最小服务：

```ts
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss', colorize: true },
    },
  },
});

// 全局 plugin（fp 包装的，影响所有 scope）
await app.register(cors, { origin: true });
await app.register(sensible);   // 提供 reply.notFound() reply.unauthorized() 等
await app.register(jwt, { secret: process.env.JWT_SECRET! });

// auth decorator：给 preHandler 用
app.decorate('authenticate', async (req, reply) => {
  try {
    await req.jwtVerify();   // 解 JWT，挂 req.user
  } catch {
    reply.unauthorized();
  }
});

// 用户 plugin（独立 scope）
app.register(async (users) => {
  // POST /users/signup —— 创建用户（公开）
  users.post('/users/signup', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name:     { type: 'string', minLength: 1 },
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id:    { type: 'integer' },
            name:  { type: 'string' },
            email: { type: 'string' },
            token: { type: 'string' },
          },
        },
      },
    },
    handler: async (req) => {
      const { name, email, password } = req.body as any;
      const user = await db.user.create({ name, email, passwordHash: hash(password) });
      const token = app.jwt.sign({ id: user.id });
      return { ...user, token };
    },
  });

  // GET /users/me —— 当前用户（需 JWT）
  users.get('/users/me', {
    preHandler: [app.authenticate],   // 直接复用 decorate
    handler: async (req) => {
      const u = await db.user.findById((req.user as any).id);
      if (!u) throw app.httpErrors.notFound('user gone');
      return u;
    },
  });
});

// 文章 plugin（独立 scope）
app.register(async (posts) => {
  posts.addHook('preHandler', app.authenticate);   // 整个 scope 都需要鉴权

  posts.get('/posts', async () => db.post.list());
  posts.post('/posts', {
    schema: {
      body: {
        type: 'object',
        required: ['title', 'content'],
        properties: {
          title:   { type: 'string', minLength: 1, maxLength: 200 },
          content: { type: 'string' },
        },
      },
    },
    handler: async (req) => {
      const userId = (req.user as any).id;
      return db.post.create({ ...(req.body as any), authorId: userId });
    },
  });
});

// 全局 errorHandler：统一返回格式
app.setErrorHandler((err, req, reply) => {
  req.log.error({ err }, 'request failed');
  if (err.validation) {
    reply.code(400).send({ ok: false, code: 'VALIDATION_ERROR', issues: err.validation });
    return;
  }
  if (err.statusCode && err.statusCode < 500) {
    reply.code(err.statusCode).send({ ok: false, code: err.code, message: err.message });
    return;
  }
  reply.code(500).send({ ok: false, code: 'INTERNAL', message: 'oops' });
});

await app.listen({ port: 3000, host: '0.0.0.0' });
```

注意：

1. `app.register(cors, ...)` —— 用 `await` 等待 plugin 注册完成。AVVIO 拓扑排序保证依赖关系正确（jwt 依赖 cors 不会先跑）。
2. `app.decorate('authenticate', ...)` —— decorator 在 root 注册，下面的子 plugin 都能访问 `app.authenticate`。
3. `preHandler: [app.authenticate]` —— hook 数组形式，按顺序执行。这里复用 decorator 出来的 fn。
4. `posts.addHook('preHandler', app.authenticate)` —— 整个 posts scope 都加 auth。这种 "scope 级 hook" 是 Fastify encapsulation 的核心收益。
5. `setErrorHandler` —— 全局统一错误格式。validation 错误 / 业务错误 / 5xx 都走这里。
6. response schema —— 注意 signup 返回 `token`，schema 必须列上，不然 fast-json-stringify 会裁掉 token 字段。

测试这个服务：

```bash
# 注册
curl -X POST http://localhost:3000/users/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"alice","email":"a@x.com","password":"hunter222"}'
# → { id: 1, name: 'alice', email: 'a@x.com', token: 'eyJ...' }

# 校验失败
curl -X POST http://localhost:3000/users/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"","email":"not-email","password":"123"}'
# → 400 { ok:false, code:'VALIDATION_ERROR', issues: [...3 个错...] }

# JWT 鉴权
TOKEN=eyJ...
curl http://localhost:3000/posts -H "Authorization: Bearer $TOKEN"
```

## 学到（≥ 12 行）

1. **schema-first 不是 framework 选择，是工程哲学选择**：把 schema 抬一等公民意味着 validation / serialization / docs 都从单源生成。代价是"必须先写 schema 再写 handler"——这个习惯转变比技术学习更大。
2. **编译期 vs 运行期**：fast-json-stringify 的本质是把 "判断 type" 从运行期移到 startup 期。这套思路在 V8 / GraalVM / 各种 codegen 工具里反复出现——能在 startup 花 100ms 算出运行期结果，永远比每次 request 算一遍划算。
3. **Plugin encapsulation 是"轻量 DI"**：不需要 Angular / NestJS 那种完整的 DI 容器，但需要某种 "代码隔离 + 依赖注入" 时，Fastify 的 register + decorate 是更轻的方案。代价是没有 NestJS 那种完整的"controller/service/provider"语义。
4. **AVVIO 是被低估的 plugin loader**：作为独立包它能给任意应用加 "拓扑排序的 plugin 启动流程"。Fastify 用它，但理论上你的 CLI / batch job / 桌面应用都能用。
5. **find-my-way 是性能差距的最大单点**：radix tree 路由 vs 数组遍历，URL 多了之后差距非线性放大。如果只能从 Fastify 借一样东西到 Express 项目，应该借 find-my-way。
6. **lifecycle hook 8 段是过度设计但留有余地**：90% 项目只用 3-4 个 hook，但极端场景（流式上传、加密、metrics 埋点）每个 hook 都有用武之地。"提供完整覆盖让用户按需选" vs "只提供必需让用户简单上手" 是 framework 设计的永恒抉择。
7. **fast-json-stringify 的代价是 "schema 必须准确"**：这违反了"防御式编程"的直觉——通常我们倾向运行期再校验一次。schema-first 框架要求开发者把 schema 当合同来写，这种心态转变在 Java/Spring 工程师看来熟悉，在 JS 工程师看来需要适应。
8. **fastify-plugin (fp) 是必要的 escape hatch**：encapsulation 是默认行为，但很多 plugin（cors / helmet / metric）天生就需要全局生效。fp 让 plugin 作者显式声明 "我不要 scope"。这种"默认严格 + 提供逃生口" 是良好框架设计。
9. **performance benchmark 的实际意义有限**：30k vs 10k req/s 这种 hello-world 数据放在真实业务（每 request 100ms DB 查询）下几乎没差别。Fastify 真正赢 Express 的不是性能，是 schema-first 带来的工程纯洁性 + plugin encapsulation 带来的代码组织。
10. **TS 体验是 Fastify 最弱的一环**：JSON Schema 不能直接推 TS 类型；type-provider 是补丁。新一代 TS-first 框架（Hono / Elysia / tRPC）这一点远超 Fastify。Fastify 想保住地位必须解决 schema-to-types 的体验。
11. **logger 内置是 framework 的合理偏见**：log 是每个生产服务的必需品，让用户自己挑反而增加 onboarding 成本。Fastify 选 pino + 让 user 能换，是"提供合理默认 + 不锁死" 的中庸路线。
12. **错误处理统一性 > 通用性**：`setErrorHandler` 让用户写一个全局 fn 处理所有异常。这种"集中式错误"比 Express 的"每个 middleware 自己 next(err)" 简单得多，调试时只看一个地方。
13. **register await 时序很重要**：`await app.register(jwt, ...)` 而不是 `app.register(...)` 让 AVVIO 知道你想等这个 plugin 完成。漏 await 在 startup 阶段不报错，但运行时可能 plugin 还没装完就接到 request——这种"安静的 race"是最难排查的。
14. **生态广度 ≠ 深度**：Fastify plugin 200+ 看起来很多，但社区 plugin 维护参差。生产选 plugin 优先 `@fastify/*` 官方系列，社区 plugin 必查 last commit / open issues / async hook 兼容性。
15. **encapsulation 调试靠 `printPlugins()`**：复杂项目 50+ plugin 时光看代码想不清 plugin tree，`app.printPlugins()` 输出整棵树是必备工具。这种"框架自带的可观测性"是大型应用的隐性收益。

## 关联

- [[express]] —— 2010 年的中间件抽象，Fastify 是它的 schema-first 升级版，性能 3x
- [[koa]] —— TJ 的 async middleware 框架，Fastify 比它结构性更强
- [[nestjs-overview]] —— 重量级 DI 框架，可以底层跑 Fastify adapter；定位上 NestJS 是"框架+应用结构"，Fastify 是"轻框架"
- [[hono]] —— TS-first Edge runtime 新秀，schema 用 zod，bundle 50KB；Fastify 在 Edge 不敌
- [[elysia]] —— Bun-first 新秀，性能极高（runtime 加成），schema 自带；和 Hono 是新一代代表
- [[trpc]] —— 不是 framework 是 RPC 层，schema-to-types 体验是 Fastify 该学的方向
- [[ajv]] —— Fastify 的 validator 引擎，编译 JSON Schema 到 fn 的核心
- [[pino]] —— Fastify 默认 logger，async 风格高性能 log
- [[zod]] —— Fastify 用 type-provider 间接接入；Hono / Elysia 直接内置
- [[graphql-yoga]] —— 现代 GraphQL server，能跑在 Fastify adapter 上

## 附录 A — 8 个 lifecycle hook 完整对照表

| hook | 触发时机 | 典型用途 | req.body 可用 | reply 可发 |
|---|---|---|---|---|
| onRequest | 进入路由前 | rate-limit / IP 黑名单 | 否 | 是（提前拒绝） |
| preParsing | raw body 拿到 | 流转换（解密、解压） | 否（流） | 否 |
| preValidation | parse 完，validate 前 | 默认值填充 / body 改写 | 是（未验证） | 是（提前拒绝） |
| preHandler | validate 完，handler 前 | 注入 user / 关联 entity | 是（已验证） | 是（提前响应） |
| (handler) | 用户业务函数 | — | 是 | 是 |
| preSerialization | handler return 后 | 改 response shape | 是 | 否（这一步只准改 payload） |
| onSend | 写 socket 前，已 serialize | gzip / 加 header | 是 | 否 |
| onResponse | socket 写完 | metrics / 埋点 | 是 | 否（已发完） |

观察：

1. **能不能发 reply** 在不同 hook 阶段不同。onRequest / preValidation / preHandler 都能"提前响应"（短路）；preSerialization 之后已经在序列化路径，只能改 payload 不能改决定。
2. **req.body 可用性** 也分阶段。onRequest 还没解析；preParsing 是流；preValidation 后才有解析后的 body。
3. **错误路径** 不在表里。任何 hook 抛错都会跳到 onError → setErrorHandler。

## 附录 B — Fastify 与 Platformatic 的关系

Platformatic 是 Matteo Collina 创办的公司（2022 起），基于 Fastify 构建的 backend platform：

1. **Platformatic DB**：自动从 PostgreSQL schema 生成 Fastify route + REST + GraphQL，零配置 CRUD。
2. **Platformatic Service**：Fastify 之上的"项目脚手架 + 配置管理 + 部署"。
3. **Platformatic Composer**：multiple Fastify service 的 API gateway。

观察：

1. Fastify 是开源框架，Platformatic 是商业产品。这种"OSS + 商业化"是 Vercel/Next.js / Tailwind/Tailwind UI 同样的模式。
2. Platformatic 商业化让 Matteo 有持续投入 Fastify 的动力——bus factor 风险被部分对冲。
3. Platformatic 的 "schema-first auto-generate" 把 Fastify schema-first 哲学推到极致——schema = API 全部。

## 附录 C — 为什么 Edge / Bun runtime 场景 Fastify 不被首选

1. **Bundle 体积**：core 600KB + 各 plugin 加起来轻松 1-2MB，Cloudflare Workers 1MB 限制塞不进去。
2. **Node API 依赖**：Fastify 内部用 `http` / `net` / `Buffer` 等 Node 特定 API，Edge runtime 默认不全提供。
3. **冷启动时间**：AVVIO 拓扑排序 + schema compile + Ajv 编译，冷启动 100-300ms（vs Hono ~10ms）。
4. **runtime 差异**：Bun 自带 server 性能 ~50k req/s，Hono on Bun 同级；Fastify on Bun 能跑但性能优势不再独占。
5. **生态错位**：Fastify plugin 大多基于 Node API 写的，Edge runtime 兼容性参差。

结论：Fastify 是给"传统 Node.js 长生命周期 server"项目的框架。Edge / Bun-first 项目应该选 Hono / Elysia。这不是 Fastify 的失败，是 runtime 时代的分化。

## 附录 D — 学到补充（≥ 5 行）

16. **fast-json-stringify 可以独立用**：不在 Fastify 里也能 `require('fast-json-stringify')` 拿单独的 stringify。schema-first 序列化思路适合任何 high-throughput JSON 输出场景（log 写盘、消息队列 publish）。
17. **schema 推 TS 类型的两条路线**：`@fastify/type-provider-typebox`（用 typebox 写 schema 同时推 TS）和 `json-schema-to-ts`（编译期把 JSON Schema 转 TS）。前者 DX 更近 zod，后者更"原生 JSON Schema"。
18. **printPlugins / printRoutes 是日常工具**：debug 时 `app.printPlugins()` 出 plugin tree，`app.printRoutes()` 出 route 表。两者都该接进 admin endpoint 或 startup log。
19. **request 对象池意味着不要存引用**：handler 之外（比如丢进 setTimeout / 队列）使用 `request` 对象会出问题——请求结束后对象被复用，你的引用指向"下一 request"。需要数据应在 handler 内拷贝出来。
20. **schemaErrorFormatter 自定义**：默认 validation error 格式是 Ajv 风格（`/body/email must match format "email"`），客户端不友好。生产环境应 `schemaErrorFormatter: (errs, dataVar) => new MyValidationError(...)` 输出业务规范的错误结构。

关联补充：

- [[ajv]] —— Fastify 的 validator 引擎，独立项目也广泛使用
- [[pino]] —— Fastify 默认 logger，独立用也是 Node.js 高性能 log 首选
- [[platformatic]] —— Fastify 商业化产品，schema-first 哲学的极致演绎
- [[hono]] [[elysia]] —— 新一代 TS-first 框架，Edge / Bun 场景更合适
- [[express]] [[koa]] —— 上一代框架，Fastify 在 Node.js server 场景的事实替代
