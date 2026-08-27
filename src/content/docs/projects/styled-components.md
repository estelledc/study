---
title: styled-components — 用标签模板把 CSS 写进 React 组件的 CSS-in-JS 库
来源: 'https://github.com/styled-components/styled-components'
日期: 2026-05-30
分类: projects / 前端样式
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/styled-components/styled-components
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 159302389c696a7952aaed31d840b06b8aa6d677
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.5.3
---

## 是什么

styled-components 是一个 React CSS-in-JS 库。日常类比：后厨给每道菜贴两张号——一张是菜名牌（`componentId`），一张是今天这份酱汁的配方号（动态 class）。你用标签模板写 CSS，库负责算号、注入 `<style>`，DOM 只拿到 className。

你写：

```jsx
import styled from 'styled-components'

const Button = styled.button`
  background: ${p => (p.$primary ? '#0070f3' : '#fff')};
`
```

固定 6.5.3 把 `styled.div` 这类快捷方式预挂到 `baseStyled` 上；模板先经 `css()` 展平，再由 `ComponentStyle.generateAndInjectStyles()` 用 stylis 编译并写入 StyleSheet。

## 为什么重要

不理解它，下面这些事都没法解释：

- 为什么 className 常常是两段：稳定 `componentId` 加上动态 hash
- 为什么 `$primary` 不会落到 DOM，而 `primary` 可能触发未知 prop 警告
- 为什么旧文说“RSC 必须 `'use client'`”，但 6.5.3 源码里有独立的 RSC 注入路径
- 为什么没装 babel 插件也能生成 `componentId`，却仍可能和 SSR 顺序打架

## 核心要点

主链可以拆成五步：

1. **构造**：`styled.button\`...\`` 调用 `constructWithOptions` → `createStyledComponent`，把模板交给 `css()` 展平。
2. **编号**：默认 `componentId` 是 `escape(displayName) + '-' + generateComponentId(SC_VERSION + name + 计数)`；djb2 哈希再转成 base-52 字母名。`withConfig({ componentId })` 可以钉死。
3. **执行**：渲染时 `resolveContext` 合并 `.attrs()`、props 和 theme；`$` 前缀与 `as` 不会转发给 DOM。
4. **注入**：对展平后的 CSS 再做 `phash(baseHash, stylis.hash, css)`，得到动态名并 `insertRules`。同一 CSS 字符串走 `dynamicNameCache`。
5. **环境分叉**：浏览器走 CSSOM / 文本插入；`ServerStyleSheet` 收集后输出 `<style data-styled>`；`IS_RSC`（`React.createContext === undefined`）则在组件旁内联 `<style>`，并用 `React.cache` 去重。

## 实践示例

### 案例 1：用 transient prop 切换按钮

```jsx
import styled from 'styled-components'

const Button = styled.button`
  background: ${p => (p.$primary ? '#0070f3' : '#eee')};
  color: ${p => (p.$primary ? '#fff' : '#111')};
`

<Button $primary>Save</Button>
```

`$primary` 只参与样式函数，不会成为 DOM 属性。写成 `primary` 且目标是普通 HTML 标签时，开发态会警告未知 prop。

### 案例 2：SSR 抽出 critical CSS

```jsx
import { ServerStyleSheet } from 'styled-components'

const sheet = new ServerStyleSheet()
const html = renderToString(sheet.collectStyles(<App />))
const tags = sheet.getStyleTags()
sheet.seal()
```

`collectStyles` 把子树包进 `StyleSheetManager`。`seal()` 之后不能再收集；流式 SSR 走 `interleaveWithNodeStream`。

### 案例 3：RSC 里 ThemeProvider 不会传 theme

```jsx
<ThemeProvider theme={{ bg: '#000' }}>
  <Box />
</ThemeProvider>
```

固定实现在 `IS_RSC` 下把 `ThemeProvider` 变成透传 children 的 no-op，`useTheme()` 也跳过 `useContext`。主题只在存在 `createContext` 的客户端 / 传统 SSR 路径生效。

## 踩过的坑

1. **把 babel 插件当成运行时身份来源**：6.5.3 默认用 displayName + 创建顺序 + `SC_VERSION` 生成 `componentId`。插件可以钉 ID，但不是运行时必经步骤。
2. **在 render 里写 `styled.div`**：开发态 `checkDynamicCreation` 会警告；每次新建组件会打乱 cache 与 SSR 顺序。
3. **把 2025 年“维护期、不再发版”外推到 6.5.3**：GitHub annotated tag `styled-components@6.5.3` 落在 2026-08-15，同仓还有 7.0 预发布。是否适合新项目要另看 RSC / 编译期方案，不能用过期维护声明当证据。
4. **以为 RSC 路径也有 Theme Context**：源码明确在 `IS_RSC` 下关掉 context；FAQ 写的是 React 19+ 自动检测，不是“必须 `'use client'`”。

## 适用 vs 不适用场景

**适用**：

- 已有 `styled.div` 代码、需要 props / attrs / 主题驱动样式的 React 18 客户端树
- Pages Router 或自定义 SSR，可用 `ServerStyleSheet`
- 需要 `$` transient props 把样式开关和 DOM 属性分开

**不适用**：

- 把 ThemeProvider 当 RSC 主题通道
- 需要编译期原子 CSS、零运行时注入的新栈
- 不能接受 peer `react >= 16.8.0`、`stylis@4.3.6` 与 `@emotion/is-prop-valid@1.4.0`

## 固定版本边界

- 本文绑定 `styled-components/styled-components@159302389c...`，annotated tag 与 package 均为 `6.5.3`。
- npm `styled-components@6.5.3` 版本一致，但不暴露可比的 `gitHead`。
- `engines.node` 为 `>= 16`；`peerDependencies.react` 为 `>= 16.8.0`。
- 本文未安装依赖、运行上游测试、测量 bundle / SSR / RSC，状态保持 `UNVERIFIED`。

## 学到什么

1. **稳定 ID 和动态 class 是两件事**——前者标识组件，后者标识这份 CSS 文本。
2. **环境检测改写了旧 RSC 故事**——`createContext` 缺失时走内联 style，而不是一律 `'use client'`。
3. **主题是 Context 功能，不是样式函数语法糖**——RSC 下 Provider 被掏空。
4. **维护期叙事必须跟 tag 对表**——2026-08 的 6.5.3 不能沿用 2025 年停更印象。

## 应用型自测

1. 不装 babel 插件时，6.5.3 还会生成 `componentId` 吗？
2. RSC 树里的 `ThemeProvider` 能否把 `theme` 交给 styled 插值？
3. `<Button $primary />` 的 `$primary` 会不会出现在 HTML 属性里？

检查点：

1. 会。运行时用 displayName、计数和 `SC_VERSION` 生成；插件只是可选钉 ID。
2. 不能。`IS_RSC` 下 Provider 是 no-op。
3. 不会；`$` 前缀在转发给 DOM 前被丢掉。

## 延伸阅读

- 文档：[styled-components.com](https://styled-components.com)
- 固定源码：[styled-components/styled-components](https://github.com/styled-components/styled-components) —— 本文绑定提交 `159302389c696a7952aaed31d840b06b8aa6d677`
- [[emotion]] —— 同赛道运行时 CSS-in-JS，cache / css prop / SSR API 不同
- [[vanilla-extract]] —— 编译期对照
- [[stylex]] —— 原子编译期对照

## 关联

- [[emotion]] —— 同年代竞品；注入与 SSR 合同不同
- [[vanilla-extract]] —— 零运行时、RSC 友好的编译期方案
- [[tailwind]] —— atomic utility，和 CSS-in-JS 解法相反
- [[stylex]] —— Meta 的编译期原子 CSS
- [[react]] —— peer 宿主

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[emotion]] —— Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
