# React-test leftover source review

> 用途：记录 Enzyme、Unexpected 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DX
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与 README / docs 阅读
- not executed：未安装两仓依赖，未运行上游 mocha / karma / jest / jasmine、未挂载真实 DOM、未测 bundle 或性能
- worktrees：本机 `research-worktrees/`，不进入 Git
- 选题：`testing-library` 页已在 `origin/main` 且开放 PR #70 占用；调用方标明 happy-dom 已被其他 writer 占用；本轮取 leftover 双子 `enzyme` + `unexpected`。未改 vitest / jest / playwright。

## Enzyme

- canonical source：`https://github.com/enzymejs/enzyme`
- revision：`88dae28d8bda4c1e8582d63f9162fb1200d10ec4`
- package：`enzyme@3.11.0`
- companion in-tree：`packages/enzyme-adapter-react-16` 自报 `1.15.2`，peer 为 `react` / `react-dom` `^16.0.0-0`
- provenance：
  - GitHub lightweight tag `enzyme@3.11.0` 在 `enzymejs/enzyme` 与 `airbnb/enzyme` 都指向该提交
  - npm `enzyme@3.11.0` 不暴露 `gitHead`；`repository.url` 仍写 `airbnb/enzyme`，`directory` 为 `packages/enzyme`
  - 不以 registry 反推 revision；正文绑定可达 tag
- inspected：
  - `packages/enzyme/package.json`
  - `packages/enzyme/src/index.js`
  - `packages/enzyme/src/shallow.js`
  - `packages/enzyme/src/mount.js`
  - `packages/enzyme/src/render.js`
  - `packages/enzyme/src/configuration.js`
  - `packages/enzyme/src/getAdapter.js`
  - `packages/enzyme/src/validateAdapter.js`
  - `packages/enzyme/src/EnzymeAdapter.js`
  - `packages/enzyme/src/Utils.js`
  - `packages/enzyme/src/ShallowWrapper.js`
  - `packages/enzyme/src/ReactWrapper.js`
  - `packages/enzyme-adapter-react-16/package.json`
  - `packages/enzyme-adapter-react-16/src/ReactSixteenAdapter.js`
- observed：
  - 公开入口只导出 `shallow` / `mount` / `render`、两种 Wrapper、`configure`（即 `configuration.merge`）和 `EnzymeAdapter`
  - `configure` 对模块级对象做 `Object.assign`；`getAdapter` 优先 `options.adapter`，否则读这份配置
  - 缺 adapter、传入构造函数而不是实例、或实例未继承 `EnzymeAdapter`，都会在第一次 `getAdapter` 时抛错
  - `EnzymeAdapter.MODES` 为 `string` / `mount` / `shallow`；React 16 adapter 的 `createRenderer` 按 mode 分派
  - `shallow()` 构造 `ShallowWrapper`，不检查 `window`/`document`；根节点必须是 valid element
  - 首次 shallow 后，若实例存在且未设 `disableLifecycleMethods`，会在 `componentDidUpdate.onSetState` 时改写 `instance.setState`，并用 `batchedUpdates` 调 `componentDidMount`
  - `mount()` 构造 `ReactWrapper`；没有 `global.window` 与 `global.document` 会硬失败
  - `render()` 走 `adapter.createRenderer({ mode: 'string' })`，再把 HTML 交给 `loadCheerioRoot`
  - `dive()` 只能作用于 custom component，不能作用于 host；它用 `wrap(el, null, childOptions)` 开一个新的根 wrapper
  - `simulate` 把事件交给 renderer 后调用根 `update()`
  - 本提交没有 React 17 / 18 official adapter；adapter-react-16 依赖 `react-test-renderer/shallow`、`react-dom` 与 `react-dom/server`

## Unexpected

- canonical source：`https://github.com/unexpectedjs/unexpected`
- revision：`a47e211af54bdbf19ae15b81c3f30f86aa5bde7a`
- package：`unexpected@13.2.1`
- provenance：GitHub annotated tag `v13.2.1` 剥开后与 npm `13.2.1` 的 `gitHead` 指向同一提交
- inspected：
  - `package.json`
  - `lib/index.js`
  - `lib/createTopLevelExpect.js`
  - `lib/assertions.js`
  - `lib/types.js`
  - `lib/notifyPendingPromise.js`
  - `lib/UnexpectedError.js`
  - `README.md`
- observed：
  - 默认导出是 `createTopLevelExpect()().use(styles).use(types).use(assertions).freeze()`
  - 顶层 `expect(...args)` 转到 `_expect(new Context(), args)`；少于两个参数会抛错
  - 第二个参数若是 function，走 `withError`，不是断言字符串
  - 断言按 subject 类型 + 描述字符串查找；找不到时从右往左尝试最长前缀，以便嵌套断言
  - `<any> to be <any>` 用 `objectIs`；`<string> to be <string>` 改走 `to equal`；`<any> to equal <any>` 调 `expect.equal`，默认 depth 100，环会抛 `Cannot compare circular structures`
  - `freeze()` 只置 `_frozen`；`use` / `addAssertion` / `addType` / `hook` 在冻结实例上会要求先 `clone()`
  - `clone()` 复制 assertions、types、plugins 并重装 hooks；`child()` 是空的嵌套 expect，可通过 `exportAssertion` 写回父级
  - plugin 必须是 function 或带 `installInto` 的对象；同名不同 version 会抛错
  - `unexpected-promise`（8.5.0 起内建）和 `unexpected-set`（13.0.0 起内建）再 `use` 会硬失败
  - 异步结果若是 pending promise，会 `notifyPendingPromise`；mocha/jasmine 的 `afterEach` 在测试已通过但仍有未返回 promise 时抛错
  - 没有 `engines` 字段；未审查 `unexpected-react` 插件

## 未覆盖

- 未安装 `unexpected-react` / `enzyme-adapter-react-17` 等仓库外插件
- 未对照 React 17+ concurrent / hooks 行为做运行验证
- 未测量 wrapper 查询或 assertion diff 的性能
