---
title: React Server Components — 让组件自己决定在哪台机器跑
来源: React RFC 0188, "Server Components", 2020
日期: 2026-05-31
分类: 前端框架
难度: 中级
---

## 是什么

React Server Components（**RSC**）是 React 团队 2020 年提的一个 RFC，把组件分成 **两类**：

- **服务器组件**：默认。只在服务端执行，**永远不会**被打进浏览器 JS bundle
- **客户端组件**：文件顶部写 `'use client'` 才算。这部分才会送到浏览器

日常类比：像餐厅厨房和前厅。厨房组件（server）拿原料、看库存、做菜，**做完只把盘子端出来**；前厅组件（client）和顾客互动——按按钮、填表、点单。顾客**永远进不了厨房**，厨房代码也不会出现在客人桌上。

## 为什么重要

不理解 RSC，下面这些事都没法解释：

- 为什么 Next.js 13 App Router 里写 `async function Page()` 能直接 `await db.query(...)`，但同一个写法在 Pages Router 报错
- 为什么 `'use client'` 这一行有时**让 bundle 变小**（边界往上推），有时反而变大
- 为什么传给客户端组件的 props 不能是函数——序列化边界硬约束
- 为什么 RSC 和 SSR（服务端渲染）是两件事，虽然都"在服务端跑"

## 核心要点

RSC 的设计可以拆成 **三个边界**：

1. **执行边界**：server component 跑在 Node / Edge，能 `await fetch`、`import('fs')`、连数据库；client component 跑在浏览器，能 `useState` / `useEffect` / 监听点击

2. **打包边界**：server component 的代码**不进 JS bundle**。一个 server component 用了 100KB 的 markdown 解析库，浏览器**收不到那 100KB JS**——只收到 RSC 序列化后的节点描述（常称 Flight payload），不是 SSR 那种整页 HTML 字符串

3. **序列化边界**：server → client 传 props 时必须是可序列化的值（大致像 JSON）。函数、class 实例、带方法的对象都过不去；`children` 是特殊豁免（React 知道怎么序列化它们）

`'use client'` 这一行**不是性能标记**，是**边界声明**——告诉打包器："从这个文件开始，下面的子树要打到浏览器"。

## 实践案例

### 案例 1：server component 直连数据库

分三步看：

1. 文件**没有** `'use client'` → 默认是 server component（厨房）
2. 组件写成 `async`，直接 `await` 查库——浏览器端做不到
3. 返回的 JSX 会序列化成节点描述发给客户端；`db` 对象**永远不进 bundle**

```tsx
// app/posts/page.tsx — 没有 'use client'，默认 server
import { db } from '@/lib/db'

export default async function Posts() {
  const posts = await db.post.findMany()
  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>
}
```

### 案例 2：边界划分

分三步：① server 取数；② 只把可序列化的 `postId`（数字）传给 client；③ client 用 `useState` 做点赞交互。

```tsx
// app/page.tsx — server
import LikeButton from './like-button'  // client component

export default async function Page() {
  const post = await db.post.find(1)
  return (
    <article>
      <h1>{post.title}</h1>
      <LikeButton postId={post.id} /> {/* 边界：可序列化 props */}
    </article>
  )
}
```

```tsx
// app/like-button.tsx
'use client'
import { useState } from 'react'

export default function LikeButton({ postId }) {
  const [liked, setLiked] = useState(false)
  return <button onClick={() => setLiked(!liked)}>{liked ? '♥' : '♡'}</button>
}
```

换成 `onClick={...}` 当 props 从 server 传入会报错——函数过不了序列化边界。

### 案例 3：常见误区——把 SSR 当 RSC

**SSR**（服务端渲染）：把**客户端组件**先在服务端画成 HTML 字符串发给浏览器，再 **hydrate**（把已有 HTML 和 JS 事件绑在一起）。这些组件的 JS **仍会进 bundle**。

**RSC**：组件**只存在于服务端**，浏览器拿到的是序列化后的 React 节点描述（Flight），**没有**「给这段 UI hydrate」这一步，因为本来就没事件处理器。

一句话：SSR 优化首屏 HTML；RSC 优化 bundle 大小 + 数据获取路径。常一起用，不是同一回事。

### 案例 4：client 壳包 server 内容

```tsx
// app/layout.tsx — server
import Sidebar from './sidebar'   // client

export default function Layout({ children }) {
  return <div><Sidebar>{children}</Sidebar></div>
}
```

若 `children` 是 server component，会**先在服务端渲染好**再作为序列化节点传给 client `Sidebar`。组合模式：交互壳在浏览器，内容仍可在厨房做。

## 踩过的坑

1. **把 `'use client'` 当性能优化**：越往**叶子**加 bundle 越小，越往**根**加越大。判断标准是「这块要不要交互 / 状态 / 浏览器 API」
2. **传非序列化 props**：`<Child onClick={fn} />` 从 server 传 client 直接报错。把 fn 放进 client 文件，或用 Server Actions（React 19）
3. **在 server component 里用 hooks**：`useState` / `useEffect` / `useContext` 全部失败
4. **以为 `'use client'` 就完全脱离 server**：错。该文件仍会先 SSR 再 hydrate；`'use client'` 只表示「代码也要送到浏览器」

## 适用 vs 不适用场景

**适用**：

- 以 **Next.js App Router（建议 13.4+）** 为主、已接好 RSC 运行时的元框架
- 中小项目想直连数据库、少写一层 REST/API
- 页面里交互热点少（例如 <30% 组件需要 `useState`），想明显缩 JS bundle

**不适用**：

- 纯 SPA（CRA / 仅客户端 Vite）— 没有服务端执行环境
- 强离线 PWA — server component 依赖在线请求
- Next.js Pages Router — RSC 只在 App Router

## 历史小故事（可跳过）

- **2020 年 12 月**：React 发 RFC 0188 + demo，组件直接读 markdown，浏览器几乎只剩 React 运行时
- **2022 年**：Next.js 13 引入 App Router（当时仍偏 beta）；**2023 年 13.4** 标稳定，RSC 才广泛用于生产
- **2024 年**：React 19 把 RSC（及配套的 Server Actions）标为稳定，从 RFC 变一等公民

## 学到什么

1. **`'use client'` 是边界声明，不是优化标记**——React 团队把「默认 server、显式标 client」写成设计决策
2. **三个边界要分开看**：执行 / 打包 / 序列化，讨论时别混成一件事
3. **RSC ≠ SSR**：前者是「组件只在服务端存在」，后者是「客户端组件预渲染成 HTML」
4. **组件第一次有了「在哪运行」**：以前默认都是浏览器里的纯 UI 函数

## 延伸阅读
- 原 RFC：[reactjs/rfcs#188](https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md)
- 演示视频：[Data Fetching with Server Components](https://www.youtube.com/watch?v=TQQPAU21ZUw)（Dan Abramov 30 分钟讲清动机）
- Next.js 文档：[Server and Client Components](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns)
- [[react-hooks]] —— useState / useEffect 只能在 client component 用
- [[hindley-milner]] —— 类型推导思路；TS 在 RSC 边界做 props 序列化校验

## 关联

- [[react-hooks]] —— 老 React 心智模型；client component 仍然遵循
- [[nextjs-app-router]] —— RSC 第一个稳定宿主
- [[suspense-boundaries]] —— RSC 异步渲染依赖 Suspense 表达 loading
- [[server-actions]] —— RSC 的姊妹机制，让 client 调 server 函数

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[islands-architecture]] —— Islands Architecture — 静态页面里只让需要交互的小块加载 JS
- [[papers/nvm]] —— nvm — 在同一台机器上轻松切换 Node 版本
- [[lexical]] —— Lexical — 把富文本编辑拆成快照、事务和插件
- [[next-intl]] —— next-intl — Next.js 专用的多语言开关
- [[nivo]] —— nivo — React + d3 组件化图表
