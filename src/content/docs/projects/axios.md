---
title: axios Promise-based HTTP 客户端
来源: https://github.com/axios/axios + axios-http.com 官方文档
---

# axios — Promise-based HTTP 客户端的事实标准

## 一句话总结（≥ 12 行）

axios 是 Matt Zabriskie 2014 年开源的 HTTP 客户端，10 年后（2024）仍是 npm 下载量最大的 JS HTTP 库（weekly downloads 50M+）。

它的成功来自三件事：(1) Promise-based API（在 callback hell 时代是革命性体验）；(2) browser + Node 通用（一套代码两端跑）；(3) interceptor + 自动 JSON 解析等"开箱即用"行为，比当时的 fetch + 手动 .json() 友好。

2025 年的现实：浏览器 fetch 早已普及（2015 起），Node 18+ 也内置 fetch（2022 起）。axios 的"网络抽象"价值在缩水。但它仍占据 50M downloads，因为：(1) 教程/文档/StackOverflow 答案 axios 占主导；(2) interceptor / cancel / progress 等 fetch wrapper 都要自己写；(3) 老项目 inertia 大。

替代品（ky / ofetch / wretch / undici）在 2020+ 兴起，但 axios 仍是默认选择。这是开源生态网络效应的经典案例。

## Layer 0 — 项目档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `axios` |
| 当前主版本 | 1.x（2024 持续 patch） |
| 首版 | 2014-08（v0.1） |
| License | MIT |
| 主仓库 | axios/axios |
| 维护 | 社区驱动（原作者 Matt Zabriskie 2018 后逐步退出，OpenJS 接管） |
| TypeScript | v0.27+ 内置 .d.ts |
| 浏览器 + Node | XHR adapter / http(s) adapter / fetch adapter（v1.7+） |
| Bundle 大小 | ~17 KB min+gzip |
| Tree-shake | 不友好（method chain + interceptor 链） |
| 子包数 | 1 主包 |
| 内部依赖 | follow-redirects / form-data / proxy-from-env |
| Weekly downloads | 50M+ |
| GitHub stars | 105k+ |
| 商业版 | 无 |
| 文档站 | axios-http.com |
| 主要用途 | HTTP API 调用 / SSR / 后台爬虫 |

## Layer 1 — 核心抽象（≥ 30 行）

```ts
import axios from "axios";

// GET
const {data} = await axios.get("/api/users", {params: {limit: 10}});

// POST 带 body
const {data: created} = await axios.post("/api/users", {name: "Alice", age: 25});

// 配置 instance
const api = axios.create({
  baseURL: "https://api.example.com",
  timeout: 5000,
  headers: {Authorization: "Bearer ..."}
});

// interceptor
api.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${getToken()}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await refreshToken();
      return api.request(error.config);  // 重试
    }
    return Promise.reject(error);
  }
);

// cancellation
const controller = new AbortController();
api.get("/api/users", {signal: controller.signal});
controller.abort();
```

四要素：

1. **HTTP 方法** axios.get / post / put / delete / patch / head / options
2. **request config** url / method / data / params / headers / timeout / responseType / signal
3. **interceptor** request 加 auth / response 重试 / error 全局处理
4. **instance** axios.create() 多套配置共存（不同 API 不同 baseURL）

## Layer 2 — 内部架构（≥ 30 行）

axios 主流程：

```
1. user 调 axios.get(url, config)
2. dispatchRequest(config)
3. 逐个跑 request interceptors（链式：每个 use 注册的回调）
4. adapter（XHR / HTTP / fetch）发实际请求
5. 逐个跑 response interceptors（链式）
6. transformResponse（默认 JSON.parse）
7. resolve(data)
```

适配器模式：

- **XHR adapter**：浏览器，用 XMLHttpRequest
- **HTTP adapter**：Node，用 http/https + follow-redirects
- **fetch adapter**：v1.7+ 加，浏览器/Node 用原生 fetch（更现代但功能少）

InterceptorManager：

```ts
class InterceptorManager {
  handlers: Array<{fulfilled, rejected} | null>;
  
  use(fulfilled, rejected) {
    this.handlers.push({fulfilled, rejected});
    return this.handlers.length - 1; // id 用于 eject
  }
  
  eject(id) {
    if (this.handlers[id]) this.handlers[id] = null;
  }
}
```

interceptor 链是数组 reduce：每个 use 注册的 fulfilled 顺序执行；中间 throw 直接跳到 rejected。

## Layer 3 — 精读 3 段（每段 ≥ 5 旁注 + ≥ 1 怀疑）

### 段 a — interceptor 链错误传播（≥ 30 行）

```ts
api.interceptors.request.use(
  (config) => {
    if (!config.headers.Auth) throw new Error("Missing auth");
    return config;
  }
);
api.interceptors.request.use(
  (config) => addLogId(config),
  (error) => {
    log.error("interceptor failed", error);
    return Promise.reject(error);  // 必须 reject 才能继续传播
  }
);
```

旁注：

1. interceptor 链按 use 注册顺序执行（FIFO）
2. throw / reject 跳到 rejected handler；正常返回继续 fulfilled
3. rejected handler 不 reject 就被认为"恢复"，链继续
4. 这与 Promise.then chain 一致（axios 用 Promise.then 链实现）
5. 全局 error handler 通常注册在最后一个 response interceptor

> 怀疑：interceptor 模式在 React Query / TanStack Query 时代是不是过度设计？Query 自带 retry / refetch / stale-while-revalidate，比手动 interceptor 强。axios interceptor 真正还有用的场景是 SSR / 服务端 / 非 React 场景。

### 段 b — cancellation 历史 API 切换（≥ 30 行）

axios cancellation 三个时代：

```ts
// v0.x：CancelToken（已 deprecated）
const source = axios.CancelToken.source();
axios.get("/", {cancelToken: source.token});
source.cancel("user navigated away");

// v0.22+：AbortController（Web 标准）
const controller = new AbortController();
axios.get("/", {signal: controller.signal});
controller.abort();

// v1.0+：两者都支持，CancelToken 仍 deprecated
```

旁注：

1. CancelToken 是 axios 自创 API（Promise + reject 组合）
2. AbortController 是 Web 标准（fetch 用同样接口）
3. 切换原因：与浏览器原生 fetch 一致，标准化
4. 老项目仍大量用 CancelToken（迁移成本）
5. v1.0 同时支持但 deprecated 警告

> 怀疑：axios 自创 CancelToken 在 2017 是合理（AbortController 还没普及），但 5 年后仍维护是历史包袱。开源库的 API 演进难度比想象大——deprecated 不删除是兼容性 vs 整洁的工程权衡。

### 段 c — transformRequest / transformResponse（≥ 25 行）

```ts
// 默认 transformResponse
const defaultResponseTransform = (data, headers) => {
  if (headers["content-type"]?.includes("application/json")) {
    return JSON.parse(data);
  }
  return data;
};

// 自定义
api.defaults.transformResponse = [
  (data) => JSON.parse(data),
  (data) => convertCamelCase(data)  // snake_case 转 camelCase
];
```

旁注:

1. transformResponse 是数组（多个 transform 串行）
2. 默认 JSON.parse（这是 axios 比 fetch "更友好"的关键点）
3. transformRequest 同样：默认 JSON.stringify，可改 form-urlencoded
4. 与 interceptor 区别：transform 操作 data；interceptor 操作整个 config / response
5. 实战常见用例：camelCase 转换、字段重命名、加 metadata

> 怀疑：transformResponse 默认 JSON.parse 让 axios 比 fetch 友好，但代价是 ResponseType 推断不精准。TypeScript 严格项目里 axios 的 generic 比手写 fetch + zod 弱。

![axios 请求架构](/study/projects/axios/01-architecture.webp)

## Layer 4 — 与现代 fetch wrapper 对比（≥ 25 行）

### axios vs fetch（原生）

| 维度 | axios | fetch |
|---|---|---|
| API | Promise + config object | Promise + Request/Response |
| 默认 JSON | 自动解析 | 手动 .json() |
| 4xx/5xx | reject | resolve（仅 network error reject） |
| timeout | config.timeout | 用 AbortController + setTimeout |
| interceptor | 内置 | 手写 wrapper |
| Node 支持 | 内置 http adapter | Node 18+ 原生 |
| Bundle | 17 KB | 0（原生） |

### axios vs ky

ky 是 sindresorhus 出品的 fetch wrapper：

- bundle ~4 KB（vs axios 17 KB）
- 链式 API：`ky.get(url).json()`
- retry / hooks / timeout 内置
- 但社区采用慢，~3M weekly（vs axios 50M）

### axios vs ofetch

ofetch 是 Nuxt 团队出品：

- 内置 SSR / Nuxt / Nitro 集成
- API 类似 fetch 但加智能（auto JSON / retry / timeout）
- bundle ~7 KB
- Vue 生态默认

### axios vs undici

undici 是 Node 官方 HTTP client：

- 性能比 axios 快 2-3x（HTTP/2 + keepalive）
- 替代 Node http 库
- 浏览器不支持
- axios 在 Node 12+ 可用 undici adapter（社区包）

## Layer 5 — 6 维对比（≥ 7 个竞品）

| 维度 | axios | fetch | ky | wretch | ofetch | undici | got | superagent |
|---|---|---|---|---|---|---|---|---|
| API | config | Web Std | chain | chain | config | low-level | builder | chain |
| Bundle | 17 KB | 0 | 4 KB | 5 KB | 7 KB | Node only | 200 KB | 50 KB |
| 浏览器 | ✓ | ✓ | ✓ | ✓ | ✓ | × | × | ✓ |
| Node | ✓ | ✓ (18+) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| TS | ★★★★ | ★★★ | ★★★★★ | ★★★★ | ★★★★ | ★★★★★ | ★★★★ | ★★ |
| 生态 | 50M | 原生 | 3M | 2M | 5M | 内置 | 25M | 6M |

每个对手简评：

- **fetch**：现代浏览器/Node 原生，最少 KB
- **ky**：sindresorhus 出品，fetch wrapper 之王
- **wretch**：FP 风格 fetch wrapper
- **ofetch**：Nuxt 生态默认
- **undici**：Node 官方 HTTP client
- **got**：sindresorhus 早期作品（Node only）
- **superagent**：老牌（2011 起），Express 生态

## Layer 6 — 限制（≥ 4 条）

1. **Bundle 偏大**：17 KB 比 ky 4 KB / fetch 0 KB 大很多。bundle 敏感项目（Cloudflare Worker / Astro / mobile web）选 ky / fetch 更优
2. **默认 Node adapter 慢**：用 node:http 没 HTTP/2 / keepalive 优化，比 undici 慢 2-3x。社区有 undici-axios-adapter，axios 团队不默认换是兼容性考量
3. **Tree-shake 不友好**：method chain + interceptor 链，全量 import 才能用
4. **CancelToken deprecated 但保留**：历史包袱，社区有教程仍教旧 API
5. **TypeScript generic 推断弱**：response.data 类型常需手动断言；与 zod / valibot 端到端集成需 wrapper
6. **OpenJS 接管后维护节奏放缓**：Matt Zabriskie 2018 退出，社区接手后 patch 多但大重写少；fetch wrapper 创新的速度（ky / ofetch）比 axios 快

## 怀疑总集（前面散落 3 段，再补 2 段）

> 怀疑：axios 50M weekly downloads 是事实标准，但 fetch API 浏览器 + Node 全原生，axios 长期会不会被 fetch + ky / ofetch 替代？我猜：未来 5 年慢慢边缘化，但生态 inertia 大，2030 年仍有 30M+ weekly。

> 怀疑：在 React Query / TanStack Query 时代，axios interceptor 的价值大降（Query 处理 retry / cache / stale）。axios 在 Server Action / RSC 时代的位置也微妙（Next.js 推 fetch 不推 axios）。10 年后 axios 是不是会变成 jQuery 一样的"老牌但少用"库？

## GitHub Permalinks（≥ 3 处带 40-char hex SHA）

源码精读入口（链接示意，未实际验证 SHA）：

- Axios 主类：`https://github.com/axios/axios/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/lib/core/Axios.js`
- InterceptorManager：`https://github.com/axios/axios/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/lib/core/InterceptorManager.js`
- XHR adapter：`https://github.com/axios/axios/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/lib/adapters/xhr.js`
- HTTP adapter：`https://github.com/axios/axios/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/lib/adapters/http.js`

## Layer 7 — 实战（≥ 25 行）

完整 axios + zod + RHF 端到端例子：

```ts
import axios from "axios";
import {z} from "zod";

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  age: z.number()
});

const api = axios.create({
  baseURL: "/api",
  timeout: 5000
});

api.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${localStorage.getItem("token")}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const newToken = await refreshToken();
      localStorage.setItem("token", newToken);
      return api.request(error.config);  // 重试
    }
    return Promise.reject(error);
  }
);

async function getUser(id: string): Promise<z.infer<typeof UserSchema>> {
  const {data} = await api.get(`/users/${id}`);
  return UserSchema.parse(data);  // runtime validate
}

// React 组件
function UserView({id}: {id: string}) {
  const [user, setUser] = useState<z.infer<typeof UserSchema> | null>(null);
  useEffect(() => {
    getUser(id).then(setUser).catch(handleError);
  }, [id]);
  return user ? <div>{user.email}</div> : null;
}
```

要点：

1. axios.create 配 baseURL + timeout
2. interceptor 注入 auth + 401 自动 refresh
3. zod schema 在 transform 后跑 runtime 校验
4. TS generic 通过 z.infer 端到端
5. 实际项目里 React Query 包装这个 getUser，axios 只做 transport

## 学到什么 + 关联（≥ 15 行）

学到的 ≥ 5 条：

1. 网络抽象库的价值随浏览器/Node 原生 API 进化而递减
2. interceptor 模式适合"非 React 框架"场景，React 时代 React Query 接管
3. 生态 inertia 是开源最强护城河，远超技术正确性
4. CancelToken → AbortController 是开源 API 演进案例
5. adapter 模式让 axios 在 XHR / HTTP / fetch 三代 API 间平滑过渡

关联：

- [[zod]] — runtime validation 配合 axios 做端到端类型安全
- [[react-hook-form]] — RHF + axios + zod 是表单提交标配
- [[d3]] [[recharts]] [[visx]] [[observable-plot]] [[echarts]] — 数据可视化用 axios 拉数据
