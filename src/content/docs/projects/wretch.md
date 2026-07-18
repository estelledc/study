---
title: Wretch — 用不可变配置链组织 Fetch
来源: https://github.com/elbywan/wretch
日期: 2026-05-30
分类: 前端工具
难度: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/elbywan/wretch
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-17'
  immutable_revision: 32d5f68badf7e8f103b734febe680968c6e0f97f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-17'
  review_after: '2026-10-17'
  applicable_version: 3.0.9
---

## 是什么

Wretch 是一个围绕 Fetch 构建的 fluent HTTP 客户端。日常类比：先在一张新运单上逐步追加 URL、headers 与 body，调用 `.get()` / `.post()` 后才交给运输系统，再用 response chain 选择解析或错误处理方式。

你写：

```js
import wretch from "wretch"

const user = await wretch("/api/users/1")
  .auth("Bearer abc")
  .get()
  .json()
```

这一句会创建带 URL 的配置对象、复制并加入 Authorization header、触发 Fetch，再解析 JSON。固定 3.0.9 同时导出 core、addons 与 middlewares；实际 bundle 取决于 import 与构建器，本轮未测量。

## 为什么重要

不理解 wretch 这种"一步一个方法、改配置不改原对象"的写法，就解释不了下面几件事：

- 为什么配置方法丢弃返回值时，原实例不会被更新
- 为什么 `.get()` 后得到 ResponseChain，而 `.json()` 后才得到 Promise
- 为什么 wrapper catcher 与 response-chain error handler 是两层 API
- 为什么 retry、dedupe 与 timeout 分别位于 middleware/addon，而不是 core 默认

## 核心要点

Wretch 的执行链可以拆成五步：

1. **创建配置对象**：factory 用 `{...core, _url, _options}` 生成 fresh object，不是 class instance。

2. **复制配置**：`.url()`、`.headers()`、`.auth()`、`.catcher()` 等以 object spread 或新 Map 返回副本；不会修改原 wrapper。

3. **动词触发 resolver**：`.get()` / `.post()` 进入 `fetch()`，普通 object body 在 JSON MIME 边界被 stringify，然后创建 resolver。

4. **middleware 包裹 Fetch**：`reduceRight` 把 middleware 组装成洋葱链，最先注册的 middleware 位于最外层。

5. **ResponseChain 解析或派发错误**：非 ok response 形成 `WretchError`；`.res()` / `.json()` 等消费结果，response-chain 的 `.notFound()` 等可注册本次请求 catcher。

## 实践示例

### 案例 1：把原生 fetch 三行压成一行

原生 fetch：

```js
const res = await fetch("/api/users/1", { headers: { Authorization: "Bearer abc" } })
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const user = await res.json()
```

wretch 等价写法：

```js
const user = await wretch("/api/users/1").auth("Bearer abc").get().json()
```

`.auth(...)` 返回新 wrapper；`.get()` 已发起底层 Fetch；`.json()` 选择 body parser。非 ok response 会形成包含 response/status/url 的 `WretchError`。

### 案例 2：复用一个 base wrapper

```js
const api = wretch("https://api.example.com")
  .auth(`Bearer ${token}`)
  .headers({ "X-Trace-Id": traceId })

const me   = await api.url("/me").get().json()
const post = await api.url("/posts").post({ title: "hi" }).json()
const file = await api.url("/upload").body(blob).put().res()
```

**逐部分解释**：

1. `api` 保存 base URL + auth + 公共头。
2. 每次 `.url(...)` 返回新 object，三处调用互不污染。
3. `.res()` 返回原始 Response；`.json()` 等方法消费 body。

### 案例 3：装一个 retry middleware

```js
import wretch from "wretch"
import { retry } from "wretch/middlewares"

const api = wretch().middlewares([
  retry({
    delayTimer: 500,
    maxAttempts: 3,
    retryOnNetworkError: false,
    skip: (_url, options) => options.method !== "GET"
  })
])

const data = await api.url("/flaky").get().json()
```

`maxAttempts` 表示最多重试次数，因此总调用可能是 1 + 3。固定默认会重试 5xx、停止于 4xx，network error 默认不重试；middleware 本身不按 HTTP method 判断，示例用 `skip` 收窄到 GET。

## 踩过的坑

1. **混淆两层 catcher API**：wrapper 上是 `.catcher(404, fn)`；`.get()` 后的 ResponseChain 用 `.notFound(fn)` 或 `.error(404, fn)`，没有同名 `.catcher()`。

2. **丢弃配置方法返回值**：`api.auth(...)` 不会修改 `api`，必须接住返回的新 object。

3. **把 retry middleware 当幂等保护**：默认不检查 method；POST 也可能重试 5xx。副作用请求必须用 `skip`、idempotency key 或等价策略收口。

4. **误读 `maxAttempts`**：值 3 表示初次请求之外最多重试 3 次，总调用可达 4；固定默认值是 10，不是 3。

5. **把 addon 当 core 默认**：timeout 依赖 Abort addon 的 `setTimeout()`，retry 依赖 middleware；只 import core 不会自动获得这些策略。

## 适用 vs 不适用场景

**适用**：

- 满足当前 package Node >=22 边界，或具有标准 Fetch 的目标运行时
- 喜欢不可变 fluent config 与显式 ResponseChain
- 希望按需组合 middleware/addon，并愿意自己定义 retry/timeout policy

**不适用**：

- 项目已经在用 axios 且团队习惯 config object 风格——再换成本不划算
- 用 Nuxt / Nitro——`ofetch` 框架已经默认集成
- Node 版本低于当前 package engines，且无法升级
- 想要"运行时强校验响应"——wretch 不做，得再加 zod / valibot

## 固定版本边界

- 本文绑定 `elbywan/wretch@32d5f68b...`，tag、package 与 npm `gitHead` 均为 `3.0.9`。
- package 同时提供 import/require exports，声明 Node >=22。
- retry middleware 默认 `delayTimer=500`、线性 delay ramp、`maxAttempts=10`、停止于 ok 或 4xx、network retry 关闭。
- 本文未安装依赖、运行上游 Node/browser/Bun/Deno 测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **不可变不要求 class**——object spread 与新 Map 就能形成可复用配置链。
2. **请求触发与响应消费是两个阶段**——动词创建 ResponseChain，parser 再返回 Promise。
3. **扩展点也有职责边界**——middleware 包装 Fetch，addon 扩展 wrapper/response chain。
4. **retry 默认不是业务安全策略**——method、副作用、body 重放与总预算仍需调用方约束。

## 应用型自测

1. 执行 `api.auth("Bearer x")` 但不保存返回值，后续 `api.get()` 会带新 header 吗？
2. `retry({maxAttempts: 3})` 最多会调用底层 Fetch 几次？
3. 默认 retry middleware 遇到 POST 500，会因为 method 是 POST 而自动跳过吗？

检查点：

1. 不会；原 wrapper 未变。
2. 最多 4 次，包含初次调用和 3 次 retry。
3. 不会。默认 condition 看 response，不看 method；需显式 `skip` 或幂等设计。

## 延伸阅读

- 官方文档：[elbywan.github.io/wretch](https://elbywan.github.io/wretch)（API 全集 + middleware / addon 列表）
- 固定源码：[elbywan/wretch](https://github.com/elbywan/wretch) —— 本文绑定提交 `32d5f68badf7e8f103b734febe680968c6e0f97f`
- [[axios]] —— 老牌 HTTP 客户端，和 wretch 的设计哲学正相反
- [[ky]] —— 同属轻量 fetch 包装，API 风格可对照着看

## 关联

- [[axios]] —— wretch 的"对照组"：config object vs fluent chain
- [[ky]] —— 另一款轻量 fetch wrapper，和 wretch 常被横评
- [[ofetch]] —— Nuxt / Nitro 默认 HTTP 客户端，框架内优先选它
- [[tanstack-query]] —— wretch 当 fetcher，Query 管缓存和重试状态
- [[msw]] —— wretch 测试用的 mock 网络层，跟 fetch 标准对齐
- [[zod]] —— 补 wretch 缺的"运行时响应校验"那一环

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[got]] —— got — Node 端 HTTP 客户端的瑞士军刀
