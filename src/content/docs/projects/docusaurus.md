---
title: Docusaurus — 一组 plugin 协作出来的文档站框架
来源: 'Meta Open Source, "Docusaurus: Easy to Maintain Open Source Documentation Websites", 2017–2026'
日期: 2026-05-29
分类: 文档工具
难度: 中级
---

## 是什么

Docusaurus 是一个**专门用来搭文档站点**的框架。日常类比：像盖房子用的"标准户型套装"——你只管搬家具（写 markdown），地基 / 水电 / 承重墙（路由 / 版本 / 搜索 / 翻译）已经预制好了。

你跑一条命令：

```bash
npx create-docusaurus@latest my-docs classic
```

5 分钟里你就有一个能上线的文档站，自带版本切换、多语言、客户端搜索、代码高亮、暗色主题——这些功能你**一行 React 代码都不用写**。

它的核心 insight 是出品方 2021 年那句话——"docs 不是 README，是产品"。一个像样的文档站不只是把 markdown 渲染出来，它要支持：用户用 v1.0 时能看 v1.0 文档，多语言时每条 doc 都有独立翻译，客户端搜索不依赖外部服务。

## 为什么重要

不理解 Docusaurus 的设计思路，下面这些事没法解释：

- 为什么 React、Babel、Jest、Redux、Tailwind 的官网都用同一套——它解决了"开源项目想要像样文档站"的最大公约数
- 为什么"plugin 系统"能取代"祖传配置文件"——把功能拆成可插拔模块比打补丁可维护
- 为什么 versioning 内置 vs 用户自己拼是个大区别——别家框架（[[vitepress]] / [[starlight]]）让你自己拼，Docusaurus 给你 `docs:version` 一条命令搞定
- 为什么打开 docusaurus.io 网络面板能看到 200KB+ JS——这是"全功能 React docs 框架"的代价

## 核心要点

整个 Docusaurus 靠 **plugin lifecycle 三段 hook** 撑起来：

1. **loadContent**：plugin 读自己关心的文件（docs plugin 读 markdown、blog plugin 读 blog 目录）。类比：每个工人去自己的料场拉材料。这一步必须是纯函数、不能产生副作用。

2. **contentLoaded**：plugin 把加工后的数据**注册成路由**（`actions.addRoute({path, component})`）和**全局数据**（`actions.setGlobalData(...)`）。类比：工人把料运到工地、按图纸标位置。

3. **postBuild**：HTML 已经生成完，plugin 可以在 build 产物上做额外文件（sitemap.xml、service worker）。类比：装修完了贴门牌号、钉雨棚。

加上中间一个 `allContentLoaded`（所有 plugin 都跑完 `contentLoaded` 之后做跨 plugin 聚合），就是完整四段。每段是 async 函数、按 plugin 配置数组顺序串起来。**Docusaurus 内置的 docs / blog / pages / sitemap / pwa 都是 plugin**——主壳本身只是调度器。

## 实践案例

### 案例 1：写一个 30 行的最小 plugin

在项目根新建 `plugins/my-plugin/index.js`：

```javascript
module.exports = function myPlugin(context, options) {
  return {
    name: 'my-plugin',
    async loadContent() {
      return { msg: 'hello', when: Date.now() };
    },
    async contentLoaded({ content, actions }) {
      actions.setGlobalData({ ...content, name: 'my-plugin' });
    },
    async postBuild({ outDir, routesPaths }) {
      console.log('built', routesPaths.length, 'routes to', outDir);
    },
  };
};
```

在 `docusaurus.config.js` 注册一行 `plugins: [require.resolve('./plugins/my-plugin')]`，跑 `npm run build` 就能在 stdout 看到 lifecycle 顺序：先 loadContent、再 contentLoaded、最后 postBuild。三个 hook 之间靠**返回值传递**数据，不需要全局变量。

### 案例 2：theme swizzle —— 把组件"导出来"再改

```bash
npx docusaurus swizzle @docusaurus/theme-classic Footer
```

跑完之后 `src/theme/Footer/` 出现一份 Footer 组件副本，你直接改这个文件就覆盖默认 Footer。框架不强制 fork，但允许"局部覆盖"。类比：买宜家家具但允许你换某一块板。这种"代码分发"模式 [[shadcn-ui]] 也用——trade-off 是原 theme 升级时副本不会自动同步，要手动 diff。

### 案例 3：给文档加版本

```bash
npm run docusaurus docs:version 1.0
```

这条命令做了一件**朴素到争议**的事：把当前 `docs/` 整个目录复制到 `versioned_docs/version-1.0/`，把 `sidebars.js` 复制到 `versioned_sidebars/`，往 `versions.json` 加一行。从此 v1.0 的所有内容**冻结在仓库里**——任何时刻 checkout 任何 commit 都能完整 build 出 v1.0 文档，不依赖 git tag 状态。代价是仓库膨胀（5 个版本 = 5 倍 markdown 文件）。

## 踩过的坑

1. **plugin 之间靠数组顺序排——不是依赖声明**：如果 plugin A 在 contentLoaded 里读 plugin B 的 globalData，但 user 把 B 放在 A 之后，A 看不到 B 的数据。框架不检查依赖，靠用户自觉排序。

2. **plugin 抛异常 = build 直接挂**：没有 graceful fallback。一个版本损坏会让 5 个历史版本一起 build 失败。这是有意的"fail loud"，但对大型多版本项目挺粗暴。

3. **swizzle 之后原 theme 升级不会自动同步**：你 swizzle 出来的副本停在 swizzle 那天的版本。Docusaurus 升到 v3.10 时你的副本可能用了 v3.5 的 props 接口，要手动 diff 才能跟上。

4. **build 时间慢**：100 doc + 5 version + 3 locale 的项目动辄 60–120 秒。主因是 webpack 双 compiler（client + server）各跑一遍 + MDX 编译没有 incremental cache。Vite 系（[[vitepress]] / [[starlight]]）这块快很多——这是"webpack 历史负债"，不是写法问题。

## 适用 vs 不适用

**适用**：

- 大型多版本开源项目（≥ 3 个历史版本，≥ 100 doc，多语言）：versioning + i18n + theme swizzle 是别家没有的开箱即用
- React 团队：theme classic 大量组件依赖 React hooks，扩展时不用学新语法
- 想要"行业默认"：React / Babel / Jest / Redux / Tailwind 都用它，你的贡献者几乎一定见过

**不适用**：

- 性能敏感的小型 docs：默认带 ~150KB hydration JS，Lighthouse 比不上 0-JS 的 [[starlight]]
- Vue 系项目：用 [[vitepress]] 更顺手
- [[next-js]] 应用想把文档作为子路由：用 [[nextra]] 复用 Next 路由
- 老派性能极致 + 不爱 JS toolchain：用 Hugo（Go）

## 历史小故事（可跳过）

- **2017 年**：开源团队发现内部很多项目（React、Jest 等）都在重复造文档站轮子，决定做 Docusaurus 1.x。React 渲染但走传统模板风格。
- **2019 年**：v2 alpha 发布，做了一次彻底重构——把整个框架建立在 plugin 系统上。
- **2022 年**：v2 正式 GA。docs / blog / pages 全部重写成 plugin。
- **2025 年 12 月**：v3.10 发布。核心维护者 @slorber 加入 Vercel 后仍是项目主力。
- **2026-05**：65k star，156 release，每月 1–2 次小版本，活跃度健康。
- **现状**：竞品里 [[starlight]]（性能极致、0 JS）和 [[nextra]]（吃 Next.js 路由）正在分流，但 Docusaurus 凭"versioning + i18n 内置"还是大型多版本项目的默认选择。

## 学到什么

1. **"docs 是产品" vs "docs 是 README" 是两种心智**——前者会让你内置 versioning / i18n / search，后者只会渲染 markdown。两种都对，看你做什么规模
2. **plugin 系统的本质是"低自由度的 lifecycle"**——四段 hook 严格限定语义，比 webpack 那种几十个 tap 点更不容易让 plugin 互相打架
3. **"整目录复制"做 versioning 看起来朴素但极稳健**——不依赖 git 状态、可离线 build 任意历史版本，代价是仓库膨胀
4. **swizzle 是"代码分发"模式的早期实践**——[[shadcn-ui]] 把这个思路推广到了组件库，思路一致：导出代码、用户接管、不绑死框架升级
5. **行业默认有自我强化效应**——React / Babel / Jest 用 Docusaurus 之后，新项目"和大家一样"的成本远低于"挑一个轻量但小众的"，于是默认越来越胖

## 延伸阅读

- [Announcing Docusaurus 2](https://docusaurus.io/blog/2021/11/21/announcing-docusaurus-2)（v2 设计文档，"docs as a product" 原文出处）
- [官方 plugin lifecycle 文档](https://docusaurus.io/docs/api/plugins)（四段 hook 的完整 API 参考）
- [Docusaurus GitHub 仓库](https://github.com/facebook/docusaurus)（pnpm + lerna monorepo，30+ packages，吃自己狗粮）
- [Docusaurus swizzle CLI 文档](https://docusaurus.io/docs/swizzling)（什么时候 eject、什么时候 wrap，官方对"代码分发"利弊的判断）
- [[starlight]] —— Astro 出品的轻量 0-JS 替代方案
- [[vitepress]] —— Vue 团队的轻量替代
- [[webpack]] —— Docusaurus build pipeline 的底层

## 关联

- [[starlight]] —— 同类竞品，0 JS 默认 vs Docusaurus ~150KB hydration
- [[vitepress]] —— Vue 系替代，无内置 versioning
- [[nextra]] —— [[next-js]] 子路由方案
- [[webpack]] —— Docusaurus 的 build pipeline 引擎，慢 build 的根因
- [[react]] —— theme classic 完全建立在 React 上
- [[astro]] —— Starlight 的底层；和 Docusaurus "0 JS vs 150KB" 哲学差异源头
- [[unified]] —— Docusaurus MDX 处理走 remark / rehype 流水线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[minisearch]] —— minisearch — 浏览器里的小型全文搜索引擎
- [[nextra]] —— Nextra — 在 Next.js 上盖一层文档站脚手架
- [[silverbullet]] —— SilverBullet — 自托管笔记 web 应用
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[texstudio]] —— TeXstudio — LaTeX IDE
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
- [[zettlr]] —— Zettlr — 学者向 Markdown 编辑器
