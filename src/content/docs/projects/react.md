---
title: React UI 组件库
来源: https://github.com/facebook/react
日期: 2026-05-29
子分类: UI 框架
分类: 后端 API
难度: 中级
schema_version: legacy-long
provenance: legacy-migrated
---

## 是什么

React 是一个让你**用写函数的方式描述界面**的 JavaScript 库。日常类比：你在餐厅写菜单，老板（React）安排厨房按你菜单做菜——你只管菜单里有什么菜，不用管炉火怎么开、汤怎么炖。

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

`name="Jason"` 从父组件 `App` 传给子组件 `Greeting`。**props 只能从上往下传**——子组件想改父组件的状态，必须父组件传一个回调函数（如 `onChange`），子组件调用它通知父组件。

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
- 需要 SSR + 强 SEO —— 用纯 React 难，用 Next.js 这种框架更合适

## 历史小故事（可跳过）

- **2011 年**：Facebook 工程师 Jordan Walke 在内部做了个原型叫 FaxJS，想解决新闻流的复杂状态同步问题
- **2013 年 5 月**：Pete Hunt 在 JSConf US 上开源 React，演讲名叫 "Rethinking Best Practices"——观众觉得"在 JS 里写 HTML"很反传统，反响褒贬参半
- **2015 年**：React Native 发布，把组件思想带到移动端
- **2018 年 10 月**：React 16.8 发布 Hooks，颠覆了 class 写法。`useState` / `useEffect` 让函数组件第一次能存状态
- **2022 年 3 月**：React 18 发布并发渲染（concurrent rendering）+ 自动批处理，为后续 Server Components 铺路

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

- [[affine]] —— AFFiNE — 文档和白板共用同一棵 block 树的开源知识库
- [[ag-grid]] —— AG Grid — 企业级数据表格
- [[agentless]] —— Agentless — 反 Agent 派的 SWE-bench 解法
- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[clawtrace-cost-aware]] —— ClawTrace — 把 agent 每步操作的"成本账"先算清再蒸馏
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[conform]] —— Conform — 让浏览器原生 form 也能 type-safe 校验
- [[cot]] —— Chain-of-Thought Prompting
- [[cvat]] —— CVAT — 视频帧标注与半自动追踪的开源王者
- [[dash]] —— Dash — Plotly 的 Python 仪表板框架
- [[dnd-kit]] —— dnd-kit — React 现代拖拽 toolkit
- [[docusaurus]] —— Docusaurus — 一组 plugin 协作出来的文档站框架
- [[effiskill]] —— EffiSkill — 把代码效率优化经验抽成两层 skill 库
- [[element-web]] —— Element Web — Matrix 协议旗舰 web 客户端（React + matrix-js-sdk）
- [[emotion]] —— Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
- [[flutter]] —— Flutter — Google 自绘像素的跨平台 UI 框架
- [[framer-motion]] —— Framer Motion — React 声明式动画
- [[glide-data-grid]] —— glide-data-grid — Canvas 画出来的百万行表格
- [[gradio]] —— Gradio — ML 模型 demo 框架
- [[graphrag]] —— GraphRAG — 微软的知识图谱 + RAG
- [[gsap]] —— GSAP — GreenSock 高性能动画
- [[handsontable]] —— Handsontable — 浏览器里的 Excel
- [[i18next]] —— i18next — 让一份 JS 代码同时讲几十种语言
- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[ink]] —— ink — 用 React 组件树写终端 CLI
- [[kepler-gl]] —— kepler.gl — 拖拽式百万点 GIS 探索界面
- [[label-studio]] —— Label Studio — 文本图像音视频时序通吃的标注王者
- [[lens]] —— Lens — Kubernetes 集群的桌面 IDE
- [[librechat]] —— LibreChat — 让一份聊天 UI 同时连 OpenAI / Anthropic / Google / 本地模型，对话留在自己的服务器
- [[lingui]] —— Lingui — 写自然字符串，编译期自动提取 i18n msgid
- [[mapbox-gl-js]] —— Mapbox GL JS — 矢量瓦片 + WebGL 客户端渲染地图
- [[metagpt]] —— MetaGPT — 多智能体软件公司
- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[mmskills-multimodal]] —— MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片
- [[next-js]] —— Next.js — React 全栈框架
- [[nextra]] —— Nextra — 在 Next.js 上盖一层文档站脚手架
- [[nuxt]] —— Nuxt — Vue 全栈框架
- [[openhands]] —— OpenHands — 开源 AI 软件工程师
- [[penpot]] —— Penpot — 开源自托管的 Figma 替代
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[preact]] —— Preact — 3KB React 替代
- [[qwik]] —— Qwik — Resumable UI 框架
- [[radix-ui]] —— Radix UI — unstyled accessible 的 React 组件原语库
- [[react-dnd]] —— react-dnd — React 时代第一个把拖拽拆成四层的库
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[react-spring]] —— react-spring — 用真实弹簧的物理写网页动画
- [[reflexion]] —— Reflexion — 让 LLM 自我反思
- [[sentry]] —— Sentry — 把崩溃和报错自动收集 + 分组 + 可查询的错误监控平台
- [[shadcn-ui]] —— shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
- [[skcc-skill-compiler]] —— SkCC — 给 LLM agent 写一个真正的 skill 编译器
- [[skill-as-pseudocode]] —— Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
- [[skill-pro-nonparametric-ppo]] —— Skill-Pro — 不动权重学可复用 skill 的非参数 PPO
- [[solid]] —— SolidJS — 细粒度响应式 UI 框架
- [[streamlit]] —— Streamlit — Python 几行写 Web 应用
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
- [[svelte]] —— Svelte — 编译时 UI 框架
- [[sveltekit]] —— SvelteKit — Svelte 全栈框架
- [[swe-agent]] —— SWE-Agent — Princeton SWE-bench 解法
- [[swe-bench]] —— SWE-bench — 真实 GitHub Issue 评测
- [[swr]] —— SWR — React 远程数据 hook 的极简流派
- [[tabulator]] —— Tabulator — 纯 JS 交互式表格
- [[tailwind]] —— Tailwind CSS — 工具类优先样式框架
- [[tanstack-query]] —— TanStack Query — 数据获取与缓存库
- [[testing-library]] —— Testing Library — 像用户一样测前端，重构不再挂测试
- [[toolformer]] —— Toolformer — 教 LLM 自主调用 API
- [[tree-of-thoughts-2023]] —— Tree of Thoughts — 让 LLM 像下棋一样多想几步再答
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
- [[vercel-ai]] —— Vercel AI SDK — 多 LLM Provider 统一 SDK
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[voila]] —— Voilà — 把 Jupyter Notebook 变成只显示输出的网页
- [[voyager]] —— Voyager — LLM 终身学习智能体
- [[vue]] —— Vue.js — 渐进式 UI 框架
- [[webxskill]] —— WebXSkill — 给 Web agent 的可执行 skill 是参数化代码 + URL 图索引
- [[why-did-you-render]] —— why-did-you-render — 让 React 告诉你这次渲染到底为什么
- [[world-model-robot-learning-2026]] —— 机器人世界模型综述 — 预测未来再动手
- [[xstate]] —— XState — 把状态画成图，让矛盾写不出来
- [[zombie-agents-2602]] —— Zombie Agents — 自进化 agent 的长期记忆能被持久化"借尸还魂"
- [[zustand]] —— Zustand — 极简 React 状态管理

