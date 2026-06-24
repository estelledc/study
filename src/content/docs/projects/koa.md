---
title: Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
来源: https://github.com/koajs/koa + koajs.com 官方文档
日期: 2026-05-30
分类: 工具库
难度: 中级
---

## 是什么

Koa 是 **TJ Holowaychuk（Express 同作者）2013 年起在 koajs 组织下开源**的 Node.js web 框架。日常类比：Express 像装修齐全的精装公寓——开门就能住，但墙体家具都按房东想法定好了；Koa 像毛坯房——给你水电承重墙（中间件链 + ctx），其余 router、body 解析、CORS、模板引擎全自己买装（独立 npm 包），布置完全你说了算。

你写：

```ts
import Koa from 'koa';
const app = new Koa();
app.use(async (ctx, next) => { const t = Date.now(); await next(); ctx.set('X-Time', `${Date.now()-t}ms`); });
app.use(async (ctx) => { ctx.body = { ok: true }; });
app.listen(3000);
```

四行起一个有计时 header 的服务。`await next()` 之前是请求进入路径，之后是响应回流路径——同一个函数包住两个方向，这就是 **洋葱模型**。weekly downloads ~1M，core ~600 行 JS，是非内置主义 Node web 框架的事实代表。

## 为什么重要

不理解 Koa，下面这些事都没法解释：

- 为什么 TJ Holowaychuk 写完 Express 三年后又写一个 **反 Express** 的框架——同作者亲手革命自己的产品
- 为什么 Fastify / Hono / Elysia 这些后辈讲设计哲学时都要 **拿 Koa 当参照系**——洋葱中间件是它们的精神祖先
- 为什么 50 行的 `koa-compose` 是 Node 中间件机制的 **教学典范**，读完彻底懂"中间件链异步执行"是怎么回事
- 为什么 Koa v3 卡了好几年发不出稳定版——BDFL（仁慈独裁者）离场后社区维护的真实代价

## 核心要点

Koa 的工作可以拆成 **三个支柱**：

1. **极简核心**：core 只负责 ctx 包装 + 中间件链编排 + 错误冒泡，~600 行 JS。router、body-parser、CORS 全是独立 npm 包（`@koa/router` / `koa-bodyparser` / `@koa/cors`）。"什么都没有"是入口姿态。

2. **洋葱模型中间件**：每个中间件是 `async (ctx, next) => { /* 上游 */ await next(); /* 下游 */ }`。`koa-compose` 50 行实现：`dispatch(i)` 调用 `middleware[i]`，把 `dispatch.bind(null, i+1)` 作为 `next` 传入；`await next()` 实质是 `await dispatch(i+1)` 递归。一进一出对称，错误用 try/catch 一处接。

3. **ctx 取代 (req, res, next)**：Express 把 Node 原生 `req` / `res` 直接暴露；Koa 用 `ctx` 包装两者，提供 `ctx.body` `ctx.status` `ctx.throw()` 这套高层 API。`ctx.state` 是 per-request 状态容器，跨中间件共享数据的标准位置。

三件事拼起来 = 把"中间件链异步控制流"这个 callback 时代痛点用 Promise 时代的语言原生机制解出来。代价：极简哲学换来组装负担，新人上手要装 5-10 个包；ctx 抽象在 2024 年看不如 Hono `c.json()` 方法式明确。

## 实践案例

### 案例 1：洋葱模型的"一进一出"

```ts
app.use(async (ctx, next) => { console.log('1 in');  await next(); console.log('1 out'); });
app.use(async (ctx, next) => { console.log('2 in');  await next(); console.log('2 out'); });
app.use(async (ctx)       => { console.log('3 in');  ctx.body = 'ok'; });
// 请求一次输出: 1 in / 2 in / 3 in / 2 out / 1 out
```

每个 mw 自然处理"请求进入 + 响应回流"两个方向，无需写两套 hook。

### 案例 2：错误统一冒泡

```ts
app.use(async (ctx, next) => {
  try { await next(); }
  catch (err: any) { ctx.status = err.status || 500; ctx.body = { msg: err.message }; }
});
app.use(async (ctx) => { ctx.throw(404, 'user not found'); });
```

下游任意层 throw → 当前 `await next()` reject → 上游 try/catch 接住。Express 的 `next(err)` 显式传错被这套 Promise rejection 自然链取代。

### 案例 3：plugin 拼装而非内置

```ts
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
const router = new Router();
router.post('/users', async (ctx) => { ctx.body = ctx.request.body; });
app.use(cors()).use(bodyParser()).use(router.routes()).use(router.allowedMethods());
```

router / cors / bodyparser 都是独立 npm 包，自己装自己挂——这就是"极简核心"的代价与自由度同源。

## 踩过的坑

1. **极简核心反成入门负担**：开箱什么都没有——做 REST API 至少要装 `@koa/router` + `koa-bodyparser` + `@koa/cors` + `koa-helmet` + `koa-static`。每个包独立维护、版本独立升级、配置风格各异。Express 一行 `express()` 起步，Koa 要拼 5-10 个包。

2. **ctx.state 类型推导是 TS 重灾区**：默认 `Record<string, any>`，挂 `ctx.state.user = ...` 时类型完全丢。补救方式 `declare module 'koa' { interface DefaultState { user?: User } }`，但跨 plugin 扩展 state 类型很麻烦。Hono 用 `Variables: { user: User }` 泛型直传，体验差距明显。

3. **洋葱式调试地狱**：50 个中间件叠起来出错时，stack trace 全是 `dispatch / dispatch / dispatch`。`koa-compose` 没特殊处理 `Error.captureStackTrace`，prod 环境定位异常代价高。Fastify 8 段固定 lifecycle hook 反而清晰。

4. **Stream body 错误隐晦**：`ctx.body = stream` 时 stream 出错不自动冒到 `ctx.onerror`，要手写 `stream.on('error', ctx.onerror)`。文档讲了但藏在角落，新人第一次踩到 stream 错误时连 socket hang up 原因都看不到。

5. **v3 alpha 卡多年**：2019 起的 alpha 版本主要差别是 ESM-first + drop Node <18，但稳定版迟迟没出。TJ 离场后无强决策者拍板。Fastify / Hono 同期快速迭代，Koa 在新一代框架竞争里失速。

## 适用 vs 不适用场景

**适用**：

- 教学示例与中间件机制学习（核心 600 行，`koa-compose` 50 行，源码极易读）
- 中小型 REST API + 轻量微服务（洋葱中间件够清晰）
- 从 Express 迁移过来想要 async/await 但保留同作者血缘
- Bun 直接能跑，少 Node 特定 internal API 绑定 → 跨 runtime 兼容性好

**不适用**：

- 高吞吐场景 → 用 Fastify（schema 编译 + radix tree 快 ~1.5x，~30k req/s）
- Edge runtime 优先 → 用 Hono（~50KB bundle + TS 一等 + Cloudflare Workers）
- 需要严格 TS 类型推导 → 用 Elysia / Hono（schema 一写类型自动推）
- 需要内置 schema 校验 + 完整 lifecycle 8 段 hook → 用 Fastify

## 历史小故事（可跳过）

- **2010 年**：TJ 写 Express，回调风格 + `next(err)` 显式传错，是当时 Node web 框架代表。
- **2013 年**：TJ 起步 Koa v0.x，明确反思 Express——极简核心 + 不内置 router + 用 ES6 generators 解 callback hell。
- **2014 年**：v1 稳定，generators 中间件（`yield next`）展示了"中间件链异步控制流"的优雅写法。
- **2017 年**：v2 改 async/await，把 `yield next` 换成 `await next()`，更符合语言原生。
- **2019-2024 年**：v3 alpha 多年没出稳定版，TJ 多年没活跃 commit，Jonathan Ong / Imed Jaberi 等社区 maintainer 接手节奏放缓。同期 Fastify / Hono / Elysia 抢走"现代 Node web 框架"心智份额。

## 学到什么

1. **同作者反思自己的设计是技术演进的良性信号**：TJ 三年后亲手做 Express 的"反面"——这种"我做的东西我亲手革命"在 OSS 领域少见但极有价值，说明作者真在思考问题本身而不是抱产品不放。
2. **洋葱模型 = async/await 与中间件的自然结合**：Promise 时代之前中间件链是 callback hell；`await next()` 这一句话同时具备"递交控制 + 等待完成"双语义，才让洋葱从概念变成代码。
3. **极简核心是哲学不是产品**：Koa core 600 行漂亮，用户视角是装 10 个包。"哲学正确" vs "用户体验正确" 在框架领域不总一致——Express 一站式赢在 onboarding，Koa 极简赢在思想纯洁。
4. **maintainer 节奏决定框架命运**：v3 卡几年根因是 BDFL 离场后无人拍板。Fastify 双核心 + 商业化（Platformatic）有持续发版动力，OSS 框架成熟期"维护者激励"是第一生产力。
5. **50 行库的复杂度承载量是有限的**：`koa-compose` 50 行实现洋葱很优雅，但任何想加 lifecycle hook 区分 onRequest / preHandler 都要改根本。Fastify 选 8 段固定 hook 牺牲自由度换结构化语义清晰度——这是设计权衡而非优劣。

## 延伸阅读

- 官方仓库：[koajs/koa](https://github.com/koajs/koa)（README + lib/ 四个文件值得通读）
- 中间件核心：[koajs/compose](https://github.com/koajs/compose)（50 行洋葱 dispatch，教学典范）
- 路由独立包：[koajs/router](https://github.com/koajs/router)（@koa/router，path-to-regexp 实现）
- 同作者上一代：[expressjs/express](https://github.com/expressjs/express)（对照看哲学差别）
- 后辈对比：[fastify/fastify](https://github.com/fastify/fastify) / [honojs/hono](https://github.com/honojs/hono)（schema-first / Edge-first 现代版）

## 关联

- [[express]] —— TJ 同作者上一代框架，2010 起；Koa 是它的反思版
- [[fastify]] —— 2017 起，schema-first + plugin encapsulation；Koa 的"加结构化"对手
- [[hono]] —— 2022 起，TS-first + Edge runtime；Koa 哲学的现代化重写
- [[elysia]] —— 2023 起，Bun-first + 自带 schema；新一代代表
- [[hapi]] —— 配置驱动 + 内置一切，与 Koa 组合式哲学相反
- [[bun]] —— Koa 直接能跑的新 runtime，跨 runtime 兼容性优势
- [[axios]] —— 同样 TJ 时代的小而美 npm 库，命名规约 / 维护断档模式可类比
- [[ink]] —— 同期"用 React 心智搬到非浏览器宿主"案例，体现哲学决定边界

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[bun]] —— Bun — JS 全能运行时
- [[clack]] —— Clack — 给 Common Lisp 加一层标准化的 web 服务器接口
- [[commander]] —— commander.js — Node.js CLI 解析的声明式标准
- [[echo]] —— Echo — 极简高性能 Go 框架，5 行起服务
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[fiber]] —— Fiber — 把 Express 写法搬到 Go 上的高性能 web 框架
- [[hono]] —— Hono — 多运行时 Web 框架
- [[ink]] —— ink — 用 React 组件树写终端 CLI
- [[ktor]] —— Ktor — 用 Kotlin DSL 拼出来的异步 Web 框架
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[pino]] —— pino — 日志不该阻塞热路径
- [[zod]] —— Zod — TypeScript-first schema 验证

