---
title: "TanStack Router — 把类型系统当 UX 工具"
description: 路由不只是跳转，是从 URL 到组件的端到端类型契约
sidebar:
  order: 17
  label: "TanStack/router"
---

> @tanstack/react-router v1.170.8（2026-05），MIT。
>
> TanStack Router 不是 React Router 的"更好版本"——它在赌一件事：
> **路由是软件最重要的 UX 边界，类型系统应该把这个边界守得死死的**。
>
> 你写 `<Link to="/posts/$postId" params={{ postId: '123' }} />`，
> TS 会校验 `postId` 是必填字符串。改路由路径，所有引用编译期就报错。
> 这是 Season 2「类型当设计工具」第三篇。

## 一句话定位

**TanStack Router = 一棵编译期可推理的路由树 + 一组 template literal 类型工具。**
它把 URL 模板（`/posts/$postId`）从字符串升级为**TS 类型**，
然后让 Link / useNavigate / useParams / useSearch 全链路推断这个类型。

## Why（为什么是它而不是 React Router / Next App Router / Remix / Wouter）

主流路由库的痛点：

```typescript
// React Router v6/v7
<Link to="/posts/123" />               // ← 路径是字符串，typo 编译期不报
const { postId } = useParams()          // ← postId 类型是 string | undefined（每次都得判断 undefined）

// Next.js App Router (app/posts/[postId]/page.tsx)
export default function Page({ params }: { params: { postId: string } }) {
  // ← params 类型必须自己写，文件改名后类型不会同步
}

// Wouter
<Link href="/posts/123" />              // ← 没有任何类型推断
```

**所有这些库共有的 bug**：路由路径在多处重复（声明 + 跳转 + 读参数），
其中任意一处改了，其他地方不会自动同步。

TanStack Router 的回答：

```typescript
const postRoute = createRoute({
  path: '/posts/$postId',                // ← 路径在这里声明一次
  loader: ({ params }) => fetchPost(params.postId),  // ← params.postId 自动是 string
  component: PostPage
})

// 别处用：
<Link to="/posts/$postId" params={{ postId: '123' }} />
//      ↑ 自动补全所有可能的路径
//                       ↑ TS 检查 params 必须有 postId
const { postId } = useParams({ from: '/posts/$postId' })
//                                    ↑ 推断 postId: string，不带 undefined
```

**改 path → 编译期所有引用全部报错**。这是把"路由作为契约"做到底。

| 库 | path 类型 | params 推断 | search 推断 | loader 数据 | 文件路由 |
|---|---|---|---|---|---|
| React Router v7 | string | 弱（`string \| undefined`） | 不推断 | 不推断 | 仅 Remix 风格 |
| Next App Router | 文件名 | 部分（运行时） | 不推断 | RSC 推断 | ✓ |
| Wouter | string | 不推断 | 不推断 | 不推断 | ✗ |
| **TanStack Router** | **template literal type** | **强（必须 + 默认 string）** | **schema-validated（zod 等）** | **完全推断** | **✓ codegen** |

**为什么不是 React Router**：v7 的类型推导仍然以"运行期为主"，
`useParams<{ postId: string }>()` 要手动写泛型。TanStack 的 `useParams({ from: '/posts/$postId' })`
是从路由实例反推类型，**不需要重复声明**。

**为什么不是 Next App Router**：Next 的文件即路由是好主意，但
"动态参数靠运行时校验"——`params.postId` 永远是 string 不会出错，
但 `params.notExist` 也是 string，编译期不会报。TanStack Router 通过类型把这种错误前置。

**为什么不是 Wouter**：Wouter 是"我只要 React Router 的 5%"——它确实做到了，
但完全放弃类型安全。TanStack 是反方向：**为了类型安全多付一些复杂度**。

## 仓库地形

```
tanstack-router/
└── packages/
    ├── router-core/                    ← ★ 框架无关核心
    │   └── src/
    │       ├── router.ts               ← 3246 行：RouterCore 类
    │       ├── route.ts                ← 2123 行：Route 类 + 类型层
    │       ├── new-process-route-tree.ts ← 1385 行：路由树展开
    │       ├── load-matches.ts         ← 1280 行：匹配 + loader 调度
    │       ├── link.ts                 ← 704 行：★★★ template literal 类型工具
    │       ├── path.ts                 ← 410 行：URL 解析 / 插值
    │       ├── scroll-restoration.ts   ← 373 行：滚动位置还原
    │       └── ...
    ├── react-router/                   ← React adapter
    ├── solid-router/                   ← Solid adapter
    ├── vue-router/                     ← Vue adapter
    ├── router-generator/               ← 文件路由 codegen
    ├── router-plugin/                  ← Vite 插件
    ├── react-start/                    ← TanStack Start（全栈框架）
    ├── zod-adapter/                    ← search params validation
    ├── arktype-adapter/                ← 同上
    └── valibot-adapter/                ← 同上
```

**心脏文件**：
- `packages/router-core/src/link.ts:33-160`——template literal 类型推导的所有魔法
- `packages/router-core/src/router.ts:941+`——RouterCore 类的状态机

route.ts 2123 行、router.ts 3246 行**是手册不是心脏**——读它会被嵌套泛型淹没。

## 核心机制 · Layer 3 精读

### 机制 1 · Template literal 类型解析路径参数

这是 TanStack Router 与所有其他路由库的**最大差异点**。

`packages/router-core/src/link.ts:115-127`（完整 `ParsePathParams` 类型）：

```typescript
export type ParsePathParams<T extends string> = T extends `${string}[${string}`
  ? ParsePathParamsEscapeStart<T>
  : T extends `${string}]${string}`
    ? ParsePathParamsEscapeEnd<T>
    : T extends `${string}}${string}`
      ? ParsePathParamsBoundaryEnd<T>
      : T extends `${string}{${string}`
        ? ParsePathParamsBoundaryStart<T>
        : T extends `${string}$${string}`
          ? ParsePathParamsSymbol<T>
          : never
```

这是个**纯类型层的递归 parser**。给它一个字符串字面量类型 `'/posts/$postId'`，
它会通过 TS 的 `infer` 关键字一步步解析出参数：

`packages/router-core/src/link.ts:68-87`（`ParsePathParamsSymbol` 节选）：

```typescript
export type ParsePathParamsSymbol<T extends string> =
  T extends `${string}$${infer TRight}`         // ← 找到 $ 后面的部分
    ? TRight extends `${string}/${string}`
      ? TRight extends `${infer TParam}/${infer TRest}`   // ← 继续切到下一个 /
        ? TParam extends ''
          ? ParsePathParamsResult<
              ParsePathParams<TRest>['required'],
              '_splat' | ParsePathParams<TRest>['optional'],   // ← `$` 单独是 splat
              ParsePathParams<TRest>['rest']
            >
          : ParsePathParamsResult<
              TParam | ParsePathParams<TRest>['required'],     // ← 收集 TParam 到 required
              ParsePathParams<TRest>['optional'],
              ParsePathParams<TRest>['rest']
            >
        : never
      : TRight extends ''
        ? ParsePathParamsResult<never, '_splat', never>
        : ParsePathParamsResult<TRight, never, never>
    : never
```

**用语言描述这段类型**：

> 给我一个字符串 T。
> 找出第一个 `$` 后面的内容 TRight。
> 如果 TRight 还有 `/`，把 `/` 前面的部分 TParam 作为参数名收集，
> 然后递归处理 `/` 后面的 TRest。
> 否则把 TRight 整体作为参数名。

`/posts/$postId/comments/$commentId` 经过这套递归会被解析成：

```typescript
{ required: 'postId' | 'commentId', optional: never, rest: never }
```

→ TS 的类型系统在这里**做了一个真实的语法分析器**，全部在编译期跑。
**这是把"类型"当作"图灵完备的工具"使用**——大多数项目只用了类型的 5%。

### 机制 2 · 这套类型如何流到 Link 组件

`packages/router-core/src/link.ts:33-47`（输出类型容器）：

```typescript
export interface ParsePathParamsResult<
  in out TRequired,
  in out TOptional,
  in out TRest,
> {
  required: TRequired
  optional: TOptional
  rest: TRest
}
```

`<Link to="/posts/$postId" />` 的类型流（伪代码）：

```typescript
type LinkProps<TTo extends string> = {
  to: TTo                                                   // 字符串字面量
  params: { [K in ParsePathParams<TTo>['required']]: string }   // ← 必选 params
       & { [K in ParsePathParams<TTo>['optional']]?: string }   // ← 可选 params
}
```

所以你写 `<Link to="/posts/$postId" />` 时：

- 编译器先算出 `ParsePathParams<'/posts/$postId'>` 的结果
- 然后要求 `params` 必须有 `postId: string`
- 漏写、写错名都立即报错

→ **这就是"类型当 UX 工具"的真意**：类型不是额外负担，是给开发者的实时反馈——
你写代码时，编辑器自动补全所有可能的路径，参数缺一个就红线。

### 机制 3 · RouterCore 的状态机

类型系统是 TanStack Router 的灵魂，但它的运行时也是个不小的工程。
`packages/router-core/src/router.ts:941-947` 的类签名：

```typescript
export class RouterCore<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption,
  in out TDefaultStructuralSharingOption extends boolean,
  in out TRouterHistory extends RouterHistory = RouterHistory,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
> {
```

注意 `in out` 修饰符——**TS 4.7 引入的 variance 标注**。
`in out` 表示这个泛型在协变和逆变两个位置都被用。
TS 编译器只有看到这个标注，才能在某些复杂场景下做出正确的子类型判断。

→ 这种细节是 TanStack Router 在 TS 编译器极限上跳舞的证据。
普通业务代码用不上 `in out`，但写库的人必须懂。

`router-core/src/router.ts:983-989`（状态属性节选）：

```typescript
routeTree!: TRouteTree
routesById!: RoutesById<TRouteTree>
routesByPath!: RoutesByPath<TRouteTree>
processedTree!: ProcessedTree<TRouteTree, any, any>
resolvePathCache!: LRUCache<string, string>
```

构造时 router 把 routeTree 展开成两份索引（按 ID、按 path），
加 LRU 缓存优化 path resolve——**因为路径解析是 hot path**，
每次点击 link 都会走。

### 机制 4 · path 系统 — 不只是字符串拼接

`packages/router-core/src/path.ts:75-93`（exactPathTest）：

```typescript
export function exactPathTest(
  pathName1: string,
  pathName2: string,
  basepath: string,
): boolean {
  return (
    removeTrailingSlash(pathName1, basepath) ===
    removeTrailingSlash(pathName2, basepath)
  )
}
```

看似简单，但 path.ts 整个 410 行都在处理：

- trailing slash 一致性（`/posts` 和 `/posts/` 是不是同一路由？取决于你的配置）
- 相对路径 resolve（`../foo` 在不同 basepath 下展开）
- 参数插值（`/posts/$postId` + `{ postId: '123' }` → `/posts/123`）
- URL 编码 / 解码

**这是路由库被低估的部分**——以为"path 拼起来就行"，实际上每个边界情况都是
线上 bug 来源。TanStack 把这部分做到 410 行，不是过度工程。

### 机制 5 · 文件路由 + codegen

TanStack Router 支持两种使用方式：

**手动声明**：

```typescript
const rootRoute = createRootRoute()
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' })
const postRoute = createRoute({ getParentRoute: () => rootRoute, path: '/posts/$postId' })
const routeTree = rootRoute.addChildren([indexRoute, postRoute])
const router = createRouter({ routeTree })
```

**文件路由（codegen）**：

```
src/routes/
├── __root.tsx
├── index.tsx                ← /
├── posts.tsx                ← layout
└── posts/
    └── $postId.tsx          ← /posts/$postId
```

`@tanstack/router-plugin` 监听文件变化，自动生成 `routeTree.gen.ts`：

```typescript
// routeTree.gen.ts (auto-generated)
import { Route as PostsPostIdRoute } from './routes/posts/$postId'
// ...
const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsPostIdRoute])
])
declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/posts/$postId': { ... }   // ← 这里 declare 全局类型
  }
}
```

**关键点**：codegen 不只是生成 JS 路由，还**生成全局 module declaration**，
让 `<Link to="/posts/$postId">` 在所有文件里都能自动补全。

→ 这是文件路由 + 类型路由的完美结合。Next.js App Router 只做了一半（文件路由但没全局类型）。

### 机制 6 · loader 的并行加载

`packages/router-core/src/load-matches.ts:1280` 行的代码主要解决一件事：
**用户访问 `/posts/$postId/comments` 时，post loader 和 comments loader 应该并行**。

伪代码：

```typescript
// 错的串行：
for (const match of matches) {
  await match.route.options.loader(match)   // ← 一个一个等
}

// 对的并行：
await Promise.all(
  matches.map(match => match.route.options.loader(match))
)
```

但实际比这复杂——loader 之间可能有依赖（子 loader 需要父 loader 结果），
还要处理 redirect、notFound、defer/await 流式 SSR、缓存等。

→ 这就是 load-matches.ts 1280 行的来源。它解决的不是"如何 fetch"，
是"**如何编排 N 个 loader 的依赖关系并保证最优并行度**"。

## 横向对比

### vs React Router v7 — 同源异路

React Router v7 = Remix → 合并回 React Router。它也支持 loader、文件路由，
但类型推导比 TanStack 弱：

```typescript
// React Router v7
const router = createBrowserRouter([
  { path: '/posts/:postId', loader: ({ params }) => fetchPost(params.postId) }
])
// params.postId 类型是 string，但跨文件用 useParams<...>() 时要重复写泛型
```

TanStack 的 `useParams({ from: '/posts/$postId' })` 通过 `from` 这个**类型 key**
反推出 params 形状——**不重复**。

### vs Next.js App Router — 文件路由的不同诠释

Next 的取舍：放弃完全的类型推导，换来"零配置 + RSC 集成"。
TanStack 的取舍：保留客户端路由 + 类型推导，但要 codegen + Vite 插件。

如果你做 RSC + 极致 SEO，选 Next；
如果你做 SPA / 内部工具 / 类型敏感的应用，选 TanStack。

### vs Wouter — 体积差 50 倍

Wouter 大约 1.5KB，TanStack Router 核心 ~25KB（算上 react-router 包）。
**这不是 fair comparison**——Wouter 没做类型，没 loader，没并行。
但如果你只要"路径 → 组件"，Wouter 真的够用。

判断标准：你的应用有 50+ 路由 + 复杂 loader 编排，TanStack 的复杂度有意义；
否则 Wouter 是更诚实的选择。

### vs TanStack Query 的整合

这点非常重要——TanStack 团队故意做了 `@tanstack/react-router-with-query` 包：

```typescript
const route = createRoute({
  path: '/posts/$postId',
  loader: ({ params }) => queryClient.ensureQueryData(postQuery(params.postId))
})
```

router 的 loader 直接用 query 的 `ensureQueryData`——**有缓存就用，没有就拉**。
这种深度整合在其他路由库要自己手写。

## Hands-on（30 分钟内能跑）

```bash
npm create vite@latest router-demo -- --template react-ts
cd router-demo
npm install
npm install @tanstack/react-router
```

写 `src/main.tsx`：

```typescript
import {
  createRouter,
  createRoute,
  createRootRoute,
  RouterProvider,
  Link,
  Outlet,
} from '@tanstack/react-router'
import { useParams } from '@tanstack/react-router'
import ReactDOM from 'react-dom/client'

const rootRoute = createRootRoute({
  component: () => (
    <>
      <nav>
        <Link to="/">Home</Link>
        {' | '}
        <Link to="/posts/$postId" params={{ postId: '1' }}>
          Post 1
        </Link>
      </nav>
      <Outlet />
    </>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <div>home</div>,
})

const postRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts/$postId',
  component: () => {
    const { postId } = useParams({ from: '/posts/$postId' })
    //         ↑ 类型自动是 string
    return <div>Post {postId}</div>
  },
})

const routeTree = rootRoute.addChildren([indexRoute, postRoute])
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />
)
```

```bash
npm run dev
```

### 改一处的实验（必做）

把 `<Link to="/posts/$postId" params={{ postId: '1' }} />` 里的 `postId` 改成 `postIdd`。
**TS 立即在 Link 处报错**："Property 'postIdd' does not exist on type ..."。

→ 这就是"类型当 UX"的核心体验。你不需要等到运行时才发现错。

第二个实验：把 `path: '/posts/$postId'` 改成 `path: '/blog/$slug'`，
观察整个项目里**所有引用都会被高亮报错**——Link 的 to、useParams 的 from 全部失效。
你不会忘了改其中一处，因为编译器在帮你。

## 与你工作的连接

**能立刻迁移**：

- 任何用 React Router 的项目，新写的页面优先用 TanStack Router
- 学会用 `from` 反推类型这个 idiom——它是这个库设计哲学的浓缩
- search params validation 用 zod adapter——和 [zod 笔记](/study/projects/zod/) 联动

**下个月可能用到**：

- 全栈 TanStack Start（基于 router 的 Next 替代）做内部工具——
  类型贯穿前后端、loader 自动 SSR
- 配合 [TanStack Query](/study/projects/tanstack-query/) 做"路由切换即缓存"——
  loader 调 `ensureQueryData`，组件用 `useQuery` 读，永远命中缓存

**不要用 TanStack Router 的部分**：

- 不要在小项目（< 10 路由）用——架构成本不划算
- 不要在 SSR-heavy 的 SEO 站点用——Next App Router + RSC 更合适
- 不要直接迁移已有 React Router 项目——双栈并存几乎不可能，要全部重写

## 读完你能做之前做不了的事

- **判断**：看到 `useParams<{ id: string }>()` 这种手写泛型时，能识别"这是路由设计的味道不对"
- **设计**：把"路由表"看作类型系统的一部分，而不是字符串配置
- **解释**：被问"为什么 TS 模板字面量类型重要"时，能用 ParsePathParams 当例子
- **下钻**：看懂任何用 `infer` 做字符串解析的代码——TanStack Router 是范例
- **对照**：识别"我这个 string config 应不应该升级成 template literal type"——
  比如 i18n key、API endpoint、event type 名

## 自检 · 5 个问题

1. `link.ts:115` 的 `ParsePathParams<T>` 用 5 层嵌套条件类型。把它简化成一个正则会有什么问题？
   （提示：runtime vs compile time）
2. `router.ts:941` 的 `in out TRouteTree` 里的 `in out` 是什么意思？把它去掉会怎样？
3. `useParams({ from: '/posts/$postId' })` 的 `from` 字段为什么必须是字符串字面量类型？
   传一个普通 string 变量会怎样？
4. 如果 codegen 生成的 `routeTree.gen.ts` 没有 `declare module`，
   `<Link to="/posts/$postId">` 还能自动补全吗？为什么？
5. **TanStack Router 在大项目里的 TS 编译时间比 React Router 慢**。说出至少 2 个原因，
   以及作为用户应该接受这个代价吗？

## 延伸阅读

读完 `link.ts:33-160` 后下一步：

1. `packages/router-core/src/route.ts:395-450`——Route 类的泛型签名（13 个泛型参数），
   感受"为了 UX 把类型层做厚"是什么意思
2. `packages/router-generator/src/`——文件路由 codegen 的实现
3. **TanStack Start**（`packages/react-start/`）——基于 router 的全栈框架，
   是 Next 替代品的有力候选
4. **TS 模板字面量类型**官方文档（[handbook](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html)）——
   读完你会发现 TanStack Router 用了所有这些 trick
5. **Type-fest** 库源码——同样是"类型当工具"的范本，但更通用

---

**笔记完成**：2026-05-27（v1.170.8）
**研究方法**：本地克隆 + 子代理深读 + 自查 link.ts 类型 parser 实现
**心脏文件**：`packages/router-core/src/link.ts:33-160`
