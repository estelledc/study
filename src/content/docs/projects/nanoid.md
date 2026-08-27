---
title: Nano ID — 短且 URL 安全的随机字符串 ID
description: 短且 URL 安全的随机 ID 库，区分 Node 字符串池与浏览器 getRandomValues 路径。
来源: https://github.com/ai/nanoid
日期: 2026-08-27
分类: 基础设施 / 标识
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/ai/nanoid
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9247b6dbfe97854e6e136784ae5dde0c672d22c5
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.0.1
---

## 是什么

Nano ID 生成短的、URL 安全的随机字符串。默认 21 个字符，字母表是 64 个 `A-Za-z0-9_-`。日常类比：它不像 [[uuid]] 那样坚持 8-4-4-4-12 的标准信封，而像快递单号——能放进 URL 和文件名，长度自己定。

```js
import { nanoid, customAlphabet } from "nanoid"
nanoid()      // 21 字符，例如 "V1StGXR8_Z5jdHi6B-myT"
nanoid(10)    // 更短，碰撞空间也更小
const digits = customAlphabet("0123456789", 6)
digits()      // 6 位数字，但仍走拒绝采样
```

固定 6.0.1 把 Node 入口和浏览器入口分成两份实现。`package.json` 的 `engines.node` 是 `^22 || ^24 || >=26`。

## 为什么重要

不看源码，下面这些说法很容易被 README 带偏：

- 「118 bytes」指 size-limit 对 `{ nanoid }` 的限制，不是把整个仓库塞进 118 字节
- Node 上的 `nanoid` 其实是 `customAlphabet(urlAlphabet)`，带着字符串池；浏览器文件没有这套池
- 默认 21 字符 × 6 bit ≈ 126 bit，和 UUID v4 的 122 个随机 bit 只是同一量级，不是同一格式
- `nanoid/non-secure` 用 `Math.random()`，不能和默认入口混称为“安全随机”

## 核心要点

1. **字母表先定碰撞模型**：`urlAlphabet` 固定 64 符号。每个字符携带 6 bit。默认 21 字符大约 126 bit。字符顺序按 gzip/brotli 字典排，不是 `A-Za-z` 顺序。

2. **Node 与浏览器不是同一条热路径**：Node `index.js` 预生成 latin1 字符串池，用 `substring` 切片；池按请求长度几何增长，上限 `65536 / 2`。浏览器 `index.browser.js` 每次 `getRandomValues(new Uint8Array(size))`，再 `urlAlphabet[byte & 63]`。独立文件 `nanoid.js` 是给体积演示用的单行实现。

3. **均匀性靠拒绝，不靠裸取模**：`customRandom` 计算 `safeByteCutoff = 256 - (256 % alphabet.length)`，大于等于截止值的字节丢掉。2 的幂字母表改用 `& mask`。`customAlphabet` 若字母表长于 256 或含非单字节字符，就退回这条慢路径。类型注释写明：超过 256 个符号时生成器“will not be secure”。

4. **`size |= 0` 是安全阀**：它把输入收成整数，挡住用 `valueOf()` 伪造长度、污染池偏移的对象。负长度抛 `RangeError('Wrong ID size')`。`getRandomValues` 单次上限 65536，更大缓冲按块填充。

## 实践示例

### 案例 1：默认 21 字符

```js
import { nanoid } from "nanoid"
const id = nanoid()
```

**逐部分解释**：

1. Node 上这是对 `urlAlphabet` 的 `customAlphabet` 调用，可能命中已有池
2. 浏览器打包若走 `browser`/`react-native` 字段，则每次现场抽 21 个随机字节
3. 输出可放进 URL 和文件名，但不是 UUID，[[postgresql]] 的 UUID 类型不会认它

### 案例 2：自定义字母表

```js
import { customAlphabet } from "nanoid"
const hex = customAlphabet("0123456789abcdef", 16)
hex()
hex(8)
```

**逐部分解释**：

1. 16 不是 2 的幂，Node 快路径会用 mask + 拒绝采样填池
2. 第二次 `hex(8)` 仍用同一生成器的默认字母表，只改长度
3. 若传入 `'αβγ'` 这类非单字节字符，实现退回 `customRandom`，不再走字节池

### 案例 3：不要用错入口

```js
import { nanoid as insecure } from "nanoid/non-secure"
insecure() // Math.random()，不能当不可预测 ID
```

`non-secure` 用 `(Math.random() * 64) | 0` 取下标。它存在是为了体积和演示，不是默认安全合同。

## 踩过的坑

1. **把 118 B / “比 randomUUID 快 50%” 写成当前事实**：这些是 README 与 size-limit / benchmark 脚本的声明。本文未跑，不能当 6.0.1 的实测数。
2. **在 Node 20 安装 6.x**：`engines` 明确排除 20 和奇数主版本 23/25。要旧运行时需另选 5.x，那是另一份 revision。
3. **以为 `customAlphabet` 多长都安全**：源码对 `length > 256` 或非单字节字符回退；类型定义把 >256 标成 insecure。
4. **用代理数字对象当 `size`**：测试专门覆盖 `valueOf` 污染。`|= 0` 之后长度被钉死，异常对象不会让池错位循环。

## 适用 vs 不适用场景

**适用**：
- 需要短、可放进 URL 的随机主键或文件名
- 运行时是 Node 22/24/26+ 或现代浏览器，并能接受 ESM
- 愿意自己选字母表，并理解长度直接换碰撞空间

**不适用**：
- 对端要求 RFC UUID 文本或数据库 UUID 类型 → 用 [[uuid]]
- 需要跨进程可排序的时间前缀 → `nanoid` 默认不编码时间；那是 UUID v7 的合同
- 把 `non-secure` 用在会话、令牌或任何不可预测场景

## 固定版本边界

- 本文绑定 `ai/nanoid@9247b6db...`，包版本 `6.0.1`；tag 剥皮提交与 npm `gitHead` 一致。
- `sideEffects: false`；`118 B` 只约束 `{ nanoid }` 这条 size-limit。
- 未安装依赖，未运行 `pnpm test`、size-limit 或 `test/benchmark.js`。
- 状态保持 `UNVERIFIED`。

## 学到什么

1. **短 ID 的本质是更大字母表，不是“更少随机”**：21×6 bit 和 UUID v4 的随机位接近，格式完全不同
2. **同一导出名字在 Node 和浏览器可以是两种算法**：看 `exports`/`browser` 字段，不要只读类型声明
3. **均匀随机必须处理 256 不能整除字母表长度**：拒绝采样是合同，不是微优化
4. **体积数字要写清测量对象**：size-limit 的 118 B 约束的是一个 named export，不是仓库或 gzip 整包

## 应用型自测

1. 默认 `nanoid()` 在 Node 6.0.1 和浏览器入口是否共享字符串池？
2. `customAlphabet('abcdef', 5)` 若直接 `byte % 6` 而不拒绝高字节，会有什么问题？
3. `import { nanoid } from 'nanoid/non-secure'` 还保证不可预测吗？

检查点：

1. 不共享。Node 入口用池；浏览器入口每次 `getRandomValues`。
2. 0-255 对 6 取模会让部分符号多映射几个源字节，分布偏斜。
3. 不保证。这条路径用 `Math.random()`。

## 延伸阅读

- 固定源码：[ai/nanoid](https://github.com/ai/nanoid) —— 本文绑定提交 `9247b6dbfe97854e6e136784ae5dde0c672d22c5`
- [[uuid]] —— RFC 形态、时间序和名字空间 ID
- [[next-js]] —— 客户端组件与服务端动作都可能生成短 ID
- [[react]] —— 列表 key 仍应稳定，不要每轮 `nanoid()`

## 关联

- [[uuid]] —— 标准 128-bit 布局；`v4`/`v7` 与 Nano ID 的取舍对象
- [[next-js]] —— 全栈边界上的 ID 生成位置
- [[react]] —— 渲染期随机 ID 会拆掉 reconciliation
- [[postgresql]] —— 文本短 ID 通常走 `TEXT`/`VARCHAR`，不是 UUID 类型
