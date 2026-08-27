---
title: Enzyme — 用 adapter 把 React 树收成可查询 wrapper
description: Three render modes share one adapter; mount needs a document, shallow does not.
来源: https://github.com/enzymejs/enzyme
日期: 2026-08-27
分类: 测试
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/enzymejs/enzyme
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 88dae28d8bda4c1e8582d63f9162fb1200d10ec4
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.11.0
---

## 是什么

Enzyme 是一套 React 组件测试工具：它不自己实现 React，而是要求你先装一个 **adapter**，再把组件收成可查询的 wrapper。日常类比：adapter 像相机卡口，wrapper 像取景框——你换卡口才能拍，取景框只让你看已经渲染出来的那一层。

三个入口走三条 renderer 模式：

```js
const { configure, shallow, mount, render } = require("enzyme");
const Adapter = require("enzyme-adapter-react-16");

configure({ adapter: new Adapter() });

const wrap = shallow(<Counter />);
```

`shallow` 得到 `ShallowWrapper`，`mount` 得到 `ReactWrapper`，`render` 把静态 HTML 交给 cheerio。固定 3.11.0 同树的官方 adapter 是 `enzyme-adapter-react-16@1.15.2`，peer 为 React 16。

## 为什么重要

不理解 adapter、三种 mode 和 lifecycle 开关，就解释不了下面几件事：

- 为什么第一次调用就会抛 “expects an adapter to be configured”
- 为什么 `configure({ adapter: Adapter })` 把构造函数传进去仍会失败
- 为什么 `mount()` 没 document 会硬失败，而 `shallow()` 不会
- 为什么 `dive()` 只能再浅渲染一个 custom component，不能对 `div` 用

## 核心要点

固定版本的主链可以拆成五步：

1. **登记 adapter**：`configure` 是 `configuration.merge`，对模块级对象做 `Object.assign`。`getAdapter` 先看本次 `options.adapter`，否则读这份配置。

2. **校验实例**：adapter 必须存在、必须是对象实例，且 `instanceof EnzymeAdapter`。传入 class 本身会单独报错。

3. **选 mode**：`EnzymeAdapter.MODES` 为 `shallow` / `mount` / `string`。React 16 adapter 的 `createRenderer` 按 mode 分派到 shallow renderer、`ReactDOM` 或 `renderToStaticMarkup`。

4. **收成 wrapper**：根节点必须是 valid element。`shallow` 不检查 `window`/`document`；`mount` 两者都缺就抛错。

5. **补生命周期**：首次 shallow 后，若实例存在且未设 `disableLifecycleMethods`，会在需要时改写 `instance.setState`，再用 `batchedUpdates` 调 `componentDidMount`。

## 实践示例

### 案例 1：必须先 `new Adapter()`

```js
const Enzyme = require("enzyme");
const Adapter = require("enzyme-adapter-react-16");

Enzyme.configure({ adapter: new Adapter() });
const wrap = Enzyme.shallow(<button type="button">ok</button>);
wrap.text(); // "ok"
```

`configure({ adapter: Adapter })` 会在 `validateAdapter` 里失败：它要的是实例，不是构造函数。

### 案例 2：`dive()` 开一个新的浅根

```js
function Inner() { return <span>hi</span>; }
function Outer() { return <Inner />; }

const wrap = shallow(<Outer />);
wrap.find(Inner).dive().text(); // "hi"
```

`dive()` 只能作用于 custom component。它对 host 节点抛 `TypeError`，并用 `wrap(el, null, childOptions)` 新建根 wrapper，不是在原树上继续往下走。

### 案例 3：`mount` 依赖全局 document

```js
// 没有 global.window / global.document 时：
mount(<App />);
// Error: It looks like you called `mount()` without a global document being loaded.
```

`render(<App />)` 不走这条检查；它要 string renderer 和 cheerio。本轮未挂真实 DOM，也未跑 jsdom。

## 踩过的坑

1. **把 adapter 包名当成自动配置**：核心库默认 `configuration = {}`，没有任何 React 版本被内置。

2. **以为 `shallow` 不跑 lifecycle**：默认会跑 `componentDidMount`；要关掉需显式 `disableLifecycleMethods: true`。

3. **把 `dive()` 当 `mount`**：它仍是 shallow，只是对子组件再开一次浅渲染。

4. **把 3.11.0 说成支持 React 18**：本提交里官方 adapter 的 peer 是 `react@^16`。仓库外的 17/18 adapter 不在本轮固定源码内。

5. **把 `simulate` 当浏览器事件序列**：它把事件交给当前 renderer，再 `update()` 根 wrapper，不保证完整 DOM 事件链。

## 适用 vs 不适用场景

**适用**：

- 仍停在 React 16，并接受官方 `enzyme-adapter-react-16`
- 需要读 `instance` / `state`，或对单个子组件 `dive()`
- 测试运行时已经提供 document（mount）或可以只用 shallow / string render

**不适用**：

- React 17 / 18 / 19 的并发、hooks 和官方测试栈——本提交没有对应 official adapter
- 想按用户可见角色查询，而不是按组件类型和内部 state
- 不能先 `configure` 出合法 adapter 实例的环境

## 固定版本边界

- 本文绑定 `enzymejs/enzyme@88dae28d...`，lightweight tag `enzyme@3.11.0`。
- npm `enzyme@3.11.0` 不暴露 `gitHead`；package `repository` 仍写 `airbnb/enzyme`。`airbnb/enzyme` 与 `enzymejs/enzyme` 的同名 tag 指向同一提交。
- 同树 `enzyme-adapter-react-16@1.15.2` 依赖 `react-test-renderer/shallow`、`react-dom` 与 `react-dom/server`。
- 本文未安装依赖、未跑上游测试、未挂 DOM，状态保持 `UNVERIFIED`。

## 学到什么

1. **Enzyme 的产品边界是 adapter 协议**——三种入口只是 mode 不同的 renderer 客户。
2. **配置是进程级 merge**——`configure` 改模块状态，不是每次调用的局部对象。
3. **shallow 省的是 document，不是 lifecycle**——默认仍补 `componentDidMount`。
4. **官方 3.11.0 停在 React 16**——更高版本不能从本提交推导。

## 应用型自测

1. 只写 `configure({ adapter: Adapter })` 不 `new`，第一次 `shallow()` 会成功吗？
2. 没有 `global.document` 时，`shallow(<X />)` 和 `mount(<X />)` 谁会先失败？
3. `shallow(<Outer />).find(Inner).dive()` 得到的是原 wrapper 的子视图，还是新的根 wrapper？

检查点：

1. 不会。`validateAdapter` 拒绝构造函数。
2. `mount` 失败；`shallow` 不检查 document。
3. 新的根 wrapper。`dive()` 传入 `root = null`。

## 延伸阅读

- 固定源码：[enzymejs/enzyme](https://github.com/enzymejs/enzyme) —— 本文绑定提交 `88dae28d8bda4c1e8582d63f9162fb1200d10ec4`
- 历史文档站点：[airbnb.io/enzyme](https://airbnb.io/enzyme/)（安装说明仍以 adapter 为核心）
- [[unexpected]] —— 句子式断言库；和 Enzyme 常被一起用，但是另一份源码合同

## 关联

- [[unexpected]] —— leftover React-test 双子的断言一侧
