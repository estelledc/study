---
title: make-fetch-happen — 带磁盘缓存的 npm Fetch 客户端
description: 介绍 make-fetch-happen 如何用 minipass-fetch、HTTP 缓存语义和 cacache 组成可重试的 Fetch 客户端。
来源: https://github.com/npm/make-fetch-happen
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/npm/make-fetch-happen
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 36435b4fd8e68ff77fda4ac515d3dea198da2cb9
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 16.0.1
---

## 是什么

make-fetch-happen 是 npm 自己用的 Fetch 客户端：底层请求交给 `minipass-fetch`，缓存目录交给 [[cacache]]，新鲜度规则交给 `http-cache-semantics`。日常类比：前台按饭店菜单点菜（Fetch API），后厨却记得哪些菜还能热一热、哪些必须再问厨师（ETag / 304），库存本则锁在本地仓库里。

你写：

```js
const fetch = require('make-fetch-happen').defaults({
  cachePath: './my-cache',
});

const res = await fetch('https://registry.npmjs.org/make-fetch-happen');
const body = await res.json();
```

没有 `cachePath` 时它仍能发请求，只是不走磁盘缓存。固定 16.0.1 依赖 `cacache@^21.0.0`。

## 为什么重要

不理解“能不能存”和“要不要再验证”，就解释不了下面几件事：

- 为什么设了 `cachePath` 仍可能完全不写盘
- 为什么 `res.json()` 没被调用时，缓存里常常是空的
- 为什么默认几乎不重试，文档却仍列出一长串可重试状态
- 为什么 GitHub Releases 的 latest 还停在 v15.0.6，npm 上已经是 16.0.1

## 核心要点

固定 16.0.1 的主链可以拆成五步：

1. **先规范化选项**：`configureOptions` 把 method 收成大写，默认 `cache: 'default'`、`retry: { retries: 0 }`、DNS ttl 5 分钟。请求已带 `If-None-Match` 这类条件头时，`default` 会被改成 `no-store`。旧字段 `cacheManager` 只在没写 `cachePath` 时回填。

2. **先问能不能缓存**：`lib/fetch.js` 用 `CachePolicy.storable` 决定走 `cache/` 还是直接 `remote`。没有 `cachePath`、`cache === 'no-store'`、或方法不是 GET/HEAD，都不会进磁盘缓存。策略库按 `shared: false` 构造。

3. **命中后再分支**：`CacheEntry.find` 先 `cacache.index.compact` 去重。`reload` 假装没有缓存；`no-cache` 一律再验证；`force-cache` / `only-if-cached` 或策略仍新鲜则直接 `respond`；否则 `revalidate`。miss 且 `only-if-cached` 抛 `ENOTCACHED`。

4. **写入发生在消费 body 时**：只有 GET 的 200/301/308 且 `policy.storable()` 才会存。200 要等 body 的 `resume` 才 `cacache.put.stream`；301/308 只往索引插一条 `integrity: null` 的元数据。响应头会带 `x-local-cache-status`：`miss` / `hit` / `stale` / `revalidated` / `updated` / `skip`。

5. **远程层自己处理重试和跳转**：`remote` 用 `@npmcli/agent`，默认 `redirect: 'manual'`，再由 `fetch.js` 自己跟。默认 `retries: 0`。只有调用方显式加 retry，且不是 POST、body 也不是流时，才会对 408/420/429/5xx 或若干套接字错误再试。

## 实践示例

### 案例 1：先吃掉 body，缓存才会落盘

```js
const fetch = require('make-fetch-happen').defaults({ cachePath });
const res = await fetch('https://registry.npmjs.org/make-fetch-happen');
await res.buffer();
```

`store()` 把写入挂在 `resume` 上。只拿到 Response、不读 body，200 响应可以标 `miss` 却不进 [[cacache]]。

### 案例 2：`no-cache` 会发条件请求

```js
await fetch(url, { cache: 'no-cache' });
```

即使本地有条目，也会带上策略算出的 `If-None-Match` / `If-Modified-Since`。304 只刷新索引 metadata，内容 integrity 保持原值，状态写成 `revalidated`。

### 案例 3：缓存键不含用户名密码

```js
// 内部等价于：
// make-fetch-happen:request-cache:https://registry.npmjs.org/foo?bar=1
```

`cache/key.js` 用 `url.format`，`auth: false`、`fragment: false`、`search: true`。查询串会进键，用户信息不会。

## 踩过的坑

1. **把默认 retry 理解成“会自动再试”**：`options.js` 在没传 `retry` 时写成 `{ retries: 0 }`。功能在，默认关。

2. **POST 成功后页面还是旧的**：非 GET/HEAD 且状态 200–399 会 `rm.entry(..., { removeFully: true })`，清的是同一 URL 的索引，不是随便哪个 key。

3. **跨主机 302 还带着 Authorization**：`getRedirect` 在 hostname 变化时删除 `authorization` 和 `cookie`。303，或 POST 遇到 301/302，会改成 GET 并丢掉 body。

4. **把 GitHub latest release 当成 16.0.1**：发布页 latest 仍是 `v15.0.6`。npm `16.0.1` 的 `gitHead` 对齐可达 tag `v16.0.1` / `36435b4fd8e68ff77fda4ac515d3dea198da2cb9`。

5. **把 `x-local-cache-hash` 写在 miss 响应上**：刚写入时还不知道最终 hash，`store()` 故意不设这个头。

## 适用 vs 不适用场景

**适用**：

- 需要 Fetch 形态，并且要把可缓存 GET 响应落到本地 [[cacache]] 目录
- 接受 HTTP 缓存语义（新鲜度、条件请求、304）而不是“key 永远有效”
- 调用方会消费 body，并自己打开 retry

**不适用**：

- 只要内容地址存储、不要 HTTP 头——直接用 [[cacache]]
- 浏览器优先、体积敏感的 Fetch 包装——[[ky]] / [[ofetch]] 更贴
- 需要 Node Duplex / 流式重试主链——[[got]] 更贴
- 不能接受 `^22.22.2 || ^24.15.0 || >=26.0.0`

## 固定版本边界

- 本文绑定 `npm/make-fetch-happen@36435b4fd8e68ff77fda4ac515d3dea198da2cb9`，tag `v16.0.1`。`package.json` version 与 npm `gitHead` 同指此提交。
- 16.0.0 收窄 Node 引擎并升到 `cacache@^21.0.0`；16.0.1 是 changelog / CI 整理，无新缓存合同。
- GitHub Releases latest 仍指向 `v15.0.6`，与本页绑定的 tag 不是同一提交。
- 策略对象使用 `http-cache-semantics`，`shared: false`、`ignoreCargoCult: true`。
- 本文未安装依赖、发送网络请求或运行上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **磁盘缓存是可选管道，不是 Fetch 默认值**——没有 `cachePath` 就只走 remote。
2. **HTTP 语义和内容地址要分开看**——能不能存问策略；存成什么问 [[cacache]]。
3. **消费 body 才是写入的开关**——流不流动，缓存就不落盘。
4. **retry 默认次数是 0**——可重试条件存在，不等于每次请求都会重试。

## 应用型自测

1. 不传 `retry` 时，408 响应会不会自动再发一次？
2. GET 200 且策略允许缓存，但调用方不读 `res.body`，内容会不会进入 cacache？
3. `only-if-cached` 在本地没有条目时抛出的错误码是什么？

检查点：

1. 不会。默认 `retries` 为 0。
2. 不会。`store()` 把 `put.stream` 挂在 `resume` 上。
3. `ENOTCACHED`。

## 延伸阅读

- 文档：[npm/make-fetch-happen README](https://github.com/npm/make-fetch-happen#readme)
- 固定源码：[npm/make-fetch-happen](https://github.com/npm/make-fetch-happen) —— 本文绑定提交 `36435b4fd8e68ff77fda4ac515d3dea198da2cb9`
- [[cacache]] —— 响应体真正落盘的那一层
- [[ofetch]] —— 另一条 Fetch 包装，重试合同不同

## 关联

- [[cacache]] —— 磁盘内容地址层
- [[got]] —— Node HTTP 客户端对照
- [[ky]] —— 更薄的 Fetch wrapper
- [[axios]] —— adapter 型客户端，不是这套 npm 缓存目录
- [[wretch]] —— immutable fluent 对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
