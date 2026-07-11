---
title: why-did-you-render — 让 React 告诉你这次渲染到底为什么
来源: 'https://github.com/welldone-software/why-did-you-render'
日期: 2026-05-30
分类: 前端工具
难度: 中级
---

## 是什么

why-did-you-render（**WDYR**）是一个**只在开发时启用**的 React 调试库，每当一个组件重新渲染，它都会站出来对你喊：你这次渲染**到底为什么**？是 props 真变了，还是只是引用换了一只？

日常类比：像超市收银台的老员工，每次你拿同一瓶水重新结账时，他都会探头说"这瓶刚才结过了，你确定要再扫一次吗"——React 默认是个不爱说话的新员工，照单全收；WDYR 给它装了一张嘴。

具体做法是：**接管** React 的 `createElement` / `cloneElement` 和几个常用 hook，给每次组件渲染前后做一次 props/state/hook 的对账，发现"值等价但引用变了"就在 console 里打一段 diff，告诉你哪一行是冤枉的渲染。

它不是 React DevTools Profiler 的替代品——Profiler 告诉你"哪个组件慢"，WDYR 告诉你"哪个组件**白渲染了**"。

## 为什么重要

不理解 WDYR 这种"诊断假更新"的工具，下面这些事都没法解释：

- 为什么 `<Foo style={{width: 100}}/>` 看起来人畜无害，却让 `React.memo` 的优化彻底失效
- 为什么明明 props 的值都没变，子组件还在每次父组件 setState 时被重新渲染
- 为什么"性能差 = 组件本身慢"经常是个误导——React 性能问题 90% 是冤枉的 re-render
- 为什么 React Compiler 的"自动 memo"是把 WDYR 这一类调试工具往退休方向推

## 核心要点

WDYR 的工作可以拆成 **三步**：

1. **挖个旁路（monkey-patch）**：调一次 `whyDidYouRender(React)`，它就把 `React.createElement` 等公共方法换成自己包过的版本——React 没有提供官方钩子，它只能用这种"霸王硬上弓"的姿势。类比：你把家门口的门把手拆了，换成自己装的电子锁，外人推门照样能进，但每次进出都被记账。

2. **比较 prev 和 next（diff 决策）**：每次组件渲染时，wrapper 抓两份 props 做比较——外层走浅比（看 key），每个 value 内部再走深比（看引用 vs 值）。如果"值相等但引用不等"，就标记为 `deepEquals` 类型——这就是"白渲染"的特征指纹。

3. **结构化输出（updateInfo）**：比较结果不是一句话，而是一个**对象**：包含 `propsDifferences` / `stateDifferences` / `hookDifferences` / `ownerDifferences` 四个维度。默认 notifier 走 `console.group`，把 prev/next 字段级 diff 直接打到浏览器 console。

三步加起来，就是把"组件白渲染"从口头警告，变成一个**可定位、可分类、可写测试**的诊断对象。

## 实践案例

### 案例 1：5 分钟接入

在项目入口（如 `index.js`）顶部加 4 行，dev 环境才生效：

```js
import React from 'react';
if (process.env.NODE_ENV === 'development') {
  const wdyr = require('@welldone-software/why-did-you-render');
  wdyr.default(React, { trackAllPureComponents: true });
}
```

刷新页面，console 会开始出现 `Re-rendered for the same props` 的红色分组——说明它已经在替你盯着每一个 memo 组件。

### 案例 2：抓一个真实的"白渲染"

写一个被 `memo` 包过的子组件，故意传 inline object：

```jsx
const Child = React.memo(function Child({ style }) {
  return <div style={style}>hi</div>;
});
Child.whyDidYouRender = true;

function App() {
  const [n, setN] = React.useState(0);
  return <>
    <button onClick={() => setN(n + 1)}>{n}</button>
    <Child style={{ width: 100 }} />
  </>;
}
```

每点 button，console 立刻报：`different objects that are equal by value in ".style"`，prev/next 两份 `{width: 100}` 字面量并排——你**亲眼看到**引用不同但值相等。

### 案例 3：修一处验证

把 `style={{width: 100}}` 提到模块作用域：

```jsx
const STYLE = { width: 100 };
// ...
<Child style={STYLE} />
```

再点 button，Child 那行 console 直接消失。诊断 → 修复 → 验证闭环，2 分钟跑完——这是博客读 10 篇都换不来的"手感"。

## 踩过的坑

1. **多 React 副本只 patch 到一份**——monorepo dedup 失败或 micro-frontend 各自带 React 时，WDYR 只追到自己 import 那一份，另一份照常"装哑巴"
2. **inline arrow 永远报假阳性**——函数 diff 只比 `name` 不比 `toString`，匿名箭头 `name` 都是空字符串，每次 render 都会被判"等价但引用不等"
3. **trackAllPureComponents 在大型应用很贵**——每个被追踪的 functional 组件多出 2 个 useRef hook，几百个 memo 组件下 hook overhead 肉眼可见
4. **与 React Compiler 完全不兼容**——README 自己写了 `completely incompatible`，编译期自动 memo 之后，monkey-patch 会和编译产物冲突，要么用 Compiler，要么用 WDYR
5. **生产环境绝不能引**——README 反复警告 `It significantly slows down React`，必须用 `process.env.NODE_ENV === 'development'` 守卫，写错一次就是真事故

## 适用 vs 不适用

**适用**：

- 调一个具体的"为什么这个 list 每次都全量重渲染"的 bug
- code review 配套——合作者改了 props 结构，本地跑一遍看 console 有没有新红字
- 给团队新人讲"为什么不能 inline object prop"，开 demo 现场演示一次胜过 10 张幻灯片
- 接手老项目，全量打开 `trackAllPureComponents`，跑核心交互扫一遍找祖传引用问题

**不适用**：

- 想看应用"哪几个组件最耗时"——那是 React DevTools Profiler 的活，看 flame graph 不是看 diff
- 已经全量切到 React Compiler——Compiler 帮你自动 memo 了，WDYR 既不兼容也无用武之地
- 生产环境性能监控——WDYR 是 dev-only 工具，绝不能跑在线上用户面前
- 想"修复"白渲染——WDYR 只诊断不修复，修是你自己的活（提引用 / `useCallback` / `useMemo`）

## 历史小故事（可跳过）

- **2018**：Welldone Software 的 Vitali Zaidman 写出第一版 WDYR；那个年代 React DevTools Profiler 才刚出，行业还在用 `componentDidUpdate` 手动 `console.log`
- **2019**：v3 加入 hook tracking，开始 patch `useState` / `useReducer`——这一步把 WDYR 从"class 时代工具"拖进了 hooks 时代
- **2022**：v7 适配 React 18 的 concurrent rendering 和 StrictMode 双调用，引入 `renderNumber % 2 === 1` 跳过逻辑
- **2025-01**：v10.0.1 适配 React 19 + JSX automatic transform，提供 `jsx-runtime.js` / `jsx-dev-runtime.js` 两套接入
- **现在**：一作 Vitali 已加入 React 团队，未来 React Compiler 会逐步把 WDYR 解决的"该 memo 而没 memo"自动化掉，WDYR 的价值会从"调优工具"逐步退化为"教学工具"

## 学到什么

- **monkey-patch 是工具库的最后手段**：没有官方钩子时，替换公共方法是唯一选择，但要做幂等哨兵（`__IS_WDYR__`）和反挂回（`__REVERT_*`）
- **shallow 入口 + deep 内部** 是工程上"全 shallow 漏 / 全 deep 炸"的折中，diff 算法设计的经典样板
- **诊断 ≠ 修复**：好工具不替你做决定，而是把"原因"结构化暴露给你；从 `console.log("update")` 升级到 `console.group(updateInfo)` 是质变
- **dev 工具的灵魂是 NODE_ENV gate**：性能/正确性都允许牺牲，但必须有一道闸门把代价挡在线下
- **工具的目标不是消灭问题，而是把问题"看得见"**：WDYR 不替你 memo，但它让你看得到该 memo 而没 memo 的位置——这是诊断工具区别于自动化工具的核心定位

## 延伸阅读

- [welldone-software/why-did-you-render 仓库](https://github.com/welldone-software/why-did-you-render) —— 总入口 + README，红色警告比文档多
- [Vitali 的 v1.0 launch blog (Medium)](https://medium.com/welldone-software/why-did-you-render-mr-big-pure-react-component-2a36dd86996f) —— 原作者讲清楚动机的一篇
- [[react]] —— 理解 createElement / Fiber / useRef 的工作机制
- [[react-compiler]] —— 与 WDYR 哲学对立的"自动 memo"路径
- [[use-deep-compare-effect]] —— 解决"应对策略"，WDYR 解决"根因诊断"
- [React DevTools Profiler 文档](https://react.dev/learn/react-developer-tools) —— 看时间用它，看原因用 WDYR

## 关联

- [[react]] —— WDYR 的所有 monkey-patch 都是基于 React 公共 API 的
- [[react-compiler]] —— 与 WDYR 完全不兼容；编译期自动 memo 的另一条路
- [[use-deep-compare-effect]] —— "深比代替浅比"的应对工具，和 WDYR 是诊断 vs 治疗的关系
- [[eslint-plugin-react-hooks]] —— 编译期防"deps 缺失"，但抓不到 inline object prop
- [[react-devtools]] —— 看耗时与 commit 时序，和 WDYR 各管"性能"的一半
- [[turbopack]] —— 同样是 dev-only 工具的设计哲学：开发期重，生产期消失

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[testing-library]] —— Testing Library — 像用户一样测前端，重构不再挂测试
