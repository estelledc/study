---
title: Preact — 3KB React 替代
来源: https://github.com/preactjs/preact
日期: 2026-05-29
分类: UI 框架
难度: 中级
---

## 是什么

Preact 是 **React 的轻量替代品**——API 几乎一样，但打包后只有 3KB（gzip）。React 是 45KB+。

日常类比：同款方便面，一家用大袋装得全（React），一家用小袋恰好够吃（Preact），口味基本一样。

代码长这样（你看不出和 React 的区别）：

```js
import { h, render } from 'preact'
import { useState } from 'preact/hooks'

function Counter() {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>{n}</button>
}

render(<Counter />, document.body)
```

把 `preact` 换成 `react` + `react-dom`，几乎不改一行也能跑——这就是 Preact 的核心卖点。

## 为什么重要

不理解 Preact 的存在价值，下面这些事都解释不清：

- 移动端 / 性能敏感场景（百度首页、Etsy 商品页、阿里小程序）为什么用 Preact 替代 React 节省加载时间
- 为什么 API 兼容 React 还能瘦身 14 倍——"React 不轻量"这个长期吐槽，Preact 给了开源解
- 为什么 Astro / Fresh 等新框架默认搭 Preact 而不是 React——岛屿架构 / 边缘渲染对包体积敏感
- 为什么营销活动 H5 / 落地页宁愿手写也不上 React——但上 Preact 可以，体积差距决定了能不能用

3KB 不是数字游戏。每多一个 KB，2G 网络下加载多 200ms，转化率掉 1%。

## 核心要点

Preact 怎么砍掉 42KB，靠的是 **三招**：

1. **去掉合成事件（synthetic event）**：React 自己造了一套跨浏览器事件系统（SyntheticEvent），统一行为。Preact 直接用浏览器原生事件——绑事件就是 `addEventListener`。代价：极少数浏览器兼容差异要自己处理。

2. **简化 reconciler（diff 算法）**：React 用 fiber 架构（可中断、优先级调度），Preact 是简单递归 diff。代价：超大组件树场景丢帧——但 99% 网页根本不到那个量。

3. **`h()` 替代 `createElement`**：函数名短、压缩友好。`h(name, props, children)` 三个参数，没有内部包装层。

兼容层 **`preact/compat`** 把类组件 / `forwardRef` / `lazy` / `Suspense` 都模拟出来。打包工具配一行 alias，第三方 React 库就能跑：

```js
// vite.config.js
export default {
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
}
```

## 实践案例

### 案例 1：Hello world，30 秒看懂

```js
import { h, render } from 'preact'
render(<h1>Hi</h1>, document.body)
```

**逐行解释**：

- `h` 是 `createElement` 的简写——`<h1>Hi</h1>` 经 JSX 编译变成 `h('h1', null, 'Hi')`
- `render(vnode, container)` 把虚拟节点挂到真实 DOM 上
- 整个 import 加起来 3KB，没了

### 案例 2：Hooks 用法和 React 一模一样

```js
import { useState, useEffect } from 'preact/hooks'

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <div>{time.toLocaleTimeString()}</div>
}
```

`useState` / `useEffect` / `useMemo` / `useRef` 全部对齐 React API。学过 React 的零成本切换。

### 案例 3：用 preact/compat 替换 React

老项目想试 Preact，不用改业务代码，配置层做手术：

```js
// vite.config.js
export default {
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom/client': 'preact/compat/client',
      'react-dom': 'preact/compat',
    },
  },
}
```

跑起来：bundle size 从 130KB → 30KB 是常见结果。第三方依赖几乎无感。

## 踩过的坑

1. **第三方 React 库依赖 React 内部 API**：老版本 `react-dnd`、某些 React 19 RSC 库会直接 import `react/jsx-runtime` 的内部模块，preact/compat 没模拟全。判断标准：库 README 写 "compatible with Preact" 就稳，没写就要测一遍。

2. **事件命名差异**：`onChange` 在 input 上，Preact 是浏览器原生 change（失焦才触发），React 改写成 input（每次按键触发）。从 React 迁过来要把 `onChange` 改 `onInput`，否则受控组件输入会卡。

3. **React 19 新特性跟进慢**：Server Components / `use()` hook / Actions 这些 React 19 新东西，Preact 要等几个月甚至更久。如果项目重度依赖 RSC，Preact 不是首选。

4. **测试要换库**：单测不能直接用 `@testing-library/react`，要用 `@testing-library/preact`。两个 API 几乎一样但 import 不同，迁移时记得全局搜索替换。

5. **DevTools 是单独的扩展**：React DevTools 不能直接用，Preact 有自己的 `preact/debug` 包，开发环境多 import 一行才能看组件树。

## 适用 vs 不适用场景

**适用**：

- 移动端 H5 / 营销落地页（包体积敏感，每 KB 影响转化）
- Astro / Fresh / Eleventy 这类岛屿架构（按需加载组件，越小越好）
- 老 jQuery / 原生项目逐步迁移到组件化（学习成本低 + 体积接近）
- React 项目极致瘦身（用 preact/compat 一键替换）

**不适用**：

- 重度依赖 React 19 RSC / Server Actions 的项目
- 超大型 SaaS 后台（fiber 调度 / 优先级在大组件树有优势）
- 团队 React 生态用得很深，且依赖偏门 React 库（兼容性赌不起）
- SSR 优先场景（Next.js + React 的工具链比 Preact + 自搭成熟很多）

## 历史小故事（可跳过）

- **2015 年**：Jason Miller 觉得 React 那么大有点离谱，周末写了一版 mini React——核心就一个 reconciler 文件，几百行。
- **2017–2018 年**：`preact/compat` 兼容层成熟，开始有公司用；此时 React Hooks 尚未发布。
- **2019 年**：Preact X 发布，对齐 Hooks API，性能和 React 持平甚至更快，体积保持约 3KB。
- **现在**：GitHub 约 36k star，Astro / Fresh / 多家大厂都在线上跑。

一个人周末项目跑赢大厂团队的轻量替代品——这是开源世界经常出现的故事。

## 学到什么

- **API 兼容是开源传播最大的杠杆**——Preact 不发明新 API，让 React 用户零成本迁移，这比"我们更快"重要 100 倍
- **3KB 不是营销词**——移动端 / 边缘场景每 KB 都是钱，包体积是产品决策不是技术细节
- **兼容层（compat）模式**——核心轻量 + 可选兼容包，鱼和熊掌都要的工程妥协
- **简单 reconciler 大多数场景够用**——React fiber 是给 99 分场景准备的，多数项目还在 60 分线挣扎

## 延伸阅读

- 官网快速上手：[Preact Getting Started](https://preactjs.com/guide/v10/getting-started)（30 分钟跑起来）
- 兼容层文档：[Switching to Preact](https://preactjs.com/guide/v10/switching-to-preact)（从 React 迁的踩坑全集）
- 性能对比：[js-framework-benchmark](https://krausest.github.io/js-framework-benchmark/current.html)（Preact 在 vanilla 之后第二快）
- [[react]] —— Preact 模仿的对象，理解 React 才能理解 Preact 砍了什么
- [[vite]] —— 配 Preact 的官方推荐 bundler

## 关联

- [[react]] —— 同源同 API，理解差异才能选对
- [[vite]] —— Preact 项目首选构建工具，alias 配一行就能用
- [[react-dnd]] —— 拖拽库依赖 React 内部，Preact 兼容性踩坑的典型案例
- [[webpack]] —— 老项目用 webpack alias 切 Preact 的标准做法

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[flutter]] —— Flutter — Google 的 Dart 跨平台 UI 框架
- [[hermes]] —— Hermes — Facebook 的 React Native JS 引擎
- [[radix-ui]] —— Radix UI — unstyled accessible 的 React 组件原语库
- [[react-dnd]] —— react-dnd — React 时代第一个把拖拽拆成四层的库
- [[swr]] —— SWR — React 远程数据 hook 的极简流派
- [[web-vitals]] —— web-vitals — 让你在自己页面测的数和 Google 排名用的数对得上
