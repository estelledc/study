---
title: Starlight — Astro 文档站点主题
来源: https://github.com/withastro/starlight
日期: 2026-05-29
分类: 文档站点
难度: 中级
---

## 是什么

Starlight 是一个**文档站点主题**，建立在 [[astro]] 之上。日常类比：**Astro 是空白餐厅**——有水电、有厨房、有牌照，但你得自己买桌椅、印菜单、装灯。**Starlight 是装修好的店面**——把侧边栏、搜索、暗色模式、多语言、目录导航这些"docs 站标配"全装好，你写几行配置就能开门营业。

你写一个 `astro.config.mjs`：

```js
import starlight from '@astrojs/starlight'
export default {
  integrations: [starlight({ title: 'My Docs' })]
}
```

加上 `src/content/docs/` 下放 markdown 文件——一个能用的文档站就跑起来了，自带左侧导航、右侧目录、顶部搜索框、暗色模式切换。

## 为什么重要

不理解 Starlight，下面这些事都没法解释：

- 为什么 Anthropic 的 Claude 文档、Cloudflare Workers 文档、Bun 文档、Astro 自家文档**长得风格类似**——它们都是 Starlight
- 为什么这个 study 站只用 5-10 行配置就有侧边栏 + 搜索 + 暗色模式——开箱即用的边界画在哪里
- 为什么文档站不用接 Algolia 也能全文搜索——Starlight 自带 Pagefind，**离线索引、零 SaaS 依赖**
- 为什么"写 markdown 就有像样网站"这件事在 2024 年才真正普及——是 Astro 的 island 架构 + Starlight 的薄壳一起完成的

简单说：**它把"做一个 docs 站"从一周降到一晚上**。

## 核心要点

Starlight 的能力可以拆成 **三块**：

1. **Sidebar 配置**：左侧导航有两种写法——**手写**（明确列出每个链接）和 **autogenerate**（按文件系统目录自动生成）。autogenerate 是约定优于配置：你按文件夹组织笔记，sidebar 自己长出来。

2. **Markdown / MDX 内容流水线**：Starlight 跑在 Astro 的 markdown 引擎上，意味着 **remark / rehype 插件可以注入**——双链 wikilinks、自动加 anchor、数学公式渲染都靠这个口子。

3. **i18n 多语言**：把翻译版本放进 `src/content/docs/<locale>/` 目录，Starlight 自动生成多语言路由 + 语言切换器。约定就是路径。

加上一个**搜索后端**：构建期跑 Pagefind，把 HTML 内容切片做成 WASM 索引，运行时 lazy load——这就是为什么"零 JS 默认 + 全文搜索"能共存。

## 实践案例

### 案例 1：最小可用配置

`astro.config.mjs` 写 5 行：

```js
import starlight from '@astrojs/starlight'

export default {
  integrations: [
    starlight({
      title: 'My Docs',
      sidebar: [{ label: 'Home', link: '/' }],
    }),
  ],
}
```

加一个 `src/content/docs/index.md` 写点内容——`npm run dev` 后浏览器打开就是个完整文档站。这是 Starlight 最 minimal 的姿势。

### 案例 2：在 markdown 里嵌组件

Starlight 用 MDX 让你在内容里 import Astro 组件：

```mdx
---
title: 我的页面
---

import Card from '~/components/Card.astro'

# 标题

<Card title="高亮卡片">
  这段文字被卡片包起来。
</Card>

正文继续。
```

意思是：**markdown 写文字、MDX 让你在文字中间塞 Astro 组件**——卡片、标签页、警告框这些 UI 不再需要离开 markdown。

### 案例 3：加 remark 插件做双链

这个 study 站就用了双链——`[[hindley-milner]]` 自动变链接。在 `astro.config.mjs` 里加一行：

```js
import remarkWikilinks from './scripts/remark-wikilinks.mjs'

export default {
  markdown: {
    remarkPlugins: [remarkWikilinks],
  },
  integrations: [starlight({ /* ... */ })],
}
```

`remarkPlugins` 是 Astro 标准接口，Starlight 不挡道——任何 remark 生态插件都能插进来：anchor、KaTeX、emoji、自定义指令。

## 踩过的坑

1. **autogenerate 在 100+ 笔记会生成超长侧边栏**：自动生成会把目录里所有文件按字母顺序排出来，70+ 篇笔记后侧边栏长到滚不到底。解决：按主题分组手写（写一个 atlas 索引页），或用 `sidebar.order` frontmatter 字段强制顺序。autogen 适合 ≤ 30 篇的小站。

2. **Pagefind 中文需要二次跑**：默认 Pagefind 用英文分词，中文搜索会把"文档站点"当作一个整体词，搜"文档"搜不到。修复：build 完后 `pagefind --site dist --force-language zh` 二次跑，启用中文分词器。

3. **MDX 注释 vs Astro 注释语法不同**：`.astro` 文件用 `<!-- -->` 注释，`.mdx` 文件里写 JSX 必须用 `{/* */}`——混用会报 parser error 但错误信息不直观。同理给 MDX 组件传 props 用 `<Card title="X" />` 不是 `<Card title='X' />`（单引号在某些版本会出问题）。

4. **Starlight 0.30 默认开 Pagefind UI**：升级后发现自定义搜索框不工作——是因为 0.30 内置了一个 Pagefind 搜索 UI 抢了快捷键。要么用内置的（删自定义代码），要么在配置里 `pagefind: false` 关掉。

## 适用 vs 不适用场景

**适用**：
- 开源项目文档站（API 参考 + Guide + 教程）
- 个人 / 团队知识库（这个 study 站就是）
- 需要多语言文档的项目（i18n 内置）
- 想要"零 JS 默认、不依赖 SaaS 搜索"的场景

**不适用**：
- 需要复杂动态交互（用户登录态、实时数据、API mock）的产品文档 → 用 [[nextra]] 或 [[docusaurus]]，吃 React 全 hydration
- Vue 系团队 → 用 [[vitepress]]，Vue 心智一致
- 不想自己运维、能付费 → Mintlify 等托管 SaaS，但锁部署
- 需要"section 级搜索"（在 H3 内搜词） → Pagefind 只到 page 级，要 Algolia

## 历史小故事（可跳过）

- **2022 年**：Astro 1.0 发布，island 架构成熟——但写文档站还是要自己拼 sidebar / 搜索 / i18n 三大件，每个项目重新写一遍。
- **2023 年 Q4**：Astro core team 判断"docs 站点 80% 的脚手架已经长在 Astro 里了"，缺的只是一层 convention 壳。
- **2023-09**：`@astrojs/starlight` 0.1 发布。
- **2024-2025**：Cloudflare、Bun、Anthropic 等大型项目把文档站迁移到 Starlight，**"docs as Astro integration"** 成为一种通用范式。
- **2026-05**：稳定版 0.39，配套生态 starlight-tailwind / starlight-markdoc / starlight-blog 等社区扩展。

## 学到什么

1. **Convention over configuration 在 docs 场景特别成立**——文件夹就是侧边栏、目录就是路由、frontmatter 就是元数据，不需要每次重新设计
2. **薄壳 > 重框架**：Starlight 主体只有几百行，靠"挂 hook 到 Astro"而不是重新发明引擎，更新和维护都轻
3. **构建期搜索索引** 是个好默认：Pagefind 把搜索从"运行时调用 SaaS"降到"构建产物里多一个文件夹"，部署门槛 -1
4. **Markdown 流水线开放** 是关键扩展点：双链、KaTeX、Mermaid 这些"非主流需求"都能通过 remark 插件接入，不用 fork 主题

## 延伸阅读

- 官方文档：[Starlight Docs](https://starlight.astro.build/)（Starlight 自己写的 Starlight 文档，吃自己的狗粮）
- Pagefind：[pagefind.app](https://pagefind.app/)（CloudCannon 出品的静态站搜索引擎）
- Astro Content Collections：[docs.astro.build/en/guides/content-collections/](https://docs.astro.build/en/guides/content-collections/)（理解 Starlight 的 frontmatter 校验底层）
- [[astro]] —— Starlight 的宿主框架，理解 island 架构是理解 Starlight 性能模型的前提
- [[vitepress]] —— Vue 系对照，看不同生态如何处理 docs
- [[docusaurus]] —— React 系对照，看"全 hydration"的 trade-off
- [[nextra]] —— Next.js 系对照，看"在 Next 上叠 docs 主题"的另一种姿势

## 关联

- [[astro]] —— 提供 SSG 引擎、content collection、integration hook，Starlight 是其上的薄壳
- [[vitepress]] —— Vue 系平行项目，零 hydration 同款理念
- [[docusaurus]] —— React 系平行项目，全 hydration 路线
- [[nextra]] —— Next.js 系平行项目，HOC 包装路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anime]] —— anime.js — 一行 JS 让网页元素按时间线动起来
- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[dayjs]] —— Day.js — 用 2 KB 复刻 Moment 的极简日期库
- [[docusaurus]] —— Docusaurus — 一组 plugin 协作出来的文档站框架
- [[gh]] —— gh — GitHub 官方命令行
- [[glab]] —— glab — GitLab 官方命令行
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[islands-architecture]] —— Islands Architecture — 静态页面里只让需要交互的小块加载 JS
- [[markdown-it]] —— markdown-it — 把 Markdown 文本变成 HTML 的工业级解析器
- [[marked]] —— marked — 用一堆正则把 markdown 变成 HTML 的轻量解析器
- [[minisearch]] —— minisearch — 浏览器里的小型全文搜索引擎
- [[nextra]] —— Nextra — 在 Next.js 上盖一层文档站脚手架
- [[nivo]] —— nivo — React + d3 组件化图表
- [[sharp]] —— sharp — 让 Node.js 处理图像快到不像 JS
- [[shfmt]] —— shfmt — Shell 脚本的 gofmt（用 Go 写的统一格式化器）
- [[shiki]] —— shiki — 把 VS Code 那套染色搬到网页上
- [[unified]] —— unified — 把文档处理拆成 AST + plugin 流水线
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器

