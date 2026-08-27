---
title: htmx — 用 HTML 属性发请求、换 DOM
description: 用 HTML 属性发出 XHR 并按固定 swap/status 规则替换 DOM 的 HTML-first 库。
来源: https://github.com/bigskysoftware/htmx
日期: 2026-08-27
分类: HTML-first
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/bigskysoftware/htmx
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: bdc7d7d3e25d0390c7ee11049806e8279b075598
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.10
---

## 是什么

htmx 是一个**让 HTML 属性直接发出 AJAX、再按规则替换 DOM** 的浏览器库。日常类比：像给标签加遥控器——按钮自己说“点我去哪个地址、把回包塞进哪块”，不必再写一层 fetch + innerHTML 样板。

你写：

```html
<button hx-post="/clicked" hx-target="#result" hx-swap="innerHTML">
  点我
</button>
<div id="result"></div>
```

固定 `2.0.10` 的实现集中在单文件 `src/htmx.js`。`hx-post` 属于核心动词表 `get/post/put/delete/patch`；未写 `hx-trigger` 时，普通元素默认 `click`。未写 `hx-target` 时，非 boost 请求默认替换**触发元素自己**。

## 为什么重要

不理解 htmx 的属性合同，下面这些事都会说错：

- 为什么“HTML-first”不是口号：请求、目标、交换、确认都写在属性上，JS 只负责解释
- 为什么默认不跨源：`selfRequestsOnly` 为 true，跨 origin 会被 `verifyPath` 拦下
- 为什么 4xx/5xx 默认不换 DOM：`responseHandling` 把 `[45]..` 标成 `swap: false, error: true`
- 为什么和 [[alpinejs]] 常一起出现：htmx 管“去服务器换 HTML”，Alpine 管“这块 HTML 里的本地状态”

## 核心要点

固定源码的执行链可以拆成五步：

1. **就绪后扫一遍 DOM**：`DOMContentLoaded` 后合并 `meta[name="htmx-config"]`，给 body 跑 `processNode`，按属性哈希决定是否重新绑定。

2. **解析触发器**：有 `hx-trigger` 就解析；否则 `form` → `submit`，`input[type=button|submit]` → `click`，其它 input → `change`，其余 → `click`。

3. **`issueAjaxRequest` 发 XHR**：先走 `htmx:confirm` / `hx-confirm`，再按 `hx-sync`（默认 in-flight 用 `drop`，排队默认 `last`）决定丢弃、中止、替换或入队。用 `XMLHttpRequest`，不是 fetch。

4. **带上 htmx 头**：`HX-Request: true`、`HX-Current-URL`，以及触发元素的 `HX-Trigger` / `HX-Trigger-Name` 和目标 `HX-Target`。boost 请求再加 `HX-Boosted: true`。GET/DELETE 默认把参数放进 URL，其它动词默认 `application/x-www-form-urlencoded`。

5. **按状态码决定是否 swap**：204 不换；`[23]..` 换；`[45]..` 不换并记错误。通过后走 `swap`：默认 `innerHTML`，再等 `defaultSettleDelay` 20ms 结算 `class/style/width/height`。扩展可以 `transformResponse` 或接管未知 `hx-swap`。

## 实践示例

### 案例 1：按钮 POST，回包换自己

```html
<button hx-post="/like" hx-swap="outerHTML">赞</button>
```

未写 `hx-target`，非 boost 路径的 `getTarget` 返回按钮自己；默认 `innerHTML` 会换成“按钮内部”。这里显式 `outerHTML`，整颗按钮被服务端回包替换。默认 trigger 是 `click`。

### 案例 2：表单提交，参数进 body

```html
<form hx-post="/search" hx-target="#results">
  <input name="q" />
  <button type="submit">搜</button>
</form>
<div id="results"></div>
```

`form` 的默认 trigger 是 `submit`。POST 不在 `methodsThatUseUrlParams`（只有 `get`/`delete`）里，值进 body。`hx-target="#results"` 覆盖“换自己”的默认。

### 案例 3：boost 把链接升级成 AJAX

```html
<body hx-boost="true">
  <a href="/about">关于</a>
</body>
```

`boostElement` 只提升同源、`target` 为空或 `_self` 的 `<a>`，以及 `method` 不是 `dialog` 的 `<form>`。boost 后默认目标是 `document.body`，并带 `HX-Boosted: true`。

## 踩过的坑

1. **把默认 target 想成 body**：只有 boost 才默认 body；普通 `hx-get` 默认换触发元素。
2. **以为 404/500 也会 swap**：固定 `responseHandling` 对 `[45]..` 是 `swap: false`。要换错误页必须改配置或响应头 `HX-Reswap` / `HX-Retarget`。
3. **跨源请求被静默挡下**：`selfRequestsOnly` 默认 true，`verifyPath` 比较 `url.origin`。
4. **并发默认 drop 或 queue last**：已有 xhr 且不可 abort 时，默认策略是 `last`（清掉旧队列只留最新），不是自动并行。
5. **`allowEval` 默认 true**：`hx-vars`、触发条件、脚本标签都依赖它；CSP 环境要显式关掉，不能假定“只是属性、没有 eval”。

## 适用 vs 不适用场景

**适用**：

- 服务端已经能吐 HTML 片段，希望少写前端状态机
- 表单、列表刷新、局部替换这类“请求 → 换一块 DOM”
- 需要渐进增强：`hx-boost` 把普通链接/表单升级成 XHR

**不适用**：

- 默认就要跨 origin 调 API——先改 `selfRequestsOnly` 并自己处理 CORS
- 要把 4xx 错误页直接 swap 进当前块——默认不会
- 需要 fetch/stream/复杂客户端路由——这不是固定 2.0.10 的合同
- 想跟 4.0 beta 混用 API——npm `next` 已指向 `4.0.0-beta6`，本文不绑定

## 固定版本边界

- 本文绑定 `bigskysoftware/htmx@bdc7d7d3...`，tag `v2.0.10`，package `htmx.org@2.0.10`；npm `gitHead` 与 tag 一致。
- npm `latest` 是 2.0.10；`next` 是 `4.0.0-beta6`。4.x 未读、未绑定。
- 默认：`defaultSwapStyle=innerHTML`，`timeout=0`，`defaultSwapDelay=0`，`defaultSettleDelay=20`，`historyCacheSize=10`，`selfRequestsOnly=true`。
- 核心只发 XHR；ws/sse 等能力走扩展入口，不在本文件默认装载。
- 本文未安装依赖、未跑上游测试、未发网络请求，状态保持 `UNVERIFIED`。

## 学到什么

1. **HTML 属性可以是完整的请求合同**——动词、触发、目标、交换、确认都不必先经过 JS 框架状态。
2. **默认值比口号更重要**——target、status → swap、同源限制都要以固定源码为准。
3. **boost 和普通 hx-* 不是同一条默认路径**——目标从 body 变成“自己”就是一条常见误读。
4. **扩展是 swap/response 的逃生舱**，不是第二个运行时。

## 应用型自测

1. `<div hx-get="/x">` 没写 `hx-target`，成功 200 后默认换哪？
2. 同一元素上一次请求还在飞，默认会并行发出第二次吗？
3. 服务端返回 500 且没有 `HX-Reswap`，固定 2.0.10 会 swap 吗？

检查点：

1. 换这个 `div` 自己，不是 body。
2. 不会并行；已有 xhr 时默认按 `last` 排队，只保留最新一次。
3. 不会。`[45]..` 默认 `swap: false`。

## 延伸阅读

- 文档：[htmx.org](https://htmx.org/)
- 固定源码：[bigskysoftware/htmx](https://github.com/bigskysoftware/htmx) —— 本文绑定提交 `bdc7d7d3e25d0390c7ee11049806e8279b075598`
- [[alpinejs]] —— 同一 HTML 上补本地响应式，不接管请求
- [[phoenix]] —— 服务端 HTML + 事件推送的另一条路

## 关联

- [[alpinejs]] —— 客户端状态留在标记里；htmx 负责把新 HTML 换进来
- [[phoenix]] —— LiveView 也是“少写 JS、多换 HTML”，但状态在服务端进程
- [[remix]] —— 同样拥抱 form/fetch，但是 React 全栈约定
- [[qwik]] —— 也把行为序列化进 HTML，但是为了 resume 而不是 AJAX swap

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alpinejs]] —— Alpine.js — 在 HTML 上长出一块本地响应式
