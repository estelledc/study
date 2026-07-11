---
title: got — Node 端 HTTP 客户端的瑞士军刀
来源: 'https://github.com/sindresorhus/got'
日期: 2026-05-30
分类: projects
难度: 中级
---

## 是什么

got 是一个**只跑在 Node 服务端**的 HTTP 客户端，由 Sindre Sorhus 在 2014 年起头，后来 Szymon Marczak 接过主力维护。日常类比：像一把厨房里的**多功能料理棒**——同一个手柄能装搅拌头 / 打蛋头 / 切碎头，下载、上传、翻页、重试都换头不换手。

它和今天 fetch 系（ky / wretch / ofetch）最大的差别就一句话：**got 不是 fetch 的薄壳，它是基于 `node:http` / `node:https` / `node:http2` 自己写一套完整状态机**。所以它能做 fetch wrapper 做不到的事：retry、流式上传下载、自动 next-link 翻页、unix socket、HTTP/2、RFC 7234 标准 cache、cookie jar——这些在 ky 里要么要插件、要么没有。

代价：bundle 大（约 200 KB），不跑浏览器，不跑 Cloudflare Worker / Vercel Edge。25M weekly downloads，14k+ GitHub stars。

## 为什么重要

不理解 got，下面这些事都没法解释：

- 为什么"Node 端 HTTP client"和"浏览器 fetch"在 2024 年还分两条进化线，没有合流
- 为什么 axios 在 Node 服务端项目逐渐被 got 取代——只在浏览器+Node 兼容场景还赢
- 为什么 v12 切 ESM-only 引爆社区争议，很多老项目被迫锁在 v11.8.5 不敢动
- 为什么爬虫 / 大文件下载 / API 网关这种"轴向特性多"的场景，用 got 比堆 axios 插件干净

## 核心要点

got 的设计可以拆成 **三个支柱**：

1. **4 套并列 API 共享一套 options**：Promise（默认）/ Stream / Pagination / Instance（带预设的 wrapper），底层是同一个 Request 类、同一份 80+ 字段的 Options。类比：四个出口的水龙头都接在一根总水管上。

2. **Request 继承 Duplex stream**：所有请求底层都是双向流，可读（接响应）+ 可写（发 body）。Promise API 内部其实是把 stream buffer 完再解析。stream 是 first-class，promise 是 derived。

3. **retry 不是包 promise 是重起 Request**：触发重试时把当前 Request destroy 掉，用相同 options 起一个新 Request——保留完整生命周期事件，不是"static 重试 N 次"那种黑盒。

## 实践案例

### 案例 1：集中 client + 自动续 token

把所有调用从一个 `got.extend` 出来的实例派生，hook 里统一注 token / 打日志：

```ts
// lib/http.ts
import got from "got";

export const http = got.extend({
  prefixUrl: process.env.API_URL,
  timeout: {request: 5000, connect: 1000},
  retry: {
    limit: 3,
    methods: ["GET", "HEAD", "OPTIONS"],   // 显式收窄，不要默认重 PUT/DELETE
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
  hooks: {
    beforeRequest: [async (opts) => {
      opts.headers.authorization = `Bearer ${await getToken()}`;
    }],
    beforeRetry: [async (opts, error) => {
      if (error?.response?.statusCode === 401) await refreshToken();
    }],
  },
});
```

`beforeRetry` 在 401 时刷 token 再重试，比 axios 用 interceptor 实现"401 自动续杯"直观一档。

### 案例 2：流式下大文件 + 进度

下载 zip 时不要 `await response.body` 把 200 MB 塞进内存。用 stream + `pipeline`：

```ts
import {pipeline} from "node:stream/promises";
import {createWriteStream} from "node:fs";
import got from "got";

const stream = got.stream("https://example.com/big.zip");
stream.on("downloadProgress", ({percent, transferred, total}) => {
  console.log(`${(percent * 100).toFixed(1)}%  ${transferred}/${total}`);
});
await pipeline(stream, createWriteStream("/tmp/big.zip"));
// pipeline 自动处理 error / cleanup / 反压
```

注意错误得在 stream 上 `.on('error', ...)`，不是外面 try/catch——这是 Node stream 通用规则，但很多人踩。

### 案例 3：paginate 一行抓完所有

GitHub / Atlassian 这类用 RFC 5988 Link header 翻页的 API，got 默认就支持：

```ts
import got from "got";

// Link header 自动翻
for await (const repo of got.paginate<Repo>("https://api.github.com/users/sindresorhus/repos")) {
  console.log(repo.name);
}

// API 用 cursor 时自定义
for await (const item of got.paginate<Item>("items", {
  pagination: {
    transform: (res) => res.body.items,
    paginate: ({response}) => response.body.nextCursor
      ? {searchParams: {cursor: response.body.nextCursor}} : false,
    countLimit: 10000, requestLimit: 100,    // 双重保险防死循环
  },
})) { /* ... */ }
```

`countLimit` + `requestLimit` 一起防"API 给死循环 cursor"这种边角灾难。

## 踩过的坑

1. **v12+ ESM-only 卡死老项目**：CommonJS 项目（`require`）只能锁 v11.8.5。Sindre 立场是"ESM 是标准、CJS 在死"，但 npm stats 显示 v11/v12+ 比例约 4:6，意味着 40% 用户被锁两年前版本，bug fix 拿不到。

2. **默认 retry=2 + 默认重 PUT/DELETE 在真实业务里炸**：RFC 说 PUT 幂等，但很多项目的 PUT 触发后续异步任务（发邮件 / 写日志），不真幂等。要么显式 `retry: {methods: ["GET"]}` 收窄，要么业务层加 idempotency key。

3. **stream 错误用 try/catch 抓不到**：必须 `stream.on('error', ...)` 或者用 `pipeline()` 让它自己抛。把 stream 当 promise `await` 是新人最常见的吞错误方式。

4. **bundle 200 KB + Node-only**：Lambda / Vercel Function cold start 多 50-100ms 解析时间；Cloudflare Worker / Vercel Edge / Deno Deploy 直接不能跑（核心代码 import node:http）。"全栈一把梭"的幻觉在 Edge 时代必须破。

## 适用 vs 不适用场景

**适用**：

- Node 服务 / 爬虫 / 大文件下载 / API 网关——需要 retry / stream / pagination 这种轴向特性
- Node 18 之前的项目，没有原生 fetch 兜底
- 需要 unix socket / HTTP/2 / RFC 7234 cache / cookie jar 这些 fetch 系拿不到的能力
- 类型推断要求高的 TS 项目（got 是 100% TS 写就，generic 推响应）

**不适用**：

- 浏览器项目 → 用 ky / ofetch / axios
- Cloudflare Worker / Vercel Edge / Deno Deploy → 用 ky / 原生 fetch
- Node 18+ 简单 API 调用 → 原生 fetch 已经够用，加 got 是过度依赖
- Lambda / Serverless 关心 cold start 的小函数 → 用 undici / 原生 fetch
- CommonJS 老项目升不动 ESM → 锁 v11.8.5 用着，但拿不到新版 bug fix

## 历史小故事（可跳过）

- **2014-11**：Sindre Sorhus 发 got v0.1，定位是替代当时已经沉重而进入维护期的 request 库
- **2015 中**：v1.0 发布，主打 Promise API + 简单的 retry / hook
- **2021**：v11 整体重写为 TypeScript，类型从源码生成
- **2022-04**：v12 切 ESM-only 引爆社区，issues #1789 / #2051 / #2089 集中抱怨
- **2024**：v14 起要求 Node ≥ 20；Sindre 精力转向 ky 和新项目，主力维护交给 Szymon Marczak (@szmarczak)

## 学到什么

1. **Node 端 HTTP 复杂性是固有的，不是 got 加的**——retry / cookie / cache / proxy / unix socket / HTTP/2 在裸 `node:http` 里全部要自己写。got 选择"把复杂吸收"，fetch 系选"包薄壳把复杂留给用户"，没绝对优劣
2. **Promise + Stream + AsyncIterable 三套异步模型** 在 got 里同框出现，是现代 Node 异步语义的活教材
3. **"友好默认 vs 显式声明"是产品哲学**——got 默认 retry=2，axios 默认不 retry，两边都对，只是赌的用户不一样
4. **Node-only 是赌注**——10 年前是优势（一份代码两端跑），今天 Edge 时代是限制；选 got 等于赌"Node 服务越来越复杂"这个方向

## 延伸阅读

- 官方文档：[got/readme.md](https://github.com/sindresorhus/got#readme)（功能矩阵 + 4 套 API 速查）
- 深度文章：[Node.js HTTP libraries comparison — got vs axios vs node-fetch](https://blog.logrocket.com/got-vs-axios/)
- ESM 迁移之争：Sindre 的立场帖 [`Pure ESM package`](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c)
- [[axios]] —— got 早年对标的"通用 HTTP 客户端"，今天在浏览器场景仍占主导
- [[ky]] —— 同作者 Sindre 的轻量 fetch wrapper，是 got 在 Edge 时代的"另一条腿"

## 关联

- [[axios]] —— 老牌 HTTP 客户端，浏览器+Node 双端，与 got 在 Node 服务场景直接竞争
- [[ky]] —— Sindre 同作者的 fetch 薄壳，与 got 互补覆盖 Edge 运行时
- [[ofetch]] —— UnJS / Nuxt 默认，function-style，跟 got 在"现代 Node 后端"赛道相邻
- [[wretch]] —— fluent FP / immutable middleware，和 got 在 API 设计哲学上对位
- [[tanstack-query]] —— 状态层（不是 HTTP 层）；用 got 取数据，用 TanStack Query 缓存
- [[fastify]] —— Node 后端框架；fastify 服务里用 got 出向调用，组合常见

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[ky]] —— ky — 把浏览器自带的 fetch 包成顺手工具
