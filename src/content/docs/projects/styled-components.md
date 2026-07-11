---
title: styled-components — 用标签模板把 CSS 写进 React 组件的 CSS-in-JS 库
来源: 'https://github.com/styled-components/styled-components'
日期: 2026-05-30
分类: projects / 前端样式
难度: 中级
---

## 是什么

styled-components 是一个 React 库，用 JavaScript 的**标签模板字面量**把 CSS 写在组件文件里，自动生成不冲突的类名，再把样式注入到页面 `<head>`。

日常类比：传统 CSS 像**印一大张共用贴纸**——所有组件去同一张纸上撕自己那块，名字一样就互相覆盖。styled-components 像**自助打印机**——每个组件当场打印自己的贴纸，机器自动给每张编一个唯一编号，永远不会撞名字。

它由 babel 插件（编译期）+ 运行时 StyleSheet（浏览器期）两段组成。babel 插件给每个 `styled.xxx` 模板算一个稳定的短哈希，叫 componentId；运行时第一次渲染组件时把 CSS 文本拼出来、再 hash 一次、注入一个 `<style data-styled>` 标签到 head 里。

它解决的是 React 项目里传统 CSS 的三个老问题：类名全局冲突、组件和样式分散在两个文件、动态样式难表达伪类和媒体查询。换句话说，它把 "样式" 重新装回了 "组件" 这个盒子里。

## 为什么重要

- 不理解它，看不懂 2017-2023 年 React 项目里满屏的 `styled.div` 写法
- 不理解它，会以为 "CSS-in-JS" 是抽象概念——其实就是 "用 JS 函数把 CSS 字符串变成 className" 这一件事
- 不理解它，无法解释为什么后来 Emotion / MUI 等抢走大量新项目与明星用户
- 不理解它，无法判断新项目该不该选——约 2025 起进入维护期，对 React Server Components 不友好

## 核心要点

1. **标签模板字面量是入口**——`styled.div` 后面跟反引号那段，本质是 JS 引擎把模板拆成静态字符串数组和动态值数组传给 `styled.div` 这个函数。函数怎么拼都行。这是 ES2015 的语法，不是 styled 自创。
2. **componentId 是稳定钩子**——babel 插件遍历源码，给每个 styled 调用算 "基于文件路径 + 变量名" 的短哈希，比如 `sc-Button-1a2b3c`。SSR 时服务端和客户端必须算出一样的 hash，否则 hydration 失败。所以**生产环境必装 babel-plugin**。
3. **运行时按需注入**——组件第一次渲染才把 CSS 拼出来、hash、注入 `<style>` 到 head。这和 inline-style 的关键区别是**支持伪类、媒体查询、关键帧**——这三样能力在 `style={{}}` 里都没有。
4. **componentId + 动态 hash 双重命名**——DOM 里看到的 className 通常是两段，前一段是 babel 给的稳定 id（用于 SSR 和 DevTools 调试），后一段是 props 算出来的动态 hash（用于命中 cache）。两段合起来才是一个完整 class 名。

## 实践案例

### 案例 1：根据 props 切换底色的按钮

```jsx
import styled from 'styled-components'

const Button = styled.button`
  background: ${props => props.primary ? '#0070f3' : '#fff'};
  color: ${props => props.primary ? '#fff' : '#000'};
  padding: 8px 16px;
  &:hover { opacity: 0.85; }
`

<Button primary>Click</Button>
```

每次渲染跑 `props => ...` 算出真实 CSS 字符串，hash 后看 cache 有没有；没有就注入新 class。primary=true 和 primary=false 产生两个不同的 class，DOM 里看到的 className 数 = 用到的 props 组合数。

### 案例 2：用 ThemeProvider 切换主题

```jsx
import { ThemeProvider } from 'styled-components'
const dark = { bg: '#000', fg: '#fff' }
const Box = styled.div`background: ${p => p.theme.bg};`

<ThemeProvider theme={dark}><Box /></ThemeProvider>
```

`theme` 通过 React Context 流到每个 styled 组件，props 函数能直接读 `props.theme`。这是 styled-components 的 "杀手锏"——无需 CSS 变量也能做主题切换。

### 案例 3：十几行写 mini styled，验证整个机制

可以照着下面的玩具实现自己跑一遍，把 SSR 和嵌套伪类先放一边，只看 "JS 函数怎么把字符串变成 className" 这个核心。

```js
function styled(tag) {
  return (strings, ...fns) => (props) => {
    const css = strings.reduce((acc, s, i) =>
      acc + s + (fns[i] ? fns[i](props) : ''), '')
    const hash = 'sc-' + simpleHash(css)
    if (!document.querySelector(`[data-id="${hash}"]`)) {
      const el = document.createElement('style')
      el.dataset.id = hash
      el.textContent = `.${hash} { ${css} }`
      document.head.appendChild(el)
    }
    return React.createElement(tag, { ...props, className: hash })
  }
}
```

十几行复刻核心机制——真实库的复杂度主要在 SSR 提取、嵌套伪类解析、性能 cache 等工程细节。

## 踩过的坑

1. 没装 babel-plugin → SSR hydration mismatch，DevTools 里也看不到 `displayName`
2. 在循环或函数体里写 `styled.div` → 每次都新建组件，cache 全 miss，性能直接劣化
3. props 函数里依赖外部多变的变量 → 哈希频繁失效，CSS 重复注入，head 里 `<style>` 越堆越长
4. 同项目里 styled-components 和 Emotion 混用 → 两份运行时同时跑，bundle 翻倍且互不复用 cache

## 适用 vs 不适用场景

适用：

- 老 React 项目（Next.js Pages Router、CRA、Vite SPA），团队已熟练
- 需要 "组件即样式" 心智的中小型 UI 库
- 主题切换频繁、希望 props 直接驱动样式的场景
- 把现有 CSS 大文件按组件拆分迁移的过渡期

不适用：

- 新建的 RSC 项目（Next.js App Router 默认）——styled 必须 `'use client'`，违背 "零 JS 默认" 哲学
- 极致追求 bundle 体积的场景——Emotion 比它小一半，Tailwind 几乎零运行时
- 严格的 "编译期 CSS" 要求——选 [[vanilla-extract]] 或 Panda CSS
- 想长期跟进新特性的团队——维护期后以修 bug / 兼容为主，不宜当新项目默认选型

## 历史小故事（可跳过）

- 2016-10：Glen Maddern 与 Max Stoiber 发布首版，用标签模板把 CSS 写进组件（CSS-in-JS 流派此前已有 Aphrodite 等）
- 2017：Emotion 出现，社区从此分裂成两派各自维护
- 2018-2019：Aphrodite、Glamor 等早期竞品淡出，市场基本剩 styled 和 Emotion 两家
- 2020-2022：MUI v5、Chakra 等大型组件库纷纷选 Emotion，styled-components 失去明星用户
- 2023-06：v6.0.0 发布，从 Flow 迁到 TypeScript 重写
- 2025-03：维护者宣布进入维护期（修兼容 / 安全，不再冲新特性）；新项目选型几乎不再默认选它

时间线读起来像 OSS 流派兴衰的小教材——一个先发库被同代后来者抢走份额，再被下一代范式（atomic CSS、编译期 CSS）整体绕开。

## 学到什么

- "CSS-in-JS" 听起来神秘，本质就是 "用一个 JS 函数把字符串变成 className"
- 编译期 + 运行时双段架构是大量库的通用模板（webpack loader、babel 插件、CSS-in-JS 都是这个套路）
- 先发优势在 OSS 世界很有限——styled 早 Emotion 一年，照样被后者抢走份额
- 看到一个库进入 "维护期" 信号要敏感——不主动重构，但也不在新项目里再下注
- 标签模板字面量是被低估的语言特性——它让一个库可以原汁原味嵌入另一种语言（CSS、SQL、GraphQL 都用过这套路）
- 选样式方案前先回答 "我的项目在 RSC 边界上吗"——答案变了，最优解就变

## 延伸阅读

- 官方文档 styled-components.com（v6 章节最新）
- React 官方对 RSC 与样式方案的讨论文档
- "Tagged Template Literals" MDN 入门页
- Max Stoiber 关于离开维护的公开博客文 / 推特线程
- Next.js App Router 文档里 `StyledComponentsRegistry` workaround 章节
- [[emotion]]、[[vanilla-extract]]、[[tailwind]] 三篇一起读，构成完整 React 样式光谱

## 关联

- [[emotion]] —— 同年代竞品，工程上 95% 等价但 bundle 更小、社区更活跃
- [[vanilla-extract]] —— 编译期 CSS-in-JS，零运行时，RSC 友好的下一代方案
- [[tailwind]] —— atomic CSS 范式，与 CSS-in-JS 思路相反但解决同样痛点
- [[react-spring]] —— 经常被 styled 组件包装的动画库，互补而非竞争
- [[shadcn-ui]] —— 新一代组件库，用 Tailwind 替代 styled，体现选型迁移趋势

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[emotion]] —— Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
- [[react-spring]] —— react-spring — 用真实弹簧的物理写网页动画
- [[shadcn-ui]] —— shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
- [[tailwind]] —— Tailwind CSS — 工具类优先样式框架
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时

