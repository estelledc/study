---
title: es-toolkit — 分类导出的现代工具函数集，compat 另走一条入口
description: 主入口不带 lodash 语义；chunk/debounce/merge 的严格合同与 compat 层不同
来源: https://github.com/toss/es-toolkit
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/toss/es-toolkit
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5dc4477f838b8cee2b6b09af4f373be2b3aaaa54
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.51.0
---

## 是什么

es-toolkit 是一个按类别拆文件的 JavaScript / TypeScript 工具函数库。日常类比：它不是一整个 Lodash 抽屉，而是一组标好「数组 / 函数 / 对象」的小盒子；要 lodash 同款行为，得另开 `es-toolkit/compat` 那一盒。

```ts
import { chunk, debounce } from "es-toolkit"
chunk([1, 2, 3, 4, 5], 2)
// [[1, 2], [3, 4], [5]]
```

固定 `1.51.0` 的 `package.json` 声明 `"sideEffects": false`，并用 `exports` 暴露 `.`、`./array`、`./compat`、`./fp` 等子路径。主入口 `src/index.ts` 再导出 array / function / object 等现代实现，**不**再导出 compat。

## 为什么重要

不看主入口和 compat 两套 `chunk`，容易把「替代 lodash」理解成「同一个函数、两种包装」：

- 为什么 `chunk(arr, 0)` 在 `es-toolkit` 抛错，在 `es-toolkit/compat` 却得到 `[]`
- 为什么 `import { debounce } from "es-toolkit"` 默认只走 trailing，而 throttle 默认 leading+trailing
- 为什么 `merge` 会改传入的 target，想要新对象得用 `toMerged`
- 为什么 README 里的 2–3× / 「最多小 97%」不能直接写成已测事实

一句话：它是 **现代严格合同 + 可选 lodash 兼容层**，不是把 lodash 换了个包名。

## 核心要点

固定 1.51.0 的主链可以拆成五步：

1. **先选入口**：`es-toolkit` 走现代实现；`es-toolkit/compat` 才追求 lodash 对齐，并且注明会故意省略部分不安全隐式转换。`es-toolkit/fp` 另有 `pipe` / `flow`。
2. **现代 `chunk` 先验 size**：`size` 必须是大于 0 的整数，否则抛 `Size must be an integer greater than zero.`；compat 则 `Math.max(Math.floor(size), 0)`，`0` 或非 array-like 返回 `[]`。
3. **`debounce` 记边沿**：默认 `edges == null` 时只 trailing；`edges` 含 `leading` 时第一次调用立刻 `invoke`。返回函数带 `schedule` / `cancel` / `flush`，并可接 `AbortSignal`。
4. **`throttle` 包着 debounce**：默认 `edges = ['leading', 'trailing']`，用 `pendingAt` 判断是否已过窗口。
5. **对象写入分两条**：`pick` 只用 `Object.hasOwn`；`merge(target, source)` 就地递归改 target，source 的 `undefined` 不覆盖已有值；`toMerged` 先深拷再合并。

`isNotNil` 是 `x != null` 的类型守卫。`delay(ms, { signal })` 在 abort 时 `reject(new AbortError())`。`limitAsync(fn, n)` 用 `Semaphore` 限制并发。

## 实践示例

### 案例 1：现代 chunk 与 compat 的 size=0

```ts
import { chunk } from "es-toolkit"
import { chunk as chunkCompat } from "es-toolkit/compat"

chunk([1, 2, 3], 2)        // [[1, 2], [3]]
chunkCompat([1, 2, 3], 0)  // []
// chunk([1, 2, 3], 0)     // throws
```

同一名字，两套入口。要从 lodash 迁过来、又依赖「非法 size 当空数组」，必须走 compat。

### 案例 2：debounce 的边沿和取消

```ts
import { debounce } from "es-toolkit"

const log = debounce((msg: string) => {
  console.log(msg)
}, 300)

log("a")
log.cancel()
```

默认只在安静 300ms 后跑一次。`cancel` 清 timer，也丢掉 `pendingArgs`。需要第一次立刻跑时写 `{ edges: ["leading", "trailing"] }`。

### 案例 3：merge 会改原对象

```ts
import { merge, toMerged } from "es-toolkit"

const target = { a: 1, b: { x: 1 } }
merge(target, { b: { y: 2 }, c: 3 })
// target 变成 { a: 1, b: { x: 1, y: 2 }, c: 3 }

const next = toMerged({ a: 1 }, { b: 2 })
```

`merge` 的注释写明 mutate。只想拿新对象时用 `toMerged`。

## 踩过的坑

1. **把主包当成 lodash drop-in**：compat 才是那条路，而且自己标明 WIP、会省略部分隐式转换。
2. **假定 `chunk` 对 `0` 很宽容**：现代实现直接抛错。
3. **以为 debounce 默认 leading**：源码默认只有 trailing；throttle 才默认两边都有。
4. **把 README 性能句抄进结论**：本文没有跑 benchmark 或测 bundle。
5. **`merge` 当纯函数**：它改的是传入的 target。

## 适用 vs 不适用场景

**适用**：

- 只要若干具名函数，并希望按 `es-toolkit/array` 这类子路径导入
- 需要 `AbortSignal` 取消 debounce / delay
- 接受「现代严格 + 可选 compat」两套合同

**不适用**：

- 必须 100% 复刻当前 lodash 每一个隐式转换 → 先核 compat 覆盖，而不是假定主包
- 要把 README 的倍数写成已测性能
- 更想要单桶、异步 `try` / 顺序 `map` 那种控制流 API → 看 [[radash]]

## 固定版本边界

- 本文绑定 `toss/es-toolkit@5dc4477f838b8cee2b6b09af4f373be2b3aaaa54`。GitHub tag `v1.51.0` 指向该提交；仓内 `package.json` 报 `1.51.0`。
- npm `es-toolkit@1.51.0` 未发布 `gitHead`，身份靠 tag + 版本号。
- 主入口不导出 `compat` / `fp` / `map` / `bigint` / `set` / `server` / `types`，这些只在对应子路径。
- 未安装依赖、未跑上游测试或 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **兼容层是第二条产品**——同名函数可以有两套失败语义
2. **默认边沿要读源码**：debounce 与 throttle 的默认 `edges` 不一样
3. **合并和拷贝要拆开**：`merge` mutate，`toMerged` 才留原对象
4. **宣传数字不是合同**：性能和体积必须另测

## 应用型自测

1. `import { chunk } from "es-toolkit"` 之后 `chunk([1], 0)` 会怎样？
2. 不传 `edges` 时，第一次 `debounce(fn, 300)()` 会立刻调用 `fn` 吗？
3. `merge(target, source)` 之后，原来的 `target` 还是不是同一份引用、内容有没有变？

检查点：

1. 抛错。现代 `chunk` 要求正整数 size。
2. 不会。默认只 trailing。
3. 是同一引用，内容已被就地合并。

## 延伸阅读

- 文档：[es-toolkit.dev](https://es-toolkit.dev)
- 固定源码：[toss/es-toolkit](https://github.com/toss/es-toolkit) —— 本文绑定 `5dc4477f838b8cee2b6b09af4f373be2b3aaaa54`
- [[radash]] —— 单桶导出，异步 `map` / `try` 是另一条设计
- [[immer]] —— 也产出新对象，但走的是草稿更新

## 关联

- [[radash]] —— 同赛道的函数工具集，入口和异步合同不同
- [[immer]] —— 不可变更新，不是通用 util 抽屉
- [[date-fns]] —— 同样按函数拆分、强调 tree-shake

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
