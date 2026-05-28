---
title: ky 极简 fetch-based HTTP 客户端
来源: https://github.com/sindresorhus/ky + ky.dev 官方文档
---

# ky — fetch wrapper 之王

## 一句话总结

ky 是 Sindre Sorhus 2018 年开源的 HTTP 客户端，2024 v1.x。它彻底押注"基于原生 fetch"路线：bundle ~4 KB（vs axios 17 KB），API 链式，retry / timeout / hooks / JSON 解析等"现代化默认"内置。

设计哲学：fetch 是 Web 标准，Node 18+ / Deno / Bun 都原生支持。ky 不重新造网络层，只在 fetch 上加"开发体验"层（自动 JSON、智能 retry、易用 hooks、标准 AbortController）。

ky 是"现代化 fetch 的代言人"。它没有发明新概念，只是把 fetch 已有的标准 API 包成更好用的形态。

与 axios 的关键差别：

- ky 默认 4xx/5xx 抛 HTTPError（与 axios 同，但比原生 fetch 友好）
- ky 默认 retry（max 2 次指数退避，可配）
- ky 链式 API（`ky.get(url).json()`）；axios 是 config object
- ky 全栈（浏览器 + Node 18+ + Deno + Bun + Cloudflare Worker），axios 也全栈但 bundle 大
- ky tree-shake 友好，axios 不友好
- ky 0 runtime dependencies，axios 有 form-data / follow-redirects 等

社区采用：weekly downloads ~3M（2024）。axios 50M。差 17 倍但 ky 持续涨。这是"技术优 vs 生态强"的典型对照。

ky 的 user persona：写新项目 / 关心 bundle / 用 TS / 跑在 edge runtime（CF Worker / Vercel Edge）的开发者。axios 的 persona：维护老项目 / 已有大量 interceptor 代码 / Node 服务端为主。

## Layer 0 — 项目档案速查

| 字段 | 值 |
|---|---|
| 包名 | `ky` |
| 当前主版本 | 1.x（2024） |
| 首版 | 2018-04（v0.1） |
| License | MIT |
| 主仓库 | sindresorhus/ky |
| 维护 | Sindre Sorhus（@sindresorhus）+ 80+ contributors |
| TypeScript | 完整支持（v0.7+ 内置 .d.ts） |
| Bundle 大小 | ~4 KB min+gzip |
| Tree-shake | 友好（ESM 优先） |
| 子包数 | 1 主包 |
| 内部依赖 | 0 runtime |
| 浏览器 | ✓ |
| Node | ≥ 18（fetch 原生） |
| Deno / Bun / CF Worker | ✓ |
| Weekly downloads | ~3M+ |
| GitHub stars | 13k+ |
| 商业版 | 无 |
| 文档站 | github.com/sindresorhus/ky README |
| 主要文件 | source/core/Ky.ts / source/types/options.ts / source/index.ts |
| 测试覆盖 | ava + 100+ test cases |
| 发布频率 | 月度 minor / patch |
| Breaking changes | 1.0 后稳定，遵循 semver |

## Layer 1 — 核心抽象

```ts
import ky from "ky";

// GET（链式 + parseJson）
const user = await ky.get("/api/users/1").json<User>();

// POST 带 body
const created = await ky.post("/api/users", {json: {name: "Alice"}}).json<User>();

// 配置 instance
const api = ky.create({
  prefixUrl: "https://api.example.com",
  timeout: 5000,
  retry: {limit: 3},
  headers: {Authorization: "Bearer ..."},
  hooks: {
    beforeRequest: [
      (request) => {
        request.headers.set("X-Trace-ID", uuid());
      }
    ],
    afterResponse: [
      async (request, options, response) => {
        if (response.status === 401) {
          const newToken = await refreshToken();
          request.headers.set("Authorization", `Bearer ${newToken}`);
          return ky(request);  // 重试
        }
        return response;
      }
    ]
  }
});

// 使用 instance
const data = await api.get("users").json<User[]>();

// extend instance（继承+覆盖）
const adminApi = api.extend({
  headers: {"X-Admin-Token": "..."}
});

// AbortController
const controller = new AbortController();
const promise = api.get("slow-endpoint", {signal: controller.signal});
setTimeout(() => controller.abort(), 1000);
```

四要素：

1. **HTTP 方法链式** ky.get / post / put / delete / patch / head / options
2. **解析方法链** `.json<T>()` / `.text()` / `.blob()` / `.arrayBuffer()` / `.formData()`
3. **options object** prefixUrl / timeout / retry / headers / json / searchParams / hooks / signal
4. **hooks** beforeRequest / beforeRetry / afterResponse / beforeError（4 种）

ky 的核心抽象是"延迟执行 + 链式解析"。`ky.get(url)` 返回 KyInstance（一个 Promise-like 对象），它没立刻发请求；`.json()` 才真正触发 fetch 并解析。这种 lazy 模式让链式调用既符合 await 语法又能在调用前继续配置。

## Layer 2 — 内部架构

ky 是个 Ky class + ky 入口函数：

```ts
// 伪代码
class Ky {
  request: Request;
  options: KyOptions;

  async fetch() {
    let response = await fetch(this.request);

    if (!response.ok && this.options.retry) {
      for (let attempt = 0; attempt < this.options.retry.limit; attempt++) {
        await this.sleep(this.calcDelay(attempt));
        response = await fetch(this.request);
        if (response.ok) break;
      }
    }

    if (!response.ok) throw new HTTPError(response);
    return response;
  }

  json<T>(): Promise<T> {
    return this.fetch().then(r => r.json());
  }

  text(): Promise<string> {
    return this.fetch().then(r => r.text());
  }

  blob(): Promise<Blob> {
    return this.fetch().then(r => r.blob());
  }
}

function ky(input: string | Request, options?: KyOptions) {
  return new Ky(input, options);
}
ky.get = (input, options) => ky(input, {...options, method: "GET"});
ky.post = (input, options) => ky(input, {...options, method: "POST"});
ky.put = (input, options) => ky(input, {...options, method: "PUT"});
ky.delete = (input, options) => ky(input, {...options, method: "DELETE"});
```

工程要点：

1. **薄封装**：80% 行为是原生 fetch，ky 只加 retry / hooks / parseJson
2. **链式触发**：`.json()` / `.text()` 才真正发请求（lazy execution）
3. **prefixUrl**：避免每次写完整 URL（与 axios baseURL 等价）
4. **searchParams**：自动 URLSearchParams 序列化
5. **json**：自动 Content-Type: application/json + JSON.stringify（vs fetch 手动）
6. **timeout**：内部用 AbortController + setTimeout 实现
7. **HTTPError**：自定义 Error class 含 response / request / options 字段
8. **TimeoutError**：单独错误类型方便 try/catch 区分

ky 的"创新"几乎都在 DX 层：把 fetch 已有标准能力（AbortController / FormData / Headers）包成更易用的接口。它没在网络层加任何"魔法"——这反而是它能保持 4 KB 的关键。

## Layer 3 — 精读 3 段

### 段 a — retry 算法

```ts
const api = ky.create({
  retry: {
    limit: 3,                          // 最多重试 3 次
    methods: ["get", "put", "head"],   // 仅幂等方法
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
    delay: (attemptCount) => 0.3 * (2 ** (attemptCount - 1)) * 1000,  // 指数退避
    backoffLimit: 30000                // 最大单次等待
  }
});
```

旁注：

1. 默认 retry：limit 2 / 仅幂等 GET PUT HEAD DELETE / 状态码 408 413 429 500 502 503 504
2. delay 默认指数退避（300ms / 600ms / 1200ms）
3. POST / PATCH 默认不重试（防重复创建）
4. retry 在 hooks 之间：beforeRetry hook 可在每次重试前修改 request
5. 超过 retry-after header（429）会按 header 时长等
6. backoffLimit 防止指数爆炸（重试 10 次 = 153 秒会被截到 30 秒）

> 怀疑：ky 默认重试 POST 也是基于 idempotency 假设。但实际很多 REST API 的 POST 不幂等（创建资源），重试会造成重复。文档警告但默认开启是不是设计反智？答案是：默认 limit=2 + 只重试 5xx，对幂等 POST 也基本安全。但 4xx 不重试已经避免大多数。更严谨的方案：每次 POST 加 Idempotency-Key header，server 端去重。

### 段 b — hooks 链

ky 4 种 hooks 形成完整 lifecycle：

```ts
hooks: {
  beforeRequest: [
    (request, options) => {
      request.headers.set("X-Custom", "value");
      // 可返回 Response 直接短路（mock / cache hit）
    }
  ],
  beforeRetry: [
    ({request, options, error, retryCount}) => {
      console.log(`retry ${retryCount} after ${error}`);
    }
  ],
  afterResponse: [
    async (request, options, response) => {
      if (response.status === 401) {
        await refresh();
        return ky(request);  // 整个请求重做
      }
      return response;  // 必须返回 Response
    }
  ],
  beforeError: [
    (error) => {
      Sentry.captureException(error);
      return error;  // 必须返回 Error
    }
  ]
}
```

旁注：

1. hooks 是数组，按顺序执行
2. beforeRequest 可以返回 Response 短路（不发实际请求，实现 mock / cache hit）
3. afterResponse 可以返回新 Response 替代
4. beforeError 用于 logging，不能取消错误
5. hooks 在 instance 配置后所有调用共享
6. extend 时 hooks 是 merge 而非 override

> 怀疑：hooks 设计灵感来自 axios interceptor，但 API 更显式（数组而非 .use()）。这种"配置式 hooks vs 命令式 interceptor"哪个更适合 React 时代？我猜：配置式更适合"不可变配置"哲学。axios .use 返回 id 用来 eject，ky 没这个能力——但实际 90% 用户配置一次后不会动。

### 段 c — parseJson 默认行为

```ts
// ky
const data = await ky.get("/api/users").json<User[]>();

// fetch 等价
const response = await fetch("/api/users");
if (!response.ok) throw new Error(response.statusText);
const data: User[] = await response.json();

// 自定义 parseJson
const api = ky.create({
  parseJson: (text) => JSON.parse(text, reviver)  // 比如转换 Date 字符串
});
```

旁注：

1. ky 默认在 .json() 调用时跑 JSON.parse + 类型推断
2. 4xx/5xx 自动抛 HTTPError（vs fetch resolve）
3. ky 错误对象含 response / request / options，便于诊断
4. JSON.parse 失败抛 SyntaxError
5. .text() / .blob() / .arrayBuffer() 同样自动抛错
6. parseJson 可自定义（reviver 函数转 Date / BigInt）

> 怀疑：parseJson 默认是 ky 比 fetch "更友好"的关键，但与 zod 端到端集成不像 axios 那么自然。需要 .json<T>() 后手动 zod.parse。这是 fetch wrapper 库的共性问题。理想做法：在 hooks.afterResponse 里自动跑 zod schema 校验，但社区没这么做的库。

![ky 请求 pipeline](/study/projects/ky/01-pipeline.webp)

## Layer 4 — 与 axios / fetch / wretch / ofetch 对比

### ky vs axios

| 维度 | ky | axios |
|---|---|---|
| Bundle | 4 KB | 17 KB |
| 基础 | fetch | XHR + http + fetch |
| API | 链式 | config object |
| Retry | 默认开 | 第三方包 |
| Tree-shake | 友好 | 不友好 |
| Node | ≥ 18（fetch 原生） | 内置 http adapter |
| Interceptor | hooks 数组 | .use() 方法 |
| Cancel | AbortController | CancelToken（已 deprecate）+ AbortController |
| Upload progress | 不支持 | 支持（XHR 特性） |

ky 的优势在 bundle / 现代 / 标准化。axios 的优势在生态 / 教程 / 历史代码。新项目选 ky，老项目维持 axios。

### ky vs 原生 fetch

```ts
// fetch
const response = await fetch("/api/users", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({name: "Alice"})
});
if (!response.ok) throw new Error(response.statusText);
const data = await response.json();

// ky
const data = await ky.post("/api/users", {json: {name: "Alice"}}).json<User>();
```

ky 把 fetch 的 5 行变 1 行，自动 Content-Type / JSON.stringify / 错误处理。

### ky vs wretch

wretch 是 Julien Poissonnier 出品，FP-style fetch wrapper。比 ky 更激进的链式：

```ts
await wretch("/api/users")
  .auth("Bearer xyz")
  .json({name: "Alice"})
  .post()
  .json<User>();
```

wretch 学习曲线陡，社区更小（~2M weekly）。

### ky vs ofetch

ofetch 是 Nuxt 团队出品，更"smart"：

- 自动 baseURL + retry + parse
- SSR / Nuxt / Nitro 集成最好
- bundle 7 KB

Vue / Nuxt 默认 ofetch，React 默认 ky / axios。

### 总结对比

| 选择标准 | 推荐 |
|---|---|
| 新项目 + bundle 敏感 + TS | ky |
| 老项目维护 / 已用 interceptor | axios |
| Vue / Nuxt | ofetch |
| FP 风格爱好者 | wretch |
| 极致最小 + 自己写工具 | fetch |

## Layer 5 — 6 维对比

| 维度 | ky | axios | fetch | wretch | ofetch | undici | got | superagent |
|---|---|---|---|---|---|---|---|---|
| Bundle | 4 KB | 17 KB | 0 | 5 KB | 7 KB | Node only | 200 KB | 50 KB |
| API | chain + json | config | Web Std | FP chain | config | low-level | builder | chain |
| 浏览器 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| Node | ≥ 18 | 任意 | ≥ 18 | ≥ 18 | ≥ 18 | ✓ | ✓ | ✓ |
| TS | ★★★★★ | ★★★★ | ★★★ | ★★★★ | ★★★★ | ★★★★★ | ★★★★ | ★★ |
| Retry | 内置 | 第三方 | 手写 | 内置 | 内置 | 手写 | 内置 | 手写 |
| 生态 | 3M | 50M | 原生 | 2M | 5M | Node 内 | 25M | 6M |

整体看：ky 的位置是"现代浏览器+Node 18+"领域的最优选；axios 是历史包袱，但生态最大；fetch 是基础设施；undici 是 Node 内核（fetch 在 Node 内部就是 undici）；got 是纯 Node 老牌。

## Layer 6 — 限制

1. **Node 18+ 要求**：老 Node 项目（14 / 16）跑不了，要用 ky-universal
2. **bundle 不是绝对最小**：fetch 0 KB，ky 4 KB。bundle 极致项目仍可能选 fetch + 自己写 retry
3. **生态远不如 axios**：教程 / SO / Stack Overflow 答案 ky 占少
4. **链式 API 学习曲线**：从 axios 迁过来心智重置（`.json<T>()` 而非 `await axios.get<T>().data`）
5. **TypeScript generic 在错误处理里弱**：`ky.HTTPError` 的 response 类型推断有时失败
6. **interceptor 模式不如 axios 灵活**：hooks 是数组，axios .use 可 eject 单个
7. **Upload progress 不支持**：fetch 标准没 onUploadProgress，axios 用 XHR 有
8. **HTTP/2 push 不支持**：fetch API 限制
9. **stream upload 体验差**：fetch ReadableStream 浏览器兼容性参差

## 怀疑总集

> 怀疑：ky bundle 4 KB，axios 17 KB，但 axios 50M weekly downloads / ky 3M。"小"为什么没成 winner？答案是 axios 占领早 + 教程 inertia + interceptor 强大。技术正确不等于商业胜利。

> 怀疑：ky 把"基于 fetch"当卖点，但 fetch 在 Node / Deno / Bun 都原生支持后，ky 的 wrapper 层价值缩水。是不是浏览器优先时代过去后 ky 注定边缘化？我猜：相反，因为 fetch 的"差体验"（手动 .json / 不抛 4xx / 无 retry）让 wrapper 永远有市场。ky 在新项目里逐渐替代 axios 是趋势。

> 怀疑：ky 的 hooks 数组设计能否支持复杂场景？比如多个 auth 拦截器要按优先级跑、动态注册 / 卸载。axios .use 返回 id 来 eject 是其优势。我猜：90% 场景 ky 够用，复杂场景需要自己包一层 hook manager。

> 怀疑：parseJson 默认抛 HTTPError 是否过度激进？某些场景（GraphQL 把错误放 200 body 里）希望 4xx 也能 resolve。需要 hooks.beforeError 短路。这种"一刀切默认"是 ky 设计哲学的代价。

> 怀疑：ky 没 upload progress 是否会成为致命弱点？图片 / 视频上传场景多，axios 有 XHR 进度。我猜：fetch ReadableStream API 成熟后会有，但近期是 ky 的硬伤。需要 upload 选 axios。

## GitHub Permalinks

源码精读入口（链接示意，未实际验证 SHA）：

- Ky 主类：`https://github.com/sindresorhus/ky/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/source/core/Ky.ts`
- options 类型：`https://github.com/sindresorhus/ky/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/source/types/options.ts`
- timeout 工具：`https://github.com/sindresorhus/ky/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/source/utils/timeout.ts`
- index 入口：`https://github.com/sindresorhus/ky/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/source/index.ts`
- HTTPError：`https://github.com/sindresorhus/ky/blob/5d7f9a1c3e5d7f9b1c3e5d7f9a1c3e5d7f9b1c3e/source/errors/HTTPError.ts`
- retry 算法：`https://github.com/sindresorhus/ky/blob/7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7d9f1a3c5e/source/core/constants.ts`

## Layer 7 — 实战

完整 ky + zod + RHF 端到端例子：

```ts
import ky from "ky";
import {z} from "zod";

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email()
});

const api = ky.create({
  prefixUrl: "/api",
  timeout: 5000,
  retry: {limit: 2, methods: ["get"]},
  hooks: {
    beforeRequest: [
      (request) => {
        request.headers.set("Authorization", `Bearer ${getToken()}`);
      }
    ],
    afterResponse: [
      async (request, options, response) => {
        if (response.status === 401) {
          const newToken = await refreshToken();
          request.headers.set("Authorization", `Bearer ${newToken}`);
          return ky(request);
        }
        return response;
      }
    ]
  }
});

async function getUser(id: string): Promise<z.infer<typeof UserSchema>> {
  const data = await api.get(`users/${id}`).json();
  return UserSchema.parse(data);
}

// 与 React Query 集成
import {useQuery} from "@tanstack/react-query";

function useUser(id: string) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => getUser(id),
    staleTime: 60_000
  });
}

// 与 React Hook Form 集成
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2)
});

function CreateUserForm() {
  const {register, handleSubmit, formState} = useForm({
    resolver: zodResolver(CreateUserSchema)
  });

  const onSubmit = async (data: z.infer<typeof CreateUserSchema>) => {
    const created = await api.post("users", {json: data}).json<User>();
    console.log(created);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("email")} />
      <input {...register("name")} />
      <button type="submit">Create</button>
    </form>
  );
}
```

要点：

1. ky.create + prefixUrl + timeout
2. hooks 注入 auth + 401 refresh
3. .json() 自动解析
4. zod parse runtime 校验
5. 与 React Query 集成同 axios，queryFn 里跑 ky
6. 与 RHF 集成在 onSubmit 跑 ky.post

## 学到什么 + 关联

学到的：

1. fetch 标准化让 wrapper 库轻量化（ky 4 KB vs axios 17 KB）
2. 链式 API + 解析方法链是现代 HTTP 库 DX 趋势
3. retry / hooks / parseJson 是"新一代默认"，老库（axios）需用插件实现
4. bundle 大小重要但不是决定因素（ky 仍未取代 axios）
5. Node fetch 标准化（v18+）改变了 HTTP wrapper 设计空间
6. lazy execution 让链式 API 又能 await 又能继续配置
7. 0 runtime dependencies 是现代库的卖点（ky 靠 fetch 标准做到了）
8. hooks 配置式 vs interceptor 命令式的 trade-off：前者不可变更稳，后者动态更灵活

关联：

- [[axios]] — 直接对手，市场占领战
- [[zod]] — runtime 校验配 ky
- [[react-hook-form]] — RHF + ky + zod 是 fetch-first 项目的标配
- [[d3]] [[recharts]] [[visx]] [[observable-plot]] [[echarts]] — 数据可视化的数据层
- [[react-query]] — queryFn 里调 ky，缓存层
- [[fetch]] — 底层 Web 标准
- [[ofetch]] — Vue/Nuxt 同位库
