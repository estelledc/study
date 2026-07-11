---
title: Islands Architecture — 静态页面里只让需要交互的小块加载 JS
来源: Jason Miller, "Islands Architecture", jasonformat.com, 2020
日期: 2026-05-31
分类: 前端框架
难度: 入门
---

## 是什么

Islands Architecture（**岛屿架构**）是一种网页渲染思路：**整页 HTML 在服务端先渲染好直接发出去，浏览器拿到的是纯 HTML；只有页面里真正需要交互的小块（"岛屿"）才单独加载 JavaScript 把自己"激活"**。其余部分**永远是静态的**，不带 JS。

日常类比：像一片**海面**。海面本身（HTML 文字、图片、排版）静止不动，**不需要电池**。海面上散落几座**小岛**——一个搜索框、一个主题切换按钮、一个评论区——这些岛各自有发动机（JS bundle），自己启动、互不相关。**99% 的海面**没岛屿，所以**完全不耗电**。

你的 study 站现在用的 Astro，就是这个思路最直接的实现。

## 为什么重要

不理解 Islands，下面这些事都没法解释：

- 为什么 Astro 文档站打开速度比 Next.js 文档站快——大部分页面 ship 0 KB JS
- 为什么写 `<Counter client:visible />` 比 `<Counter client:load />` 省流量——岛的水合时机不同
- 为什么 Islands 和 React Server Components（[[react-server-components]]）听起来像但其实是**两种不同抽象层级**
- 为什么单页应用（SPA）哪怕 90% 内容是静态的，**整个组件树都要水合一遍**

## 核心要点

Islands 的核心可以拆成 **三个属性**：

1. **静态 HTML 是默认**：整页在服务端渲染成纯 HTML 直接发给浏览器。**没有岛屿的页面，0 字节 JS**。

2. **每座岛单独水合**：每个交互组件是一个独立的 JS bundle，有自己的水合时机——`load`（立刻）、`idle`（浏览器空闲时）、`visible`（滚动到可见时）、`media`（媒体查询匹配时）。

3. **岛与岛互相独立**：A 岛的 JS 加载失败**不影响** B 岛。一个岛跑 React，另一个岛跑 Vue 也行——框架在岛级别选。

类比：每座岛是一艘**自带发动机的小船**，互不通讯。要让两艘船共享油料（共享状态），必须搭一座**显式的桥**（pub/sub、URL 参数、localStorage）。

## 实践案例

### 案例 1：Astro 的 client 指令

```astro
---
import Counter from '../components/Counter.jsx'
import Search from '../components/Search.jsx'
---
<h1>欢迎</h1>
<p>这一段是纯 HTML，0 KB JS</p>

<Counter client:visible />
<Search client:idle />
```

页面发出去时：

- `<h1>` 和 `<p>` 是纯 HTML
- `Counter` 的 JS 在用户**滚动到它**时才下载并水合
- `Search` 的 JS 在浏览器**空闲时**预加载

如果你**完全没用任何 client 指令**，整个页面 JS 大小是 **0**。

### 案例 2：Islands vs SPA

同样一个博客页——99% 是文章内容，1% 是评论区。

| 方式 | 整页水合？ | JS 体积 |
|------|-----------|--------|
| SPA（Next.js Pages） | 是（整棵组件树） | ~150 KB |
| Islands（Astro） | 仅评论区 | ~15 KB |

**90 倍差距**。原因：SPA 不知道哪些是静态的——它把每个组件都假设可能要重新渲染，全部水合。Islands 反过来——**默认静态，opt-in 才动**。

### 案例 3：Islands vs RSC

两个都说"减少客户端 JS"，但抽象层级**完全不同**：

- **RSC**：在 **React 内部**把组件分成"服务器组件"和"客户端组件"。需要 React + 复杂的序列化协议。
- **Islands**：在 **页面级**把"静态 HTML"和"交互岛"分开。**框架无关**——可以混用 React/Vue/Svelte。

类比：RSC 像在一艘大船**内部**分舱（厨房 vs 客舱），Islands 是**整个海面**上撒岛。前者更适合应用，后者更适合内容站。

### 案例 4：水合时机怎么选

```astro
<Header client:load />        <!-- 立刻水合：一进页面就要响应 -->
<Newsletter client:idle />    <!-- 浏览器空闲时：不急用 -->
<Comments client:visible />   <!-- 滚到才水合：长文档才看得见 -->
<MobileMenu client:media="(max-width: 640px)" />  <!-- 仅小屏 -->
```

**经验法则**：能用 `visible` 别用 `idle`，能用 `idle` 别用 `load`。每往后挪一档，**首屏 JS 体积少一半**。

## 踩过的坑

1. **把 Islands 当 SPA 用**：每个组件都写 `client:load` → 失去意义。Islands 的优势在 **0 JS 默认**。如果你 90% 组件都标 `client:load`，应该用 Next.js。

2. **误以为 Islands = SSR**：SSR 是"服务端渲染"，Islands 是"客户端**怎么水合**"。Astro 既能 SSG（静态生成）也能 SSR，两者都用 Islands 思路。

3. **跨岛共享状态**：A 岛改了主题，B 岛要不要跟着变？**直接 import 全局变量行不通**——每个岛是独立 bundle。必须用 pub/sub（如 nanostores）、URL 参数、或 localStorage。

4. **岛太多 = bundle 太多**：每个岛是一个 chunk，HTTP/2 多路复用能扛 50 个并发请求。但**100 个小岛**会让浏览器主线程被解析 chunk 占满，反而慢。经验：**单页 < 10 个岛**。

## 适用 vs 不适用场景

**适用**：

- 内容驱动型站点（博客、文档、营销页、电商列表页）——Astro 主力场景
- SEO 极端重要的页面——纯 HTML 对爬虫最友好
- 性能预算紧的国家/设备（印度、东南亚低端 Android）

**不适用**：

- 高度交互的 web 应用（Figma、Notion、Linear）——大部分是 client，Islands 收益小
- 客户端路由频繁切换的应用——岛之间跳页接近整页刷新
- 复杂跨组件状态管理（购物车 + 推荐 + 用户数据全联动）——SPA 的 store 模型更顺手

## 历史小故事（可跳过）

- **2019 年**：Etsy 前端架构师 **Katie Sylor-Miller** 在内部技术分享里提"islands of interactivity"概念，指 Etsy 商品页的优化思路——大部分静态、几个交互模块独立水合。
- **2020 年 8 月**：Preact 作者 **Jason Miller** 写下 [jasonformat.com/islands-architecture/](https://jasonformat.com/islands-architecture/)，把这个名字推上前端社区。文章很短——**1500 字**。
- **2021 年**：**Astro** 1.0 alpha 发布，成为第一个把 Islands 当核心抽象的通用框架。
- **2022—2023**：概念扩散——Next.js 推出 **Partial Prerendering**（部分预渲染），Qwik 提出 **Resumability**（可恢复执行），都受 Islands 启发。

## 学到什么

1. **静态是默认，动态 opt-in**——这是 Islands 与 SPA 最根本的哲学差异。SPA 默认假设一切要动，Islands 默认假设一切静止。
2. **岛级别的框架自由**：一个站点里可以**同时**有 React 岛和 Svelte 岛，因为岛之间是 bundle 隔离的。
3. **抽象层级很重要**：RSC 在组件内部分服务/客户端，Islands 在页面级别分静态/动态。两者**不冲突**——可以在 RSC 里用 Islands 思路，在 Astro 里嵌 RSC。
4. **0 JS 是新基准**：在 Islands 出现前，"前端框架最小 bundle 多大" 是 React 50KB / Preact 4KB 之争。Islands 把答案变成 **0 KB**。

## 延伸阅读

- 原文：[Jason Miller — Islands Architecture (2020)](https://jasonformat.com/islands-architecture/)（1500 字，半小时读完）
- Astro 文档：[Astro Islands](https://docs.astro.build/en/concepts/islands/)（含 client 指令完整列表）
- 对比文：[Islands vs RSC — by Astro team](https://astro.build/blog/future-of-astro-zero-js/)
- [[react-server-components]] —— 同样想"减少客户端 JS"的另一条路径
- [[starlight]] —— Astro 文档站点主题，study 站正在用
- [[push-pull-frp]] —— 另一个"按需求值"的抽象，但作用在数据流而非渲染

## 关联

- [[react-server-components]] —— 组件级 server/client 划分；Islands 是页面级
- [[starlight]] —— 基于 Astro 的文档主题，study 站直接受益于 Islands
- [[playwright]] —— Islands 站点的 e2e 测试需要等 client:visible 触发
- [[tanstack-router]] —— 把 SPA 路由做到极致；Islands 站点正好相反
- [[temporal-polyfill]] —— 浏览器原生缺失功能用 polyfill 补齐；Islands 让 polyfill 只在用到的岛加载

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
