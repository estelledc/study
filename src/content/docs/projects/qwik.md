---
title: Qwik — Resumable UI 框架
来源: https://github.com/QwikDev/qwik
日期: 2026-05-29
分类: UI 框架
难度: 中级
---

## 是什么

Qwik 是一个把 **「恢复执行（resume）」** 替代「重新水合（hydrate）」的前端框架——首屏 HTML 渲染完，浏览器只下载几 KB 的 JS；用户点哪个按钮，再下载这个按钮对应的代码块。日常类比：

> 打开一本厚书，不是把全书装进脑子，而是翻到哪页才读哪页。

跟同期 React / Vue / Solid 比，Qwik 把「加载哪些 JS」这个决定推迟到用户实际交互的瞬间——首屏 JS 是 React 的 1/100（实测千分之一也常见）。

## 为什么重要

不理解 Qwik 解释不了下面这些：

- 为什么 2023 年起前端社区开始讨论「0 hydration cost」这个概念——Qwik 是第一个工程化落地的方案
- 为什么 Builder.io（无头 CMS + 视觉编辑器）的预览页能秒开千 KB 大小的复杂内容——它内部用 Qwik 做 SSR
- 为什么 React 团队在推 Server Components / Suspense 之后仍绕不开「水合」——它的架构假设跟 Qwik 是反的
- 为什么前 AngularJS / Ionic 创始人 Misko Hevery 离开 Google 后会从零再造一个框架——他想验证「hydration 本来就不该存在」

## 核心要点

Qwik 的「快」可以拆成 **三个工程决定**：

1. **序列化（serialization）**：传统框架水合时要在客户端重跑一遍 component tree 来恢复状态、绑定 handler；Qwik 把这些状态 + handler 位置直接序列化进 HTML 属性（比如 `q:click="src/foo.tsx_onClick_abc.js"`）。浏览器读 HTML 就拿到全部信息，不再需要「重启」

2. **Resumability（恢复执行）**：用户点击时，浏览器读到属性里的 chunk URL，按需下载这个 handler 的代码——千 KB 应用里此刻只下载了这一个按钮的几 KB JS。其他按钮的代码用户没碰永远不下

3. **JSX with `$` 标记**：Qwik 编译器（Optimizer）需要知道「哪里是边界（这段代码可以单独成 chunk）」。用户在 JSX 里写 `onClick$={() => ...}`——这个 `$` 后缀是给编译器的标记，触发它把箭头函数切出去成单独 chunk

三件事叠加，拿到「首屏 0 hydration JS」。

## 实践案例

### 案例 1：Counter 入门

最常见的 Qwik 组件——计数器：

```tsx
import { component$, useSignal } from '@builder.io/qwik';

export const Counter = component$(() => {
  const count = useSignal(0);
  return (
    <button onClick$={() => count.value++}>
      Count: {count.value}
    </button>
  );
});
```

逐部分解释：

- `component$(...)` 外层 `$` 让编译器把整个组件单独切成 chunk
- `useSignal(0)` 是细粒度响应式——只有 `count.value` 变化时这一段 DOM 重渲，跟 Solid 的 signal 一样
- `onClick$={() => ...}` 内层 `$` 让编译器把 click handler 也切成独立 chunk——首屏不下载，点击时才下

页面加载完，DOM 里这个 button 的 `q:click` 属性指向 handler chunk URL。用户不点击就永远不下。

### 案例 2：路由 + 服务端取数

Qwik City（Qwik 的 meta-framework，类似 Next.js 之于 React）里写 `routes/index.tsx`：

```tsx
import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';

export const useArticles = routeLoader$(async () => {
  return await fetch('https://api.example.com/articles').then(r => r.json());
});

export default component$(() => {
  const articles = useArticles();
  return (
    <ul>{articles.value.map(a => <li>{a.title}</li>)}</ul>
  );
});
```

`routeLoader$` 在服务器端跑——返回值序列化进 HTML，组件读到的是已 resolved 的数据，客户端不需要再请求一次 API。

### 案例 3：与 React 的差异

| 概念 | React | Qwik |
|------|-------|------|
| 状态 hook | `useState` | `useSignal` |
| 副作用 | `useEffect` | `useTask$` (SSR + client) / `useVisibleTask$` (仅 client) |
| 组件标记 | 普通函数 | `component$()` |
| Handler | `onClick={...}` | `onClick$={...}` |
| 水合 | 全树水合 | 不水合，按需加载 |

写法看起来像 React 多一个 `$`，但运行时模型完全不同：React 客户端要「重启」应用，Qwik 不需要。

## 踩过的坑

1. **`$` 后缀必须**：少写 `$` 编译器只给警告不报错，运行时可能静默失败——handler 没切 chunk 直接 inline 进首屏 bundle，「resumable」优势消失。新人最高频的坑

2. **第三方 React 库不能直接用**：React 库依赖 React runtime。Qwik 提供 `qwik-react` 桥接但有性能损失——用了 React 组件的页面会被强制水合那一块。生态远不如 React/Vue 大

3. **Resumability 调试难**：堆栈跨 chunk 边界——出错时 source map 指向懒加载文件。Sentry / 浏览器 devtools 都需要适配。早期版本调试体验差到劝退

4. **`useVisibleTask$` 是逃生舱不是常规**：写过 React 的人会下意识用它当 `useEffect`——但 Qwik 团队反复强调它会触发 eager hydration（违背 resumable 原则）。日常应优先 `useTask$` 或纯响应式

## 适用 vs 不适用场景

**适用**：
- 重内容站（电商 / 媒体 / 营销页）——首屏是大头，交互是少数
- Builder.io / WordPress 这类「内容多 + 编辑器拖拽」场景——HTML 已经 ready，JS 越少越好
- 性能 KPI 死磕的场景——LCP / TTI / TBT 都吃首屏 JS 大小

**不适用**：
- 重交互 SPA（dashboard / IDE / 协作工具）——所有代码迟早要下载，按需加载只增加复杂度
- 需要复用 React 生态（react-table / react-flow / Material-UI）——qwik-react 桥接性能损失大
- 团队没人愿意学 `$` 后缀语义——心智成本不划算
- 需要 SSR streaming + Suspense 复杂编排——React Server Components 更成熟

## 历史小故事（可跳过）

- **2021 年**：Misko Hevery（AngularJS / Ionic 创始人）从 Google 离职加入 Builder.io。他在 Google 时主导 Angular 1.x 但对「水合开销」这个根本问题始终不满
- **2021 年底**：第一版 Qwik 发布，核心论点 「hydration is pure overhead, resumability fixes it」。社区一开始当玩具看
- **2022 年**：Adam Bradley（Ionic 创始人，Stencil 作者）加入团队负责 Qwik City，生态成型
- **2023 年 5 月**：v1.0 发布。Builder.io 把自己的可视化编辑器底层换成 Qwik——这是「自吃狗粮」的证明
- **2024 年起**：Qwik 进入主流前端会议常规话题，「resumable」成为社区词汇。但市占率仍远低于 React / Vue

整个项目商业绑定 Builder.io——这既是优势（有金主长期投入）也是争议（去 Builder.io 化的纯 OSS 路径不清晰）。

## 学到什么

1. **「重新水合」是历史遗留，不是必然**——React 之所以要水合，是因为它假设「客户端要重跑一遍 render 才能拿到 component tree」。Qwik 证明这个假设可以打破：把状态序列化进 HTML 就够
2. **编译期标记 vs 运行时检测**——`$` 后缀是编译期标记的代价（语法侵入），换来的是不需要 runtime 解析「哪段代码可以切 chunk」。设计上是 Svelte 同路（编译期决定一切）
3. **细粒度响应式 + 懒加载叠加**——Solid 有细粒度响应式但仍要全水合；Qwik 把响应式推到组件级，再叠加懒加载，把「首屏 JS」压到极限
4. **生态壁垒是真壁垒**——技术上更优的方案如果生态不够大，仍打不过技术上次优但生态成熟的方案。Qwik vs React 是这个规律的当代案例
5. **创始人复盘前作的勇气**——Misko 主动否定自己 12 年前的 AngularJS 设计，从零再来。这种自省在框架作者里少见

## 延伸阅读

- 官方文档（推荐入口）：[qwik.dev](https://qwik.dev/)
- Resumability 概念解释（作者亲笔）：[qwik.dev/docs/concepts/resumable](https://qwik.dev/docs/concepts/resumable/)
- Misko Hevery 开篇演讲：[YouTube — WTF is Qwik](https://www.youtube.com/watch?v=0dC11DMR3fU)
- [[react]] —— hydration 模型对照
- [[solid]] —— 细粒度响应式同路

## 关联

- [[react]] —— 水合模型对照组，Qwik 整套架构是反 React 假设
- [[solid]] —— signal-based 响应式同路，但 Solid 仍水合
- [[svelte]] —— 编译期决定一切的同路，但 Svelte 没有 resumable
- [[vite]] —— Qwik City 默认底层用 Vite 做 dev server

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
