---
title: slash — 只换分隔符的 Windows 路径翻译
description: 固定 5.1.0：扩展长度前缀原样返回，其余只把反斜杠换成正斜杠
来源: https://github.com/sindresorhus/slash
日期: 2026-08-27
分类: 基础设施
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/slash
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 98b618f5a3bfcb5dd374b204868818845b87bb2f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.1.0
---

## 是什么

slash 是一个 **把 Windows 反斜杠路径改成正斜杠** 的 ESM 单函数库。日常类比：它只改标点，不打扫房间——`foo\\bar` 变成 `foo/bar`，重复的斜杠、尾巴上的 `/`、`.` 和 `..` 都原样留下。

```js
import path from 'node:path'
import slash from 'slash'

slash(path.join('foo', 'bar'))
// POSIX 上常常已经是 foo/bar；Windows 上 path.join 给出 foo\\bar，这里变成 foo/bar
```

固定 `5.1.0` 只有一条分支：字符串若以 `\\?\` 开头就立刻返回，否则把每个 `\` 换成 `/`。

## 为什么重要

不看这十来行，容易把“Windows 路径规范化”写成一整份合同：

- 为什么 `path.win32.join` 的输出在日志和 glob 里会扎眼
- 为什么 `\\?\C:\very\long\path` 不能当普通斜杠路径改
- 为什么 `foo\\bar\\` 经过 slash 之后尾巴还在
- 为什么它和 [[normalize-path]] 下载量接近，做的事却不是同一档

一句话：它是 **分隔符翻译器**，不是路径规范化器。

## 核心要点

固定 5.1.0 的主链只有两步：

1. **扩展长度路径停手**：`path.startsWith('\\\\?\\')` 为真时原样返回。Windows 允许普通路径用正斜杠，但 `\\?\` 这种 extended-length 前缀不行。
2. **其余只做替换**：`path.replace(/\\/g, '/')`。混合写法 `c:/aaaa\\bbbb` 会变成 `c:/aaaa/bbbb`；`★` 这类非 ASCII 段也会一起过。

它**不做**这些事：

- 不折叠 `foo//bar`
- 不剥 `foo/bar/`
- 不解析 `../`
- 不检查参数是不是字符串——非字符串会在 `startsWith` 上自己炸

导出是 ESM 默认函数；`package.json` 写 `"type": "module"`、`exports: "./index.js"`，类型是 `(path: string) => string`。引擎声明 `node >= 14.16`。

## 实践示例

### 案例 1：把 Node 在 Windows 上拼出的路径收成正斜杠

```js
import path from 'node:path'
import slash from 'slash'

const fromJoin = path.win32.join('src', 'index.ts')
slash(fromJoin)
// src/index.ts
```

`path.win32.join` 用 `\\`。构建日志、跨平台 snapshot、只认 `/` 的匹配器都要先过这一步。

### 案例 2：混合分隔符也会被收齐

```js
import slash from 'slash'

slash('c:/aaaa\\bbbb')
// c:/aaaa/bbbb
slash('c:\\aaaa\\bbbb\\★')
// c:/aaaa/bbbb/★
```

这是仓内 `test.js` 的断言，不是额外语义。正斜杠已经存在时不会被改坏，只动反斜杠。

### 案例 3：扩展长度前缀是禁区

```js
import slash from 'slash'

const long = '\\\\?\\c:\\aaaa\\bbbb'
slash(long) === long
// true，整串原样回去
```

`\\\\?\\` 在 JS 字符串里就是 Windows 的 `\\?\`。函数在替换之前就 return，所以后面的反斜杠也还在。

## 踩过的坑

1. **把它当成 [[normalize-path]]**：slash 不折叠、不剥尾。`foo\\\\bar/` 只会变成 `foo//bar/`。
2. **对 `\\?\` 期望正斜杠**：固定实现明确不改这类路径。
3. **传入非字符串**：没有 `TypeError` 包装，会直接撞 `startsWith`。
4. **以为它解析 `..`**：`slash('foo\\..\\bar')` 得到 `foo/../bar`，不是 `bar`。
5. **把未测的下载量或 Windows 真机行为写成结论**：本轮只读了源码和测试，没有跑 ava，也没有上 Windows。

## 适用 vs 不适用场景

**适用**：

- 已经有一条 Node `path` 拼出来的字符串，只想在日志 / glob / URL-ish 路径里统一成 `/`
- 需要默认导出、ESM、零依赖的最小函数
- 调用方自己保证输入是字符串

**不适用**：

- 要折叠重复斜杠或默认去掉尾巴——那是 [[normalize-path]]
- 要把 `\\?\` / `\\.\` 收成 `//?/` / `//./` 再交给 `path.parse`
- 需要解析 `.` / `..` 或做成绝对路径——那是 `path.normalize` / `path.resolve`

## 固定版本边界

- 本文绑定 `sindresorhus/slash@98b618f5...`，即 annotated tag `v5.1.0` 的解引用提交；npm `slash@5.1.0` 的 `gitHead` 相同。
- 运行时零依赖；开发依赖是 `xo`、`ava`、`tsd`，本文未执行。
- 状态保持 `UNVERIFIED`。

## 学到什么

1. **“换成正斜杠”可以只是一次 replace**——不必顺手做规范化
2. **Windows 有一类路径不能换分隔符**——`\\?\` 是显式禁区
3. **同类包名字接近、合同不同**——先看是否折叠、是否剥尾、是否碰 namespace
4. **类型声明不是运行时守卫**——`.d.ts` 写了 `string`，实现没检查

## 应用型自测

1. `slash('foo\\\\bar/')` 会不会变成 `foo/bar`？
2. `slash('\\\\?\\c:\\aaaa\\bbbb')` 还会含反斜杠吗？
3. 固定实现有没有对非字符串抛自己的 `TypeError`？

检查点：

1. 不会。结果是 `foo//bar/`，重复斜杠和尾巴都在。
2. 会。扩展长度前缀走原样返回。
3. 没有。非字符串会在 `startsWith` 上失败。

## 延伸阅读

- 固定源码：[sindresorhus/slash](https://github.com/sindresorhus/slash) —— 本文绑定提交 `98b618f5a3bfcb5dd374b204868818845b87bb2f`
- 对照入口：`index.js`、`test.js`、`index.d.ts`
- [[normalize-path]] —— 折叠、剥尾、改写 win32 namespace 的另一条合同
- [[node-js]] —— `path` 在 Windows 上产出 `\\` 的原因

## 关联

- [[normalize-path]] —— 同主题的规范化器，不是同一条 replace
- [[node-js]] —— `path.join` / `path.win32` 的分隔符来源
- [[vite]] —— 构建工具常把内部路径收成 POSIX 再做匹配
- [[webpack]] —— 另一处大量处理 Windows 路径字符串的打包器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[normalize-path]] —— normalize-path — 折叠斜杠并改写 Windows namespace
