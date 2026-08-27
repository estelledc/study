---
title: Sinon — 把 spy / stub / mock / 假时钟收进同一个 sandbox
description: 默认导出就是 sandbox；stub 按最长参数匹配选行为，ESM 不能直接 stub。
来源: https://github.com/sinonjs/sinon
日期: 2026-08-27
分类: 测试
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sinonjs/sinon
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ab289e92cdd76caf8cec2b0a8c9a391283e6c9df
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 22.1.0
---

## 是什么

Sinon 是一个测试替身库：它提供 spy（记调用）、stub（改返回）、mock（先写期望再核对）、fake（更短的记录函数）和假时钟。日常类比：它像实验室里那张可回收的工具台——你在台上换零件、记次数，测完一按 `restore()` 把原件装回去。

默认导入本身就是一个 `Sandbox`。`createApi()` 先 `new Sandbox()`，再挂上 `createSandbox`、`match`、`createStubInstance` 和 `@sinonjs/fake-timers`。

```js
import sinon from "sinon";

const clock = sinon.useFakeTimers();
const fetchUser = sinon.stub().resolves({ id: 1 });
clock.restore();
```

## 为什么重要

不理解 sandbox、行为表和属性描述符，就解释不了下面几件事：

- 为什么现在几乎不用再 `sinon.createSandbox()`——从 Sinon 5 起默认实例已经是 sandbox
- 为什么 `sinon.restore()` 不会顺带清掉你另建的子 sandbox（21.1.0 / #2701）
- 为什么 `sinon.stub(esmModule, "fn")` 会直接抛 `ES Modules cannot be stubbed`
- 为什么 `stub(obj, "meth", fn)` 这种三参数写法已经被删掉

## 核心要点

Sinon 主链可以拆成五步：

1. **选入口**：默认 `sinon` 是全局共用 sandbox；`createSandbox()` 另开一份独立 collection，不进默认 `restore()` 名单。

2. **包一层 proxy**：`spy` / `stub` / `fake` 都走 `createProxy`，记下 `args`、`thisValues`、`returnValues`、`exceptions` 和 per-sandbox `callId`。

3. **选本次行为**：`withArgs` 先按 `matchingArguments` 过滤；stub 再按参数长度排序，取最长匹配。`onCall(n)` 写进 `behaviors[n]`，调用时读 `behaviors[callCount - 1]`，没有就用 `defaultBehavior`。

4. **执行 `behavior.invoke`**：先按 `callsArg` / `yields*` 找回调；再按 throw、`returnsArg`、`callsFake`、`resolves` / `rejects`、`callsThrough` 或固定 `returnValue` 收场。

5. **恢复**：`restore()` 先倒序跑 `replace` restorer，再倒序 `restore` 每个 fake，最后清空 collection。超过 10000 个 fake 会打泄漏警告。

## 实践示例

### 案例 1：默认 sandbox 上的 stub

```js
const api = { load: () => "real" };
const load = sinon.stub(api, "load").returns("fake");

api.load();          // "fake"
load.calledOnce;     // true
sinon.restore();
api.load();          // "real"
```

`stub` 会保存原 descriptor；`restore` 对 own property 用 `defineProperty` 装回，对原型阴影属性则 `delete`。

### 案例 2：按参数和按次数分流

```js
const send = sinon.stub();
send.withArgs("retry").returns("queued");
send.onSecondCall().throws(new Error("busy"));
send.returns("ok");
```

`withArgs("retry")` 是另一条 fake，匹配时优先于无参默认。`onSecondCall()` 只覆盖第 2 次（0-based index 1）。`onCall(...).withArgs(...)` 会抛错，必须写成 `withArgs(...).onCall(...)`。

### 案例 3：假时钟默认从 0 开始

```js
const clock = sinon.useFakeTimers();
const later = setTimeout(() => {}, 1000);
clock.tick(1000);
clock.restore();
```

无参 `useFakeTimers()` 把 `@sinonjs/fake-timers` 装到 `now: 0`。传入 Date / epoch 或 config 对象才会改起点；非法类型抛 `TypeError`。

## 踩过的坑

1. **把默认 `sinon` 和 `createSandbox()` 当成同一份名单**：子 sandbox 的 fake 不进默认 collection，`sinon.restore()` 清不掉它们。

2. **去 stub ESM namespace**：`isEsModule(object)` 为真就抛错。要换导出，得走模块 loader 或包装一层 CJS / 自己的对象。

3. **三参数 `stub(obj, "meth", impl)`**：固定源码直接 `TypeError`，改用 `stub(obj, "meth").callsFake(impl)`。

4. **`replace` 错类型或换 accessor**：现有值与替换值类型必须相同；getter/setter 要走 `replaceGetter` / `replaceSetter`。不存在的属性该用 `define`。

5. **假时钟默认 epoch 是 0**：依赖“现在”的代码会看到 1970-01-01，除非传入 `now`。

## 适用 vs 不适用场景

**适用**：

- 已经有对象方法、需要记录调用并改返回值的 Node / 浏览器测试
- 要统一假时钟、XHR/假服务器和 assertion 的现有 Sinon 代码库
- 需要 `withArgs` + `onCall` 这种按参数和按次数叠行为的场景

**不适用**：

- 主体依赖 ESM named export，又不能改导入边界——Sinon 不能 stub ES module
- 想用“先排练调用再 thenReturn”的 TDD 句式——看 [[testdouble]]
- 只测网络层、不想碰实现对象——看 [[msw]]
- 把 Sinon 当 Jest / Vitest 的 runner。它不跑测试文件，只提供替身

## 固定版本边界

- 本文绑定 `sinonjs/sinon@ab289e92...` / tag `v22.1.0` / 包版本 `22.1.0`；npm `gitHead` 与 tag 一致。
- `exports`：`require` → `lib/sinon.js`，browser / import → `pkg/sinon-esm.js`。README 写明 `lib/` 是构建产物，仓库里不提交。
- 依赖 `@sinonjs/commons`、`@sinonjs/fake-timers`、`@sinonjs/samsam`、`diff`。没有 `engines` 字段；`COMPATIBILITY.md` 写 ES2023+、browserslist `maintained node versions`、不含 IE 11。
- 本文未安装依赖、未跑 mocha / 浏览器套件 / 假时钟，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认对象就是 sandbox**——清理合同在 collection，不在“全局单例”这个口头禅里。
2. **行为是一张表，不是一个返回值**——参数匹配、`onCall` 和 `callsThrough` 会改本次走哪条。
3. **属性描述符是硬边界**——不可配置、不可写、ESM namespace 都会让 stub 失败。
4. **假时钟是独立包装**——默认 `now: 0`，卸载走 `uninstall`（对外叫 `restore`）。

## 应用型自测

1. `const child = sinon.createSandbox(); child.stub(api, "load"); sinon.restore();` 之后 `api.load` 还是 stub 吗？
2. 对 `import * as mod from "./mod.js"` 做 `sinon.stub(mod, "fn")` 会怎样？
3. `stub.onCall(0).withArgs(1).returns(2)` 合法吗？

检查点：

1. 还是 stub。子 sandbox 不进默认 collection。
2. 抛 `ES Modules cannot be stubbed`。
3. 不合法。必须 `withArgs(1).onCall(0)`。

## 延伸阅读

- 官网：[sinonjs.org](https://sinonjs.org/)
- 固定源码：[sinonjs/sinon](https://github.com/sinonjs/sinon) —— 本文绑定提交 `ab289e92cdd76caf8cec2b0a8c9a391283e6c9df`
- [[testdouble]] —— 排练式 `when` / `verify`，模块替换走 quibble
- [[jest]] —— 自带 mock，常和 Sinon 二选一或叠时钟
- [[vitest]] —— `vi.fn` / `vi.useFakeTimers` 覆盖同类需求

## 关联

- [[testdouble]] —— 另一条 test-double 路线：先演示调用，再绑定结果
- [[jest]] —— runner + mock 全家桶；Sinon 只做替身
- [[vitest]] —— Vite 测试里的 `vi.stub` / 假时钟
- [[msw]] —— 在网络边界替换，不 wrap 业务对象
