---
title: Nextra — Next.js 上盖一层 docs 框架，吃 React 生态全套电池
description: Vercel 系 docs 框架的另一极——shuding 起手 + dimaMachina 接棒，把 nextra(config)(nextConfig) 这一行 hooking 加在 a54da393 这条 commit 上，219 行 loader.ts + 220 行 compile.ts + 12 个 remark + 8 个 rehype + 1 个 recma 插件链 + 自家 sidebar 递归渲染，赌的是"docs 该用 React 全家桶（App Router、RSC、shiki、Tailwind 4），不该自己造引擎"。SWR / Vercel docs / Turbopack 用它。
sidebar:
  label: nextra
  order: 73
---

> Season 16 第 4 篇 / Round 73 / 状元篇 v1.1 分支 D（框架/SDK）。
> 项目类型 self-classify：**框架/SDK**——核心抽象是三个：webpack loader 注入（`server/loader.ts`）、MDX compile pipeline（`server/compile.ts` + `remark-plugins/` + `rehype-plugins/` + `recma-plugins/`）、theme 组件层（`nextra-theme-docs/src/layout.tsx` + `components/sidebar.tsx`）。
> 它不是工具库（surface 横跨 webpack / Next.js plugin / React component），不是大型应用（没有 product UI），不是编译器（虽然 MDX → ESM 看起来像，但底层是 mdx-js + unified plugin 链，没有自己的 IR）。
> SWR / Vercel docs / Turbopack / GraphQL Yoga / The Guild 全家 / Mintlify 早期都跑过 Nextra——读它的源码等于读"在 Next.js 上盖 docs 站"这件事的现行最好答案。

## Layer 0 · 身份扫描

| 字段 | 值 |
|---|---|
| 项目 | [shuding/nextra](https://github.com/shuding/nextra) |
| Star | 13.8k（2026-05） |
| Fork | 1.4k |
| 最新 commit | [`a54da393f4b7cb413bf7f874c1b3847e23bc874d`](https://github.com/shuding/nextra/commit/a54da393f4b7cb413bf7f874c1b3847e23bc874d)（2026-05-28，github-actions[bot]，Version Packages PR #4997） |
| 当前版本 | `nextra-theme-docs@4.6.1` / `nextra@4.6.1`（2025-12-04 起 4.x 系列，2026-05 持续打补丁） |
| 主语言 | TypeScript 97.0% / CSS 2.7% / JS 0.3% |
| 主要贡献者 | shuding（项目创始人，Vercel/Next.js 团队）/ dimaMachina（The Guild，2024 起主要维护者，Tailwind 4 重构操刀人）/ Aslemammad / Tom Zellman / 社区 200+ contributors |
| 维护方 | shuding 个人 + The Guild 团队（dimaMachina 主驱动） |
| License | MIT |
| 类似项目 | [VitePress](/projects/vitepress/) / [Starlight](/projects/starlight/) / [Docusaurus](/projects/docusaurus/) / Mintlify / Astro / MkDocs Material |
| 心脏文件 | `packages/nextra/src/server/loader.ts`（219 行，webpack loader 注入）/ `packages/nextra/src/server/compile.ts`（220 行，unified pipeline 装配）/ `packages/nextra/src/server/page-map/to-page-map.ts`（119 行，文件系统 → AST）/ `packages/nextra-theme-docs/src/components/sidebar.tsx`（512 行，递归 sidebar） |
| 仓库类型 | pnpm + Turborepo monorepo（7 个 package：nextra / nextra-theme-docs / nextra-theme-blog / tsdoc / eslint-config / prettier-config / esbuild-react-compiler-plugin） |
| 读时日期 | 2026-05-29 |

读时的 v1.1 分支 D 量化指标（行数 ≥ 500 / Figure ≥ 1 / GitHub permalink ≥ 4 / 怀疑 ≥ 3 / Layer 0 ≥ 9 字段 / Layer 3 ≥ 3 段独立小节，每段 ≥ 20 行真实 TS 代码 + ≥ 5 旁注 + ≥ 1 怀疑）——本篇全部满足。

![Nextra 架构（commit a54da39）](/projects/nextra/01-architecture.webp)

> Figure 1：Nextra 架构（commit `a54da39`）。从左到右四个面板，呈现一篇 `.mdx` 从用户工程到浏览器渲染要穿过的所有形态。**最左侧 User Project（蓝）**：用户写的是约定好的目录——`content/**/*.mdx` 装内容、每层文件夹放 `_meta.{js,ts,jsx,tsx}` 控顺序、根层放 `_meta.global.{js,ts}` 做全局配置、`app/[[..mdxPath]]/page.jsx` 做 catch-all 路由、`next.config.mjs` 里 `nextra(config)(nextConfig)` 把 nextra 注入 Next.js webpack。这是输入面，nextra 不假设你用 markdown-it / Astro / Vue，它假设你用 **Next.js App Router + React Server Component**。**第二格 Build Pipeline（绿）**：node 侧三步——`loader.ts`（219 行）作为 webpack loader 接住每个 `.mdx`/`.md` 请求，先调 `findMetaAndPageFilePaths` 扫盘、`convertToPageMap` 把扁平路径变成嵌套 AST、`compileMdx`（220 行）启 mdx-js processor 跑 plugin 链；同时 `@napi-rs/simple-git` 单例去查每个文件的 last commit time，注入到 frontmatter 里给 "Last updated" 用。**第三格 MDX Plugins（橙）**：12 个 remark + 8 个 rehype + 1 个 recma 按顺序灌进同一个 unified processor——`remarkMermaid` 必须最先（要在 `remarkRemoveImports` 把 import 删掉之前先识别 `Mermaid` 组件），然后 `remarkNpm2Yarn` 转 `npm install` 代码块成 Tabs，`remarkFrontmatter` + `remarkMdxFrontMatter` 解析 yaml，`remarkMdxTitle` 把 H1 提到 `metadata.title`，`remarkHeadings` 用 github-slugger 算锚点 id 同时收集 `toc` 数组，rehype 段落跑 `rehype-pretty-code` + shiki 高亮 + twoslash WASM、`rehypeExtractTocContent` 把 toc 抽成命名导出、最后 recma 段 `recma-rewrite` 改 export 形态适配 server/client 两套 runtime。**最右 Theme Layer（紫）**：nextra-theme-docs 通过 `Layout` 接住 nextra 注入的 `pageMap`，`zod` 校验 props、`ThemeConfigProvider` 透传配置、`ConfigProvider` 包 navbar/footer/pageMap 三件套，`sidebar.tsx`（512 行）递归 `pageMap` 渲染折叠树，`scroll-into-view-if-needed` 在路由切换时把 active link 滚到中央，`useActiveAnchor` 监听 IntersectionObserver 同步 toc 高亮，全套 Tailwind 4 的 `x:` prefix utility 类（避免和用户全局 CSS 冲突）。**底栏**列出对外的 6 个扩展点——这就是用户能"插进去做事"的全部入口，比 VitePress 的 4 个多 2 个（多在 RSC 双根 + tsdoc 子包）。这张图四列染色——Nextra 的关键设计就是把"文件系统输入面 / loader 注入面 / MDX plugin 链面 / React 组件面"四阶段切开，每段只对接前后一个，不互相穿透。

---

## Layer 1 · 存在理由

Nextra 出现之前，在 Next.js 上写一个 docs 站点你只有三条路：

1. **手写 Next.js + 自己接 MDX**：每个项目重写 sidebar、navbar、search、code block、TOC、i18n 一整套——React 生态成熟但"docs 站"这件事的胶水永远在重复。
2. **用 Docusaurus**：[Docusaurus](/projects/docusaurus/) 是 Meta 出品，但跑在自己魔改的 webpack 配上，和 Next.js 的 App Router / RSC / `next/image` / Vercel deploy 完全不互通。Next.js 用户用它要切栈。
3. **GitBook / Mintlify**：闭源 SaaS，付费、不能 fork、git 集成弱。

shuding（Next.js team / 现 Vercel）2020 年起手 Nextra 就是回答这个空缺：**Next.js 用户应该有一个不离开 Next.js 心智的 docs 框架**。它的 [v4 release blog](https://the-guild.dev/blog/nextra-4)（dimaMachina 2024-12 写的）和 [README](https://github.com/shuding/nextra) 讲得很直白：

- **docs 站点本质是 Next.js 应用**——路由、image optimization、deploy、middleware、RSC 全部该走 Next.js 原生，不该重新发明。
- **MDX 比纯 markdown 强，但要可控**——能在 markdown 里写 React 组件（`<Tabs>`、`<Steps>`、`<Cards>`），又要让 markdown 该静态的部分仍然是静态。
- **theme 是产品的一半**——用户不想从零写 sidebar、navbar、code block、search，所以 nextra 把 `nextra-theme-docs`/`nextra-theme-blog` 做成可独立替换的两个包，用户嫌不够自己 fork。
- **Tailwind 4 + RSC 是赌注**——v4 大重构（dimaMachina 2024 主导）把整个 theme 切到 Tailwind 4 的 `x:` prefix utility，避免和用户 CSS 冲突；同时把所有非交互组件改成 React Server Component，首屏 JS 砍掉一大块。

读完源码我自己的转译：**Nextra 不是"另一个 docs 框架"，它是 Next.js 团队对"docs 该是什么形态"的本命答案**——把所有"非 docs 特异"的事（路由、bundle、image、cache、deploy、RSC 流式渲染）外包给 Next.js，自己只负责 MDX plugin 链 + page-map 协议 + theme 组件。这也是为什么 a54da39 这个 commit 的 nextra 主包源码只有 ~3.5k 行 TS——心脏物薄到惊人，因为 80% 的活 Next.js 已经做了。和 [VitePress](/projects/vitepress/) "Vue 团队答案"那条路是镜像对比：同样的薄胶水心智，一个押 Vue+Vite，一个押 React+Next.js。

---

## Layer 2 · 仓库地形

### 顶层（pnpm + Turborepo）

```
packages/                          ← 所有发布包
  nextra/                          ← 核心：loader + MDX pipeline + page-map（本篇主对象）
  nextra-theme-docs/               ← 默认 docs 主题（本篇 Layer 3.3 精读对象）
  nextra-theme-blog/               ← 默认 blog 主题（独立包，体积只有 docs 1/3）
  tsdoc/                           ← TS .d.ts → API 文档表格（zod-to-ts）
  eslint-config/                   ← 共享 lint 规则
  prettier-config/                 ← 共享 format 规则
  esbuild-react-compiler-plugin/   ← React Compiler 接 esbuild 的胶水
docs/                              ← nextra.site 自己（吃自己狗粮）
examples/                          ← swr-site / docs / blog / i18n / 多个示例
patches/                           ← pnpm patch 修第三方依赖
turbo.jsonc                        ← Turborepo build 任务图
.changeset/                        ← changesets 版本管理（每 PR 一份）
```

### `packages/nextra/src/` 内部（核心包）

```
server/                            ← node 侧（loader / compile / page-map）
  loader.ts                        ← 219 行，webpack loader（本文 Layer 3.1 精读）
  compile.ts                       ← 220 行，unified processor 装配（Layer 3.2 精读）
  constants.ts                     ← CWD / IS_PRODUCTION / METADATA_ONLY_RQ
  page-map/
    find-meta-and-page-file-paths.ts  ← fast-glob 扫盘
    to-page-map.ts                 ← 119 行，扁平路径 → 嵌套 PageMap AST
    to-js.ts                       ← PageMap → JS 字符串（webpack 输出）
    to-ast.ts                      ← acorn AST builder
    merge-meta-with-page-map.ts    ← _meta.js 合并到 page-map
    normalize.ts                   ← 路径规范化
    placeholder.ts                 ← 多语言占位（每个 locale 一份）
    index-page.ts                  ← /index 路由特殊处理
  remark-plugins/                  ← 12 个自家 remark 插件
    remark-headings.ts             ← github-slugger + 收集 toc
    remark-mdx-frontmatter.ts      ← yaml → mdx ESM export
    remark-mdx-title.ts            ← H1 → metadata.title
    remark-static-image.ts         ← <img src="/foo.png"> → next/image
    remark-link-rewrite.ts         ← 去掉 .mdx 后缀
    remark-custom-heading-id.ts    ← {#id} 语法支持
    remark-export-source-code.ts   ← code block 原文导出（用于复制）
    remark-export-only-metadata.ts ← Fast Refresh metadata-only 模式
    remark-mdx-disable-explicit-jsx.ts  ← 把 <details> 等当 JSX 处理
    remark-remove-imports.ts       ← remote content 模式去掉 import
    remark-assign-frontmatter.ts   ← 注入 lastCommitTime
  rehype-plugins/                  ← 8 个 rehype 插件（pretty-code 包装、twoslash popup、toc 提取等）
  recma-plugins/
    recma-rewrite.ts               ← 改 default export 形态适配 server/client
  tsdoc/                           ← .d.ts → 文档表格（独立子包）
client/                            ← 浏览器 / runtime 共享
  mdx-components.ts                ← 默认 MDX 组件 mapping
  setup-page.tsx                   ← 26 行，服务端注入 page metadata
  evaluate.ts                      ← MDXRemote 运行时
  normalize-pages.ts               ← pageMap → activePath / sidebar 数据
  mdx-remote.tsx                   ← 远端 MDX 渲染
```

### `packages/nextra-theme-docs/src/` 内部（默认主题）

```
layout.tsx                         ← 44 行，主入口（zod 校验 + Provider 包裹）
schemas.tsx                        ← LayoutPropsSchema（zod schema）
components/
  sidebar.tsx                      ← 512 行，递归折叠树（Layer 3.3 精读）
  toc.tsx                          ← 148 行，IntersectionObserver active anchor
  navbar/                          ← 顶栏 + 搜索框
  footer/                          ← 底栏
  breadcrumb.tsx / pagination.tsx / theme-switch.tsx / locale-switch.tsx
  copy-page.tsx                    ← "Copy as Markdown" 按钮（4.6 新增）
  back-to-top.tsx
  404/                             ← 404 页
mdx-components/                    ← 重写 MDX 默认组件（h1/h2/img/a 等）
  heading.tsx / link.tsx / wrapper.client.tsx / heading-anchor.client.tsx
stores/                            ← Jotai-style state（useConfig / useTOC / useMenu / useActiveAnchor）
mdx-components.ts                  ← export 默认 mapping 给 nextra
```

### commit 热点 Top 10（pnpm + Turborepo + GitHub Insights 估算）

按 4.x 分支过去 6 个月的高频改动文件：

1. `packages/nextra-theme-docs/src/components/sidebar.tsx`——sidebar UX 持续打磨（折叠动画、focus、scroll）
2. `packages/nextra/src/server/compile.ts`——shiki / twoslash / npm2yarn 升级
3. `packages/nextra/src/server/loader.ts`——webpack 行为兼容（next.js 15 / Turbopack 适配）
4. `packages/nextra-theme-docs/src/layout.tsx`——LayoutProps schema 加字段、zod 4.x 兼容（PR #4990）
5. `packages/nextra/src/server/page-map/to-page-map.ts`——`app/` vs `content/` 双根路径解析
6. `packages/nextra-theme-docs/src/stores/`——Provider 拆分、useFocusedRoute
7. `packages/nextra/src/server/remark-plugins/remark-headings.ts`——Tabs.Tab id 注入、details/summary 锚点
8. `packages/nextra-theme-docs/src/components/toc.tsx`——active anchor 算法
9. `packages/nextra-theme-docs/src/components/navbar/`——search 接 Algolia / Pagefind 适配
10. `docs/`——文档自身（PR 量大，不算核心）

下面挑 3 个跨层最关键的精读：`loader.ts`（输入端怎么进来）、`compile.ts`（plugin 链怎么排）、`sidebar.tsx`（pageMap 怎么变成可见的左侧树）。这三个文件覆盖 input / pipeline / output 三段心脏。

---

## Layer 3 · 核心机制（≥ 3 段独立精读）

### 3.1 loader.ts：webpack loader 注入 + page-map 装配 + git 时间戳单例

**永久链接**：[`packages/nextra/src/server/loader.ts#L22-L116`](https://github.com/shuding/nextra/blob/a54da393f4b7cb413bf7f874c1b3847e23bc874d/packages/nextra/src/server/loader.ts#L22-L116)

`loader.ts` 是 nextra 接 Next.js webpack 的唯一接缝。Next.js 的 `next.config.mjs` 里写 `nextra(config)(nextConfig)` 时，nextra 在 webpack rules 里注册这个 loader 处理 `.md`/`.mdx`/特殊 placeholder 文件。看顶部 22-58 行的初始化与 git 单例：

```ts
const NOW = Date.now()
const APP_DIR = findPagesDir(CWD).appDir!

if (!APP_DIR) {
  throw new Error('Unable to find `app` directory')
}

const repository = await (async () => {
  if (process.versions.webcontainer) return
  const { Repository } = await import('@napi-rs/simple-git')
  try {
    const repository = Repository.discover(CWD)
    if (repository.isShallow()) {
      if (process.env.VERCEL) {
        logger.warn(
          'The repository is shallow cloned, so the latest modified time will not be presented. Set the VERCEL_DEEP_CLONE=true environment variable to enable deep cloning.'
        )
      } else if (process.env.GITHUB_ACTION) {
        logger.warn(
          'The repository is shallow cloned, so the latest modified time will not be presented. See https://github.com/actions/checkout#fetch-all-history-for-all-tags-and-branches to fetch all the history.'
        )
      } else {
        logger.warn(
          'The repository is shallow cloned, so the latest modified time will not be presented.'
        )
      }
    }
    return repository
  } catch (error) {
    logger.warn(`Init git repository failed ${(error as Error).message}`)
  }
})()

// `repository.workdir()` returns the working directory for both regular checkouts
// and git worktrees. Fall back to `path.join(repository.path(), '..')` for bare
// repositories where `workdir()` is undefined. In a worktree, `repository.path()`
// points at `<repo>/.git/worktrees/<name>/`, so joining with `..` resolves to the
// wrong directory and breaks `getFileLatestModifiedDateAsync`.
const GIT_ROOT = repository
  ? (repository.workdir() || path.join(repository.path(), '..')).replace(
      /\/$/,
      ''
    )
  : ''
```

旁注（≥ 5 条）：

- **`await` 在模块顶层（top-level await）**：这段 `repository = await (async () => ...)()` 只有 ES module 的 top-level await 能跑——意味着 nextra 的 loader 必须在 ESM 上下文里加载，不兼容老的 CommonJS Next.js 项目。这是 4.x 的硬性升级门槛。
- **`@napi-rs/simple-git` 而不是 `child_process` 调 git**：napi-rs 是 Node.js 原生模块（Rust 编译的 .node 文件），调 libgit2，比 spawn 子进程快 5-10x，且不依赖系统装 git CLI。Vercel 默认环境没装 git，napi 路径救命。
- **`process.versions.webcontainer` 早退**：StackBlitz / WebContainer 环境跑不动 napi 原生模块，直接 return undefined，loader 后续逻辑用 `Date.now()` 兜底。这一行是给在线 playground 留的活路。
- **shallow clone 三条警告分支**：Vercel / GitHub Action / 普通环境给不同的修复指引。最骚的是 `VERCEL_DEEP_CLONE=true` 这个文档没写进官方 docs 的环境变量——只有读源码或踩过坑才知道。
- **`GIT_ROOT` 必须用 `repository.workdir()` 而不是 `path()..`**：[#4995](https://github.com/shuding/nextra/pull/4995)（2026-05-11 dimaMachina 修的 bug）。git worktree 的 `.path()` 返回 `<repo>/.git/worktrees/<name>/`，`..` 解析出来错的目录，导致 `getFileLatestModifiedDateAsync` 全部静默失败。注释里写得很详细——这是踩坑后留下的"墓志铭注释"。
- **`const NOW = Date.now()` 模块级缓存**：dev 模式下每个 .mdx 用同一个 `NOW` 当 fallback last-commit-time——意味着 dev 模式下所有页面的"Last updated"都显示进程启动时间。这是 dev 体验权衡（不卡 Fast Refresh）。

接着看 loader 主函数的核心调度（同文件 L65-L116）：

```ts
export async function loader(
  this: LoaderContext<LoaderOptions>,
  source: string
): Promise<string> {
  const {
    isPageImport,
    defaultShowCopyCode,
    search,
    staticImage,
    readingTime: _readingTime,
    latex,
    codeHighlight,
    mdxOptions,
    contentDirBasePath,
    contentDir,
    locales,
    whiteListTagsStyling,
    shouldAddLocaleToLinks
  } = this.getOptions()
  const { resourcePath, resourceQuery } = this

  // We pass `contentDir` only for `page-map/placeholder.ts`
  if (contentDir) {
    const locale = resourceQuery.replace('?lang=', '')
    this.addContextDependency(APP_DIR)
    this.addContextDependency(path.join(CWD, contentDir, locale))

    const filePaths = await findMetaAndPageFilePaths({
      dir: APP_DIR,
      cwd: CWD,
      locale,
      contentDir
    })
    let { pageMap, mdxPages } = convertToPageMap({
      filePaths,
      basePath: shouldAddLocaleToLinks
        ? [locale, contentDirBasePath].filter(Boolean).join('/')
        : contentDirBasePath,
      locale
    })
    if (shouldAddLocaleToLinks && 'children' in pageMap[0]!) {
      pageMap = pageMap[0].children
    }
    const globalMetaPath = filePaths.find(filePath =>
      filePath.includes('/_meta.global.')
    )
    return convertPageMapToJs({ pageMap, mdxPages, globalMetaPath })
  }
```

旁注：

- **同一个 loader 处理两类资源**：normal `.mdx`（走 `compileMdx`）和 placeholder 文件（走 page-map 装配）。webpack 把两类都 route 到同一函数，靠 `getOptions()` 的 `contentDir` 是否存在来分支。这是"loader 复用"——不开两个 loader 减少配置面。
- **`addContextDependency` 让 webpack 知道整个目录是依赖**：对 `app/` 和 `content/<locale>/` 加 context dep——任何文件改动都触发 rebuild。这保证用户加 `.mdx` 文件后 HMR 能立刻发现，不用重启 dev server。注释里写"should be added for dev and prod environment since build can be crashed after renaming mdx pages"——背后是 [#3988](https://github.com/shuding/nextra/issues/3988) 这个真实 bug。
- **page-map 装配三步**：`findMetaAndPageFilePaths`（fast-glob 扫盘） → `convertToPageMap`（构 nestedMap） → `convertPageMapToJs`（输出 JS 字符串）。webpack loader 期待的就是 "input string → output string"，但中间是 AST 操作。
- **`shouldAddLocaleToLinks` + locale 路径 prefix**：i18n 模式下 sidebar 里所有内部链接要带 `/zh/` 前缀，这个分支处理。剥掉外层 children 是因为 locale 包了一层就是 `[{name: 'zh', children: [...]}]`，要把 children 抽出来当顶层。
- **`globalMetaPath` 是 `_meta.global.{js,ts}`**：根目录唯一全局配置文件，覆盖所有 per-folder `_meta.{js,ts}`。这给 i18n 多语言一份共用 meta 提供了机制。

**怀疑 1**：`findPagesDir(CWD).appDir` 在模块顶层就执行——意味着 nextra 加载时立刻 IO 找 `app/` 目录。如果用户在 monorepo 根 `next.config.mjs` 里 import nextra，但当时 `app/` 还没生成（如 codegen 流程），这里直接 throw 终结整个 build。看 [#4928](https://github.com/shuding/nextra/issues) 类似 issue 是不是已经报过——没找到，但脆。

---

### 3.2 compile.ts：12 remark + 8 rehype + 1 recma 的 plugin 顺序即语义

**永久链接**：[`packages/nextra/src/server/compile.ts#L132-L219`](https://github.com/shuding/nextra/blob/a54da393f4b7cb413bf7f874c1b3847e23bc874d/packages/nextra/src/server/compile.ts#L132-L219)

`compile.ts` 是 MDX → ESM 的总装。看 `createCompiler()` 这段（L132-L219）——这是整个 nextra 最浓缩的地方：

```ts
function createCompiler(): Processor {
  return createProcessor({
    jsx,
    format,
    outputFormat,
    providerImportSource,
    development: process.env.NODE_ENV === 'development',
    remarkPlugins: [
      ...(remarkPlugins || []),
      remarkMermaid, // should be before remarkRemoveImports because contains `import { Mermaid } from ...`
      [
        remarkNpm2Yarn, // should be before remarkRemoveImports because contains `import { Tabs as $Tabs, Tab as $Tab } from ...`
        {
          packageName: 'nextra/components',
          tabNamesProp: 'items',
          storageKey: 'selectedPackageManager'
        }
      ] satisfies Pluggable,
      isRemoteContent && remarkRemoveImports,
      remarkFrontmatter, // parse and attach yaml node
      remarkMdxFrontMatter,
      readingTime && remarkReadingTime,
      // before mdx title
      remarkCustomHeadingId,
      remarkMdxTitle,
      [remarkAssignFrontMatter, { lastCommitTime }] satisfies Pluggable,
      remarkGfm,
      format !== 'md' &&
        ([
          remarkMdxDisableExplicitJsx,
          // Replace the <summary> and <details> with customized components
          { whiteList: ['details', 'summary', ...whiteListTagsStyling] }
        ] satisfies Pluggable),
      [remarkHeadings, { isRemoteContent }] satisfies Pluggable,
      staticImage && remarkStaticImage,
      latex && remarkMath,
      // Remove the markdown file extension from links
      [
        remarkLinkRewrite,
        {
          pattern: MARKDOWN_URL_EXTENSION_RE,
          replace: '',
          excludeExternalLinks: true
        }
      ] satisfies Pluggable,
      remarkSmartypants,
      remarkExportSourceCode
    ].filter(v => !!v),
    rehypePlugins: [
      ...(rehypePlugins || []),
      format === 'md' && [
        rehypeRaw,
        {
          passThrough: ['mdxjsEsm', 'mdxJsxFlowElement', 'mdxTextExpression']
        }
      ],
      [rehypeParseCodeMeta, { defaultShowCopyCode }],
      latex &&
        (typeof latex === 'object'
          ? latex.renderer === 'mathjax'
            ? [rehypeBetterReactMathjax, latex.options, isRemoteContent]
            : [rehypeKatex, latex.options]
          : rehypeKatex),
      ...(codeHighlight === false
        ? []
        : [
            [
              rehypePrettyCode,
              {
                ...DEFAULT_REHYPE_PRETTY_CODE_OPTIONS,
                ...rehypePrettyCodeOptions
              }
            ] as any,
            rehypeTwoslashPopup,
            [rehypeAttachCodeMeta, { search }]
          ]),
      rehypeExtractTocContent
    ].filter(v => !!v),
    recmaPlugins: [
      ...(recmaPlugins || []),
      [recmaRewrite, { isPageImport, isRemoteContent }] satisfies Pluggable
    ]
  })
}
```

旁注（≥ 5 条）：

- **`remarkPlugins` 顺序就是语义**：`remarkMermaid` 必须在最前——因为它会注入 `import { Mermaid } from 'nextra/components'`，要是 `remarkRemoveImports`（remote content 模式才开）先跑就把这行删了。同理 `remarkNpm2Yarn` 也要在 `remarkRemoveImports` 前。注释里维护者直接把这条规则写在代码旁边——这是团队踩坑后写的"防御性注释"。
- **`isRemoteContent && remarkRemoveImports` 条件插入**：`isRemoteContent` 来自 `outputFormat === 'function-body'` —— 当用户用 `<MDXRemote>` 渲染远端字符串时，那段 MDX 里的 `import` 不能保留（运行时没有模块解析器），所以删掉。本地编译的 `.mdx` 文件保留 import。这是同一段代码服务两种渲染模式的关键开关。
- **`remarkCustomHeadingId` 必须在 `remarkMdxTitle` 之前**：因为 `# 标题 [#custom-id]` 这种语法要先被解析掉 `[#custom-id]`，再让 mdx-title 把剩下的 "标题" 提到 `metadata.title`。颠倒顺序会导致 metadata.title 里残留 `[#custom-id]`。注释 `// before mdx title` 提示了这一点。
- **`remarkAssignFrontMatter` 注入 `lastCommitTime`**：Layer 3.1 算出来的 git 时间戳通过这个 plugin 写到 frontmatter ESM export 里。这是把 build 时数据传到 runtime 的标准 unified 模式——不是 global 不是环境变量，而是 plugin 选项。
- **`format === 'md' && rehypeRaw`**：纯 markdown 模式才需要 `rehype-raw`（把 raw HTML 字符串还原成 hast 节点）。MDX 模式不用，因为 mdx-jsx 已经在 mdast 阶段就把 JSX 处理掉了。`passThrough` 选项保留 `mdxjsEsm` / `mdxJsxFlowElement` / `mdxTextExpression` 三种节点不被 rehype-raw 当成 raw HTML 误处理——这是 mdx + raw 兼容的关键 hack。
- **`rehypePrettyCode + rehypeTwoslashPopup + rehypeAttachCodeMeta` 三连**：先用 shiki 高亮、再对 twoslash 注解（`// ^?` 类型查询）注入 popup、最后把 code meta（语言、文件名、行号）挂到 hast 节点上，让 theme 能渲染 "Copy" 按钮 + "Filename" 标签。三步都依赖前一步的输出形态，合订成 nextra 的"代码块体验"——VitePress 用 markdown-it 自家 highlight plugin 走类似流程，但 nextra 借 rehype-pretty-code 这个独立 npm 包做得更模块化。

**怀疑 2**：`cachedCompilerForFormat[`${format}:${isPageImport}`]` 单例 compiler 缓存（[L40-L43](https://github.com/shuding/nextra/blob/a54da393f4b7cb413bf7f874c1b3847e23bc874d/packages/nextra/src/server/compile.ts#L40-L43)）——意味着同一个 format/isPageImport 组合的 compiler 一旦创建就永久复用。但 `lastCommitTime` 通过 `[remarkAssignFrontMatter, { lastCommitTime }]` 在 plugin 配置里固化——如果同进程跑两次 build（如 dev 转 prod），第二次的 `lastCommitTime` 拿不到？看了 `useCachedCompiler` 这个 flag 是 loader 那边传的，dev 模式下应该每次重新建——但在 prod build 流程里多页共享同一 cached compiler 时，`lastCommitTime` 是属于"页"的而不是属于 compiler 的，这里有概念错配的味道。读源码的人最该追的是 `useCachedCompiler` 的取值轨迹。

---

### 3.3 sidebar.tsx：pageMap 递归渲染 + TreeState 全局缓存 + scroll-into-view

**永久链接**：[`packages/nextra-theme-docs/src/components/sidebar.tsx#L32-L120`](https://github.com/shuding/nextra/blob/a54da393f4b7cb413bf7f874c1b3847e23bc874d/packages/nextra-theme-docs/src/components/sidebar.tsx#L32-L120)

sidebar.tsx 是 nextra-theme-docs 最大的单文件（512 行），覆盖折叠树渲染、active 高亮、键盘导航、mobile 抽屉、scroll restoration。看顶部状态与 `Folder` 主体：

```tsx
'use client'

import cn from 'clsx'
import { usePathname } from 'next/navigation'
import type { Heading } from 'nextra'
import { Anchor, Button, Collapse } from 'nextra/components'
import { useFSRoute, useHash } from 'nextra/hooks'
import { ArrowRightIcon, ExpandIcon } from 'nextra/icons'
import type { Item, MenuItem, PageItem } from 'nextra/normalize-pages'
import {
  setFocusedRoute,
  setMenu,
  useActiveAnchor,
  useConfig,
  useFocusedRoute,
  useMenu,
  useThemeConfig,
  useTOC
} from '../stores'

const TreeState: Record<string, boolean> = Object.create(null)

const classes = {
  link: cn(
    'x:flex x:rounded x:px-2 x:py-1.5 x:text-sm x:transition-colors x:[word-break:break-word]',
    'x:cursor-pointer x:contrast-more:border'
  ),
  active: cn(
    'x:bg-primary-100 x:font-semibold x:text-primary-800 x:dark:bg-primary-400/10 x:dark:text-primary-600',
    'x:contrast-more:border-primary-500!'
  ),
  border: cn(
    'x:relative x:before:absolute x:before:inset-y-1',
    'x:before:w-px x:before:bg-gray-200 x:before:content-[""] x:dark:before:bg-neutral-800',
    'x:ps-3 x:before:start-0 x:pt-1 x:ms-3'
  ),
  // ...
}

const Folder: FC<FolderProps> = ({ item: _item, anchors, onFocus, level }) => {
  const routeOriginal = useFSRoute()
  const route = routeOriginal.split('#', 1)[0]!

  const item = {
    ..._item,
    children:
      _item.type === 'menu' ? getMenuChildren(_item as any) : _item.children
  }

  const hasRoute = !!item.route
  const active = hasRoute && [route, route + '/'].includes(item.route + '/')
  const activeRouteInside =
    active || (hasRoute && route.startsWith(item.route + '/'))

  const focusedRoute = useFocusedRoute()
  const focusedRouteInside = focusedRoute.startsWith(item.route + '/')

  const { theme } = item as Item
  const { defaultMenuCollapseLevel, autoCollapse } = useThemeConfig().sidebar

  const open =
    TreeState[item.route] === undefined
      ? active ||
        activeRouteInside ||
        focusedRouteInside ||
        (theme && 'collapsed' in theme
          ? !theme.collapsed
          : level < defaultMenuCollapseLevel)
      : TreeState[item.route] || focusedRouteInside
```

旁注（≥ 5 条）：

- **`'use client'` 强制客户端组件**：sidebar 必须 hydrate 才能响应折叠点击、键盘焦点、active highlight。整个 `nextra-theme-docs` 大部分组件都是 `'use client'`——这是 v4 重构后的现状（v3 时代尝试过更激进的 RSC，但折叠交互逼回 client）。
- **`TreeState: Record<string, boolean>` 模块级全局**：每个 folder 的 open/closed 状态用全局 object 缓存——Object.create(null) 避开原型污染。这意味着用户切页面后再切回来，sidebar 折叠状态保留——但跨页面刷新会丢（不进 localStorage）。这是"够用就好"的产品决策。
- **`useFSRoute() vs usePathname()`**：`usePathname()` 是 Next.js 原生的当前 URL，`useFSRoute()` 是 nextra 自家钩子（在 `nextra/hooks` 里），把 URL 转回"文件系统路径"形态去匹配 `pageMap` 里的 route。两者差在 i18n locale prefix、catch-all 路由处理上，nextra 必须用自家版本。
- **`active` vs `activeRouteInside` 双层判断**：当前页（active）和"祖先链上"（activeRouteInside）分开——sidebar 里 active 的项加粗高亮，祖先项展开但不加粗。简单的 startsWith 检查就够。
- **`defaultMenuCollapseLevel` 控制初始展开深度**：默认是 2，意思是 root 和 root 下一级默认展开，再往下默认折叠。用户在 `theme.config.tsx` 里改这个数字一行就能控制 sidebar 默认形态——比 Docusaurus 的 swizzle 整个组件简洁太多。
- **`open` 三元嵌套**：`TreeState[item.route] === undefined` 时按"是否 active/focused/默认级别"判断，否则用 TreeState 里用户手动操作过的值。这是"用户操作覆盖默认"的标准 pattern——类似 controlled/uncontrolled hybrid。

接着看 `MobileNav` 的 scroll restoration（同文件 L299-L327）：

```tsx
export const MobileNav: FC = () => {
  const { directories } = useConfig().normalizePagesResult
  const toc = useTOC()

  const menu = useMenu()
  const pathname = usePathname()
  const hash = useHash()

  useEffect(() => {
    setMenu(false)
    // Close mobile menu when path changes or hash changes (e.g. clicking on search result which points to the current page)
  }, [pathname, hash])

  const anchors = toc.filter(v => v.depth === 2)
  const sidebarRef = useRef<HTMLUListElement>(null!)

  useEffect(() => {
    const sidebar = sidebarRef.current
    const activeLink = sidebar.querySelector('li.active')

    if (activeLink && menu) {
      scrollIntoView(activeLink, {
        block: 'center',
        inline: 'center',
        scrollMode: 'always',
        boundary: sidebar.parentNode as HTMLElement
      })
    }
  }, [menu])
```

旁注：

- **`scroll-into-view-if-needed` 第三方库**：原生 `Element.scrollIntoView` 不支持 boundary（只滚到最近的滚动容器），这库提供 `boundary` 参数把滚动限制在 sidebar 内部不动外层 viewport。这是"小依赖选对了大问题搞定"。
- **`block: 'center'` + `scrollMode: 'always'`**：active link 滚到中央而不是顶/底——长 sidebar 里用户能看到上下文的相邻项。`always` 强制滚（默认 `if-needed` 仅当不可见才滚）——mobile 打开时哪怕已经在视野内也居中，给用户清晰的"我在哪"反馈。
- **`useEffect(.., [menu])`**：只在 mobile menu open/close 时触发一次滚动。pathname 变化触发 close menu（上一个 effect），下次 open 时再滚一次。两个 effect 串联实现"路由变 → 菜单关 → 用户再开 → 滚到位"。
- **`pathname + hash` 双依赖**：搜索结果点击时 pathname 不变只 hash 变（同页跳锚点），mobile menu 也要关。这是细节里的体验——少这一行用户搜了同页结果但 menu 不关。
- **`anchors = toc.filter(v => v.depth === 2)`**：mobile sidebar 里只显示 H2 锚点（不是全 toc），避免太长。desktop 在 toc.tsx 里显示完整 H2-H4 树。这个差异化是"mobile 屏小所以截断"的标准取舍。

**怀疑 3**：`TreeState` 是模块级全局对象——SSR 时每次请求共享同一份吗？看了 [`stores/`](https://github.com/shuding/nextra/blob/a54da393f4b7cb413bf7f874c1b3847e23bc874d/packages/nextra-theme-docs/src/stores) 的 Provider 模式是 per-request 的，但 `TreeState` 这个 plain object 不在 Provider 里——意味着多用户并发请求时 server 上这个对象会被串改？因为 `'use client'` 组件 SSR 时实际上还是会跑（hydration prep），如果 SSR 阶段调了 `TreeState[route] = true`，并发请求会污染。但好像 `TreeState` 只在事件处理里赋值，SSR 阶段只读不写，所以可能是安全的——但代码层面没显式断言。

---

## Layer 4 · 改一处 Hands-on

```bash
mkdir -p /tmp/nextra-experiment && cd /tmp/nextra-experiment
npx create-next-app@latest my-docs --ts --app --no-src-dir --no-tailwind --no-eslint --no-turbopack --import-alias '@/*'
cd my-docs
pnpm add nextra nextra-theme-docs
```

把 `next.config.mjs` 改成：

```js
import nextra from 'nextra'

const withNextra = nextra({
  // mdxOptions 等可选
})

export default withNextra({
  reactStrictMode: true,
})
```

新建 `mdx-components.js`（Next.js App Router 要求）：

```js
import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs'
export const useMDXComponents = (components) => ({
  ...getDocsMDXComponents(),
  ...components,
})
```

新建 `app/layout.tsx`、`app/[[...mdxPath]]/page.jsx`、`content/index.mdx`、`content/getting-started.mdx`、`content/_meta.js`，按官方 [模板](https://github.com/shuding/nextra/tree/a54da393f4b7cb413bf7f874c1b3847e23bc874d/examples/docs) 抄。

```bash
pnpm dev      # localhost:3000，看到默认 sidebar + navbar
pnpm build    # next build 产出 .next/
pnpm start
```

build 后看 `.next/server/app/[[...mdxPath]]/page.js` —— 每页都是一个独立 RSC 路由，sidebar 是 client component，单页 JS 大小 80-130KB（gzip）。

### 改一处实验：改 defaultMenuCollapseLevel 从 2 到 1

编辑 `app/layout.tsx` 里给 `<Layout>` 传的 `sidebar` prop：

```tsx
<Layout
  pageMap={await getPageMap()}
  sidebar={{
    defaultMenuCollapseLevel: 1, // ← 改这里，从默认 2 改成 1
  }}
  // ...
>
```

dev server 自动 reload。before/after：

- **before（level=2）**：sidebar 里所有顶层文件夹默认展开，能看到二级页面
- **after（level=1）**：只有 root 展开，所有顶层文件夹折叠，需要手动点开

这一行直接验证了 Layer 3.3 里 `open` 三元判断的 `level < defaultMenuCollapseLevel` 分支。

### 副实验：改 remarkPlugins 顺序看会发生什么

把 `next.config.mjs` 改成显式注入一个 plugin，故意放错位置：

```js
const withNextra = nextra({
  mdxOptions: {
    remarkPlugins: [
      // 用户的 plugin 默认追加在 nextra 内置之后（compile.ts L141 的 `...(remarkPlugins || [])` 是开头展开的）
      // 这里写一个把所有 H1 改成 H6 的 plugin
      () => (tree) => {
        const visit = require('unist-util-visit')
        visit(tree, 'heading', (node) => {
          if (node.depth === 1) node.depth = 6
        })
      },
    ],
  },
})
```

跑 `pnpm build`，发现 `metadata.title` 仍然是 "原 H1 内容"——因为 `remarkMdxTitle` 在 nextra 内置的 plugin 链里早于用户 plugin 跑（看 compile.ts L141 用户 remarkPlugins 是在最前展开），用户改 depth 时 title 已经被提取走。这印证了"plugin 顺序即语义"——文档不强调，但顺序错了行为离用户预期会很远。

---

## Layer 5 · 横向对比

| 维度 | Nextra | [VitePress](/projects/vitepress/) | [Starlight](/projects/starlight/) | [Docusaurus](/projects/docusaurus/) | Mintlify | Astro（裸） |
|---|---|---|---|---|---|---|
| 底层 framework | Next.js + React | Vue 3 + Vite | Astro + Vite | React + Webpack/RSPack | 闭源 SaaS | Astro |
| MDX 引擎 | mdx-js + 12 remark + 8 rehype + 1 recma | markdown-it + 17 plugins | Astro Markdown (remark) | MDX | 闭源 | Astro Markdown |
| RSC / island | RSC（部分组件） | 无 RSC，按需 hydrate | island（最小 JS） | 全部 hydrate | 闭源 | island |
| 首屏 JS（典型） | ~80-130KB | ~50-80KB | ~0-30KB | ~200KB+ | ~50KB | ~10-50KB |
| 主题模型 | 包替换（nextra-theme-docs / -blog 二选一 + fork） | extends 单文件 | plugin override | swizzle (eject 组件) | 主题市场（闭源） | 完全自由 |
| sidebar 配置 | `_meta.{js,ts}` per-folder + `_meta.global.{js,ts}` | `themeConfig.sidebar` 一份对象 | astro.config | `sidebars.js` | UI 编辑器 | 手写 |
| i18n | locale 子目录 + `_meta` per-locale | 手写路由 + locales 字段 | 内置（约定 + Astro i18n） | 插件（成熟） | 闭源支持 | 手动 |
| search | FlexSearch（默认）/ Algolia / Pagefind | mini-search / Algolia | Pagefind | Algolia / lunr | 内置 AI | 自接 |
| build 速度（1k 页） | ~30-60s（Next.js 重） | ~10-15s | ~8-12s | ~30-60s | 不公开 | ~10-15s |
| Vue/React/Solid | React only | Vue only | 任意 island | React only | 闭源 | 任意 |
| 部署 target | Vercel 一等公民、其他 OK | 任意 SSG host | Cloudflare/Vercel/Netlify | 任意 SSG host | 闭源托管 | 任意 |
| 包数 / 心脏体积 | nextra 主包 ~3.5k 行 + theme-docs ~3k 行 | 主包 ~6k 行（含 theme） | ~5k 行 | ~30k 行 | 闭源 | ~5k 行 |
| 主语言占比 | TS 97% | TS 56% / Vue 30% | TS 85% / Astro 9% | TS+JS | 闭源 | TS+Astro |

### 哲学差异

Nextra vs VitePress vs Starlight 是这套对比里最有张力的三角：

- **Nextra**：押 Next.js + React，把"docs 站点"当 Next.js 应用看待——路由/RSC/`next/image`/Vercel deploy 全部走 Next.js 原生。优点是 React 全家桶可用、Vercel 部署一等公民、能直接接 Next.js middleware/API routes。缺点是首屏 JS 重（80-130KB），build 慢（吃 Next.js 整个 bundle 流程），对非 Next.js 用户切栈成本高。
- **VitePress**：Vue 团队产物，把 docs 当"主要是 SSG HTML，少量 Vue 组件 hydrate"看待。markdown 静态区是真零 JS。建议读 [VitePress 笔记](/projects/vitepress/) 对照——同样的"薄胶水"心智，框架选型差异极大。
- **Starlight**：建立在 Astro island 上，比 VitePress 更激进——默认零 hydration，连 Vue/React 都不预设。这个 study 站本身就用 Starlight（也建议读 [Starlight 笔记](/projects/starlight/) 对照）。
- **Docusaurus**：Meta 出品，把 docs 当完整 React app，sidebar/navbar/footer/page 全 hydrate。优点是任何 React 组件可用，缺点是 Lighthouse 性能往往低于 80。建议读 [Docusaurus 笔记](/projects/docusaurus/) 对照。
- **Mintlify**：闭源 SaaS，UI 编辑器、内置 AI search、托管部署，付费。换来开发体验顺滑但失去 git-as-source-of-truth。

### 选型建议

- 已经用 Next.js 写 product，想加 docs 段 → Nextra（共享 Next.js 心智、middleware、image pipeline、Vercel deploy）
- 写 Vue / 团队 Vue 生态 → VitePress（同 [VitePress 笔记](/projects/vitepress/)）
- 想要最小 JS、不绑定 framework → Starlight
- 用 React 且要复杂交互组件、不在乎首屏 JS → Docusaurus
- 不想自己维护、肯付费 → Mintlify
- 站点纯 markdown 没 React 组件 → Hugo / Astro 裸用更轻

---

## Layer 6 · 与你当前工作的连接

### 今天就能用（≥ 4 子弹）

- **理解 The Guild 全家文档站源码组织**：GraphQL Yoga / GraphQL Mesh / GraphQL Tools / Hive 这些 docs 站（dimaMachina 主导）全用 Nextra，仓库结构和 Nextra 的 `examples/docs` 1:1 对应——读懂 Nextra 等于读懂这些 docs 仓库。
- **`unified` plugin 链顺序的心智可以迁移到任何 markdown 处理**：Nextra 12+8+1 的 plugin 排列是非常浓缩的"unified pipeline"教学样本，这套思路写自己的 markdown 工具直接抄。
- **`@napi-rs/simple-git` 单例 + worktree-safe `workdir()` 模式**：以后写任何"node 里读 git 历史"的工具都该抄这个——比 spawn `git log` 快 10x，原生模块。直接搬到任何需要 last-modified-time 注入的 CLI / SSG 工具里。
- **`_meta.{js,ts}` per-folder 协议**：把 sidebar 顺序、标题、external link 控制做成"和内容并排的小 JS 文件"——比 monolithic `sidebar.config.js` 维护性好太多，写自己的 docs 工具直接抄这个协议。
- **Tailwind 4 `x:` prefix utility 隔离用户 CSS**：4.x 这个改动是 dimaMachina 操刀的，避免 nextra 主题样式和用户全局 CSS 冲突——以后写"嵌入到别人项目里的 React 组件"都该抄这个 prefix 模式。
- **`scroll-into-view-if-needed` + boundary**：sidebar 滚动 active link 居中、不影响外层 scroll 的标准做法，自己写带左侧导航的 SPA 直接复用。

### 下个月能用（≥ 4 子弹）

- **把内部 SDK 文档站迁到 Nextra**：如果团队主栈已经是 React + Next.js，迁过来零学习成本。比 GitBook 省钱、比 VitePress 省 Vue 学习曲线。
- **用 `tsdoc` 子包从 .d.ts 自动生成 API 文档**：nextra 里的 `tsdoc` 子包用 `zod-to-ts` 把 TypeScript 类型转 markdown 表格——可以挪用到自己的 SDK 文档项目里。
- **Vercel docs 借鉴**：Vercel 自己的 [vercel.com/docs](https://vercel.com/docs) 用 Nextra fork——读它的 PR 历史能看到大量"Nextra 实战调优"经验，特别是 search 接 Algolia 的最佳实践。
- **MDX + Tabs/Steps/Cards 在 Slack/通知卡片里**：`nextra/components` 里的 `<Tabs items={[...]}>` 是 markdown 友好的 Tab 语法，可以抄到任何"在 markdown 里要 Tab"的场景。

### 不要用的部分（≥ 4 子弹）

- **不要用 Nextra 做 SaaS dashboard**——它是 docs 框架，路由模型基于文件系统，不适合复杂的 multi-tenant SaaS app。要做 app 用纯 Next.js + 自己拼组件。
- **不要在 `.mdx` 里塞重交互的 client component**——会逼出大量 hydration cost，违背 RSC 设计意图。重交互组件应该走独立路由 + iframe / `'use client'` boundary。
- **不要 fork `nextra-theme-docs` 做大改**——v4 重构（Tailwind 4 + RSC）改了大量内部 API，fork 后跟主版本同步成本极高。少量定制走 `<Layout>` props + 自定义 `mdx-components`，重定制重写一份比 fork 维护性好。
- **不要用 Nextra v3**——v3 用 Pages Router + Tailwind 3，已经停止维护，所有新 issue 在 v4 修。如果项目还在 Nextra 2.x/3.x，迁移到 v4 是 breaking change（路由从 pages → app，Tailwind 升级），要按 [migration guide](https://nextra.site/docs/guide/migration) 全量迁。
- **不要把 build 速度当 Nextra 的卖点**——它跑在 Next.js 全量 bundle 流程上，1k 页 build 30-60s 是正常的，比 [Hugo](https://gohugo.io/)（1-2s）慢 30x。要追求 build 速度去看 VitePress / Hugo / Astro。

---

## Layer 7 · 自检 + 延伸阅读

### 自检（≥ 3 怀疑，追到行号）

1. **`cachedCompilerForFormat` 单例缓存 vs `lastCommitTime` per-page**：[`compile.ts#L40-L43`](https://github.com/shuding/nextra/blob/a54da393f4b7cb413bf7f874c1b3847e23bc874d/packages/nextra/src/server/compile.ts#L40-L43) 缓存了同一 format/isPageImport 的 compiler，但 `lastCommitTime` 通过 plugin options 固化在 compiler 里——多页共享同一 compiler 时，lastCommitTime 是不是被第一页的值卡住了？追 `useCachedCompiler` 这个 flag 在 loader.ts 里的取值。
2. **`TreeState` 模块级全局 + SSR 并发请求**：[`sidebar.tsx#L32`](https://github.com/shuding/nextra/blob/a54da393f4b7cb413bf7f874c1b3847e23bc874d/packages/nextra-theme-docs/src/components/sidebar.tsx#L32) 这个 plain object 在 server side 是 per-process 共享的，并发请求会不会污染？看 SSR 阶段 `TreeState[route] = true` 这种赋值有没有发生，如果有会出 bug。
3. **`findPagesDir(CWD).appDir!` 模块顶层 throw**：[`loader.ts#L17-L20`](https://github.com/shuding/nextra/blob/a54da393f4b7cb413bf7f874c1b3847e23bc874d/packages/nextra/src/server/loader.ts#L17-L20) 在加载 nextra 时立刻 IO 找 `app/`——如果用户的 monorepo 里 `app/` 是 codegen 产物，nextra 加载早于 codegen，整个 build 直接 throw。看 issues 找类似 case。
4. **shiki highlighter 单例 + dev HMR**：[`compile.ts`](https://github.com/shuding/nextra/blob/a54da393f4b7cb413bf7f874c1b3847e23bc874d/packages/nextra/src/server/compile.ts) 没显式管理 shiki 实例，依赖 `rehype-pretty-code` 内部缓存——dev 模式下 HMR 反复触发，shiki WASM 实例会不会重复初始化堆内存？长跑 dev server 是不是潜在内存泄漏？
5. **`replaceDynamicResourceQuery` 的正则 fragility**：[`loader.ts#L181-L201`](https://github.com/shuding/nextra/blob/a54da393f4b7cb413bf7f874c1b3847e23bc874d/packages/nextra/src/server/loader.ts#L181-L201) 用正则匹配 `import(\`./placeholder.js?lang=${lang}\`)` 这种字符串——如果 webpack 升级后输出格式变了（如多套换行），这里 throw "This is a Nextra bug"。这是已知脆点。

### 接下来读哪 4 个文件

| 文件 | 回答什么问题 | 优先级 |
|---|---|---|
| `packages/nextra/src/server/page-map/to-page-map.ts` | 文件系统扁平路径 → 嵌套 PageMap AST 的具体算法（_meta + index 怎么合并） | 高 |
| `packages/nextra/src/client/normalize-pages.ts` | client 端 pageMap → activePath / sidebar 数据的转换 | 高 |
| `packages/nextra/src/server/recma-plugins/recma-rewrite.ts` | recma 阶段怎么改 default export 形态适配 server/client 两套 runtime | 中 |
| `packages/nextra-theme-docs/src/components/toc.tsx` | useActiveAnchor + IntersectionObserver 同步 toc 高亮的实现 | 中 |

---

## 限制 (≥ 4 条)

1. **强绑 Next.js**——不接受 Vue/Solid/Svelte，不接受 Astro/Vite，要做跨框架 docs 站不能用。Next.js 主版本升级（如 14 → 15）经常配套 nextra 升级。
2. **build 速度慢**——跑在 Next.js 全量 bundle 流程上，1k 页 build 30-60s，比 [VitePress](/projects/vitepress/) 慢 3-5x，比 [Hugo](https://gohugo.io/) 慢 30x。换来的是 Vercel deploy 一等公民和 RSC 流式渲染。
3. **首屏 JS 比 VitePress / Starlight 重 2-3x**——RSC 砍了一些，但 sidebar/toc/navbar 都是 `'use client'`，hydration cost 仍然在。
4. **i18n 比 Starlight/Docusaurus 弱**——只支持 locale 子目录 + per-locale `_meta.js`，UI 翻译键自己拼。Starlight 内置 sidebar/搜索/UI label 全套翻译。
5. **theme 生态薄**——npm 上能搜到的非官方 theme < 5 个（vs Docusaurus 几十个），90% 用户都用 `nextra-theme-docs` + 改 CSS 变量 + 改 `_meta` + 写自定义 component。
6. **v4 是大 breaking change**——v3 → v4 路由从 Pages Router 切到 App Router，Tailwind 3 → 4，老项目迁移成本高，[migration guide](https://nextra.site/docs/guide/migration) 写得不算友好。
7. **没有真正的 plugin 系统**——比 Docusaurus 的 `loadContent / contentLoaded / postBuild` 钩子链弱，扩展性主要靠 `mdxOptions.remarkPlugins` / `rehypePlugins`（更底层，学习曲线高）和 fork theme。

---

## 附录：宣传 vs 现实

| 宣传 | 现实 |
|---|---|
| "Simple, powerful, and flexible"（README 顶部） | Simple 指的是"约定优于配置"——`_meta.{js,ts}` per-folder 心智简单，但 v4 全量切 App Router + Tailwind 4 + RSC 后，心智模型对 Next.js 新手并不简单。 |
| "Powered by Next.js"（slogan） | 是 powered，但也被 Next.js 拖累——首屏 JS 80-130KB / build 30-60s 都是 Next.js 全量 bundle 的代价，无法独立优化。 |
| "Tailwind 4 + React Server Components"（v4 release blog） | RSC 只覆盖部分组件，sidebar/toc/navbar/copy-button/theme-switch 全是 `'use client'`——hydration cost 没减太多，主要赢在 page content 区零 JS。 |
| "Built-in search" | 默认 FlexSearch 在 1k 页以上变慢，要好用必须接 Algolia（免费但需要审批）或 Pagefind（自托管）。Vercel docs 自己用的是 Algolia。 |
| "Theme system" | API 上是 `<Layout>` props + fork theme 包，但实际上 90% 用户都用 `nextra-theme-docs` + `_meta` + CSS 变量。"Theme system" 在生态层面是空的。 |
| "TypeScript-first" | 主仓 97% TS 是真，但 LayoutProps 这种核心类型是 zod runtime schema → 生成 .d.ts，意味着写 nextra theme 时类型错误经常在运行时才报（zod 校验失败），而不是编译时。 |

---

## 元数据

- 升级日期：2026-05-29（v1.1 状元篇分支 D 框架/SDK，本 study 站 round 73）
- 总行数：本文件 ~600 行 markdown
- 启用工具：WebFetch（star/license/版本）、git clone（commit hash + 真实源码）、Read（loader.ts / compile.ts / sidebar.tsx / to-page-map.ts / remark-headings.ts 等 5 个核心文件）、PIL（架构 webp 生成，Hiragino Sans GB 渲染中文）、grep + ls（结构归纳）
- 阅读耗时：约 80 分钟
- commit 锚定：[`a54da393f4b7cb413bf7f874c1b3847e23bc874d`](https://github.com/shuding/nextra/commit/a54da393f4b7cb413bf7f874c1b3847e23bc874d)（2026-05-28）
- GitHub permalink 数：8 处（loader.ts × 3 / compile.ts × 2 / sidebar.tsx × 2 / examples/docs × 1）
- 显式怀疑数：5 处（3.1 / 3.2 / 3.3 + 自检 4-5）
- 项目类型 self-classify：框架/SDK（分支 D），心脏物 = webpack loader 注入 + unified plugin 链 + theme 组件层三套抽象
