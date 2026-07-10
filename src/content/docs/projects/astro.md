---
title: Astro — 内容站点优先的 Web 框架
来源: https://github.com/withastro/astro
日期: 2026-05-29
分类: UI 框架 / 静态站点
难度: 中级
---

## 是什么

Astro 是一个**内容站点优先**的 Web 框架——专门用来写"博客 / 文档 / 营销页 / 教程站"这种**内容多、交互少**的站点。它默认输出 **0 KB JavaScript 的纯 HTML**，浏览器只下载真正需要的那一点点 JS。

日常类比：[[next-js]] 是带服务的全餐厅——服务员（JS）从你坐下开始就在桌边转；Astro 是只摆好菜的自助快餐——**不需要服务员**就能吃，只有要点鸡尾酒（交互组件）的时候才叫人来。

你写一个 `index.astro`：

```astro
---
const greeting = "hi"
---
<h1>{greeting}</h1>
```

构建出来就是一个 `<h1>hi</h1>` 的 HTML 文件，**前端 0 KB JS**。读者打开页面看到内容那一刻，没有任何脚本在后台 hydration。

我们这个 study 站本身就是 Astro + [[starlight]] 写的。

## 为什么重要

不理解 Astro，下面这些事都没法解释：

- 为什么 2022 年起一堆文档站（Bun docs / Cloudflare docs / Vercel 博客）都从 [[next-js]] 迁到了 Astro
- 为什么"Islands Architecture"（孤岛架构）从 2021 年成了前端通用术语——这词是 Astro 团队推广开的
- 为什么 Astro 项目里能**同时出现** `<ReactCounter />` 和 `<VueChart />` 而不打架
- 为什么写 Markdown 在 Astro 里像在 Notion 里一样自然——MDX 是一等公民

Astro 的核心价值有四点：

1. **默认 0 JS**：内容站点不该让用户下载 React runtime + 业务代码再"水合"——直接给 HTML
2. **Islands Architecture**：页面是一片静态海，需要交互的小块（搜索框 / 计数器）才是"岛"，按需激活
3. **多框架混用**：同一个项目里可以用 React 写复杂表单、用 Vue 写图表、用 Svelte 写动画——彼此独立打包
4. **Markdown / MDX 一等公民**：写文档不用配 `gatsby-transformer-remark` 那一堆插件，开箱即用

## 核心要点

Astro 之所以能"内容快 + 灵活"，靠 **三个设计**：

1. **Islands Architecture（孤岛架构）**

   - 默认所有组件**只在构建时渲染成 HTML**（SSG），不带 JS 到客户端
   - 想要交互？给组件加 `client:*` 指令——这块组件就成为一座"岛"，单独打包它的 JS
   - 指令选项：`client:load`（立即水合）/ `client:idle`（浏览器空闲时）/ `client:visible`（滚动到可见时）/ `client:media`（满足媒体查询时）
   - 类比：一片海上零星几座岛——海水（HTML）不要 JS，岛（交互组件）才用 JS

2. **多框架支持**

   - 通过 integration 装：`@astrojs/react` / `@astrojs/vue` / `@astrojs/svelte` / `@astrojs/solid-js` / `@astrojs/preact`
   - 同一站点可以一个组件用 [[react]]、另一个用 [[vue]]——各自管各自的 runtime
   - 代价：runtime 多一份就多一份体积；建议**一个项目里只主用一个框架**，混用是"特殊场景救场用的"

3. **Content Collections（内容集合）**

   - `src/content/<集合名>/*.md` 是一个"集合"，配上 [[zod]] schema 定义 frontmatter 字段
   - 类比：Notion 里的 database——每条记录字段统一、有类型校验
   - 写错字段（如 `pubDate` 写成字符串而非 Date）构建直接报错，不会到运行时才挂

## 实践案例

### 案例 1：`.astro` 文件长什么样

`src/pages/index.astro`：

```astro
---
const greeting = "hi"
const items = ["苹果", "香蕉", "橙子"]
---
<h1>{greeting}</h1>
<ul>
  {items.map((it) => <li>{it}</li>)}
</ul>
```

**逐部分解释**：

- `---` 之间是 **frontmatter**（不是 markdown 那种 yaml，而是**真正的 JavaScript**）——构建时执行
- `---` 之后是模板，语法**像 JSX 但更接近 HTML**：直接 `<h1>` 而不是 `<h1></h1>` 也行
- `{greeting}` / `{items.map(...)}` 是表达式插值——和 JSX 一样
- 构建产物是一个**纯 HTML 文件**，没有任何 JS。浏览器看到的是 `<h1>hi</h1><ul><li>苹果</li>...`

### 案例 2：什么时候用 client:visible 而不是 client:load

```astro
---
import Counter from "../components/Counter.jsx"
import Footer from "../components/Footer.jsx"
---
<Counter client:load />
<Footer client:visible />
```

**为什么这么分**：

- `Counter` 在首屏顶部、用户进来就能看见——`client:load` 立即水合（不等不行）
- `Footer` 在页面底部、用户可能根本不滚下去——`client:visible` 等滚到再水合，**省掉这部分 JS 的下载 + 解析**
- 在长文档站点里，正确用 `client:visible` 能让首屏 JS 体积**减少 50%+**，Lighthouse 分数立刻好看

类比：餐厅里靠门的桌子立刻摆餐具（`client:load`），里间的桌子等有客人进去再摆（`client:visible`）——省人力。

### 案例 3：Content Collections 的 schema 校验

`src/content/config.ts`：

```typescript
import { defineCollection, z } from "astro:content"

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    draft: z.boolean().default(false),
  }),
})

export const collections = { blog }
```

**逐部分解释**：

- `defineCollection` 注册一个内容集合，`schema` 定义 frontmatter 必须长什么样
- [[zod]] 是 schema 验证库——`z.string()` / `z.date()` 表示这个字段必须是字符串 / 日期
- 写一篇 `src/content/blog/hello.md` 时如果 frontmatter 缺 `title` 或 `pubDate` 不是日期，**构建直接报错**——不会到生产环境才发现
- 配合 TypeScript，模板里 `post.data.title` 是有类型的——拼错字段名 IDE 会高亮

## 踩过的坑

1. **复杂状态用 Astro 自身组件吃力**：`.astro` 组件**不能在客户端管状态**——它就是 SSG 模板。需要 `useState` / 双向绑定的地方必须用 React / Vue / Svelte 客户端组件。新手常想"我能不能在 .astro 里写 onClick"——不能。

2. **Markdown 里写 JSX 必须用 .mdx 不能 .md**：默认 `.md` 文件是纯 Markdown，**写 `<MyComponent />` 不会渲染成组件**——它会被当成 HTML 字符串原样输出。要嵌组件必须文件名改成 `.mdx`，并装 `@astrojs/mdx` integration。

3. **Astro 5 升级 Content Layer 与老 collections 不兼容**：Astro 5（2024 末发布）把 Content Collections 重写成 Content Layer——支持从远程 API / CMS 拉数据。**老项目升级要改 `defineCollection` 的写法**，没看 migration guide 直接升大概率构建报错。

4. **View Transitions 只在浏览器层面，不是真 SPA**：Astro 提供 `<ClientRouter />` 用 [浏览器原生 View Transitions API] 做页面切换的过渡动画——但**它不是 React Router 那种 SPA**：每次切换仍然是新页面，只是浏览器在切换瞬间渲染一次过渡。不支持 View Transitions API 的浏览器（老版 Safari）会直接整页刷。

## 适用 vs 不适用场景

**适用**：

- 文档站 / 博客 / 营销页 / 教程站——内容多 + 交互少 + 要 Lighthouse 满分
- 需要**多框架混用**的迁移场景——老项目慢慢从 Vue 迁到 React，用 Astro 当壳
- 写 Markdown / MDX 为主的内容平台——Content Collections 比 [[next-js]] 的 `getStaticProps` 顺手太多
- 个人博客 / 实习日志——这个 study 站就是

**不适用**：

- 高度交互的 web app（dashboard / SaaS / 编辑器）——核心价值是状态管理和路由，[[next-js]] / [[react]] SPA 更顺
- SSR 为主、需要每个请求动态渲染——Astro 能 SSR 但不是它的强项
- 强依赖某个框架的生态（如要用 Next.js 的 ISR + 边缘函数 + middleware）——直接上 [[next-js]]
- 团队完全没有前端经验——Astro 的学习曲线在"什么时候加 client:* 指令"这类决策上有门槛

## 历史小故事（可跳过）

- **2021 年 6 月**：Fred K. Schott（Snowpack 作者）在博客发文宣布 Astro 0.1，提出 "Islands Architecture" 一词
- **2022 年 8 月**：Astro 1.0 发布，定位明确为"内容优先 + 多框架混用"
- **2023 年**：Starlight（Astro 出品的文档主题）发布——Bun / Cloudflare / Vercel 部分文档迁过来
- **2024 年末**：Astro 5 发布，Content Layer 重写，支持 server islands（服务端按需渲染的岛）
- **2026 年**：成为 Markdown / MDX 静态站点事实标准之一，与 [[next-js]] / [[vitepress]] 并列

## 学到什么

1. **默认值的力量**：[[next-js]] 默认带 React runtime；Astro 默认 0 JS。**默认值就是文化**——决定团队 90% 的代码长什么样
2. **架构选择 = 假设选择**：Islands 架构假设"页面大部分是静态内容"——这假设对内容站成立、对 SaaS dashboard 不成立
3. **指令式优化（client:visible）比配置式优化（webpack chunkSplit）更直观**：让作者在写组件那一刻决定"这块要不要 lazy"——不用打包工具替你猜
4. **多框架共存是兼容代价**：能混用是好事；同一项目用三个框架是噩梦——能力 ≠ 应该

## 延伸阅读

- 官方 docs：[docs.astro.build](https://docs.astro.build)——产品功能 + Islands Architecture 的官方解释
- 源码：[github.com/withastro/astro](https://github.com/withastro/astro)——TypeScript 实现的 compiler + runtime
- [[starlight]] —— Astro 出品的文档主题，本 study 站在用
- [[next-js]] —— Astro 的常被对比对象；选哪个看"内容站还是 web app"

## 关联

- [[starlight]] —— Astro 出品的文档主题；本站点用的就是它
- [[next-js]] —— Astro 的近邻 + 常被对比；前者 web app 优先，后者内容优先
- [[react]] —— Astro 里最常用的客户端组件框架，通过 `@astrojs/react` 集成
- [[vue]] —— 通过 `@astrojs/vue` 集成；可以与 React 在同一站点共存
- [[svelte]] —— 通过 `@astrojs/svelte` 集成；编译成原生 DOM 操作，岛体积更小
- [[solid]] —— 通过 `@astrojs/solid-js` 集成；细粒度响应式，适合性能敏感岛
- [[preact]] —— React 兼容但更小的轻量替代；Astro 推荐用它降低 runtime 体积
- [[vite]] —— Astro 5 起底层构建工具切到 Vite；dev server / HMR 全靠它
- [[markdown-it]] —— Astro 默认 markdown 解析器底层就是它
- [[zod]] —— Content Collections schema 验证用的就是 zod

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
