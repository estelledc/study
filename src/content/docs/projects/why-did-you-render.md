---
title: why-did-you-render — 让 React 告诉你这次渲染到底为什么
来源: 'https://github.com/welldone-software/why-did-you-render'
日期: 2026-05-30
分类: 前端工具
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/welldone-software/why-did-you-render
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 752cfdb4d5c5eba5a8774fb19a978a7ac0a0d5de
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.0.1
---

## 是什么

why-did-you-render（**WDYR**）是一个 **只应在开发时启用** 的 React 诊断库。它 monkey-patch `React.createElement` / `cloneElement` 和若干 hook，在被跟踪组件再次渲染时比较 prev/next 的 props、state 和 hook 结果，并把“值等价但引用变了”打到 console。

日常类比：React 默认是不解释的收银员，同一瓶水再扫一次也不会说话；WDYR 是会探头问“这瓶刚才结过了，你确定要再扫吗”的老员工。它不是 React DevTools Profiler 的替代品——Profiler 回答“谁慢”，WDYR 回答“谁可能白渲染了”。

固定 10.0.1 的 `peerDependencies` 是 `react@^19`。README 写明：未测试 React Compiler，并相信 **完全不兼容**；生产环境绝不能用，因为会显著拖慢 React，且 patch 公共 API。

## 为什么重要

不理解这套 patch 合同，下面这些事会按旧印象写错：

- 为什么 `<Child style={{width: 100}} />` 能让 `React.memo` 失效，而 WDYR 会把它标成 `deepEquals`
- 为什么 React 19 的 automatic JSX 需要 `importSource`，而 `jsx-runtime.js` 本身并不包一层 WDYR
- 为什么默认 notifier **不报**“props 真的变了”的渲染，除非打开 `logOnDifferentValues`
- 为什么调用两次 `whyDidYouRender(React)` 不会叠两层 patch

## 核心要点

固定 10.0.1 的工作可以拆成三步：

1. **挂旁路**：`whyDidYouRender(React, options)` 若看到 `React.__IS_WDYR__` 直接返回。否则保存原 `createElement` / `createFactory` / `cloneElement`，换成会调用 `getWDYRType()` 的包装。`__REVERT_WHY_DID_YOU_RENDER__` 能把方法和 hook 还原。

2. **决定跟不跟踪**：`shouldTrack()` 看 `Component.whyDidYouRender`、`include`/`exclude` 正则，以及 `trackAllPureComponents`（只覆盖 `PureComponent` 和 `React.memo`）。默认 `trackHooks: true`，会包装 `useState` / `useReducer` / `useContext` / `useSyncExternalStore`；`useMemo` / `useCallback` 只把 deps 记进 WeakMap，不当 hook 变更上报。

3. **结构化 diff**：`getUpdateInfo()` 产出 `propsDifferences` / `stateDifferences` / `hookDifferences` / `ownerDifferences`。顶层对象按 key 浅看，每个 value 再走 `calculateDeepEqualDiffs`。函数先比 `name`；同名且来自被跟踪 hook 时再深比 deps。默认 notifier 只在 **没有** `diffType === 'different'` 时打日志，也就是专抓“引用变了、值没变”。

class 组件用 `renderNumber % 2 === 1` 跳过 StrictMode 的奇数次渲染；functional wrapper 没有这条短路，每次后续 render 都比较。

## 实践案例

### 案例 1：React 19 的开发态接入

README 要求 `preset-react` 走 automatic runtime，并且 **development** 才把 `importSource` 指到本包：

```js
['@babel/preset-react', {
  runtime: 'automatic',
  development: process.env.NODE_ENV === 'development',
  importSource: '@welldone-software/why-did-you-render',
}]
```

入口仍要 **最先** 调用 `whyDidYouRender(React)`，否则 `wdyrStore.React` 为空，`jsxDEV` wrapper 会原样落到 React：

```js
import React from 'react';
if (process.env.NODE_ENV === 'development') {
  const whyDidYouRender = require('@welldone-software/why-did-you-render');
  whyDidYouRender(React, { trackAllPureComponents: true });
}
```

`jsx-dev-runtime.js` 才替换 `jsxDEV`。同版本的 `jsx-runtime.js` 只是 `require('react/jsx-runtime')`，生产/非 dev transform 不会自动获得跟踪。

### 案例 2：抓一次“值相等、引用不等”

```jsx
const Child = React.memo(function Child({ style }) {
  return <div style={style}>hi</div>;
});
Child.whyDidYouRender = true;

function App() {
  const [n, setN] = React.useState(0);
  return (
    <>
      <button onClick={() => setN(n + 1)}>{n}</button>
      <Child style={{ width: 100 }} />
    </>
  );
}
```

父组件每次 `setN` 都新建 `{ width: 100 }`。WDYR 的 deep diff 应把它标成 `deepEquals`（“different objects that are equal by value”）。本文未在浏览器里跑这个例子。

### 案例 3：修引用后再看 notifier 是否安静

```jsx
const STYLE = { width: 100 };
<Child style={STYLE} />
```

顶层 `findObjectsDifferences` 先做 `prev === next`。引用不变则整段 props diff 为 `false`，默认 notifier 不再为这次 Child 开 group。这是诊断 → 改引用 → 再看 console 的闭环，不是 WDYR 替你 memo。

## 踩过的坑

1. **把 `jsx-runtime.js` 当成第二套 patch**：10.0.1 里它不包 `jsx()`。只配 production runtime、或忘了先调用 `whyDidYouRender(React)`，都会静默无日志。

2. **多份 React 只 patch 到你传入的那一份**：monorepo / microfrontend 若解析出两份 `react`，另一份的 `createElement` 仍是哑巴。`__IS_WDYR__` 也只打在传入对象上。

3. **匿名函数永远像“等价但新引用”**：函数 diff 比的是 `name`。inline arrow 的 `name` 常是空字符串，两次都会走 `diffTypes.function`。`useMemo`/`useCallback` 只有在 hook wrapper 把结果放进 `dependenciesMap` 后才会比 deps。

4. **`trackAllPureComponents` 会给每个被跟踪 function 多两个 `useRef`**：`patchFunctionalOrStrComponent` 用它们存 prev props 和 prev owner。大应用全开会改变 hook 数量和耗时；README 也警告不要把它当通用性能优化器。

5. **默认 notifier 会吞“真的变了”**：`shouldLog()` 看到任何 `different` 就返回 false。想记录合法更新必须设 `logOnDifferentValues`。热更新后 `hotReloadBufferMs` 默认 500ms 内也会静音。

6. **React Compiler / 生产构建**：README 两段 CAUTION 写死。Compiler 自动 memo 之后，这套 createElement patch 没有合同；生产引入会同时付出性能和正确性风险。

## 适用 vs 不适用场景

**适用**：

- 追查某个 `memo` / `PureComponent` 为什么还在更新
- 用 `trackExtraHooks` 看 React-Redux `useSelector` 这类自定义 hook 的结果引用
- 给新人演示 inline object / inline function 怎样打穿浅比较

**不适用**：

- 找“哪个组件最耗时”——那是 Profiler / flame graph
- 已经全量 React Compiler，并且接受 README 的不兼容声明
- 生产监控或 RUM——这是 dev-only monkey-patch
- 期望工具自动修好引用——它只产出 `updateInfo`，不改你的组件

## 固定版本边界

- 本文绑定 `welldone-software/why-did-you-render@752cfdb4...`，即 GitHub annotated tag `v10.0.1` 剥出的 commit；`package.json` 为 `10.0.1`。
- npm `10.0.1` 的 `gitHead` 是 `5623596ee8833f8352c6bf7a713619a1bcd57c6c`（tag 之后的 badge 提交）；`master` 后来还有 `3ec3512d...`，版本号仍写 10.0.1。本文不把后两份当成同一 provenance。
- 运行时依赖 `lodash@^4`；类型和 `dist/` 随 npm 包发布，本 review 读的是 `src/`。
- 本文未安装依赖、未跑 Jest/Cypress、未在浏览器挂载 React 19，状态保持 `UNVERIFIED`。

## 学到什么

1. **没有官方钩子时，幂等哨兵和 revert 是最低安全网**——`__IS_WDYR__` 与 `__REVERT_*` 决定能不能安全地补丁公共 API。
2. **诊断默认要偏向假阳性里的“白渲染”**——默认 notifier 故意忽略值真的变了的更新。
3. **JSX transform 入口和 `whyDidYouRender()` 必须成对**——只改 babel `importSource` 或只 patch `React.createElement`，在 React 19 都会漏一侧。
4. **函数相等是工程近似**——比 `name` 和 hook deps，不比 `toString()`。

## 应用型自测

1. 第二次调用 `whyDidYouRender(React)` 会再包一层 `createElement` 吗？
2. 默认 notifier 会不会为 `prev={a:1}` → `next={a:2}` 打日志？
3. 只引入 `jsx-runtime.js`、不调用 `whyDidYouRender(React)`，automatic production runtime 会被跟踪吗？

检查点：

1. 不会。已有 `React.__IS_WDYR__` 时函数直接 return。
2. 不会。顶层值变化是 `different`，`shouldLog` 为 false，除非 `logOnDifferentValues`。
3. 不会。`jsx-runtime.js` 原样重导出 React；跟踪发生在 `jsxDEV` 包装和已初始化的 `wdyrStore`。

## 延伸阅读

- 固定源码：[welldone-software/why-did-you-render](https://github.com/welldone-software/why-did-you-render) —— 本文绑定提交 `752cfdb4d5c5eba5a8774fb19a978a7ac0a0d5de`
- [Vitali 的 v1.0 动机文](https://medium.com/welldone-software/why-did-you-render-mr-big-pure-react-component-2a36dd86996f)
- [[react]] —— `createElement` / memo / hook 的公共合同
- [[react-compiler]] —— README 声明与 WDYR 不兼容的自动 memo
- [React DevTools Profiler](https://react.dev/learn/react-developer-tools) —— 看耗时用它

## 关联

- [[react]] —— 全部 monkey-patch 都建立在 React 公共对象上
- [[react-compiler]] —— 编译期 memo，和运行时 patch 互斥
- [[use-deep-compare-effect]] —— 用深比回避引用抖动；WDYR 负责把抖动显示出来
- [[eslint-plugin-react-hooks]] —— 管 deps 数组写没写全，不管 inline object prop
- [[react-devtools]] —— 看 commit 时序和耗时
- [[turbopack]] —— 同样把重代价留在 development

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[testing-library]] —— Testing Library — 像用户一样测前端，重构不再挂测试
