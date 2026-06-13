---
title: Next.js 零基础入门笔记
来源: https://github.com/vercel/next.js
日期: 2026-06-13
分类: 后端 API
子分类: frontend-frameworks
provenance: pipeline-v3
---

# Next.js 零基础入门笔记

## 一、什么是 Next.js？—— 用开餐厅来理解

想象你要开一家餐厅（做一个网站）：

- **React** 就像是一套厨房设备和烹饪技法。它很强大，但你需要自己选址、装修、办执照、设计菜单。
- **Next.js** 就像是一个"全包式餐饮方案"：它帮你选好了地址（服务器）、装修好了厨房（构建工具）、设计好了菜单结构（路由系统），你只需要专注做菜（写页面逻辑）。

Next.js 是一个基于 React 的**全栈 Web 框架**，由 Vercel 公司开发。它最大的价值是：**让原本很复杂的"服务端渲染"和"路由管理"变得极其简单**。

> **核心类比**：如果你把 React 比作"引擎"，那 Next.js 就是"整辆车"——引擎还在，但你不需要自己造轮胎和方向盘。

---

## 二、核心概念

### 2.1 文件即路由（File-Based Routing）

这是 Next.js 最直观的设计：**你在哪里放文件，就决定了用户访问哪个 URL。**

假设你创建了这样的文件结构：

```
app/
  page.tsx          → 用户访问 / 时显示
  about/
    page.tsx        → 用户访问 /about 时显示
  blog/
    page.tsx        → 用户访问 /blog 时显示
    [slug]/
      page.tsx      → 用户访问 /blog/my-first-post 时显示（动态路由）
```

你不需要手动配置任何路由规则。文件结构 = URL 结构。

### 2.2 服务端组件（Server Components）

Next.js 默认在**服务器**上渲染页面。这意味着：

- 页面 HTML 在服务器上生成好，再发给浏览器
- 用户拿到的是完整的 HTML，加载更快、对 SEO（搜索引擎）更友好
- 你不需要写额外的配置，默认就是服务端渲染

**类比**：传统的 React 应用像"寄一份空白模板给用户，让用户自己的浏览器去填充内容"；Next.js 像"厨师做好菜直接端上桌"。

### 2.3 数据获取（Data Fetching）

在 Next.js 中，你可以在组件里直接 `fetch` 数据，无需额外的 API 调用层：

```tsx
async function getBlogPosts() {
  const res = await fetch('https://api.example.com/posts')
  return res.json()
}

export default async function BlogPage() {
  const posts = await getBlogPosts()
  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
        </article>
      ))}
    </div>
  )
}
```

- 数据在服务端获取
- 组件用 `async/await` 语法，和写普通的异步函数一样
- 无需额外的 `useEffect` 或第三方数据管理库

---

## 三、代码示例

### 示例 1：创建一个完整的首页

下面是一个 Next.js 项目的典型首页，展示了组件、布局和样式：

```tsx
// app/page.tsx

// 从外部导入组件
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

// 模拟从数据库获取数据（实际项目中替换为真实 API）
async function getSiteData() {
  // Next.js 会在服务端执行这段代码
  return {
    greeting: '欢迎来到我的网站',
    description: '这是一个用 Next.js 构建的全栈应用',
    stats: [
      { label: '文章数', value: '42' },
      { label: '项目数', value: '8' },
      { label: '活跃用户', value: '1,200' },
    ],
  }
}

// 导出默认组件作为页面的入口
export default async function HomePage() {
  const data = await getSiteData()

  return (
    <div className="page">
      <Header />

      <main className="content">
        <h1>{data.greeting}</h1>
        <p>{data.description}</p>

        <section className="stats">
          {data.stats.map((stat, index) => (
            <div key={index} className="stat-card">
              <span className="value">{stat.value}</span>
              <span className="label">{stat.label}</span>
            </div>
          ))}
        </section>

        <nav className="links">
          <Link href="/about">关于我们</Link>
          <Link href="/blog">浏览文章</Link>
        </nav>
      </main>

      <Footer />
    </div>
  )
}

// 告诉搜索引擎这个页面的元信息
export const metadata = {
  title: '我的 Next.js 网站',
  description: '一个从零开始学习的 Next.js 项目',
}
```

**关键点**：

- `page.tsx` 是 Next.js 的约定文件名，每个目录下的 `page.tsx` 对应一个 URL 路由
- `export default async function` 表示这个页面在服务端异步渲染
- `metadata` 导出的元数据会自动生成 HTML 的 `<title>` 和 `<meta>` 标签
- `Link` 组件用于页面间跳转，比原生 `<a>` 标签更快，因为它会预加载下一页

### 示例 2：动态路由 + 数据获取

假设你要做一个博客系统，每篇文章有独立的 URL（如 `/blog/hello-world`）：

```tsx
// app/blog/[slug]/page.tsx

// 这个 slug 来自 URL 路径，比如 /blog/my-post → slug = 'my-post'
import { notFound } from 'next/navigation'

// 模拟：根据 slug 从数据库获取文章
async function getPost(slug: string) {
  // 实际项目中替换为 fetch 或数据库查询
  const posts = [
    { slug: 'hello-world', title: 'Hello World', content: '这是我的第一篇文章...' },
    { slug: 'nextjs-guide', title: 'Next.js 指南', content: '本文介绍 Next.js...' },
  ]
  return posts.find(post => post.slug === slug)
}

// 动态路由的参数
export async function generateStaticParams() {
  return [
    { slug: 'hello-world' },
    { slug: 'nextjs-guide' },
  ]
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  // 等待异步参数解析
  const { slug } = await params

  // 获取文章数据
  const post = await getPost(slug)

  // 文章不存在时显示 404
  if (!post) {
    notFound()
  }

  return (
    <article className="post">
      <h1>{post.title}</h1>
      <time>{'2026-06-13'}</time>
      <div className="content">
        <p>{post.content}</p>
      </div>
    </article>
  )
}
```

**关键点**：

- `[slug]` 文件夹名表示这是一个**动态路由参数**
- `params` 是 Next.js 自动传入的，包含了 URL 中的动态部分
- `generateStaticParams()` 告诉 Next.js 在构建时预生成哪些页面（适合静态内容）
- `notFound()` 是 Next.js 内置函数，触发后自动跳转到 404 页面
- 这种模式让你无需写任何路由配置就能支持无限多的文章页面

---

## 四、Next.js 的主要优势

1. **开箱即用**：安装后直接运行 `next dev` 即可开发，无需配置 Webpack、Babel 等工具
2. **自动代码分割**：每个页面只加载自己需要的代码，页面越多越快
3. **图片优化**：内置 `<Image>` 组件，自动压缩、懒加载、自适应格式
4. **API 路由**：在 `app/api/` 目录下创建文件即可编写后端 API，无需单独的服务器
5. **生产就绪**：`next build` 生成优化后的生产版本，支持静态导出和服务器渲染

---

## 五、学习路线建议

1. **第一步**：跑通第一个项目 → `npx create-next-app@latest my-app`
2. **第二步**：理解 `app/` 目录结构，修改 `page.tsx` 看变化
3. **第三步**：学习 Link 组件，创建多个页面并互相跳转
4. **第四步**：动手写数据获取（fetch API）
5. **第五步**：尝试动态路由和 API 路由
6. **第六步**：了解样式方案（CSS Modules、Tailwind CSS）

---

## 六、常用命令速查

| 命令 | 作用 |
|------|------|
| `npx create-next-app@latest 项目名` | 创建新项目 |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm start` | 启动生产服务器 |

---

## 参考资料

- 官方文档：https://nextjs.org/docs
- GitHub 仓库：https://github.com/vercel/next.js
- 官方学习路径：https://nextjs.org/learn
