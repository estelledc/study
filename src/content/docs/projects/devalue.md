---
title: devalue — 把值编成可 JSON 传输的索引图
description: Svelte 生态的值编解码器，用扁平数组、负数哨兵和 uneval 处理 JSON 做不到的类型。
来源: https://github.com/sveltejs/devalue
日期: 2026-08-27
分类: 基础设施 / 序列化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sveltejs/devalue
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3e01a6c749e215e16c94f5c132f46f7840dfa5e0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.9.1
---

## 是什么

devalue 是一份**把任意可编码值打成一张编号表**的编解码器。日常类比：先给每个对象发工号，重复出现只写号码；`undefined`、`NaN`、数组空洞这些 JSON 说不清的东西改用负数工牌。收件方按号回填，而不是再解析一套自定义语法。

```js
import { stringify, parse } from "devalue"
const text = stringify({ when: new Date("2026-08-27T00:00:00.000Z"), miss: undefined })
const again = parse(text)
```

同一仓库还提供 `uneval()`：产出一段可执行 JS，用来在 HTML 里内联状态。`stringifyAsync()` 才接受 Promise / thenable。

## 为什么重要

不理解「扁平数组 + 哨兵 + 拒绝任意对象」，就解释不了 [[sveltekit]] 为什么能脱水 `Map` / typed array，却仍然对未知 class 说不：

- 为什么重复对象不会复制成两份 JSON，而是后到的写成索引
- 为什么 `arr[1_000_000] = 1` 不会按长度展开成百万个 `-2`
- 为什么函数、symbol 原始值和带 `__proto__` 的键是硬错误
- 为什么自定义类型要靠 reducer 返回**真值**，而不是靠 class 注册表

一句话：它优先保证可往返和不可信输入的边界，而不是尽量吞下任意实例。

## 核心要点

1. **三条入口不要混用**：`stringify`/`parse` 走 JSON 安全字符串；`uneval` 走 JS 源码，给 `<script>` 内联，不是给 `JSON.parse`；同步 `stringify` 碰到 thenable 会抛，必须改 `stringifyAsync`。

2. **负数是类型，不是索引**：`undefined=-1`、`HOLE=-2`、`NaN=-3`、`Infinity=-4`、`-Infinity=-5`、`-0=-6`、`SPARSE=-7`。普通对象在数组里占非负下标，后续引用只回写这个下标。

3. **默认检查走可替换的 operations**：`typeOf` / `identify` / `tagOf` / `shapeOf` 等默认实现被冻结。调用方可覆盖它们，用来避开 getter、跨 realm 或自己决定「什么算 POJO」。不传时就是宿主 JavaScript 语义。

4. **稀疏数组和二进制是一等合同**：第一次碰到 hole 会比较 HOLE 编码和 `[-7, length, idx, val, ...]` 的成本；typed array / `DataView` 先编 `ArrayBuffer` 的 base64，再带 `byteOffset` 还原 subarray。Temporal 各类型按 `toString()` 往返。

## 实践示例

### 案例 1：重复引用变成索引，而不是第二份拷贝

```js
import { stringify, parse } from "devalue"
const node = { name: "root" }
const text = stringify({ a: node, b: node })
const again = parse(text)
again.a === again.b // true：同一对象
```

**逐部分解释**：

1. `identify` 默认就是值本身，`Map` 记住第一次出现的下标
2. 第二次写入的是数字索引，不是再展开一份 `{name:"root"}`
3. `parse` 先 `JSON.parse` 再 `unflatten`，按索引 hydrate

### 案例 2：自定义类型靠 reducer 的真值，而不是 class 名

```js
import { stringify, parse } from "devalue"
class Box { constructor(value) { this.value = value } }
const text = stringify(new Box(1), {
  Box: (value) => value instanceof Box && [value.value],
})
const again = parse(text, { Box: ([value]) => new Box(value) })
```

**逐部分解释**：

1. reducer 返回假值表示「这个 reducer 不适用」
2. 返回真值时编码为 `["Box", flatten(payload)]`
3. 没有 reducer 时，带自定义原型的对象会抛 `Cannot stringify arbitrary non-POJOs`

### 案例 3：`uneval` 不是 `stringify` 的别名

```js
import { uneval } from "devalue"
const js = uneval(new Map([["k", 1n]]))
// 类似 new Map([["k",1n]])，给脚本内联，不能丢给 JSON.parse
```

**逐部分解释**：

1. `uneval` 直接写 JS 字面量 / 构造调用
2. 重复对象会包一层 IIFE；占位参数超过 65534 时改走 `arguments[0]` 解构
3. `<`、U+2028/U+2029 等字符会被转义，降低塞进 HTML 文本节点时的破裂面

## 踩过的坑

1. **把 `uneval` 输出当 JSON**：它是 JS 源码，`JSON.parse` 会失败。
2. **同步路径塞 Promise**：必须 `stringifyAsync`，否则抛 `DevalueError`。
3. **reducer 返回 `0` / `""` / `false`**：这些假值等于「没匹配」，对象会掉进默认 POJO 检查。
4. **假设任意 class 都能过**：默认 `shapeOf` 把非 POJO 判成 `not-plain` 并拒绝。

## 适用 vs 不适用场景

**适用**：

- [[sveltekit]] / [[svelte]] 这类需要把服务端状态安全嵌进页面的脱水
- 要带着 typed array、`ArrayBuffer`、稀疏数组或 Temporal 走 JSON 通道
- 调用方能接受「未知 class 失败，而不是静默变成普通对象」

**不适用**：

- 已经在用 [[superjson]] 的 registry/class 模型，并且两端都登记了同一批 class
- 需要把任意用户对象「尽量序列化出去」而不想维护 reducer
- 目标是 schema 化零拷贝 → 看 [[capnproto]]

## 固定版本边界

- 本文绑定 `sveltejs/devalue@3e01a6c7...`，package 版本 `5.9.1`，ESM-only，`sideEffects: false`。
- annotated tag `v5.9.1` 剥皮提交与当时 HEAD 一致；`Rich-Harris/devalue` 重定向到同一仓库。
- 没有 `engines` 字段；Temporal 支持取决于运行时是否提供这些对象。
- 本文只做静态阅读，没有跑上游 uvu 测试或 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **索引图能同时表达共享和循环**——不必再额外写一份 equality annotation。
2. **拒绝也是 API**——function / symbol / 非 POJO / `__proto__` 失败比静默变 `{}` 更可预测。
3. **稀疏与二进制要单独定价**——线性展开 hole 或复制 typed array 都会变成输入 assailant。
4. **自定义类型的开关是真值，不是类型名命中**——reducer 返回假值等于缺席。

## 应用型自测

1. `stringify({ x: Promise.resolve(1) })` 会得到 JSON，还是抛错？
2. 没有 reducer 时，`stringify(new Foo())` 会把实例压成普通对象吗？
3. `arr[1000000] = "x"` 时，`stringify(arr)` 一定会写出 1000001 个槽位吗？

检查点：

1. 抛错。thenable 只能走 `stringifyAsync`。
2. 不会。默认拒绝 arbitrary non-POJO。
3. 不一定。成本启发式可能改用 `SPARSE` 编码，只写 length 和已有下标。

## 延伸阅读

- 仓库：[github.com/sveltejs/devalue](https://github.com/sveltejs/devalue)
- 固定源码：本文绑定提交 `3e01a6c749e215e16c94f5c132f46f7840dfa5e0`
- [[superjson]] —— json+meta 与 class registry 的对照
- [[sveltekit]] —— 页面脱水的主要下游
- [[capnproto]] —— 对照另一种「不为 JSON 打补丁」的序列化

## 关联

- [[superjson]] —— 同一问题：JSON 不够用时怎么带类型
- [[sveltekit]] —— load 数据脱水常用 devalue
- [[svelte]] —— 编译器和运行时文档会指向它
- [[trpc]] —— 对照：那边更常见 superjson transformer
- [[capnproto]] —— schema / 零拷贝对照
- [[zod]] —— 管校验；devalue 管值怎么编码

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
