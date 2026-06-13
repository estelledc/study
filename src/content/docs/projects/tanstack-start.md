---
title: TanStack Start 学习笔记
来源: https://github.com/TanStack/router
日期: 2026-06-13
分类: 后端 API
子分类: frontend-web
provenance: pipeline-v3
---

# TanStack Start 学习笔记

## 什么是 TanStack Start

TanStack Start 是一个基于 TanStack Router 构建的全栈 React 框架。

用日常类比来理解：如果把前端框架比作餐厅，那么普通的 React（如 Vite + React）就像是一个只提供厨房的共享空间——你需要自己买锅碗瓢盆（配置路由、数据请求、构建工具）。而 TanStack Start 像是一家"精装厨房餐厅"——它不仅提供厨房，还把路由、数据获取、服务端渲染、类型安全这些常用设备都准备好了，你拎包入住就行。

它是 TanStack 生态系统的一部分，这个生态系统包含：

- **TanStack Router**：类型安全的路由库
- **TanStack Query**：异步状态和数据缓存
- **TanStack Form**：类型安全的表单状态
- **TanStack Table**：无头数据表格
- **TanStack Start**：把它们全部整合在一起的全栈框架

GitHub 仓库：https://github.com/TanStack/router（14.6k+ Star）

## 核心概念

### 1. 文件系统路由（File-Based Routing）

TanStack Start 使用 `src/routes/` 目录来自动创建路由。文件名就是 URL 路径。

```
src/routes/
├── __root.tsx          # 根布局，包裹所有页面
├── index.tsx           # 首页 (/)
├── about.tsx           # /about
├── users/
│   └── $userId.tsx     # /users/123（动态路由）
└── fetch-movies.tsx    # /fetch-movies
```

### 2. SSR（服务端渲染）

页面先在服务器上渲染成 HTML，再发送到浏览器。用户看到页面的速度更快，SEO 也更好。TanStack Start 支持完整的文档 SSR 和流式渲染（streaming）。

### 3. Loader（数据加载器）

每个路由可以定义一个 `loader` 函数，专门用来在页面渲染前获取数据。Loader 是"同构"的——在服务器端渲染（SSR）时运行在服务端，在客户端导航时运行在客户端。

### 4. Server Functions（服务端函数）

定义在服务器端运行的函数，但可以从客户端直接调用。它们提供端到端的类型安全：你在客户端调用服务端函数时，如果参数类型不对，TypeScript 会直接报错。

### 5. 类型安全（Type Safety）

从路由参数到 loader 返回的数据，整个流程都有 TypeScript 类型推导。你不需要手动写类型声明，TanStack Start 会自动推断。

### 6. 混合执行模型（Isomorphic Execution）

代码可以同时在服务端和客户端运行。比如一个 `formatPrice` 函数，在服务端渲染时用一次，客户端导航时再用一次，写法完全一样。

## 项目结构

一个典型的 TanStack Start 项目结构：

```
/movie-discovery
├── src/
│   ├── routes/
│   │   ├── __root.tsx        # 根布局
│   │   ├── index.tsx         # 首页
│   │   └── fetch-movies.tsx  # 电影列表页
│   ├── types/
│   │   └── movie.ts          # 类型定义
│   ├── router.tsx            # 路由器配置
│   ├── routeTree.gen.ts      # 自动生成的路由树
│   └── styles.css            # 全局样式
├── public/                   # 静态资源
├── vite.config.ts            # 配置
├── package.json
└── tsconfig.json
```

## 代码示例

### 示例一：基础路由与 Loader 获取数据

这里展示如何创建一个电影发现页面。`loader` 负责在页面渲染前从 API 获取数据，`useLoaderData` 让组件拿到这些数据。

```tsx
// src/routes/fetch-movies.tsx
import { createFileRoute } from '@tanstack/react-router'
import type { Movie } from '../types/movie'

// 定义这个路由的 loader，在页面渲染前运行
export const Route = createFileRoute('/fetch-movies')({
  loader: async () => {
    // 从外部 API 获取电影数据
    const response = await fetch('https://www.omdbapi.com/?s=matrix&apikey=your-api-key')
    const data = await response.json()
    return data.Search as Movie[]
  },
})

// 组件中使用 loader 返回的数据
function Movies() {
  // useLoaderData 会从 Route 的 loader 中自动推断类型
  const movies = Route.useLoaderData()

  return (
    <div>
      <h1>Matrix Movies</h1>
      <ul>
        {movies.map((movie) => (
          <li key={movie.imdbID}>
            {movie.Title} ({movie.Year})
          </li>
        ))}
      </ul>
    </div>
  )
}
```

**关键点**：loader 返回的数据会自动通过 TypeScript 传递给组件，不需要手动声明类型。

### 示例二：Server Functions — 从客户端调用服务端代码

Server Functions 让你在不写 API 路由的情况下，直接从客户端调用服务端逻辑。这是 TanStack Start 最强大的特性之一。

```tsx
// src/utils/server-fn.ts
import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

// 定义一个服务端函数，带有输入验证
export const getTodos = createServerFn({ method: 'GET' })
  // 输入验证：userId 必须是字符串
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    // 这里运行在服务端，可以访问数据库、文件系统
    // 返回 Todo 列表
    return [
      { id: 1, title: '学习 TanStack Start', completed: false },
      { id: 2, title: '写一个 Server Function', completed: true },
      { id: 3, title: '部署到生产环境', completed: false },
    ]
  })
```

在组件中直接调用服务端函数：

```tsx
// src/routes/todos.tsx
import { createFileRoute } from '@tanstack/react-router'
import { getTodos } from '../utils/server-fn'

export const Route = createFileRoute('/todos')({
  component: TodosPage,
})

function TodosPage() {
  // 直接调用服务端函数！无需配置 API 路由
  // TypeScript 会自动推断 getTodos 的参数类型和返回类型
  const todos = getTodos({ data: { userId: 'user-1' } })

  return (
    <div>
      <h1>My Todos</h1>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            {todo.completed ? '✅' : '⬜'} {todo.title}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

## 选择 SSR（选择性服务端渲染）

不是所有页面都需要 SSR。TanStack Start 允许你对每个路由精细控制 SSR 行为：

```tsx
// src/routes/docs/$docType/$docId.tsx
export const Route = createFileRoute('/docs/$docType/$docId')({
  validateSearch: z.object({ details: z.boolean().optional() }),
  // 根据参数决定是否启用 SSR
  ssr: ({ params, search }) => {
    if (params.status === 'success' && params.value.docType === 'sheet') {
      return false  // 这个页面不 SSR
    }
    if (search.status === 'success' && search.value.details) {
      return 'data-only'  // 只服务渲染数据
    }
    return true  // 正常 SSR
  },
  loader: () => {
    console.log('仅在服务器执行')
  },
  component: () => <div>页面内容</div>,
})
```

## 为什么选择 TanStack Start

1. **开箱即用**：路由、SSR、数据获取、类型安全全部集成好了
2. **类型安全贯穿全栈**：从路由参数到服务端函数返回值，TypeScript 全程保护
3. **灵活的部署**：支持 Vite 和 Rsbuild，可以部署到 Netlify、Vercel、Cloudflare、Railway 等平台
4. **生态整合**：与 TanStack Query、TanStack Form 等无缝配合
5. **渐进式采用**：可以用纯客户端模式，也可以完全启用 SSR

## 总结

TanStack Start 的本质就是把 TanStack 全家桶打包成一个框架。它核心理念是：

- **客户端优先**：页面先在客户端运行，保证交互体验
- **服务器能力**：在需要时启用 SSR 和服务端函数
- **类型即文档**：不写额外文档，类型系统就是最准确的文档

对于想要构建类型安全、数据驱动的全栈 React 应用的项目来说，TanStack Start 是一个值得关注的选择。
