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

2. **打包边界**：server component 的代码**不进 JS bundle**。一个 server component 用了 100KB 的 markdown 解析库，浏览器收到的只是渲染好的 HTML 片段，0 字节 JS

3. **序列化边界**：server → client 传 props 时必须是 JSON 可序列化的值。函数、class 实例、Date 的方法都过不去；children 是特殊豁免（React 知道怎么序列化它们）

`'use client'` 这一行**不是性能标记**，是**边界声明**——告诉打包器："从这个文件开始，下面的子树要打到浏览器"。

## 实践案例

### 案例 1：server component 直连数据库

```tsx
// app/posts/page.tsx — 没有 'use client'，默认 server
import { db } from '@/lib/db'

export default async function Posts() {
  const posts = await db.post.findMany()
  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>
}
```

注意 **`async function` 组件 + 直接 `await`**——客户端组件做不到。这段代码里 `db` 这个对象**永远不会出现在浏览器**。

### 案例 2：边界划分

```tsx
// app/page.tsx — server
import LikeButton from './like-button'  // client component

export default async function Page() {
  const post = await db.post.find(1)
  return (
    <article>
      <h1>{post.title}</h1>          {/* server 渲染 */}
      <LikeButton postId={post.id} /> {/* 边界！ */}
    </article>
  )
}
```

```tsx
// app/like-button.tsx
'use client'                          // ← 这一行是边界
import { useState } from 'react'

export default function LikeButton({ postId }) {
  const [liked, setLiked] = useState(false)
  return <button onClick={() => setLiked(!liked)}>{liked ? '♥' : '♡'}</button>
}
```

`postId` 是数字，能跨边界。换成 `onClick={...}` 当 props 传则报错。

### 案例 3：常见误区——把 SSR 当 RSC

SSR 是把**已经存在的客户端组件**预渲染成 HTML 字符串发给浏览器，浏览器再 hydrate（绑事件）。这些组件的 JS 代码**还是会被打包**。

RSC 是组件**只存在于服务端**，浏览器拿到的是序列化后的 React 节点描述（不是 HTML 字符串），**没有 hydrate 步骤**因为本来就没事件。

差别用一句话说：SSR 优化"首屏速度"，RSC 优化"bundle 大小 + 数据获取路径"。两件事经常一起用，但不是同一回事。

### 案例 4：把 client 组件当 children 传

```tsx
// app/layout.tsx — server
import Sidebar from './sidebar'   // client

export default function Layout({ children }) {
  return <div><Sidebar>{children}</Sidebar></div>
}
```

`children` 这里如果是 server component，它会**先在服务端渲染好**再作为序列化节点传给 client `Sidebar`。这是 RSC 最强的组合模式：让 client 壳包 server 内容。

## 踩过的坑

1. **把 `'use client'` 当性能优化**：很多人见到 bundle 大就到处加，其实越往**叶子**加 bundle 越小，越往**根**加越大。正确的判断是"这块需不需要交互/状态/浏览器 API"

2. **传非序列化 props**：`<Child onClick={fn} />` 从 server 传 client 直接报错。解决方式要么把 fn 内联到 client 组件里、要么用 server action（React 19 的扩展机制）

3. **在 server component 里用 hooks**：`useState` / `useEffect` / `useContext` 全部失败。新手常见错误是从 client 复制过来忘了改

4. **以为加了 `'use client'` 就完全脱离 server**：错。这种文件**还是会**先在服务端预渲染一遍（SSR 那种），然后再 hydrate。`'use client'` 只是说"这部分代码也要送到浏览器"

## 适用 vs 不适用场景

**适用**：

- Next.js App Router 应用（13+）/ Remix / 后续支持 RSC 的元框架
- 需要直连数据库但不想自己写 API 层的中小项目
- 想缩 bundle 但保留 React 心智模型的团队

**不适用**：

- 纯 SPA（Create React App / 旧 Vite）— 没有服务端执行环境
- 强离线 PWA — server component 必须在线
- Next.js Pages Router — RSC 只在 App Router 工作

## 学到什么

1. **`'use client'` 是边界声明，不是优化标记**——这是 ADR-5 的核心
2. **三个边界要分开看**：执行 / 打包 / 序列化。三件事经常被混在一起讨论
3. **RSC ≠ SSR**：前者是"组件只在服务端存在"，后者是"客户端组件预渲染"。同一个项目可以两者都用
4. **从 React 视角看**：组件第一次有了"在哪运行"的属性。之前的组件都是位置无关的纯 UI 函数

## 历史小故事（可跳过）

- **2020 年 12 月**：React 团队发 RFC + demo 视频，演示一个组件直接读 markdown 文件并渲染，bundle 只有 React 本身
- **2022 年**：Next.js 13 推 App Router，第一次稳定落地 RSC
- **2024 年**：React 19 把 RSC + Server Actions 正式 GA，从 RFC 变成 React 的一等公民

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

- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[islands-architecture]] —— Islands Architecture — 静态页面里只让需要交互的小块加载 JS
- [[next-intl]] —— next-intl — Next.js 专用的多语言开关
- [[nivo]] —— nivo — React + d3 组件化图表

