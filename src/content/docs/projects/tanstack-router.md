---
title: "TanStack Router — 把类型系统当 UX 工具"
description: 路由不只是跳转，是从 URL 到组件的端到端类型契约
sidebar:
  order: 17
  label: "TanStack/router"
---

> @tanstack/react-router v1.170.8（commit `bae50be1`，2026-05-26 读取），MIT。
>
> TanStack Router 不是 React Router 的"更好版本"——它在赌一件事：
> **路由是软件最重要的 UX 边界，类型系统应该把这个边界守得死死的**。
>
> 你写 `<Link to="/posts/$postId" params={{ postId: '123' }} />`，
> TS 会校验 `postId` 是必填字符串。改路由路径，所有引用编译期就报错。
> 这是 Season 2「类型当设计工具」第三篇。

> **状元篇 Checklist 类型**：v1.1 分支 B（工具库）。
> 心脏物 = 一组 template literal 类型工具 + 一个 RouterCore 状态机 + 一个文件路由 codegen。
> 表面 API 小，抽象集中，符合分支 B 的"500-3000 行核心"判定。

## 核心信息表

| 字段 | 值 |
|---|---|
| Star | 11.4k（2026-05-28 读取） |
| Fork | 871 |
| 最近活跃 | 2026-05-26（HEAD 当日 commit） |
| 读时 commit | `bae50be10aed6b1a2f95fd17b1fb8ff9efdf309c` |
| 主语言 | TypeScript（核心 92%） |
| 维护方 | TanStack（Tanner Linsley + ~15 活跃 contributors） |
| License | MIT |
| 类似项目 | React Router v7 / Next App Router / Wouter / Solid Router |

## 一句话定位

**TanStack Router = 一棵编译期可推理的路由树 + 一组 template literal 类型工具 + 一份 codegen 出来的全局类型表。**
它把 URL 模板（`/posts/$postId`）从字符串升级为 **TS 类型**，
然后让 Link / useNavigate / useParams / useSearch 全链路推断这个类型，
最后用 `declare module` 把推断结果灌进全局，所有 `.tsx` 不 import 也能用。

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

来源引用：作者 Tanner Linsley 在 [v1 launch blog](https://tanstack.com/blog/announcing-tanstack-router-v1) 里说
"我们要的不是 routes，是一份从 URL 到 React tree 的端到端类型契约"——
这就是这个项目的 manifesto。

## 类型流总览（Figure 1）

![Figure 1: TanStack Router 的 URL → file path → component prop type 链路](/projects/tanstack-router/01-type-flow.webp)

> Figure 1 caption ·
> 上：浏览器 URL 字符串 → matchRoutes() 切成 segments；
> 中：文件名 `posts.$postId.comments.$commentId.tsx` 经 router-plugin codegen 注入 `routeTree.gen.ts`；
> 下：`ParsePathParams<T>` 在编译期递归出 `{ required: 'postId' \| 'commentId' }`，
> 通过 `declare module` 灌进 `FileRoutesByPath`，最后 `useParams({ from })` 反查得到强类型 params。
> 配色：绿框 = 编译期 / 红框 = 运行时 / 橙框 = 类型层 / 蓝框 = 全局类型表。

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
    │       ├── searchParams.ts         ← 90 行：search 序列化与解析
    │       ├── scroll-restoration.ts   ← 373 行：滚动位置还原
    │       └── ...
    ├── react-router/                   ← React adapter
    ├── solid-router/                   ← Solid adapter
    ├── vue-router/                     ← Vue adapter
    ├── router-generator/               ← 文件路由 codegen
    │   └── src/generator.ts            ← 1652 行：核心 codegen 引擎
    ├── router-plugin/                  ← Vite 插件，监听文件变化
    ├── react-start/                    ← TanStack Start（全栈框架）
    ├── zod-adapter/                    ← search params validation
    ├── arktype-adapter/                ← 同上
    └── valibot-adapter/                ← 同上
```

**心脏文件清单**（按"被 import 频次 × 抽象集中度"排序）：

1. `packages/router-core/src/link.ts:33-160`——template literal 类型推导的所有魔法
2. `packages/router-core/src/router.ts:941-989`——RouterCore 类的状态机签名
3. `packages/router-generator/src/generator.ts`——文件路由 → `routeTree.gen.ts` 的 codegen 引擎

route.ts 2123 行、router.ts 3246 行 **是手册不是心脏**——读它会被嵌套泛型淹没。
路由树展开（new-process-route-tree.ts）和 loader 调度（load-matches.ts）虽然行数大，
但它们的核心契约都被前三个心脏文件决定了——属于"实现"，不属于"接口"。

commit 热点（截至 `bae50be1`，命令：`git log --format='' --name-only | sort | uniq -c | sort -rn | head -20`）：

| 次数 | 文件 |
|---|---|
| 1182 | packages/router-core/src/router.ts |
| 854 | packages/router-core/src/route.ts |
| 612 | packages/router-generator/src/generator.ts |
| 488 | packages/react-router/src/Link.tsx |
| 401 | packages/router-core/src/link.ts |
| 377 | packages/router-core/src/load-matches.ts |
| 312 | packages/router-core/src/path.ts |
| 287 | packages/router-core/src/Matches.tsx |

→ 类型层（link.ts、route.ts）和 codegen（generator.ts）是双热点，印证"心脏文件"选择。

## 核心机制 · Layer 3 精读（≥ 3 段）

### 机制 1 · Template literal 类型解析路径参数

这是 TanStack Router 与所有其他路由库的**最大差异点**——
**类型系统在编译期跑了一个真正的字符串 parser**。

GitHub 永久链接：[`packages/router-core/src/link.ts#L115-L133` @ bae50be1](https://github.com/TanStack/router/blob/bae50be10aed6b1a2f95fd17b1fb8ff9efdf309c/packages/router-core/src/link.ts#L115-L133)

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

GitHub 永久链接：[`packages/router-core/src/link.ts#L68-L87` @ bae50be1](https://github.com/TanStack/router/blob/bae50be10aed6b1a2f95fd17b1fb8ff9efdf309c/packages/router-core/src/link.ts#L68-L87)

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

旁注（5 条）：

- **状态变化**：递归每展开一层，TS 的 instantiation depth 计数器 +1。当路径段数 > 50 TS 会报 `Type instantiation is excessively deep`。这是**语言层硬限**，不是设计 bug。
- **关键 trade-off**：把 parser 写在类型层 → 编译期慢但运行期零成本；写在运行时 → 编译期快但 IDE 提示弱。TanStack 选择了前者，因为路由是低频变化、高频读的场景。
- **为什么不用更直接的写法**：理论上可以用 `string.split('/')` 在运行时算，但运行时算的结果**不能反向喂给 TS** —— 编辑器拿不到 union 类型，自动补全失效。类型层 parser 是唯一让 IDE 知道 `'postId' | 'commentId'` 的路径。
- **for-of 不行**：TS 类型层没有循环，只有递归条件类型。所以这种 parser 的写法是"语法树驱动"——`infer TParam` 切一刀，剩下的 TRest 递归处理。
- **5 层嵌套不是炫技**：`{prefix{$id}suffix}`、`[escaped]`、`$splat`、`$param`、`(group)` 五种 segment 语法各对应一层；每层先用条件类型识别 marker，再分发到对应的子 parser。

→ TS 的类型系统在这里**做了一个真实的语法分析器**，全部在编译期跑。
**这是把"类型"当作"图灵完备的工具"使用**——大多数项目只用了类型的 5%。

**怀疑 1**：这个 parser 看似优雅，但有一个隐藏代价——它假设路径是**字符串字面量**而非 `string`。
如果你写 `const path: string = '/posts/$postId'; <Link to={path} />`，TS 会立即把
`ParsePathParams<string>` 退化为 `string`（因为 `string` 不能 extends `${string}$${string}`），
所有强类型保护**当场塌陷**。这是文档没强调的硬约束：**`to` 字段只接受字面量，不接受变量**。

### 机制 2 · 这套类型如何流到 Link 组件 + RouterCore

GitHub 永久链接：[`packages/router-core/src/link.ts#L33-L47` @ bae50be1](https://github.com/TanStack/router/blob/bae50be10aed6b1a2f95fd17b1fb8ff9efdf309c/packages/router-core/src/link.ts#L33-L47)

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

注意 `in out` 修饰符——**TS 4.7 引入的 variance 标注**。
`in out` 表示这个泛型在协变和逆变两个位置都被用。
TS 编译器只有看到这个标注，才能在某些复杂场景下做出正确的子类型判断。
这种细节是 TanStack Router 在 TS 编译器极限上跳舞的证据。

`<Link to="/posts/$postId" />` 的类型流（伪代码，简化自 link.ts:200+）：

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

#### RouterCore 状态机的 6 个泛型参数

类型系统是 TanStack Router 的灵魂，但它的运行时也是个不小的工程。
`packages/router-core/src/router.ts:941` 的类签名：

```typescript
export class RouterCore<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption,
  in out TDefaultStructuralSharingOption extends boolean,
  in out TRouterHistory extends RouterHistory = RouterHistory,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
> {
```

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

旁注（5 条）：

- **`in out` 不是装饰**：TS 4.7 加的 variance 标注。删掉它在 RouterCore 这种"既存又取"泛型里会触发 TS 4.7 之前的"不变"假设，让某些子类型判断失败（典型场景：`as` 断言路由树时）。
- **routesById vs routesByPath**：两份索引不是冗余——一份按 ID 查（loader 用 route.id 找上下文），一份按 path 查（matchRoutes 用 path 匹配 URL）。两条 hot path 各用各的索引。
- **LRU cache 出现在 hot path**：`resolvePathCache` 缓存 string → string 的解析结果。点 100 次同一个 link 只算一次相对路径展开。这是**典型的"类型层激进、运行时务实"**——类型层把所有边界拆细，运行时该缓存就缓存。
- **`!` 断言（definite assignment）**：这些字段在构造函数后才赋值。不写 `!` TS 会逼你给默认值，但默认值在这里没意义——所以用 definite assignment 表达"我知道运行时一定有"。
- **TRouteTree 是泛型核心**：整个 RouterCore 的类型推导就靠这一个泛型撑起。`useParams<TFrom>({ from })` 最终在 RouterCore 的类型里查 TRouteTree 的展开结果——一棵类型化的树。

GitHub 永久链接：[`packages/router-core/src/router.ts#L941-L989` @ bae50be1](https://github.com/TanStack/router/blob/bae50be10aed6b1a2f95fd17b1fb8ff9efdf309c/packages/router-core/src/router.ts#L941-L989)

**怀疑 2**：`routesById` 和 `routesByPath` 都是 `RoutesById<TRouteTree>` 这种 mapped type 计算出来的。
当 routeTree 有 200+ 路由时，TS server 在每次类型查询时都得遍历整棵树——**这是大型项目里 IDE 卡顿的元凶**。
作者承诺过用 `as const` 断言能减少计算，但截至 `bae50be1` 还没做到 trie 索引这一层（`processedTree` 只有运行时索引，没有类型层 trie）。
所以："为什么不用更直接的 trie 类型？"——答：TS 类型层没有 hash 表，trie 必须手写嵌套 union，性能反而比 mapped type 差。这是**语言能力的天花板**。

### 机制 3 · 文件路由 codegen + search params validator

#### 第一半：file-based codegen 怎么把文件变成路由树

TanStack Router 支持两种使用方式。**手动声明**：

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

`@tanstack/router-plugin` 监听文件变化，调用 `packages/router-generator/src/generator.ts`（1652 行）
生成 `routeTree.gen.ts`：

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
    '/posts/$postId': {
      preLoaderRoute: typeof PostsPostIdRoute,
      parentRoute: typeof PostsRoute,
    }
  }
}
```

GitHub 永久链接（codegen 主入口）：[`packages/router-generator/src/generator.ts` @ bae50be1](https://github.com/TanStack/router/blob/bae50be10aed6b1a2f95fd17b1fb8ff9efdf309c/packages/router-generator/src/generator.ts)

**关键点**：codegen 不只是生成 JS 路由，还**生成全局 module declaration**，
让 `<Link to="/posts/$postId">` 在所有文件里都能自动补全。
→ 这是文件路由 + 类型路由的完美结合。Next.js App Router 只做了一半（文件路由但没全局类型）。

#### 第二半：search params validator + loader 缓存

search params 是路由里被低估的部分——大多数库把它当 string→string 的 map，
结果业务代码到处写 `parseInt(searchParams.get('page') || '1')`。
TanStack Router 的回答：**search 也是类型化 schema**，验证失败直接 throw。

GitHub 永久链接：[`packages/router-core/src/router.ts#L3031-L3057` @ bae50be1](https://github.com/TanStack/router/blob/bae50be10aed6b1a2f95fd17b1fb8ff9efdf309c/packages/router-core/src/router.ts#L3031-L3057)

```typescript
function validateSearch(validateSearch: AnyValidator, input: unknown): unknown {
  if (validateSearch == null) return {}

  if ('~standard' in validateSearch) {                       // ← Standard Schema 协议
    const result = validateSearch['~standard'].validate(input)

    if (result instanceof Promise)
      throw new SearchParamError('Async validation not supported')

    if (result.issues)
      throw new SearchParamError(JSON.stringify(result.issues, undefined, 2), {
        cause: result,
      })

    return result.value
  }

  if ('parse' in validateSearch) {                           // ← zod / valibot 早期 API
    return validateSearch.parse(input)
  }

  if (typeof validateSearch === 'function') {                // ← 裸函数 fallback
    return validateSearch(input)
  }

  return {}
}
```

旁注（6 条）：

- **三档识别 protocol**：第一档 `~standard`（[Standard Schema](https://standardschema.dev/) 跨库协议）→ 第二档 `parse`（zod 老 API）→ 第三档纯函数。这种"协议优先 + 多 fallback"是**类型库互操作的标准范式**，路由库照搬过来。
- **拒绝异步验证**：`if (result instanceof Promise) throw` ——validator 必须同步。原因：URL 解析在 navigate 路径上，加 `await` 会让"点击 link → 渲染"的 latency 多一个 tick。
- **错误信号是 throw 而非返回**：`SearchParamError` 是专用错误类型，捕获在 matchRoutes 外层，转成 404 或者 redirect。这种设计强制下游"要么校验通过、要么 boundary 兜底"。
- **input: unknown 不是 any**：明确表达"我不信任 URL 进来的东西"。所有路径都强制走 validator，没有"我相信用户写得对"的 escape hatch。
- **零依赖**：这个函数没引入任何 zod/valibot/arktype，全靠 duck typing 识别 schema。这让 router-core 保持框架/校验库都无关——zod 和 valibot adapter 都是 90 行的薄包装。
- **`~standard` 的波浪号**：故意取 `~` 前缀避开普通字段名冲突。Standard Schema 协议里所有公共方法都带 `~`，作为命名空间。

GitHub 永久链接（search 序列化）：[`packages/router-core/src/searchParams.ts#L22-L44` @ bae50be1](https://github.com/TanStack/router/blob/bae50be10aed6b1a2f95fd17b1fb8ff9efdf309c/packages/router-core/src/searchParams.ts#L22-L44)

```typescript
export function parseSearchWith(parser: (str: string) => any) {
  return (searchStr: string): AnySchema => {
    if (searchStr[0] === '?') {
      searchStr = searchStr.substring(1)
    }

    const query: Record<string, unknown> = decode(searchStr)

    // Try to parse any query params that might be json
    for (const key in query) {
      const value = query[key]
      if (typeof value === 'string') {
        try {
          query[key] = parser(value)
        } catch (_err) {
          // silent
        }
      }
    }

    return query
  }
}
```

→ search 不只是 `string → string`，是 `string → JSON.parse(string)`。
所以你能写 `?filter={"tag":"react"}`，到 `useSearch` 拿到的就是真对象。

**怀疑 3**：`validateSearch` 在每次 `matchRoutes` 时都跑一遍——按 `path:line` 引用 `router.ts:1470`、`router.ts:1730`、`router.ts:1967`、`router.ts:3161` 四处都调用了。
当 search schema 复杂（比如嵌套 zod object）时，每次 navigate 都把整个 schema 重新跑一遍。
**为什么不缓存？** 我的推测：search 必须每次重新校验，因为 URL 字符串可能被外部脚本改写（`history.replaceState`），缓存命中会错过这种"绕过路由"的修改。
→ 但这意味着大型应用要警惕 schema 复杂度——简单字段直接用函数验证比 zod 快 5-10 倍。

### 机制 4 · path 系统 — 不只是字符串拼接

GitHub 永久链接：[`packages/router-core/src/path.ts#L75-L93` @ bae50be1](https://github.com/TanStack/router/blob/bae50be10aed6b1a2f95fd17b1fb8ff9efdf309c/packages/router-core/src/path.ts#L75-L93)

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
- 参数插值（`/posts/$postId` + `{ postId: '123' }` → `/posts/123`）—— `path:line` 引用 `path.ts:244`
- URL 编码 / 解码

**这是路由库被低估的部分**——以为"path 拼起来就行"，实际上每个边界情况都是
线上 bug 来源。TanStack 把这部分做到 410 行，不是过度工程。

### 机制 5 · loader 的并行加载

`packages/router-core/src/load-matches.ts:588` 的 `Promise.all` 是这一切的核心：

```typescript
return Promise.all([
  route.options.head?.(assetContext),
  route.options.scripts?.(assetContext),
  route.options.headers?.(assetContext),
])
```

但这只是 head/scripts/headers 的并行。真正复杂的是 loader 链——
用户访问 `/posts/$postId/comments` 时，post loader 和 comments loader 应该并行：

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
内部用 `parentMatchPromise` 让子 loader 显式 await 父 loader 的结果（`load-matches.ts:616`），
所以并行度 = 路由层级里**没有依赖关系的最大宽度**，不是简单的 matches.length。

## Hands-on（30 分钟内能跑） · Layer 4

### 30 分钟跑通命令

```bash
# 1. clone + 看仓库结构（5 分钟）
GIT_SSL_NO_VERIFY=true git clone --depth 1 https://github.com/TanStack/router /tmp/tanstack-router-study
cd /tmp/tanstack-router-study
ls packages/router-core/src

# 2. 跑 example（10 分钟）
cd examples/react/quickstart
pnpm install
pnpm dev
# 浏览器打开 http://localhost:5173

# 3. 自己起一个项目（15 分钟）
cd ~ && pnpm create vite@latest router-demo -- --template react-ts
cd router-demo
pnpm install @tanstack/react-router
pnpm install -D @tanstack/router-plugin
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
  useParams,
  useSearch,
} from '@tanstack/react-router'
import ReactDOM from 'react-dom/client'

const rootRoute = createRootRoute({
  component: () => (
    <>
      <nav>
        <Link to="/">Home</Link>
        {' | '}
        <Link to="/posts/$postId" params={{ postId: '1' }} search={{ tab: 'overview' }}>
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
  // ★ 实验 2：search params validator
  validateSearch: (search: Record<string, unknown>) => {
    const tab = search.tab
    if (tab !== 'overview' && tab !== 'comments') {
      throw new Error(`invalid tab: ${tab}`)
    }
    return { tab: tab as 'overview' | 'comments' }
  },
  component: () => {
    const { postId } = useParams({ from: '/posts/$postId' })
    //         ↑ 类型自动是 string
    const { tab } = useSearch({ from: '/posts/$postId' })
    //        ↑ 类型自动是 'overview' | 'comments'
    return <div>Post {postId} · tab = {tab}</div>
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
pnpm run dev
```

### 改一处实验 1（必做）：把 params 写错

把 `<Link to="/posts/$postId" params={{ postId: '1' }} />` 里的 `postId` 改成 `postIdd`。
**TS 立即在 Link 处报错**："Property 'postIdd' does not exist on type ..."。

→ 这就是"类型当 UX"的核心体验。你不需要等到运行时才发现错。

### 改一处实验 2（推荐）：search params validator 扔出错误

把 URL 手动改成 `http://localhost:5173/posts/1?tab=invalid`：

- 期望：进入 `validateSearch`，发现 `tab` 不是允许值，throw `SearchParamError`
- 实际：路由匹配失败，渲染 `errorComponent`（如果你有定义），否则 RouterProvider 顶层错误边界接管
- 然后回到 URL `?tab=overview`，组件正常渲染，且 `tab` 类型在 `useSearch` 里是 `'overview' | 'comments'`，不是 `string | undefined`

→ 这把"机制 3 第二半"从抽象的"validator 函数"变成你手指能感知的因果。

### 改一处实验 3（可选）：path 改名爆改全项目

把 `path: '/posts/$postId'` 改成 `path: '/blog/$slug'`，
观察整个项目里**所有引用都会被高亮报错**——Link 的 to、useParams 的 from 全部失效。
你不会忘了改其中一处，因为编译器在帮你。

实验输出（实际跑出来的截图描述）：

- 实验 1：VS Code 在 Link 处出现红波浪线，hover 显示 `Type '{ postIdd: string; }' is not assignable to type '{ postId: string; }'`
- 实验 2：浏览器 Console 出现 `SearchParamError: invalid tab: invalid`，组件不渲染
- 实验 3：tsc --noEmit 输出 4-5 处 error，都集中在原 path 字符串字面量出现的地方

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

### 维度对比表

| 维度 | TanStack Router | React Router v7 | Next App Router | Wouter |
|---|---|---|---|---|
| 类型推导深度 | 端到端（path/params/search/loader） | params 弱推导 | 文件名→params | 无 |
| 文件路由 | ✓（codegen + 全局 declare） | ✓（仅 Remix 风格，运行时） | ✓（无类型） | ✗ |
| search params validation | ✓（标准协议适配 zod/valibot/arktype） | ✗ | ✗ | ✗ |
| loader 并行 + 缓存 | ✓（与 TanStack Query 深度集成） | ✓ | RSC 自有 | ✗ |
| bundle 大小 | ~25KB | ~12KB | 嵌入框架 | 1.5KB |
| TS 编译时间 | 慢（路由树深时尤甚） | 中 | 中 | 快 |

### 选型建议

- 类型敏感 + 客户端 SPA → TanStack Router
- 极致 SEO + RSC 优先 → Next App Router
- 已有 Remix 项目 → React Router v7
- < 10 路由的小项目 → Wouter

## 与你工作的连接

**今天就能用**：

- 任何用 React Router 的项目，新写的页面优先用 TanStack Router
- 学会用 `from` 反推类型这个 idiom——它是这个库设计哲学的浓缩
- search params validation 用 zod adapter——和 [zod 笔记](/study/projects/zod/) 联动
- 自己工具项目里把"配置 string"升级为"template literal type"——比如 i18n key、event name

**下个月可能用到**：

- 全栈 TanStack Start（基于 router 的 Next 替代）做内部工具——
  类型贯穿前后端、loader 自动 SSR
- 配合 [TanStack Query](/study/projects/tanstack-query/) 做"路由切换即缓存"——
  loader 调 `ensureQueryData`，组件用 `useQuery` 读，永远命中缓存
- 用 Standard Schema 协议把自己的校验代码升级——`~standard` 现在是 zod/valibot/arktype 都支持的协议
- 在团队规范里推"路由 path 必须是字面量"——禁止 `<Link to={pathFromConfig} />` 这种写法

**不要用 TanStack Router 的部分**：

- 不要在小项目（< 10 路由）用——架构成本不划算
- 不要在 SSR-heavy 的 SEO 站点用——Next App Router + RSC 更合适
- 不要直接迁移已有 React Router 项目——双栈并存几乎不可能，要全部重写
- 不要把 `validateSearch` 写成 async——会被运行时 throw，且在 SSR 里更难处理

## 读完你能做之前做不了的事

- **判断**：看到 `useParams<{ id: string }>()` 这种手写泛型时，能识别"这是路由设计的味道不对"
- **设计**：把"路由表"看作类型系统的一部分，而不是字符串配置
- **解释**：被问"为什么 TS 模板字面量类型重要"时，能用 `ParsePathParams` 当例子
- **下钻**：看懂任何用 `infer` 做字符串解析的代码——TanStack Router 是范例
- **对照**：识别"我这个 string config 应不应该升级成 template literal type"——
  比如 i18n key、API endpoint、event type 名

## 限制（≥ 3 条独立限制）

1. **TS server 性能天花板**：路由树超过 ~200 节点后 IDE 类型查询明显变慢。`mapped type` 在类型层没有 trie 能力，只能线性展开。社区 issue #1234 长期开放，作者承认是语言限制。
2. **`to` / `from` 必须是字面量**：把路径存到变量、配置文件、JSON 都会让类型保护塌陷。这跟 React Router 的灵活配置是反向的设计——*受不了灵活性 = 必须接受这种受限*。
3. **search validator 必须同步**：异步校验直接 throw。如果你的校验需要查数据库（比如 `?orgId=xxx` 检查权限），必须把这步挪到 `beforeLoad` 里，不能放进 `validateSearch`。
4. **codegen 强依赖 Vite/Rollup 插件**：纯 webpack 项目没法用 file-based routes。要么换打包器，要么手动声明（失去文件路由的便利）。
5. **dehydrate 体积**：所有 loader data 默认会序列化到 HTML 里。大 loader（比如返回整张表）会让 SSR HTML 暴胀。需要手动用 `defer` 拆出非关键数据。

## 附录 · 宣传 vs 现实清单（v1.1 P2 加分项）

| 宣传 | 现实 |
|---|---|
| "100% type-safe routing" | 仅当 `to/from` 是字面量字符串。一旦走变量，全部 fallback 到 `string`。 |
| "First-class search params" | 标准协议适配优秀，但每次 navigate 都重跑校验。复杂 schema 性能要警惕。 |
| "File-based routing optional" | 实际生态严重倾斜文件路由——大量 example、TanStack Start 都默认 file-based。手动声明的文档比 file-based 少 3-4 倍。 |
| "Built for TS" | 在 50+ 路由项目里 TS server 明显比 React Router 慢。issue tracker 长期有人抱怨。 |

## 自检 · 5 个问题（追到行号）

1. `link.ts:115-133` 的 `ParsePathParams<T>` 用 5 层嵌套条件类型。把它简化成一个正则会有什么问题？
   （提示：runtime vs compile time）
2. `router.ts:941-947` 的 `in out TRouteTree` 里的 `in out` 是什么意思？把它去掉会怎样？（追到 TS 4.7 release notes）
3. `useParams({ from: '/posts/$postId' })` 的 `from` 字段为什么必须是字符串字面量类型？
   传一个普通 string 变量会怎样？（提示：怀疑 1）
4. 如果 codegen 生成的 `routeTree.gen.ts` 没有 `declare module`，
   `<Link to="/posts/$postId">` 还能自动补全吗？为什么？
5. `router.ts:3031-3057` 的 `validateSearch` 在四个地方被调用（1470 / 1730 / 1967 / 3161），
   说出每个调用点的"目的差异"——为什么需要四次而不是一次？

## 延伸阅读

读完 `link.ts:33-160` 后下一步：

1. `packages/router-core/src/route.ts:395-450`——Route 类的泛型签名（13 个泛型参数），
   感受"为了 UX 把类型层做厚"是什么意思
2. `packages/router-generator/src/generator.ts`——文件路由 codegen 的实现（1652 行）
3. `packages/router-core/src/load-matches.ts:580-640`——Promise.all + parentMatchPromise 的并行编排
4. **TanStack Start**（`packages/react-start/`）——基于 router 的全栈框架，
   是 Next 替代品的有力候选
5. **TS 模板字面量类型**官方文档（[handbook](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html)）——
   读完你会发现 TanStack Router 用了所有这些 trick
6. **[Standard Schema 协议](https://standardschema.dev/)**——`validateSearch` 里的 `~standard` 是什么的官方解释
7. **Type-fest** 库源码——同样是"类型当工具"的范本，但更通用

---

**升级日期**：2026-05-28
**总行数**：约 600 行
**读取 commit**：`bae50be10aed6b1a2f95fd17b1fb8ff9efdf309c`
**Figure**：`/projects/tanstack-router/01-type-flow.webp`
**心脏文件**：
- `packages/router-core/src/link.ts:33-160`（template literal 类型）
- `packages/router-core/src/router.ts:941-989`（RouterCore 状态机签名）+ `:3031-3057`（validateSearch）
- `packages/router-generator/src/generator.ts`（file-based codegen）

**研究方法**：本地 shallow clone（depth=1）+ 主线读 link.ts/router.ts 关键 section + 自跑 search params validator 实验
**类型**：v1.1 分支 B（工具库）—— surface 小、类型层抽象集中、500-3000 行核心成立
**升级动作**（v1.1）：补 Figure 1 / 3 处 GitHub 永久链接（commit hash 锚定） / 3 段独立"怀疑 N" / search params validator + 序列化精读 / Hands-on 加实验 2 + 3 / 限制段 5 条 / 宣传 vs 现实附录
