---
title: TanStack Router — 把 URL 当类型，编译器替你守路由
来源: 'https://github.com/TanStack/router'
日期: 2026-05-30
分类: projects
难度: 中级
---

## 是什么

TanStack Router 是一个 **TypeScript 路由库**：它把 URL 模板（如 `/posts/$postId`）从普通字符串升级成 **类型**，让编译器在你打字时就检查跳转是否合法、参数是否齐全。

日常类比：以前路由像在路口立一块写着"去 1 号楼 305 室"的木牌——拼写错了没人管，等访客敲错门才发现。TanStack Router 把这块木牌换成 IC 卡——卡上每个字段都是结构化的，写错形状卡就插不进读卡器，编译器立刻拦下来。

你写：

```tsx
<Link to="/posts/$postId" params={{ postId: '123' }} />
```

漏写 `postId`、把名字打成 `postIdd`，TS 立即报红。改路径 `/posts/$postId` 为 `/blog/$slug`，整个项目所有引用全部编译期报错——你不会忘了改其中一处，因为编译器会列清单。

## 为什么重要

- 不理解它，没法解释为什么一些 React 项目敢删掉 80% 的 `useParams<{ id: string }>()` 手写泛型
- 不理解它，看不懂 `<Link to="/posts/$postId">` 怎么自动补全所有可能路径
- 不理解它，不知道为什么文件 `posts.$postId.tsx` 改名后 TS 满屏报错——这是设计而不是 bug
- 不理解它，错过 TS 模板字面量类型在工业里跑得最远的一个范例
- 不理解它，被问"为什么 string 配置应该升级为类型"时举不出活的例子

## 核心要点

1. **模板字面量类型解析路径**：TS 4.1+ 引入的 `${string}$${infer T}` 让类型层能像正则一样切字符串。给定字符串字面量类型 `'/posts/$postId'`，类型层递归算出 `{ required: 'postId' }`。**类比**：在你按下回车前，编译器已经悄悄跑了一遍字符串解析，再拿结果守住 Link 的入口。

2. **RouterCore 持有类型化路由树**：用户写的一堆 `createRoute({ path, loader })` 会被收成一棵 `TRouteTree`，RouterCore 用泛型把它展开成两份索引——按 ID 查（loader 找上下文用）、按 path 查（matchRoutes 用）。运行时跑路由匹配，类型层跑参数推断。

3. **codegen + declare module 把局部类型变全局**：`@tanstack/router-plugin` 监听 `src/routes/` 目录，把文件名编译成 `routeTree.gen.ts`。生成的代码里有一段 `declare module '@tanstack/react-router'`，把整张路由表注入全局命名空间——结果就是 `<Link to="/...">` 在任何文件里不用 import 都能自动补全所有可能的路径。

三步合起来：**path 只写一次，编译期反推出参数形状，全局类型表把推断结果广播给整个项目**。这是 TS "类型即文档 + 类型即测试"想法被推到极限的工业样本。

## 实践案例

### 案例 1：改路径，编译器替你列清单

```tsx
const postRoute = createRoute({
  path: '/posts/$postId',
  loader: ({ params }) => fetchPost(params.postId),
})
```

跨文件引用：`<Link to="/posts/$postId" params={{ postId: '1' }} />`、`useParams({ from: '/posts/$postId' })`。

把 `path` 改成 `/blog/$slug`，`tsc --noEmit` 立刻列出所有用到旧路径的位置。你不需要全局搜索字符串，TS 替你做了清单——**这是把"路由作为契约"做到底的体感**。对比 React Router v7：`<Link to="/posts/123" />` 的字符串里的 `posts` 是 typo 还是真路径？编译器没办法判断。

### 案例 2：search params 当 schema 用

```tsx
const route = createRoute({
  path: '/posts/$postId',
  validateSearch: (s: Record<string, unknown>) => {
    const tab = s.tab
    if (tab !== 'overview' && tab !== 'comments') throw new Error('bad tab')
    return { tab: tab as 'overview' | 'comments' }
  },
})
```

URL 里手动改成 `?tab=invalid`，validator 抛 `SearchParamError`，进 `errorComponent` 兜底。组件里 `useSearch` 拿到的 `tab` 类型直接是 `'overview' | 'comments'`，不需要每次都判 `undefined`。

大多数路由库把 search 当 `string → string` 的 map，业务代码到处 `parseInt(searchParams.get('page') || '1')`。TanStack 把它升级为强类型 schema——错值 throw、好值进类型。换成 zod 写法只是把上面那段 `validateSearch` 替换成 `zodValidator(z.object({ tab: z.enum([...]) }))`。

### 案例 3：和 TanStack Query 拼在一起

```tsx
createRoute({
  path: '/posts/$postId',
  loader: ({ params }) => queryClient.ensureQueryData(postQuery(params.postId)),
})
```

router 的 loader 直接调 query 的 `ensureQueryData`——有缓存就用、没有就拉。**路由切换 = 缓存命中**，这种"路由数据层"的整合是其他路由库要自己手写的。组件内再用 `useQuery(postQuery(...))` 读，永远命中缓存。

整合的关键是 router 团队故意把 `@tanstack/react-router-with-query` 单独拆成包，让两个库的 lifecycle 在 SSR / dehydrate / hydrate 三个阶段对齐。

## 踩过的坑

1. **`to` / `from` 必须是字符串字面量**——把路径存到变量或 JSON 配置后，TS 把它退化成 `string`，所有强类型保护**当场塌陷**。这条文档没强调，但是硬约束。

2. **`validateSearch` 必须同步**——异步会被运行时直接 `throw`。校验需要查数据库（比如权限）必须挪到 `beforeLoad`，不能塞进 `validateSearch`。

3. **路由树超 200 节点 IDE 卡顿**——`routesById` 是 mapped type，TS server 每次类型查询都得遍历整棵路由。这是语言能力的天花板，不是写法问题。

4. **codegen 绑死 Vite/Rollup**——纯 webpack 项目用不了文件路由，要么换打包器、要么手动声明（失去文件路由便利）。

5. **dehydrate 体积容易炸**——所有 loader data 默认序列化到 HTML，大 loader 让 SSR HTML 暴胀，要手动 `defer` 拆出非关键数据。

## 适用 vs 不适用场景

**适用**：

- 类型敏感的客户端 SPA / 内部工具——路由数 30-100 之间，类型推导收益最大
- 表单 / 列表 / 搜索这类把状态放 URL 的应用——`validateSearch` + zod adapter 让 `?page=2&filter={...}` 强类型
- 已经在用 TanStack Query 的项目——`ensureQueryData` 集成几乎零成本
- 想学 TS 模板字面量类型在工业里跑到极限的样本
- TanStack Start 全栈项目——router 是 Start 的根基，loader 直接对接 server functions

**不适用**：

- < 10 路由的小项目——架构成本不划算，Wouter 1.5KB 已够用
- SSR 重 + RSC 优先的 SEO 站点——Next App Router 集成更顺
- 已有 React Router 项目想增量迁移——双栈并存几乎不可能，要全部重写
- 校验要 IO 的场景——`validateSearch` 同步限制硬性挡路
- 路径必须存数据库 / 远端配置的多租户场景——失去字面量后类型保护塌陷

## 历史小故事（可跳过）

- **2018 年前后**：Tanner Linsley 做出 react-table、react-query，把"列表/缓存"做成一等公民，开启 TanStack 系列
- **2022-2023**：他开始做 router，公开赌一件事——路由是软件最重要的 UX 边界，类型应该把它守得死死的
- **2024 年初**：v1 稳定，launch blog 写下 manifesto——"我们要的不是 routes，是一份从 URL 到 React tree 的端到端类型契约"
- **2025-2026**：衍生出 TanStack Start 全栈框架（基于 router 做 Next 替代品），同时多了 Solid / Vue adapter，core 拆出 framework-agnostic 包

## 学到什么

- **类型可以做 UX**：自动补全、报错红波浪线、改名一刀切——这些不是"额外负担"，是开发者实时反馈
- **string config 能升级成 template literal type**：i18n key、event name、API endpoint 这类配置都能搬这个套路
- **协议优先 + 多 fallback** 是类型库互操作的范式：`~standard` 协议 + `parse` 兜底 + 裸函数兜底
- **类型层激进、运行时务实**：types 把所有边界拆细，runtime 该缓存就缓存（LRU），不是越严越好
- **codegen 是工程上的必要**：`declare module` 让局部约定变全局类型——纯类型层做不到，运行时反注解又没意义

## 延伸阅读

- 官方文档：[tanstack.com/router](https://tanstack.com/router/latest)（quickstart 30 分钟跑通）
- 官方博客：[Announcing TanStack Router v1](https://tanstack.com/blog/announcing-tanstack-router-v1)（manifesto）
- TS 模板字面量类型 handbook：[TypeScript Template Literal Types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html)
- [Standard Schema 协议](https://standardschema.dev/)——`validateSearch` 里 `~standard` 是什么的官方解释
- 实验：自己起一个 Vite + React 项目，把 `<Link to="/posts/$postId" />` 的 `postId` 改成 `postIdd`，看 IDE 红波浪线长什么样
- [[hindley-milner]] —— 类型推导的祖师爷，TanStack Router 的"自动推参数表"是它的工业回响
- [[zod]] —— `validateSearch` 的最常见 adapter

## 关联

- [[hindley-milner]] —— 类型推导思想：占位符 + 解方程，TanStack 用模板字面量类型重演了一遍
- [[tanstack-query]] —— 兄弟项目，loader 直接调它的 `ensureQueryData`
- [[tanstack-form]] —— 同源设计，把表单状态也做成类型一等公民
- [[zod]] —— search validator 默认 adapter
- [[valibot]] —— 同上，更小体积的替代
- [[arktype]] —— 同上，纯 TS 类型层校验
- [[remix]] —— React Router v7 前身，文件路由的另一种诠释
- [[trpc]] —— "类型是契约"理念在 RPC 层的兄弟项目
- [[vite]] —— router-plugin 跑 codegen 的宿主，`HMR` 让 `routeTree.gen.ts` 改完即可见

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[islands-architecture]] —— Islands Architecture — 静态页面里只让需要交互的小块加载 JS
- [[ky]] —— ky — 把浏览器自带的 fetch 包成顺手工具
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库
- [[nivo]] —— nivo — React + d3 组件化图表
- [[sharp]] —— sharp — 让 Node.js 处理图像快到不像 JS
- [[swr]] —— SWR — React 远程数据 hook 的极简流派
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
