---
title: axios — 浏览器和 Node 都能用的 HTTP 客户端
来源: 'https://github.com/axios/axios'
日期: 2026-05-30
子分类: projects
分类: 后端 API
难度: 初级
provenance: pipeline-v3
---

## 是什么

axios 是一个**让前端代码发 HTTP 请求**的库。日常类比：像办公室里那个"代收快递的前台"——你只递一张单子（"发到哪 / 装什么"），他帮你处理所有跑腿、签字、报错和退件。

你写：

```js
const {data} = await axios.get("/api/users", {params: {limit: 10}});
```

axios 替你做的：组装 URL 和 query、解析返回的 JSON、把 4xx / 5xx 自动转成可 catch 的错误、给浏览器和 Node 用同一份代码。它本质是**对 XMLHttpRequest 和 Node http 模块的统一包装**，加一层 Promise + interceptor。

2014 年它出现的时候，主流方案还是 `$.ajax` 回调嵌套，axios 的 Promise + 一致 API 直接成了事实标准；十年后浏览器和 Node 都内置了 fetch，但 axios 仍是 npm 周下载量第一的 HTTP 库（50M+）。

## 为什么重要

不理解 axios，下面这些事都没法解释：

- 为什么 React / Vue 教程八成第一个 import 就是 `import axios from "axios"`
- 为什么很多团队从 fetch 迁回 axios——4xx 自动 reject、JSON 自动 parse、timeout 一行配
- 为什么 SSR / Next.js 又开始推回 fetch——平台原生、可缓存、零依赖
- 为什么 jQuery 退场了，但 axios 没退场——它解决的是"跨端 + 易用"，不是"DOM 操作"

## 核心要点

axios 要点拆成 **四件事**：

1. **config 对象**：每次请求都是一份配置（url / method / headers / data / params / timeout / signal），axios 把所有差异塞进这一个对象。类比：寄快递时填的运单。

2. **interceptor 链**：在请求出门前 / 响应进门后插钩子。最经典用法是**统一加 token + 401 自动刷新重试**。本质就是 Promise.then 链，按注册顺序串起来。

3. **adapter 适配器**：实际发请求的零件可以替换。浏览器走 XHR、Node 走 http、v1.7 起还能走 fetch。同一份业务代码，跑哪都行。

4. **transformRequest / transformResponse**：发出前和拿到后自动转一道。默认就是 `JSON.stringify` 和 `JSON.parse`——这就是 axios 比 fetch "省事"的关键。

## 实践案例

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

`axios.create()` 返回一个**预填配置的实例**。整个 App 共用一份 `api`，换 baseURL 改一处即可。这是 axios 最该养成的第一个习惯。

### 案例 2：interceptor 处理 401 自动刷新

```js
api.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${getToken()}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await refreshToken();
      return api.request(error.config);   // 用新 token 重发原请求
    }
    return Promise.reject(error);
  }
);
```

请求拦截器统一塞 token；响应拦截器看到 401 就刷 token 再重试。业务代码完全不用知道有 token 这回事——这是 interceptor 模式最经典的舞台。

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

1. **默认没有 timeout**：不显式配 timeout，遇到慢服务整个 await 卡死，UI 一直转圈。一律在 `axios.create` 里写 `timeout: 5000`。

2. **interceptor 里塞 await 重活**：拦截器里 await 写日志 / 拉配置，会让所有请求**串行排队**，QPS 暴跌。拦截器只做"轻改 config"，重活放业务层。

3. **CancelToken 老 API 还在文档里**：网上一半教程教旧的 `CancelToken.source()`，新代码统一用 `AbortController`。两套混用会让取消状态错乱。

4. **TypeScript generic 不做运行时校验**：`api.get<User>("/x")` 只是骗 IDE，服务端返 `null` 也照样过编译。要安全得配 zod / valibot 在拦截器或 transform 里跑 parse。

## 适用 vs 不适用场景

**适用**：

- 浏览器 + Node 都要发请求的同构项目（SSR、CLI 工具）
- 团队需要统一 auth / error 处理（interceptor 是最干净的落点）
- 老项目持续维护——已经在用就别折腾换 fetch
- 需要现成的 progress 事件（上传 / 下载进度）—— XHR adapter 内建

**不适用**：

- bundle 极致敏感的场景（Cloudflare Worker / 移动端 H5）→ 用 ky（4KB）或原生 fetch
- Next.js / RSC / Server Action 里 → 平台推 fetch，能享受请求级缓存
- Node-only 高性能后端 → 用 undici，HTTP/2 + keepalive 性能高 2-3x
- 只发一两个请求的小工具 → 直接 fetch，不必 17KB 依赖

## 历史小故事（可跳过）

- **2014-08**：Matt Zabriskie 发 v0.1，目标是给 AngularJS 1.x 当 `$http` 替代品
- **2016-2017**：Promise 时代来临，axios 比 jQuery.ajax 易用、比原生 fetch 友好，迅速成主流
- **2018**：Matt 退出维护，仓库一度无人合 PR，社区焦虑
- **2020**：OpenJS Foundation 接管，恢复发版节奏
- **2022**：v1.0 GA，TypeScript 类型内置，AbortController 接替 CancelToken
- **2024**：v1.7+ 加 fetch adapter，承认"未来属于平台原生"

## 学到什么

1. **生态 inertia 比技术领先更顽固**——axios 50M weekly 不是因为最强，而是教程 / SO / 团队习惯堆出来的
2. **adapter 抽象让库长寿**——XHR → fetch 两代浏览器 API 切换，业务代码零改动
3. **interceptor 是横切关注点的标准答案**——auth / log / retry 这些不该写在每次调用里
4. **deprecated API 删不掉**——CancelToken 拖了 5 年还活着，开源 API 兼容性比想象贵

## 延伸阅读

- 官网文档：[axios-http.com](https://axios-http.com/)（中文版完整，例子多）
- 源码精读：[lib/core/Axios.js](https://github.com/axios/axios/blob/v1.x/lib/core/Axios.js)、[InterceptorManager.js](https://github.com/axios/axios/blob/v1.x/lib/core/InterceptorManager.js)
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
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[got]] —— got — Node 端 HTTP 客户端的瑞士军刀
- [[i18next]] —— i18next — 让一份 JS 代码同时讲几十种语言
- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[ky]] —— ky — 把浏览器自带的 fetch 包成顺手工具
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库
- [[ofetch]] —— ofetch — Nuxt 默认的现代 fetch 包装
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[reservoir-sdk]] —— Reservoir SDK — 跨市场 NFT 聚合
- [[sortablejs]] —— SortableJS — 一行代码让任何列表能用手拖排序
- [[tanstack-query]] —— TanStack Query — 数据获取与缓存库
- [[web3-js]] —— web3.js — 老牌 EVM JavaScript 客户端库
- [[wretch]] —— wretch — 把 fetch 写成一条链
- [[zod]] —— Zod — TypeScript-first schema 验证

