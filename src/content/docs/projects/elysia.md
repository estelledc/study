---
title: Elysia — 长在 Bun 上的极致类型安全 Web 框架
来源: https://github.com/elysiajs/elysia
日期: 2026-05-30
分类: web 框架
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/elysiajs/elysia
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e037eca710e7ad193be09cc6615ab0dbe54af914
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.4.30
---

## 是什么

Elysia 是一个默认优先适配 Bun、并用 TypeBox / Standard Schema 同时约束运行时校验与 TypeScript 类型的 Web 框架。日常类比：它像一台出厂就配专属充电桩的车——在 Bun 上走 `BunAdapter` 和 `listen()`；换到只认 Web 标准的环境，必须改用 `fetch` 出口，不能假装插座还在。

你写：

```ts
import { Elysia, t } from "elysia"

new Elysia()
  .get("/hi/:name", ({ params }) => `hello ${params.name}`, {
    params: t.Object({ name: t.String() }),
  })
  .listen(3000)
```

`t` 从 TypeBox 的 `Type` 扩出来。同一份 schema 会在注册时编成校验器；过不了的请求在 handler 前变成 `ValidationError`。

## 为什么重要

不理解 Elysia 的 adapter / AOT / schema 分层，就解释不了下面几件事：

- 为什么 `typeof Bun !== 'undefined'` 时默认是 `BunAdapter`，否则是 `WebStandardAdapter`
- 为什么 WebStandard 上调用 `.listen()` 会直接抛错
- 为什么 `ELYSIA_AOT=false` 后不再走 `composeGeneralHandler`
- 为什么旧文把 sucrose 写成 “Bun bundler 把 derive inline 进 handler”

## 核心要点

Elysia 的编译链可以拆成五步：

1. **选 adapter**：构造函数里 `config.adapter` 优先；否则看全局 `Bun`。adapter 负责 `listen` / `stop`、响应映射，以及是否按 Web 标准暴露 `fetch`。

2. **方法链累积类型**：`.get()` / `.post()` / `.use()` / `.derive()` 返回同一个实例家族，把路由、schema、生命周期和推导字段合并进类型参数。

3. **schema 编译**：路由 hook 里的 `body` / `params` / `query` / `headers` 交给 `getSchemaValidator`。输入可以是 TypeBox `TSchema`，也可以是 Standard Schema-like 对象。

4. **AOT 或动态 handler**：`aot` 默认 true，除非环境变量 `ELYSIA_AOT` 等于字符串 `'false'`。AOT 走 `composeGeneralHandler`；关闭后走 `createDynamicHandler`，路由进 `router.dynamic`。

5. **sucrose 只做静态推断**：它把 handler 源码拆开，标记这个函数有没有碰 `query` / `body` / `cookie` 等字段。这是框架自己的编译辅助，不是 Bun bundler macro。

## 实践示例

### 案例 1：schema 先于 handler

```ts
import { Elysia, t } from "elysia"

new Elysia()
  .post("/users", ({ body }) => ({ ok: true, who: body.email }), {
    body: t.Object({
      email: t.String({ format: "email" }),
      age: t.Number({ minimum: 0 }),
    }),
  })
  .listen(3000)
```

校验失败时固定 `ValidationError.status = 422`，请求不会进 handler。`age: -1` 会被 TypeBox 校验拒绝；这是运行时合同，不是只靠 TypeScript。

### 案例 2：用 `.derive()` 注入字段，而不是外仓 JWT 插件

```ts
import { Elysia, t } from "elysia"

new Elysia()
  .derive(({ headers }) => ({
    requestId: headers["x-request-id"] ?? "missing",
  }))
  .get("/whoami", ({ requestId }) => ({ requestId }))
```

固定源码里 `.derive()` 默认 `as: 'local'`，并作为 transform hook 注册。`@elysiajs/jwt` 不在本仓，本轮未打开，不能把它的 `ctx.jwt` 写成核心合同。

### 案例 3：没有 Bun 时不要调用 `listen()`

```ts
import { Elysia } from "elysia"

const app = new Elysia()
  .get("/", () => "hi")

export default app
```

`WebStandardAdapter.listen` 的实现是抛 `WebStandard does not support listen, you might want to export default Elysia.fetch instead`。Node 或 Edge 上应导出 `app.fetch`，或显式传入实现了 `listen` 的 adapter。本仓 adapter 目录只有 bun、web-standard、cloudflare-worker。

## 踩过的坑

1. **把 `.listen(3000)` 当成跨运行时 API**：它只是 `this['~adapter'].listen(this)`。WebStandard 会抛错。

2. **把 sucrose 当成打包器宏**：它分析函数字符串并服务 compose；关掉 AOT 后走动态路由，并不是“换到 Node 就失去 inline”。

3. **不写 schema 还期待运行时拒绝坏数据**：没有 schema 就没有这条校验链；TypeScript 类型也不会凭空出现。

4. **把 Eden Treaty 写进本仓合同**：端到端客户端是独立包，本轮源码树里没有它。

5. **以为默认永远 AOT**：`ELYSIA_AOT=false` 会改走 dynamic handler；生产行为要以启动环境为准。

## 适用 vs 不适用场景

**适用**：

- 新服务可以跑 Bun，并愿意用 `t.Object` 或 Standard Schema 当输入合同
- 前后端同仓 TypeScript，需要路由类型随着方法链增长
- 需要框架在校验失败时给出固定 422，而不是把脏数据交给 handler

**不适用**：

- 只能在 Node listen，又不想提供自定义 adapter——默认 WebStandard 会拒绝 `listen`
- 需要本轮未核验的 QPS / TechemPower 数字来证明“比 Express 快”
- 团队不接受 TypeBox 报错和巨型方法链类型

## 固定版本边界

- 本文绑定 `elysiajs/elysia@e037eca7...`，tag `1.4.30`、package 与 npm `gitHead` 均为同一提交。
- 默认 `aot: env.ELYSIA_AOT !== 'false'`，`nativeStaticResponse: true`，`encodeSchema: true`，`normalize: true`。
- `ValidationError.status` 固定为 422；WebStandard 的 `listen` 固定抛错。
- 本文未安装依赖、运行 `test/` 或测量吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认 adapter 是运行时探测，不是口号**——有 `Bun` 才是 Bun-first；没有就只剩 fetch 出口。
2. **schema 库和框架是叠在一起的**——`t` 基于 TypeBox，但校验入口也承认 Standard Schema。
3. **AOT 是框架自己生成函数，不是打包器魔法**——sucrose / compose 都在本仓。
4. **`.use()` 合并的是另一份 Elysia 或 plugin 函数**——类型累积发生在合并之后，不在外仓插件里凭空出现。

## 应用型自测

1. 全局没有 `Bun` 时，默认 adapter 是谁？对它调用 `.listen(3000)` 会怎样？
2. `ValidationError` 的默认 HTTP 状态码是多少？
3. `sucrose` 做的是 Bun bundler inline，还是分析 handler 源码里用了哪些 context 字段？

检查点：

1. `WebStandardAdapter`。`listen` 抛错，应导出 `fetch`。
2. 422。
3. 后者。它给 compose 提供字段使用推断。

## 延伸阅读

- 官方文档：[elysiajs.com](https://elysiajs.com/)
- 固定源码：[elysiajs/elysia](https://github.com/elysiajs/elysia) —— 本文绑定提交 `e037eca710e7ad193be09cc6615ab0dbe54af914`
- 对照入口：`src/index.ts`、`src/schema.ts`、`src/sucrose.ts`、`src/adapter/web-standard/index.ts`
- TypeBox：[sinclairzx81/typebox](https://github.com/sinclairzx81/typebox)
- [[hono]] —— 同属 TypeScript Web 框架，但入口是跨运行时 `fetch`，schema 不是默认主链

## 关联

- [[hono]] —— 同样 Web 标准 + 边缘 runtime，但不绑 Bun，类型推导稍弱
- [[fastify]] —— Node 上 schema-first 的老前辈，TypeBox 思路的源头之一
- [[express]] —— 反面参照：req/res 弱类型，看完 Elysia 更能感受痛点
- [[koa]] —— method chain + 中间件思路的早期代表，Elysia 是它的类型化后继
- [[nestjs]] —— 重型企业框架，与 Elysia 形成"DI 重 vs 极简"两极
- [[trpc]] —— 端到端类型安全的另一路线（RPC over JSON），与 Eden Treaty 对照
- [[bun]] —— Elysia 的"地基"，没它谈不上 Elysia

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[sanic]] —— Sanic — 性能向 async Python 框架，对标 Node.js 高吞吐
