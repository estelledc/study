---
title: uncrypto — 用条件导出对齐 Web Crypto 表面
description: 用条件导出把 Node crypto 与 globalThis crypto 收成同一组 Web Crypto 表面
来源: https://github.com/unjs/uncrypto
日期: 2026-08-27
分类: 认证
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/uncrypto
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a0cd466151b2b728a54b085c931c7173fdecc26b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.1.3
---

## 是什么

uncrypto 是一个 **按运行时条件导出的 Web Crypto 门面**。日常类比：它不另造密码算法，只给你一张统一插座——Node 插 `node:crypto`，浏览器和 Worker 插 `globalThis.crypto`。

```ts
import { subtle, randomUUID, getRandomValues } from "uncrypto"
const id = randomUUID()
```

固定 `0.1.3` 导出 `subtle`、`randomUUID`、`getRandomValues` 和一份默认 `crypto` 对象。它**不是**旧 Node 的 polyfill：README 要求 Node.js 15+，并且依赖运行时已经露出 `webcrypto` / `globalThis.crypto`。

## 为什么重要

不看导出表，很容易把它写成“到处都能用的完整 SubtleCrypto 实现”：

- 为什么同一句 `import { subtle } from "uncrypto"` 在 Node 和 Cloudflare Worker 会落到两份源码
- 为什么 Node 入口的 `subtle` 在缺 `webcrypto.subtle` 时是 `{}`，不是补齐算法
- 为什么 `randomUUID` 在 Node 走 `node:crypto.randomUUID()`，不走 `webcrypto.randomUUID()`
- 为什么它和 [[iron-webcrypto]] 能配对：那边消费全局 `crypto.subtle`，这边提供可 import 的同一表面

## 核心要点

固定版本可以拆成四层：

1. **两份实现**：`src/crypto.node.ts` 包 `node:crypto`；`src/crypto.web.ts` 包 `globalThis.crypto`。两边都组装 `{ randomUUID, getRandomValues, subtle }`。
2. **条件导出选文件**：`node` 条件指向 `dist/crypto.node.*`；`browser` / `bun` / `deno` / `edge-light` / `edge-routine` / `lagon` / `netlify` / `react-native` / `wintercg` / `worker` / `workerd` 指向 `crypto.web`。默认 `import` / `require` 也是 web 构建。
3. **Node 细节不同**：`randomUUID` 调 Node 自己的实现；`getRandomValues` 要求 `nodeCrypto.webcrypto` 存在；`subtle` 写成 `nodeCrypto.webcrypto?.subtle || {}`。
4. **没有算法补丁**：测试只断言 UUID 形态、随机数组非零，以及 `Object.keys(subtle)` 为空——因为 SubtleCrypto 方法挂在原型上，不是自有键。

`src/utils.ts` 只有 `import crypto from "uncrypto"`，不是公开 API。

## 实践示例

### 案例 1：按导出取三个原语

```ts
import { subtle, randomUUID, getRandomValues } from "uncrypto"

const nonce = new Uint8Array(16)
getRandomValues(nonce)
const id = randomUUID()
```

打包器 / Node 解析条件导出后，这三个名字来自同一份实现。本轮没有在 Node 20 或 Worker 里实际执行。

### 案例 2：默认对象与 Node / Web 分叉

```ts
import crypto from "uncrypto"
await crypto.subtle.digest("SHA-256", new Uint8Array([1, 2, 3]))
```

Web 入口把 `subtle` 设成 `globalThis.crypto.subtle`。Node 入口在 `webcrypto.subtle` 缺失时给 `{}`，这时 `digest` 会在运行期失败——库不会偷偷换成 `createHash`。

### 案例 3：不要把它当旧环境 polyfill

```js
// 错误预期：Node 14 或非安全上下文浏览器会“自动补上 Web Crypto”
import { subtle } from "uncrypto"
```

README 写明 Node 15+、浏览器要 Secure Context，其他运行时要自己露出 `globalThis.crypto`。缺表面时，uncrypto 只是把空引用转发出去。

## 踩过的坑

1. **把 npm latest 的 tag 当成发布提交**：Git tag `v0.1.3` 指向 `90a308f0...`，该提交 `package.json` 仍是 `0.1.2`。npm `gitHead` 才是发布提交 `a0cd4661...`。
2. **以为 `Object.keys(subtle)` 有方法名就表示实现完整**：固定测试快照就是 `[]`。
3. **在 CJS Node 里以为走到了 web 构建**：`main` 是 `./dist/crypto.node.cjs`；无条件 `import` 默认才是 web。
4. **把它写成 iron / JWT / 会话库**：它只转发 Web Crypto 表面，不封对象。
5. **把后续 `main` chore commit 当成 0.1.3**：本页不绑定 2024-03 的依赖更新头。

## 适用 vs 不适用场景

**适用**：

- 代码要同时跑在 Node 与 WinterCG 运行时，只需要 `subtle` / `randomUUID` / `getRandomValues`
- 愿意用条件导出，而不是自己 `if (typeof crypto === ...)`
- 运行时已经提供 Web Crypto，只差统一 import 路径

**不适用**：

- 需要给 Node 14 或非安全浏览器补算法
- 要把 `node:crypto` 的 `createHash` / `createHmac` 也收进同一 API
- 需要本页证明 Worker / Bun / Deno 条件导出在真实打包器里都命中了

## 固定版本边界

- 本文绑定 `unjs/uncrypto@a0cd4661...`，npm `uncrypto@0.1.3`；该 SHA 与 npm `gitHead` 一致。
- Git tag `v0.1.3` → `90a308f0...` 是祖先，且自报 `0.1.2`；tag 与 npm 分裂已披露，不猜测或伪造“正确 tag”。
- 发布提交相对 tag 多了 runtime export conditions（`abf5508`）和 devDependency 更新。
- 未安装依赖、未跑 vitest、未在 Node / 浏览器调用 `subtle`，状态保持 `UNVERIFIED`。

## 学到什么

1. **条件导出是全部实现**——没有第三份“智能探测”运行时代码。
2. **空对象回退不是 polyfill**——缺 `webcrypto.subtle` 时，调用会失败而不是换算法。
3. **Node 的 UUID 与 Web 入口不是同一条函数**。
4. **版本身份要以可达 `gitHead` 为准**，不能只信同名 git tag。

## 应用型自测

1. 在固定 Node 入口里，`webcrypto.subtle` 不存在时 `subtle.encrypt` 会怎样？
2. `import { subtle } from "uncrypto"` 在 Cloudflare `workerd` 条件下降到哪份源码？
3. 把 Git tag `v0.1.3` 的 SHA 写成 npm 0.1.3 的 revision，对吗？

检查点：

1. `subtle` 是 `{}`，没有 `encrypt`，调用失败。库不会改走 `node:crypto` 的非 Web API。
2. `crypto.web`，也就是 `globalThis.crypto.subtle`。
3. 不对。tag 指向 `90a308f0...`（自报 0.1.2）；发布提交是 `a0cd4661...`。

## 延伸阅读

- 固定源码：[unjs/uncrypto](https://github.com/unjs/uncrypto) —— 本文绑定提交 `a0cd466151b2b728a54b085c931c7173fdecc26b`
- Web Crypto：[MDN SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)
- [[iron-webcrypto]] —— 消费 `crypto.subtle` 做 Iron 密封串
- [[ofetch]] —— 同属 unjs、靠条件导出分运行时的对照
- [[unstorage]] —— 另一份 unjs 门面，抽象的是 KV 而不是 crypto

## 关联

- [[iron-webcrypto]] —— 密封/拆封层，默认用全局 Web Crypto
- [[ofetch]] —— 条件导出分 Node / worker / 浏览器入口
- [[unstorage]] —— unjs 运行时无关门面的另一例
- [[lucia]] —— 会话层对照；本页不产生 token
- [[bun]] / [[deno]] —— export 表点名的运行时，本轮未实测
