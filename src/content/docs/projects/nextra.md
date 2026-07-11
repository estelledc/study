---
title: Nextra — 在 Next.js 上盖一层文档站脚手架
来源: 'https://github.com/shuding/nextra'
日期: 2026-05-30
分类: projects
难度: 中级
---

## 是什么

Nextra 是一个**搭在 Next.js 上的静态站脚手架**，专给"写文档"和"写博客"用。日常类比：像装修队的"精装修包"——你只管搬家具（写 markdown），墙体水电（路由、打包、部署）人家已经按 Next.js 标准走完了。

你写一行 `nextra(config)(nextConfig)` 加进 `next.config.mjs`，再在 `content/` 目录里塞 `.mdx` 文件，启动 `next dev`。剩下的——左侧 sidebar、顶栏 navbar、代码高亮、搜索框、暗色模式、目录 toc、上一篇下一篇——全部自动出来，**一行 React 都不用写**。

它不是要替代 Next.js，而是承认"文档站本质就是 Next.js 应用"，把那些"每个文档站都要重写一遍"的胶水代码统一收进一个 npm 包。换句话说：路由、image、bundle、deploy、cache 这五件事 Next.js 已经做得够好了，Nextra 只补"docs 站特有"的那 20% 增量——sidebar 树、TOC、搜索索引、prev/next 链接、frontmatter 解析。

## 为什么重要

不理解 Nextra，下面几件事都说不清：

- 为什么 SWR、Vercel、Turbopack 这些 React 生态门面项目的官网都长得很像
- 为什么 docs 站在 React 阵营里没有一个"绝对正统"答案，但 Nextra 是最接近的
- 为什么"写文档"这件事最后要用到 webpack loader、unified processor、Tailwind 4 这些重量级工具
- 为什么从 v3 升到 v4 几乎要重写——RSC 和 App Router 改了根基，老的 Pages Router 心智整套丢弃
- 为什么搜索、TOC、暗色模式这种"docs 站标配"在 Nextra 里完全免费，但在裸 Next.js 里要自己接三个库

## 核心要点

Nextra 干的事可以拆成 **三层**（先记：收件 → 加工 → 装修）：

1. **入口层（收件）**：在 Next.js 打包规则里塞一个自家 loader，专门接管 `.md` / `.mdx`。类比：快递分拣中心加一条「只走文档」的传送带。它还会扫一遍磁盘，画出整站目录树（官方叫 page-map），交给后面画左侧 sidebar。这一步代码不长，却是框架和 Next.js 的接缝。

2. **编译层（加工）**：每个 mdx 文件要过一串小插件：先处理 Markdown 语义（remark），再处理 HTML 形态（rehype），最后接到 JS（recma）——大约二十来个步骤，依次做 frontmatter、代码高亮、目录、链接、图片。类比：流水线前一台加把手、后一台贴标签，顺序错了会乱。这层复用 [unified.js](https://unifiedjs.com) 生态，不必从零写解析器。

3. **主题层（装修）**：`nextra-theme-docs` 提供默认 sidebar / navbar / footer，用 Tailwind 4 写，能整包替换。类比：装修风格包，嫌不够就 fork 改。也可以塞进你自己的 React 组件，所以「看起来统一」和「局部自定义」都能做。

三层叠起来，用户写的 markdown 就变成 Next.js 应用。好处是每层只对接前后一层：换主题不用碰编译，加一个 Markdown 插件不用动主题。

举个对比：搜索（DocSearch / Algolia / Pagefind）在裸 Next.js 里要自己接索引、UI、快捷键；在 Nextra 里常常只是 theme 的一个开关——因为目录树已经在入口层编好，主题直接拿来用。

## 实践案例

### 案例 1：5 分钟搭一个新文档站

最小工程结构：

```js
// next.config.mjs
import nextra from 'nextra'
const withNextra = nextra({ /* 默认配置 */ })
export default withNextra({ /* 你的 next 配置 */ })
```

然后建 `content/index.mdx` 写首页，建 `content/guide/intro.mdx` 写第一篇——`pnpm dev` 启动，浏览器打开就能看到带 sidebar 的完整站点。Nextra 自己扫盘、推 sidebar、配路由，你不用写任何 React 组件。如果想调 sidebar 顺序，每层目录建一个 `_meta.js` 列字典：

```js
export default {
  intro: '快速上手',
  guide: { title: '指南' },
  api: { title: 'API 参考', display: 'children' }
}
```

key 顺序就是 sidebar 顺序，value 可以是字符串（直接当 title）或对象（带 display 等高级开关）。改一行 `_meta.js` 即时反映到导航——这是 Nextra 比手撸 sidebar 的核心生产力差。

### 案例 2：写技术博客（用 nextra-theme-blog）

每篇文章顶部加 frontmatter：

```mdx
---
title: 我学 HM 类型推导这一周
date: 2026/05/29
description: 从占位符到统一算法
---
```

Nextra 读出 `date`，自动按时间倒序排在首页，每篇文末自动有 prev/next 链接。你只写正文，列表页和导航全自动。要做按 tag 过滤就在 frontmatter 加 `tags: [hm, ml]`，theme-blog 自动给每个 tag 生成聚合页。RSS feed 也开箱即用，不用自己接 feed 库。

### 案例 3：开源库 API 文档

一句话：从 TypeScript 类型声明（`.d.ts`）**自动生成**一张「函数/参数表格」的 mdx，再手写几段说明盖上去。

`tsdoc` 子包扫导出符号 → 写出表格 mdx → CI 每次 release 跑一遍并提交回 docs 目录，文档就不会和代码版本错位。生成的 mdx 和手写的 mdx 可以混排；要加 live demo 就当普通 React 写进 mdx，不用另学一套 DSL。

## 踩过的坑

1. **必须 ESM 项目**：nextra 4.x loader 顶层用了 top-level await，老的 CommonJS Next.js 项目升不上来，要先把 `package.json` 改 `"type": "module"`，所有 import 也要改 `.mjs` 或者补扩展名。改完往往还要清 `.next` 缓存，否则会卡在"找不到 module"。
2. **shallow clone 时 Last updated 全空**：Vercel 默认浅克隆，nextra 算不出 git 最后修改时间，要手动设环境变量 `VERCEL_DEEP_CLONE=true` 才正常。GitHub Action 里同样要把 `actions/checkout` 的 `fetch-depth` 设成 0，否则线上时间戳全是空白。
3. **_meta 文件写错 key 不报错**：sidebar 顺序由每层 `_meta.{js,ts}` 控制，key 写错只会让那个页面静默掉到末尾，不会抛错，调试时容易看半天。建议本地存一份 sidebar 截图，改完 `_meta` 对比一下顺序有没有意外漂移。
4. **Tailwind 4 prose 冲突**：theme 用 `x:` prefix utility 避免污染，但你全局加 typography 插件的 `prose` 类时容易把样式 reset 掉，要在外层包一层 div 隔离，或者干脆禁用 typography 让 nextra 自己的 `x:` 排版生效。

## 适用 vs 不适用场景

**适用**：

- React/Next.js 团队搭文档站、技术博客、产品介绍页
- 想要 MDX（markdown 里嵌 React 组件）但不想自己接 mdx-js 编译链
- 部署到 Vercel / Netlify / Cloudflare Pages 这种 Next.js 友好平台
- 已经在用 Tailwind 4 / shiki / Pagefind 这些工具，Nextra 默认就装好了

**不适用**：

- 团队主栈是 Vue → 选 [[vitepress]] 更顺，Nextra 强绑 React
- 团队主栈是 Astro → 选 [[starlight]]，多框架友好且首屏 JS 更少
- 需要复杂自定义 React 组件互动（带 store、表单、登录）→ 直接写 Next.js，不要套 docs 框架
- 离线环境跑不动 npm install → 选静态 markdown 工具（mkdocs、hugo），无 node 依赖
- 不想被 Next.js 版本绑定 → Nextra 4 跟 Next.js 15 强耦合，Next.js 大版本升级时 Nextra 也要跟

## 历史小故事（可跳过）

- **2020 年**：shuding（Next.js 团队成员）起手第一版 nextra，Vercel docs 早期采用
- **2021-2023 年**：v2 阶段，社区慢慢长，但 v2 还是 Pages Router + 老 React，跟不上 Next.js 自身节奏
- **2024 年初**：项目维护权转给 The Guild，dimaMachina 接棒做主驱动
- **2024-12**：dimaMachina 主导 v4 大重构，切到 Tailwind 4 + RSC + App Router，几乎重写
- **2025-12**：v4.6 系列发布，主要改 Copy as Markdown、tsdoc、search 集成
- **2026-05**：4.6.x 持续打补丁，git worktree 路径 bug、zod 4 兼容是近期热点

## 学到什么

1. **文档框架的赢点是"少做"**：Nextra 主包只有约 3.5k 行 TS——把路由、image、deploy、cache 全外包给 Next.js，自己只补"docs 站特有"的 20% 增量
2. **MDX 插件链的顺序就是语义**：remark → rehype → recma 三段 21 个插件按特定顺序灌进同一个 unified processor，错一个位置就坏；比如 `remarkMermaid` 必须在 `remarkRemoveImports` 之前跑
3. **理论 → 适配 → 落地**：webpack loader（适配层）+ unified（理论层）+ theme（落地层）三层分工是 docs 框架的通用骨架，[[vitepress]] 用 Vite 替 webpack、用 Vue 替 React 也是同一套结构
4. **赌技术栈的代价**：v4 重写换来 RSC 和 Tailwind 4，但老用户升级痛苦——这是框架作者要承担的取舍
5. **协议化的薄接缝**：page-map AST 是 loader 和 theme 之间的唯一接口；只要 AST 形状不变，theme 怎么改都不影响编译层——这是把"docs 站脚手架"做成可替换组件的关键设计

## 延伸阅读

- 官网：[nextra.site](https://nextra.site)（自己用自己写，最好的活样本）
- 仓库：[github.com/shuding/nextra](https://github.com/shuding/nextra)
- v4 release blog：[the-guild.dev/blog/nextra-4](https://the-guild.dev/blog/nextra-4)（讲 RSC 和 Tailwind 4 的取舍）
- MDX 规范：[mdxjs.com](https://mdxjs.com)
- unified 生态：[unifiedjs.com](https://unifiedjs.com)（remark/rehype 的母体）
- shiki 高亮：[shiki.matsu.io](https://shiki.matsu.io)（Nextra 默认代码高亮）
- Pagefind 站内搜索：[pagefind.app](https://pagefind.app)（v4 默认搜索后端）
- App Router 文档：[nextjs.org/docs/app](https://nextjs.org/docs/app)（理解 v4 升级动因的前置）
- [[vitepress]] —— Vue 阵营对应物，对照阅读最快理解 Nextra 取舍

## 关联

- [[next-js]] —— Nextra 的宿主框架，没有 Next.js 就没有 Nextra
- [[vitepress]] —— Vue 阵营的镜像答案，同样薄胶水心智但绑 Vite
- [[starlight]] —— Astro 阵营对应物，强调多框架友好
- [[docusaurus]] —— 早期主流 docs 框架，魔改 webpack 不与 Next.js 互通
- [[react]] —— Nextra theme 组件层的语言基础，RSC 让首屏 JS 砍掉一大块
- [[webpack]] —— Nextra loader 注入的接缝就是 webpack 的 rule 系统
- [[turborepo]] —— Nextra 自己用 Turborepo 管 7 个子包
- [[astro]] —— 同样押"内容站点 = 框架"的 island 思路，但和 Next.js 走不同路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chalk]] —— chalk — 让 console.log 输出彩色字符串的 Node 库
- [[docusaurus]] —— Docusaurus — 一组 plugin 协作出来的文档站框架
- [[next-js]] —— Next.js — React 全栈框架
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
