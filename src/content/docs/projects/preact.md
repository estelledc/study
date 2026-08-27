---
title: Preact — 同步 VNode diff 的轻量 React 兼容渲染器
description: 介绍 Preact 10.29.8 如何用 Fragment 根、微任务批处理和原生事件代理渲染组件
来源: https://github.com/preactjs/preact
日期: 2026-05-29
分类: UI 框架
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/preactjs/preact
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 389c7bcc5140566f3fbae73cf17edf4ab44f4d96
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.29.8
---

## 是什么

Preact 是一个用同步虚拟 DOM diff 渲染组件的库。日常类比：它像一台只做“对比新旧菜单、改桌上的盘子”的后厨，不另建一套合成事件或可中断调度。

你写：

```js
import { h, render } from "preact";
import { useState } from "preact/hooks";

function Counter() {
  const [n, setN] = useState(0);
  return h("button", { onClick: () => setN(n + 1) }, n);
}

render(h(Counter, null), document.body);
```

`h` 就是 `createElement`。`render()` 会把传入树再包一层 `Fragment`，并把这棵树挂在容器的 `_children` 上，以便下次对比。固定 10.29.8 的 `package.json` 自称 “Fast 3kb”；本轮未测量 gzip 体积，不把营销数字当合同。

## 为什么重要

不理解 Preact 的同步 diff 和事件边界，就解释不了：

- 为什么核心包里的 `onChange` 绑定的是浏览器原生 `change`，而 `preact/compat` 会把它改成 `input`
- 为什么连续 `setState` 会合成一次更新，却仍然没有 Fiber 那种可中断优先级
- 为什么函数组件在 `render` 里再 `setState` 可能循环多次
- 为什么 alias 到 `preact/compat` 能骗过检查 `React.version` 的库

## 核心要点

固定 10.29.8 的执行链可以拆成五步：

1. **建 VNode**：`createElement` 抽出 `key`/`ref`，其余放进 `props`；内部 `createVNode` 给节点一个单调 `_original` 序号。

2. **挂根**：`render(vnode, parent)` 若 `parent == document` 会改写到 `document.documentElement`；首次渲染把现有 `childNodes` 当作 excess DOM，供 hydration / 重用。

3. **同步 diff**：函数组件没有 Fiber 栈。类组件走 `prototype.render`；函数组件被包成 `BaseComponent`，`doRender` 直接调用 `constructor(props, context)`。子树由 `diffChildren` 递归处理。

4. **批处理重绘**：`setState` 和 hook setter 进入 `enqueueRender`。默认用 `Promise.then` 排到微任务；`options.debounceRendering` 可替换。队列按 vnode `_depth` 排序后一次冲刷。

5. **原生事件代理**：`on*` 属性走 `addEventListener` + 共享 `eventProxy`。代理用实例级 event clock 丢掉“补丁期间新挂上的节点”误收到的冒泡。核心**不**把 `onChange` 改写成 `onInput`。

Hooks 在独立入口 `preact/hooks`：`useState` 就是 `useReducer`；`useLayoutEffect` 进 commit 回调；`useEffect` 在 paint 之后用 `requestAnimationFrame` 加 35 ms 超时冲刷。`useId` 生成 `P{mask0}-{mask1}`。

## 实践示例

### 案例 1：核心 API 不经过 compat

```js
import { h, render } from "preact";
render(h("input", { onChange: (e) => console.log(e.type) }), document.body);
```

核心路径会监听原生 `change`。文本框里每敲一个字通常**不会**触发；失焦才会。这是浏览器语义，不是 bug。

### 案例 2：compat 把 onChange 改成 onInput

```js
import { createElement, render } from "preact/compat";
render(createElement("input", { onChange: (e) => console.log(e.type) }), document.body);
```

`compat/src/render.js` 对 `input`/`textarea` 把 `onchange` 改成 `oninput`，但 `file`/`checkbox`/`radio` 例外。同一段 JSX，核心与 compat 的事件合同不同。

### 案例 3：微任务批处理

```js
function Tick() {
  const [n, setN] = useState(0);
  const bump = () => { setN((x) => x + 1); setN((x) => x + 1); };
  return h("button", { onClick: bump }, n);
}
```

两次 setter 都只把组件标脏并入队；默认 `Promise.then` 之后才 `diff` 一次。函数组件若在 `render` 里继续 `setState`，同一轮最多再循环 24 次（`count < 25`）。

## 踩过的坑

1. **把核心 Preact 的 `onChange` 当成 React**：核心走原生 `change`。要从 React 迁核心包，受控输入应写 `onInput`；只有走 `preact/compat` 才会自动改写。

2. **以为 `preact/compat` 等于 React 18 运行时**：compat 把 `version` 写成 `'18.3.1'` 是为了骗过库检测。它提供 `memo`/`forwardRef`/`Suspense`/`lazy`/`flushSync`，但没有把调度改成 Fiber。

3. **`render(vnode, document)`**：固定实现会改写到 `document.documentElement`，不是 `document.body`。

4. **把 3KB / 某 benchmark 名次写成当前事实**：`package.json` 描述仍写 “3kb”，本轮未测产物，也未跑 js-framework-benchmark。

5. **把 11.x 预发布线当成 10.29.8**：npm 另有 `11.0.0-beta.2` / `11.0.0-rc.1`；本文只绑定 tag `10.29.8`。

## 适用 vs 不适用场景

**适用**：

- 需要 React 风格组件模型，但不想引入 Fiber / 合成事件
- 岛屿架构或逐步替换 jQuery 的页面，组件树深度可控
- 明确走 `preact/compat` alias，并愿意逐个验证第三方 React 库

**不适用**：

- 依赖 React 19 RSC / `use()` / Actions 的项目
- 需要可中断渲染或优先级调度的超深树
- 必须使用核心包、却把 React 的 `onChange` 语义原样搬过来
- 不能接受固定 10.29.8 的同步 diff 与微任务批处理

## 固定版本边界

- 本文绑定 `preactjs/preact@389c7bcc...`，即 GitHub tag `10.29.8`，package `10.29.8`。
- npm 同版本没有 `gitHead`；不以 registry 反推 revision。
- 可选 peer：`preact-render-to-string >=5`。开发时 volta 钉的是 Node 20.19.1，不是运行时合同。
- `preact/compat` 另导出 `compat/client`、`compat/server`、`jsx-runtime`。
- 本文未安装依赖、未跑上游测试、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **API 像 React 不等于事件合同像 React**——compat 才做 `onChange` 改写和 `nativeEvent` 补丁
2. **同步递归 diff + 微任务队列**就能完成多数页面的批处理，不必先上 Fiber
3. **函数组件的 “render 中 setState” 有硬上限**——固定实现是 25 次，不是无限重试
4. **营销体积必须和固定 revision 分开**——描述写 3kb，验收仍要重新测量

## 应用型自测

1. 只用 `preact`（不 import compat）给 `<input>` 绑 `onChange`，用户连续输入时会每键触发吗？
2. 同一事件循环里连续两次 `setState`，默认会立刻 diff 两次吗？
3. `preact/compat` 报告的 `version` 是 10.29.8 吗？

检查点：

1. 不会。核心监听原生 `change`，文本输入通常在失焦时才触发。
2. 不会。默认 `Promise.then` 批成一次；队列按深度排序后冲刷。
3. 不是。compat 把 `version` 写成 `'18.3.1'` 以通过库检测。

## 延伸阅读

- 固定源码：[preactjs/preact](https://github.com/preactjs/preact) —— 本文绑定提交 `389c7bcc5140566f3fbae73cf17edf4ab44f4d96`
- 兼容层说明：[Switching to Preact](https://preactjs.com/guide/v10/switching-to-preact)
- [[lit]] —— 另一条轻量路径：没有 VNode 树，用 tagged template 更新 Custom Element
- [[react]] —— Preact 对齐的 API 来源；调度与事件模型不同

## 关联

- [[lit]] —— Web Component + template parts，和 VNode diff 对照
- [[react]] —— 同源 API；Fiber / 合成事件是 Preact 刻意不复制的部分
- [[vite]] —— 文档里常见的 alias 目标构建器
- [[solid]] —— 细粒度订阅，不走虚拟 DOM
- [[astro]] —— 岛屿架构里可能挂 Preact 岛

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[flutter]] —— Flutter — Google 的 Dart 跨平台 UI 框架
- [[hermes]] —— Hermes — Facebook 的 React Native JS 引擎
- [[radix-ui]] —— Radix UI — unstyled accessible 的 React 组件原语库
- [[react-dnd]] —— react-dnd — React 时代第一个把拖拽拆成四层的库
- [[swr]] —— SWR — React 远程数据 hook 的极简流派
- [[web-vitals]] —— web-vitals — 让你在自己页面测的数和 Google 排名用的数对得上
