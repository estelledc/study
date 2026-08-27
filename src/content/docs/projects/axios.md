---
title: Axios — 浏览器和 Node 都能用的 HTTP 客户端
来源: 'https://github.com/axios/axios'
日期: 2026-05-30
分类: projects
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/axios/axios
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-17'
  immutable_revision: a092bae50d1884782151b2fcea12974d6da6e376
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-17'
  review_after: '2026-10-17'
  applicable_version: 1.18.1
---

## 是什么

Axios 是一个同时面向浏览器与 Node 的 HTTP 客户端。日常类比：像办公室里那个"代收快递的前台"——你只递一张运单（URL、method、headers、body），它再选择适合当前环境的运输渠道。

你写：

```js
const {data} = await axios.get("/api/users", {params: {limit: 10}});
```

固定源码的默认 adapter 列表是 XHR、Node HTTP、Fetch。Axios 还负责 config 合并、request/response transform、interceptor 与按 `validateStatus` 决定 resolve/reject。

## 为什么重要

不理解 axios，下面这些事都没法解释：

- 为什么同一 API 能在 XHR、Node HTTP 和 Fetch adapter 上运行
- 为什么 404 默认进入 catch，但 `validateStatus` 可以把它改成普通 response
- 为什么 interceptor、transform 与 adapter 是三种不同扩展点
- 为什么 TypeScript generic 不能替代响应数据的 runtime schema

## 核心要点

Axios 主链拆成五步：

1. **合并 config 与 headers**：instance defaults 和本次请求被合并，method 被规范化，common/method headers 被拍平。

2. **运行 request interceptors**：它们可以同步或异步修改 config，也可以根据 `runWhen` 跳过。失败处理规则必须按当前版本测试，不能只凭“Promise 链”类比。

3. **transform request + 选择 adapter**：`dispatchRequest()` 先转换 body，再从 XHR/HTTP/Fetch 候选中找当前环境可用实现。

4. **adapter 执行并 settle**：adapter 产生 response，`validateStatus` 决定 resolve 还是构造 `AxiosError` reject。默认接受 200-299。

5. **transform response + response interceptors**：成功与错误 response 都可能经过转换；之后 response interceptors 继续处理 Promise。

## 实践示例

### 案例 1：建一个共享 instance

```js
import axios from "axios";

const api = axios.create({
  baseURL: "https://api.example.com",
  timeout: 5000,
  headers: {"Content-Type": "application/json"}
});

const {data} = await api.get("/users", {params: {limit: 10}});
```

`axios.create()` 返回预填配置的实例。`timeout: 5000` 会交给所选 adapter；它不是跨 adapter 的形式化端到端 SLA，应在真实运行时测试。

### 案例 2：interceptor 处理 401 自动刷新

```js
api.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${getToken()}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      await refreshToken();
      return api.request(original);        // 用新 token 重发原请求
    }
    return Promise.reject(error);
  }
);
```

请求拦截器统一塞 token；响应拦截器第一次看到 401 就刷 token 再重试。生产实现还需合并并发 refresh、判断 body 能否重放，并确保刷新请求本身不会进入同一循环；`_retry` 只解决单请求的一部分问题。

### 案例 3：AbortController 取消请求

```js
const controller = new AbortController();

api.get("/slow-search", {signal: controller.signal})
  .catch((err) => {
    if (axios.isCancel(err)) console.log("用户离开页面，取消了");
  });

// 用户切走 → 取消
controller.abort();
```

`signal` 是 Web 标准（fetch 同款），axios 老的 `CancelToken` API 已 deprecated。React 组件 unmount 时调 `abort()`，避免"已卸载组件 setState"警告。

## 踩过的坑

1. **默认 timeout 为 0**：不会创建 Axios timeout。数值应由链路预算决定，不能把 5 秒当通用答案。

2. **把 interceptor 当自动重试系统**：Axios 默认没有 retry；手写 401 重放还要处理并发 refresh、幂等键和不可重放 stream。

3. **混淆 HTTP error 与 network error**：`validateStatus` 只决定已有 response 的状态处理；DNS、连接和取消错误没有相同的 response 字段。

4. **TypeScript generic 不做运行时校验**：`api.get<User>("/x")` 只是骗 IDE，服务端返 `null` 也照样过编译。要安全得配 zod / valibot 在拦截器或 transform 里跑 parse。

## 适用 vs 不适用场景

**适用**：

- 浏览器 + Node 都要发请求的同构项目（SSR、CLI 工具）
- 团队需要统一 auth / error 处理（interceptor 是最干净的落点）
- 老项目持续维护——已经在用就别折腾换 fetch
- 需要现成的 progress 事件（上传 / 下载进度）—— XHR adapter 内建

**不适用**：

- bundle 极致敏感且已实测原生 fetch / Ky 更合适的场景
- Next.js / RSC / Server Action 里 → 平台推 fetch，能享受请求级缓存
- Node-only 后端且只需要标准 Fetch 语义
- 只发一两个请求的小工具，原生 fetch 已满足错误、timeout 与观测要求

## 固定版本边界

- 本文绑定 `axios/axios@a092bae5...`，默认分支为 `v1.x`，包版本为 `1.18.1`。
- 固定 package exports 会按 browser、Node、Bun 与 React Native 条件选择构建。
- 默认 adapter 候选是 `xhr`、`http`、`fetch`，默认 timeout 为 0，默认不提供 retry policy。
- 本文未安装依赖、运行请求、adapter 测试或性能 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **跨环境一致 API 来自 adapter 边界**——一致外观不代表底层 timeout、stream 和 progress 语义完全相同。
2. **adapter 抽象让库长寿**——XHR → fetch 两代浏览器 API 切换，业务代码零改动
3. **interceptor 是横切关注点的标准答案**——auth / log / retry 这些不该写在每次调用里
4. **deprecated API 删不掉**——CancelToken 拖了 5 年还活着，开源 API 兼容性比想象贵

## 应用型自测

1. 把 `validateStatus` 改为始终返回 `true` 后，500 response 还会自动进入 catch 吗？
2. 两个请求同时收到 401，各自在 response interceptor 调 `refreshToken()`。`_retry` 能否防止两次 refresh？
3. `api.get<User>()` 编译通过，是否说明 response.data 一定是 User？

检查点：

1. 不会因状态码自动 reject；业务仍应自行检查 response。
2. 不能。它只标记各自的原请求，需要共享 single-flight refresh。
3. 不能。泛型只影响静态类型，外部数据仍需 runtime validation。

## 延伸阅读

- 官网文档：[axios-http.com](https://axios-http.com/)（中文版完整，例子多）
- 源码精读：[lib/core/Axios.js](https://github.com/axios/axios/blob/v1.x/lib/core/Axios.js)、[InterceptorManager.js](https://github.com/axios/axios/blob/v1.x/lib/core/InterceptorManager.js)
- 固定源码：[axios/axios](https://github.com/axios/axios) —— 本文绑定提交 `a092bae50d1884782151b2fcea12974d6da6e376`
- 对比文章：[ky vs axios vs got](https://github.com/sindresorhus/ky#comparison)（sindresorhus 视角）
- [[tanstack-query]] —— React 时代 axios 多半被它包一层用
- [[zod]] —— 配 axios 把"运行时类型安全"补上

## 关联

- [[tanstack-query]] —— axios 做 transport，Query 管 cache / retry / loading state
- [[react-hook-form]] —— RHF + axios + zod 是 React 表单提交三件套
- [[zod]] —— interceptor 里跑 schema parse，端到端类型安全
- [[ky]] —— 4KB 的 fetch wrapper，bundle 敏感时的替代
- [[ofetch]] —— Nuxt 团队出品，SSR 友好的 fetch 增强
- [[got]] —— Node-only 老牌 HTTP 客户端，sindresorhus 早期作品
- [[wretch]] —— 链式 API 风格的 fetch wrapper

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dayjs]] —— Day.js — 用 2 KB 复刻 Moment 的极简日期库
- [[ethers-js]] —— ethers.js — 浏览器和 Node 都能用的以太坊客户端库
- [[flutter]] —— Flutter — Google 的 Dart 跨平台 UI 框架
- [[got]] —— got — Node 端 HTTP 客户端的瑞士军刀
- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[ky]] —— ky — 把浏览器自带的 fetch 包成顺手工具
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库
- [[ofetch]] —— ofetch — Nuxt 默认的现代 fetch 包装
- [[reservoir-sdk]] —— Reservoir SDK — 跨市场 NFT 聚合
- [[sortablejs]] —— SortableJS — 一行代码让任何列表能用手拖排序
- [[web3-js]] —— web3.js — 老牌 EVM JavaScript 客户端库
- [[wretch]] —— wretch — 把 fetch 写成一条链
