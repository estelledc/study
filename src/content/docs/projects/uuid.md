---
title: uuid — RFC9562 UUID 的 JavaScript 实现
description: RFC9562 UUID JavaScript 库，覆盖 v4/v7、共享 rng 缓冲与时间序状态。
来源: https://github.com/uuidjs/uuid
日期: 2026-08-27
分类: 基础设施 / 标识
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/uuidjs/uuid
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: fd59f0277549d22cc7ec00a7b3b5c9bccb4d3c1d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 14.0.2
---

## 是什么

`uuid` 是一份按 [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html) 生成、解析和校验 UUID 的 JavaScript 库。日常类比：它像一套标准信封规格——16 字节固定版式、连字符文本、版本位和 variant 位都写在固定位置，数据库、浏览器和日志都能按同一格式认。

```ts
import { v4, v7, validate } from "uuid"
v4() // 随机 UUID，现代环境常直接走 crypto.randomUUID()
v7() // Unix 毫秒时间戳打头，同进程默认可单调
validate("00000000-0000-0000-0000-000000000000") // true：NIL 也算合法
```

固定源码同时导出 `v1`/`v3`/`v4`/`v5`/`v6`/`v7`、`parse`/`stringify`、`NIL`/`MAX`。`uuid@12` 起只发 ESM。

## 为什么重要

不理解这份实现，下面这些事会对不上：

- 为什么「再调一次 `rng()`」可能改掉你刚才拿到的字节数组
- 为什么无参数的 `v7()` 能保持同毫秒递增，而传入 `options` 反而丢掉内部时钟状态
- 为什么 `v4()` 在浏览器里常常就是 `crypto.randomUUID()` 的薄包装
- 为什么主键从自增改成 UUID 后，B-tree 页分裂行为会变，但 `v7` 又把时间序重新放回最前面

一句话：它把 RFC 的位布局收成可 tree-shake 的函数，而不是再发明一种 36 字符字符串。

## 核心要点

1. **随机源是共享缓冲**：`rng()` 对模块级 `Uint8Array(16)` 调用 `crypto.getRandomValues`。返回值是同一块内存，下一次生成会覆盖。需要保留字节时必须先拷贝。

2. **`v4` 有原生快路径**：无 `options`、无 `buf` 且存在 `crypto.randomUUID` 时直接返回原生字符串。只要传入 `random`/`rng` 或输出 buffer，就改走 `_v4`：把第 7 字节写成 version 4、第 9 字节写成 RFC variant。

3. **无 options 的时间 UUID 带模块状态**：`v7()` 记下 `_state.msecs` 与 32-bit `seq`。同一毫秒就 `seq + 1`；`seq` 回绕到 0 时把 `msecs` 加一，以保住单调。传入任何 `options` 对象则完全按参数生成，不读这份状态。`v1()` 用 `msecs + nsecs` 模拟 100ns 精度，同毫秒 `nsecs` 超过 9999 会丢掉 `node` 再随机。

4. **文本层和字节层分开**：生成路径用 `unsafeStringify`；公开 `stringify()` 会再跑 `validate`。`validate` 的正则接受版本 1-8，以及全 0 的 NIL 和全 `f` 的 MAX。

## 实践示例

### 案例 1：默认随机 ID 与原生快路径

```ts
import { v4 } from "uuid"
const id = v4()
const fromRng = v4({ rng: () => crypto.getRandomValues(new Uint8Array(16)) })
```

**逐部分解释**：

1. 第一个调用在支持 `crypto.randomUUID` 的环境不会经过本地 version/variant 改写
2. 第二个调用因为有 `options`，必须走 `_v4`，即使 `rng` 也来自 Web Crypto
3. 想写入已有 `Uint8Array` 时传 `buf` 和 `offset`，越界会抛 `RangeError`

### 案例 2：`v7` 的时间序与状态隔离

```ts
import { v7 } from "uuid"
const a = v7()
const b = v7()
const replay = v7({ msecs: 1_700_000_000_000, seq: 1, random: new Uint8Array(16).fill(7) })
```

**逐部分解释**：

1. `a`、`b` 共享模块 `_state`，同一毫秒内 `seq` 会加一
2. `replay` 带 options，不碰内部状态，适合测试或跨进程重放
3. 前 48 bit 是 Unix 毫秒；后随 12 bit 的 version+seq 高位。这让 [[postgresql]] 一类 B-tree 主键比纯随机 `v4` 更接近插入序，但仍取决于真实页分裂，本文未测

### 案例 3：名字空间 UUID

```ts
import { v5 } from "uuid"
const DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
v5("example.com", DNS)
```

同一名字空间加同一名字会得到同一 `v5`。实现先把 namespace 16 字节和名字字节拼起来做 SHA-1，再改 version/variant 位。`v3` 同一条链，只是哈希换成 MD5。

## 踩过的坑

1. **把 `rng()` 的返回值当快照**：它复用同一 `Uint8Array`。`const a = rng(); const b = rng();` 之后 `a === b` 且内容是第二次的随机数。
2. **以为传入空对象也走内部时钟**：`v7({})` 算有 options，会按参数默认值现算，不再更新模块 `_state`。
3. **在 CommonJS 里 `require('uuid')`**：`uuid@12` 起只发 ESM；`package.json` 的 `exports` 没有 CJS 入口。
4. **用 `validate` 当“这是 v4”**：它只检查 8-4-4-4-12 形态和版本/variant 范围，不区分你要的版本。版本要用 `version()`。

## 适用 vs 不适用场景

**适用**：
- 需要 RFC 形态、跨语言可解析的标识
- 要在同一库里切换随机、时间序和名字空间版本
- 数据库或消息系统已经按 UUID 类型存值

**不适用**：
- 只要短、URL 安全的随机串，且不必兼容 UUID 解析器 → 看 [[nanoid]]
- 仍在 CommonJS-only 打包链、又不能升到 ESM → 固定 14.0.2 不会给你 CJS
- 把 README 的 Node 支持矩阵当成 `engines` 字段 → `package.json` 没有写死引擎范围，CI 矩阵会变

## 固定版本边界

- 本文绑定 `uuidjs/uuid@fd59f027...`，包版本 `14.0.2`；tag、提交与 npm `gitHead` 一致。
- `sideEffects: false`，但最终体积仍取决于 import 与 bundler。
- README 写当时测试过 Node LTS 加前一个主版本；这不是 `engines` 声明。
- 本文只做源码/测试静态审查，没有跑上游测试或插入性能对比，状态保持 `UNVERIFIED`。

## 学到什么

1. **标准标识先锁位布局，再谈快慢**：version 和 variant 写在固定半字节，互操作靠这个，不靠库名
2. **“随机函数返回数组”不等于“给你一份拷贝”**：共享缓冲是性能技巧，也是静默数据竞争
3. **时间 UUID 的单调性是进程内状态，不是分布式共识**：`v7` 的 seq 只保护同模块实例
4. **options 出现与否本身就是 API**：从 `uuid@11` 起，它决定走内部时钟还是纯函数

## 应用型自测

1. `const x = rng(); rng();` 之后 `x` 还是第一次那 16 字节吗？
2. `v4()` 和 `v4({})` 一定走同一条代码路径吗？
3. 同一毫秒连续两次无参数 `v7()`，第二个的时间戳字段一定更大吗？

检查点：

1. 不一定。`rng()` 复用模块缓冲，第二次 `getRandomValues` 会覆盖 `x`。
2. 不一定。无参数且存在 `crypto.randomUUID` 时走原生；`{}` 会进入 `_v4`。
3. 不一定更大。同一毫秒通常只加 `seq`；只有 `seq` 32-bit 回绕才会把 `msecs` 加一。

## 延伸阅读

- 固定源码：[uuidjs/uuid](https://github.com/uuidjs/uuid) —— 本文绑定提交 `fd59f0277549d22cc7ec00a7b3b5c9bccb4d3c1d`
- RFC：[RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html)
- [[nanoid]] —— 更短的 URL 字母表随机 ID，不兼容 UUID 解析
- [[postgresql]] —— `gen_random_uuid()` 与 UUID 主键的对照点
- [[next-js]] —— 全栈应用里常见的客户端/服务端 ID 边界

## 关联

- [[nanoid]] —— 同一问题的短字符串解，字母表和碰撞模型都不同
- [[postgresql]] —— 数据库侧 UUID 类型与索引序
- [[next-js]] —— 服务端动作和客户端组件都可能生成 ID
- [[react]] —— 列表 key 不该用每次渲染新生成的随机 UUID
