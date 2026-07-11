---
title: Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
来源: 'https://github.com/emotion-js/emotion'
日期: 2026-05-30
分类: projects
难度: 中级
---

## 是什么

Emotion 是一套**让你在 JS 文件里写 CSS、运行时再生成 className 注入页面**的库。日常类比：像点单时让厨房现配酱料——你说"番茄+蒜+橄榄油"，厨房调好后给你一个唯一编号，下次同样配方就用同个编号，不再重复调。

你写：

```jsx
import { css } from '@emotion/react'

const red = css`color: red; font-size: 14px;`

<div css={red}>hello</div>
```

Emotion 读到这段后，做三件事：把字符串序列化 → 用 hash 算法生成一个短 className（如 `css-1k2f9q`）→ 把规则塞进页面顶端的 `<style>` 标签。组件拿到的就是这个独一份 className，不会和别人撞车。

它有两条路：**runtime**（浏览器现场算）和 **babel plugin**（编译时把静态部分先抽出来），过去十年它和 styled-components 共同撑起 React 圈的"CSS-in-JS"叫法。Material UI v5 / Chakra v1 都把它选作底盘。

## 为什么重要

不理解 Emotion，下面这些事都没法解释：

- 为什么 React 项目里 `<div className="css-xj3k">` 这种乱码 className 满屏都是
- 为什么 MUI v5 不需要全局 CSS 文件，组件却能各自带样式
- 为什么 2024 年大家又在喊"runtime CSS-in-JS 死了"，Tailwind 和 RSC 究竟撼动了什么
- 为什么 `<div css={...}>` 这种语法需要配 babel，不配会出怪事

## 核心要点

Emotion 的注入流水线可以拆成 **三步**：

1. **序列化**：把你写的 `css\`...\`` 模板字符串或对象拼成一段标准 CSS 文本。类比：把口语菜单翻译成厨房标准配方表。

2. **hash + cache**：对配方文本做 hash（默认是 mhash 类的 stable hash），同样输入永远拿到同样的 className。Emotion 内部维护一张 cache，已注入过的就跳过。类比：厨房里那本"配方-编号"对照册，不重复调。

3. **注入 DOM**：第一次见到的 className，就把规则 append 到页面顶部的 `<style>` 标签里；SSR 场景下改成把 critical CSS 抽成字符串拼进 HTML `<head>`，浏览器一打开就有样式，不闪烁。

三步连起来就是 runtime CSS-in-JS 的标准管线，Emotion / styled-components 几乎一样，差别在 cache 策略和 SSR API。

## 实践案例

### 案例 1：用 styled API 写带 props 变体的按钮

```jsx
import styled from '@emotion/styled'

const Button = styled.button`
  padding: 8px 16px;
  background: ${(p) => (p.primary ? '#0070f3' : '#eee')};
  color: ${(p) => (p.primary ? 'white' : 'black')};
`

<Button primary>Save</Button>
<Button>Cancel</Button>
```

**逐部分解释**：

- `styled.button\`...\`` 包了一个 `<button>` 组件，模板内可以读 props
- primary=true 走第一组样式，否则走第二组——本质是两次序列化，两个不同 className
- 渲染出来的 DOM 是 `<button class="css-abc123">`，规则在页面顶部 `<style>` 里

### 案例 2：css prop + 局部样式

```jsx
/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react'

const card = css`
  border: 1px solid #ddd;
  padding: 16px;
  &:hover { border-color: #0070f3; }
`

<div css={card}>card content</div>
```

这种 `css={...}` 写法绕过了 styled 包装，直接给原生标签贴样式。前提：顶部那行 jsx pragma 注释或在 babel 里配 `@emotion/babel-plugin`，否则 `css={}` 会原样掉到 DOM 上变成无效属性。

### 案例 3：SSR critical CSS 抽取

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
// 把 styles 拼进 <head>，浏览器收到 HTML 时第一帧就有样式
```

不抽 critical CSS，浏览器拿到 HTML → React hydrate → 此时才注入样式 → 短暂"无样式闪烁"（FOUC）。

## 踩过的坑

1. **runtime 注入有性能税**：每个组件首次渲染要走"序列化 + hash + 插 `<style>`"，1000 个组件首屏就能拖慢 LCP。babel-plugin 静态化能省一部分，但动态 props 那段省不掉。

2. **SSR critical CSS 配置容易漏**：忘了用 `extractCriticalToChunks` 把 styles 拼进 HTML，页面会闪一下。Next 模板专门处理这件事，跳过这步会被用户投诉"白屏 0.3 秒"。

3. **css prop 缺 babel/jsx pragma**：不配 `@emotion/babel-plugin`、也不写 `/** @jsxImportSource @emotion/react */`，写 `<div css={...}>` 会让浏览器把 css 对象 toString 后塞进 `<div css="[object Object]">`——不报错，样式悄悄丢失。

4. **和 React Server Components 边界冲突**：runtime 注入需要浏览器 DOM API，必须 `'use client'` 才能用。直接在 RSC 文件里 import Emotion 会序列化报错。MUI 6+ 改 pigment-css、Chakra v3 切 Panda CSS，都是为了在 RSC 里活下去。

## 适用 vs 不适用场景

**适用**：

- 已经全身心 React + 中型 SPA，且没在做 RSC：MUI v5 / Chakra v1 / 多数现存企业项目
- 需要按 props 极度动态地切换样式的组件库
- 想用 JS 表达式（变量、循环、条件）写 CSS 的场景

**不适用**：

- 重视首屏 LCP 的 marketing 站、内容站 → 选 Tailwind / vanilla-extract / lightningcss
- React Server Components 项目 → 至少要包一层 `'use client'`，更建议改用编译期方案
- 团队已统一 Tailwind atomic 风格 → 不要混两套世界观
- 微前端里多个子应用都用 Emotion → cache key 不隔离会撞车

## 历史小故事（可跳过）

- **2017 年**：Kye Hohenberger 在 styled-components 已成主流的赛道里发起 Emotion，主打更小的 runtime 和更好的 SSR critical CSS 抽取。
- **2019 年**：v10 重写，引入 `css` prop 和 babel 编译期优化，成为 styled-components 同代竞品里"最像产品"的那个。
- **2021 年**：Material UI v5 把内部 styling 引擎从 JSS 换成 Emotion，Emotion 跟着 MUI 进了大量企业项目。
- **2024 年**：Tailwind atomic CSS 把 runtime CSS-in-JS 的"性能税"暴露在阳光下；React Server Components 又让 runtime 注入在边界上语义模糊。MUI v6 推 pigment-css（编译期），Chakra v3 切 Panda CSS——runtime 路线集体让位。

## 学到什么

1. **CSS-in-JS 是一条具体的技术管线**——不是"概念"，是"序列化 → hash → 注入"三步，搞懂就能看懂任何同类库。
2. **运行时灵活性是有代价的**——动态 props 越多，性能税越重；2024 年的趋势是把能编译期解决的尽量编译期解决。
3. **基础设施换代靠下游推动**——MUI / Chakra 这些大客户切走，Emotion 不会马上死，但新项目不再选它。
4. **API 设计的选择面**——styled / css prop / 对象样式各有受众，Emotion 把三种都做了，所以接得住不同口味的团队。

## 延伸阅读

- 官方文档：[emotion.sh](https://emotion.sh/docs/introduction)（Quick Start 直接上手）
- GitHub 主仓：[emotion-js/emotion](https://github.com/emotion-js/emotion)（monorepo，看 packages/ 目录结构最直观）
- 对比文章：[CSS-in-JS Performance](https://pustelto.com/blog/css-vs-css-in-js-perf/)（runtime 路线性能数据）
- [[styled-components]] —— 同代竞品，看清"差异化 5%"是什么
- [[tailwind]] —— 编译期 atomic CSS 路线
- [[stylex]] —— Meta 出的编译期 CSS-in-JS

## 关联

- [[styled-components]] —— 同代竞品，API 几乎一样，差在 cache / SSR / object style
- [[stylex]] —— 编译期取代 runtime 的代表方案
- [[tailwind]] —— 不写 CSS 文件，用 atomic class 替代 className 生成
- [[vanilla-extract]] —— 类型安全的编译期 CSS-in-TS
- [[lightningcss]] —— Rust 写的 CSS parser/transformer，给编译期方案兜底
- [[react]] —— Emotion 的最大宿主
- [[next-js]] —— SSR 场景下 critical CSS 抽取的实际舞台

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[styled-components]] —— styled-components — 用标签模板把 CSS 写进 React 组件的 CSS-in-JS 库
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
