---
title: React — 用组件描述界面的 JavaScript 库
来源: https://github.com/facebook/react
日期: 2026-05-29
分类: UI 框架
难度: 中级
---

## 是什么

React 是一个让你**用写函数（组件）的方式描述界面**的 JavaScript 库——不是 Ant Design 那种现成按钮合集，而是自己搭积木的底座。日常类比：你在餐厅写菜单，老板（React）安排厨房按你菜单做菜——你只管菜单里有什么菜，不用管炉火怎么开、汤怎么炖。

更技术一点说：你写一个函数，输入是**数据**（props 和 state），输出是**界面应该长什么样**的描述（JSX）。React 自己负责把这份描述变成浏览器里真实的 DOM，并在数据变化时自动更新。

```jsx
function Hello({ name }) {
  return <h1>你好，{name}</h1>
}
```

这就是一个 React 组件——一个普通函数，接收 `name`，返回一段长得像 HTML 的东西（叫 JSX）。

## 为什么重要

不理解 React，下面这些事都没法解释：

- **数据变了 UI 自动更新**，不用再手写 `document.querySelector(...).innerText = ...`——这是过去 10 年前端开发体感最大的飞跃
- **组件复用让大型应用可拆**——一个 `<Button />` 写一次全站用，改一处全站跟着变
- **全行业默认**：Meta / Airbnb / Netflix / ByteDance / 阿里 / 腾讯都在用，招聘市场绝大多数前端岗要求 React
- **Hook 让逻辑复用不再需要继承或高阶组件**——这是 2019 年后的现代写法，比老式 class 简洁一个数量级

## 核心要点

React 的心智模型可以拆成 **三块**：

1. **组件 = 函数**：输入 props（外部传进来的数据），输出 JSX（描述界面）。组件之间像积木一样组合。

2. **状态 = useState**：组件内部需要记住的数据用 `useState` 存。状态变了，React 会自动重新调用组件函数，得到新的 JSX，然后高效更新 DOM。类比：你改了菜单上的菜，餐厅会自动把上桌的菜也换掉，你不用喊服务员。

3. **副作用 = useEffect**：拉数据、订阅事件、操作 DOM 这些"和外界打交道"的事，放进 `useEffect` 里。React 在合适的时机（组件挂载后、依赖变化后）帮你跑这些代码。

这三件事覆盖了 90% 的 React 使用场景。

## 实践案例

### 案例 1：最小计数器

```jsx
import { useState } from 'react'

function Counter() {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>{n}</button>
}
```

**逐行解释**：

- `useState(0)` 返回**两个东西**：当前值 `n`（初始 0）和改值的函数 `setN`
- `onClick` 是事件 props，点击时执行 `() => setN(n + 1)`
- JSX 里大括号 `{n}` 把 JavaScript 表达式嵌进界面
- 点一次：`setN(1)` → React 重新调用 `Counter` → 拿到新 JSX `<button>1</button>` → 更新 DOM

### 案例 2：用 useEffect 拉数据

```jsx
import { useState, useEffect } from 'react'

function User({ id }) {
  const [user, setUser] = useState(null)
  useEffect(() => {
    fetch(`/api/users/${id}`).then(r => r.json()).then(setUser)
  }, [id])  // ← 依赖数组
  return user ? <div>{user.name}</div> : <div>加载中...</div>
}
```

`useEffect` 的第二个参数是 **依赖数组**：

- `[]` → 只在组件挂载时跑一次
- `[id]` → 每次 `id` 变化时都跑（典型的"换用户就重新拉数据"场景）
- 不写 → 每次重渲染都跑（很少用，容易出 bug）

### 案例 3：父子组件传 props

```jsx
function App() {
  return <Greeting name="Jason" />
}
function Greeting({ name }) {
  return <p>欢迎，{name}</p>
}
```

**逐步对照**：

1. 父 `App` 写 `name="Jason"` → 数据从上往下交给子
2. 子 `Greeting` 用 `{ name }` 解构接收，只读这份 props
3. 子若要改父的状态：父再传一个回调（如 `onChange`），子调用它通知父——**不能**直接改父的 state

## 踩过的坑

1. **stale closure（旧闭包）**：`useEffect(() => { setInterval(() => console.log(n)) }, [])` 里的 `n` 永远是初始值，因为 effect 只跑了一次，闭包捕获的是当时的 `n`。修法：把 `n` 加进依赖数组，或用 `setN(prev => prev + 1)` 函数式更新。

2. **列表 key 写成 index**：`items.map((item, i) => <Row key={i} />)` —— 列表重排时 React 用 key 复用 DOM 节点，用 index 当 key 在重排后会出现"内容跟错了行"。修法：用稳定的业务 id（如 `item.id`）。

3. **setState 是异步的，console.log 看到旧值**：`setN(n + 1); console.log(n)` 打印的还是旧值，因为 React 把更新批量调度，下一次渲染才生效。想看新值要在 `useEffect` 里或下一次 render 里看。

4. **在 render 里直接改 state 触发死循环**：`function Foo() { setN(1); ... }` —— 每次 render 都调用 `setN` 触发新 render，无限循环。state 变更必须在事件回调或 `useEffect` 里，不能在函数体里直接调。

## 适用 vs 不适用场景

**适用**：

- 中大型单页应用（SPA）—— 组件复用 + 状态管理优势明显
- 数据驱动的复杂界面（dashboard / 编辑器 / 表单密集页）
- 团队协作 —— 组件边界清晰，多人分工容易
- 需要丰富生态 —— 表单、动画、路由、状态管理都有成熟方案，例如 [[zustand]] 做状态、[[react-hook-form]] 做表单

**不适用**：

- 纯静态页 / 营销落地页 —— React runtime 比 vanilla JS 重，SEO 和首屏速度都不占优；考虑 Astro / 11ty
- 极致性能场景（Canvas 渲染万级元素 / 高频动画）—— React reconciliation 有开销，直接操作 DOM 或借助 [[framer-motion]] 这类专门优化方案
- 不希望引入 build 工具的小项目 —— React 几乎必须配 [[vite]] / webpack，不像 jQuery 一个 script 标签就能用
- 需要 SSR + 强 SEO —— `react-dom/server` 能出 HTML，但路由/数据/缓存通常还要 Next.js 这类框架

## 历史小故事（可跳过）

- **2011 年**：Facebook 工程师 Jordan Walke 在内部做了个原型叫 FaxJS，想解决新闻流的复杂状态同步问题
- **2013 年 5 月**：Pete Hunt 在 JSConf US 上开源 React，演讲名叫 "Rethinking Best Practices"——观众觉得"在 JS 里写 HTML"很反传统，反响褒贬参半
- **2015 年**：React Native 发布，把组件思想带到移动端
- **2018 年 10 月**：React 16.8 发布 Hooks，颠覆了 class 写法。`useState` / `useEffect` 让函数组件第一次能存状态
- **2022 年 3 月**：React 18 发布并发渲染（concurrent rendering）+ 自动批处理，并加强流式 SSR；Server Components 则更早在 2020 提出、由框架侧落地

## 学到什么

1. **声明式 > 命令式**：你写"界面应该长什么样"，框架负责"怎么变成那样"。这是过去 10 年前端最大范式转移
2. **组件是描述，不是对象**：组件函数每次 render 都是全新的执行；想保留东西用 state / ref，不要靠"实例属性"
3. **状态变 → 函数重跑 → 输出新描述 → React diff 后更新 DOM**：这条心智链路是理解所有 React 行为（包括 bug）的根本
4. **生态 > 框架本身**：React 故意保持小（核心几乎只管"组件 + 状态 + 渲染"），但靠周边库（数据请求、表单、动画、状态管理）一起组成你日常的开发栈

## 延伸阅读

- 官方文档（2023 年重写过，质量极高）：[react.dev](https://react.dev)
- 入门教程（官方推荐）：[Tutorial: Tic-Tac-Toe](https://react.dev/learn/tutorial-tic-tac-toe)（1-2 小时跑通一个井字棋）
- 深入理解 render：[A Visual Guide to React Rendering](https://alexsidorenko.com/blog/react-render-always-rerenders/)（图解 render 触发条件）
- Hooks 起源演讲：[React Today and Tomorrow（Dan Abramov, React Conf 2018）](https://www.youtube.com/watch?v=dpw9EHDh2bM)
- [[vite]] —— 现代 React 项目的标配 build 工具，比 webpack 快 10x

## 关联

- [[jsx]] —— React 的视图描述语法，本质是 `React.createElement` 的语法糖
- [[vite]] —— 当代 React 项目的默认构建工具，dev server 启动毫秒级
- [[react-hook-form]] —— React 表单事实标准，uncontrolled-first，性能优于 Formik
- [[tanstack-query]] —— React 数据请求层标配，自动缓存 + 重试 + 后台刷新
- [[zustand]] —— 轻量级状态管理，比 Redux 简洁一个数量级
- [[framer-motion]] —— React 动画库，声明式 API，常用于过渡动效
- [[shadcn-ui]] —— 不是 npm 包而是组件源码合集，事实上的 React 设计系统选型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

