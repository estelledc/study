---
title: Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
来源: 'https://github.com/emotion-js/emotion'
日期: 2026-05-30
分类: projects
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/emotion-js/emotion
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3c19ce5997f73960679e546af47801205631dfde
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: '@emotion/react@11.14.0'
---

## 是什么

Emotion 是一套把 CSS 写进 JS、再生成稳定 className 的运行时库。日常类比：共享调料柜——同一配方永远对应同一格编号；`css` prop 是把调料直接洒在盘子上，不必先开一道“套餐组件”。

你写：

```jsx
/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react'

const red = css`color: red;`
<div css={red}>hello</div>
```

`css()` 只调用 `@emotion/serialize` 的 `serializeStyles`。真正贴 class、插 `<style>` 的是 `Emotion` 元素：它用 cache 里的 `key` 拼出 `css-xxxx`，再经 `useInsertionEffectAlwaysWithSyncFallback` 调用 `insertStyles`。

## 为什么重要

不理解 Emotion，下面这些事都没法解释：

- 为什么满屏都是 `css-1k2f9q` 这种 `key-hash` 名
- 为什么 `@emotion/server` 默认导出并不自动对准 `@emotion/react` 的 cache
- 为什么没配 jsx 运行时，`css={...}` 会变成无效 DOM 属性
- 为什么 npm 上 `@emotion/styled@11.14.1` 不能当成这份 11.14.0 快照

## 核心要点

管线可以拆成四步：

1. **序列化**：模板或对象被 `serializeStyles` 拼成标准 CSS 文本；对象键会 hyphenate，数字在非 unitless 属性上补 `px`。
2. **哈希**：`@emotion/hash` 对文本做 MurmurHash2，再转 36 进制。`label:` 规则会追加到 name 后面。
3. **cache**：浏览器默认 `createCache({ key: 'css' })`。开发态缺少 `key` 会直接抛错；同 key 的多个 cache 会抢 style 节点。
4. **插入**：`registerStyles` 记入 `cache.registered`；浏览器走 insertion effect，服务端把规则收成 `<style data-emotion>`。`createEmotionServer(cache)` 会把 `cache.compat = true`，否则 critical CSS 抽不齐。

## 实践示例

### 案例 1：styled API 的 props 变体

```jsx
import styled from '@emotion/styled'

const Button = styled.button`
  background: ${p => (p.primary ? '#0070f3' : '#eee')};
`
```

`createStyled` 把模板拆进 `__emotion_styles`，渲染时再 `serializeStyles(..., cache.registered, mergedProps)`。缺 `theme` 时从 `ThemeContext` 补；默认主题是空对象 `{}`，不是 `undefined`。

### 案例 2：css prop 必须换 jsx 工厂

```jsx
/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react'

<div css={css`border: 1px solid #ddd;`}>card</div>
```

`jsx()` 看到 `css` 才包一层 `Emotion` 内部组件。没有 `jsxImportSource` / babel plugin 时，浏览器会把对象 `toString` 成 `css="[object Object]"`。

### 案例 3：SSR 必须共用同一份 cache

```jsx
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import createEmotionServer from '@emotion/server/create-instance'

const cache = createCache({ key: 'app' })
const { extractCriticalToChunks } = createEmotionServer(cache)
const html = renderToString(
  <CacheProvider value={cache}><App /></CacheProvider>
)
const { styles } = extractCriticalToChunks(html)
```

`@emotion/server` 的默认入口绑的是 `@emotion/css` 的全局 cache。React 树若走 `@emotion/react`，必须 `create-instance` 并传入同一 `cache`。抽取时按 HTML 里的 `${key}-id` 反查 `cache.inserted`。

## 踩过的坑

1. **把默认 server 包当成 React cache**：`extractCriticalToChunks` 只认识传入的那份 cache；用错 cache 会抽出空样式。
2. **css prop 缺运行时**：不报红，只是属性落到 DOM。
3. **把 `@emotion/styled@11.14.1` 外推到本页**：该包的 npm `gitHead` 是更晚的 `49229553...`；本页绑定的是 `@emotion/react@11.14.0` / `@emotion/cache@11.14.0` 共用的 `3c19ce59...`，这里的 styled 仍是 `11.14.0`。
4. **cache key 冲突**：开发态 key 只能是小写字母和 `-`；多个应用共用 `css` 会互相搬 style 节点。

## 适用 vs 不适用场景

**适用**：

- 已有 MUI v5 / Chakra v1 一类建立在 Emotion 上的客户端 React 树
- 需要对象样式、`css` prop 和 styled 三种入口并存
- 能自己接 `CacheProvider` + `@emotion/server/create-instance`

**不适用**：

- 把 `@emotion/server` 默认导出直接套在 `@emotion/react` 树上
- React Server Components 里当零 JS 方案——运行时插入仍要浏览器 / client 边界
- 不能接受 peer `react >= 16.8.0`，以及 cache 依赖的 `stylis@4.2.0`（与 styled-components 6.5.3 的 `stylis@4.3.6` 不是同一锁定）

## 固定版本边界

- 本文绑定 `emotion-js/emotion@3c19ce5997...`。
- 同提交：`@emotion/react@11.14.0`、`@emotion/cache@11.14.0`、`@emotion/styled@11.14.0`、`@emotion/serialize@1.3.3`。
- npm `gitHead` 与 GitHub annotated tag `@emotion/react@11.14.0` / `@emotion/cache@11.14.0` 都解到该提交。
- npm latest `@emotion/styled@11.14.1` 指向另一提交，不能把 11.14.1 的行为写进本页。
- 条件导出区分 browser / edge-light / worker；开发态另有 development 构建。
- 本文未安装依赖、运行上游测试、测 SSR FOUC 或 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **序列化、哈希、插入是三个包**——`serialize` / `hash` / `cache` / `react` 不要混成一个黑盒。
2. **SSR 合同是 cache 身份，不是包名**——server helper 必须拿到渲染时那份 cache。
3. **css prop 是编译器约定**——运行时靠自定义 jsx 工厂，不是 React 内置。
4. **monorepo 包版本可以分叉**——同一仓的 latest 标签不必落在同一提交。

## 应用型自测

1. `import { extractCriticalToChunks } from '@emotion/server'` 默认抽的是哪份 cache？
2. 不写 `jsxImportSource`、也不配 babel plugin，`<div css={obj} />` 会不会自动注入样式？
3. 固定提交里 `@emotion/styled` 的 package 版本是 11.14.1 吗？

检查点：

1. `@emotion/css` 的全局 cache，不是你在 React 树里 `createCache` 的那份。
2. 不会；`css` 会原样落到 DOM。
3. 不是。本提交是 `11.14.0`；`11.14.1` 在更晚的 tag。

## 延伸阅读

- 文档：[emotion.sh/docs/introduction](https://emotion.sh/docs/introduction)
- 固定源码：[emotion-js/emotion](https://github.com/emotion-js/emotion) —— 本文绑定提交 `3c19ce5997f73960679e546af47801205631dfde`
- [[styled-components]] —— 同赛道，ID / RSC / SSR API 不同
- [[stylex]] —— 编译期原子 CSS
- [[vanilla-extract]] —— CSS-in-TS，零运行时

## 关联

- [[styled-components]] —— 标签模板入口相近，cache 与 RSC 边界不同
- [[stylex]] —— 编译期取代运行时注入
- [[tailwind]] —— utility class，不生成运行时 hash
- [[vanilla-extract]] —— 类型安全的编译期对照
- [[react]] —— peer 宿主
- [[next-js]] —— 最容易用错 cache 的 SSR 舞台

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[styled-components]] —— styled-components — 用标签模板把 CSS 写进 React 组件的 CSS-in-JS 库
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
