---
title: JSON5 — 给人写的 JSON 超集，参考实现仍是一份状态机
description: 说明 JSON5 在固定版本里如何用 lex/parse 双状态机接受注释、未加引号 key 与 Infinity，以及 CLI 为何输出严格 JSON。
来源: https://github.com/json5/json5
日期: 2026-08-27
分类: 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/json5/json5
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c3a75242772a5026a49c4017a16d9b3543b62776
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.2.3
---

## 是什么

JSON5 是一份**给人手写的 JSON 超集**，也是它自己的 JavaScript 参考实现。日常类比：像把 JSON 这份“机器清单”改成允许批注、省略引号和尾逗号的便签——读起来像 ES5 对象字面量，写完还能再压回严格 JSON。

你写：

```js
const JSON5 = require("json5")
JSON5.parse("{ unquoted: 'ok', hex: 0xFF, /* note */ }")
```

固定 2.2.3 里，`parse` 先走词法状态机，再走语法状态机；`stringify` 则按 IdentifierName 决定要不要给 key 加引号。它是方言实现，不是编辑器里的增量改写器——那条路看 [[jsonc-parser]]。

## 为什么重要

不理解 JSON5 的边界，下面这些事会对不上：

- 为什么配置文件能写注释和尾逗号，但发给对方的 payload 往往还要先转成 JSON
- 为什么 `JSON5.parse` 能吃 `Infinity`，而官方 CLI 输出里它会变成 `null`
- 为什么 `__proto__` 在 2.2.2 之后不再污染原型——属性是 `defineProperty` 写进去的
- 为什么它和 [[jsonc-parser]] 都叫“带注释的 JSON”，却不是同一份语法

一句话：JSON5 解决的是“人写配置”，不是“在原文上打补丁”。

## 核心要点

主链可以拆成四步：

1. **双状态机**：`lib/parse.js` 的 `lex()` 产出 token，`parseStates` 消费 token。词法层吃掉空白、`//` 与 `/* */`，再按当前语法状态去认值或属性名。

2. **比 JSON 多出的词法**：未加引号 IdentifierName、单引号字符串、对象/数组尾逗号、`0x`、显式 `+`、前导/尾随小数点、`Infinity` / `NaN`、字符串里用反斜杠折行。

3. **属性写入避开原型污染**：对象成员走 `Object.defineProperty`，所以名叫 `__proto__` 的 key 会变成自有属性，而不是改 `Object.prototype`。

4. **stringify 与 CLI 不是同一条路**：`stringify` 可接受 `{ replacer, space, quote }`；有缩进时对象/数组会带尾逗号。CLI 却是 `JSON5.parse` 之后调用 `JSON.stringify`，目标格式是 JSON。

## 实践示例

### 案例 1：手写配置一次 parse

```js
const JSON5 = require("json5")
const cfg = JSON5.parse(`{
  // host list
  hosts: ['a', 'b',],
  timeout: +1.5,
  flag: Infinity,
}`)
```

`hosts` 不用引号；数组允许尾逗号；`+1.5` 与 `Infinity` 都是合法数值 token。得到的是普通 JS 对象。

### 案例 2：有缩进的 stringify

```js
JSON5.stringify({ env: "dev", note: 'say "hi"' }, { space: 2 })
```

`space` 来自 options 对象。有 gap 时，对象和数组都会在最后一项后面再写一个逗号。`quote` 未指定时，实现会按字符串里单/双引号出现次数挑引号。

### 案例 3：CLI 压回 JSON

```bash
npx json5 -s 2 config.json5
```

CLI 读完文件后走 `JSON.stringify`。`Infinity` 会变成 JSON 的 `null`；十六进制会变成十进制。它是转换器，不是“漂亮打印 JSON5”。

## 踩过的坑

1. **把 CLI 输出当成 JSON5**：CLI 目标是 JSON。`Infinity` / `NaN` 经 `JSON.stringify` 会变成 `null`。

2. **以为 `parse` 可重入**：`source`、`pos`、`stack` 都在模块作用域。同一模块上重叠调用会互相踩状态。

3. **`json5/require` 已经弃用**：它只 `require('./register')` 再 `console.warn`。新代码用 `json5/register`。

4. **环会抛错**：`stringify` 用栈检测循环，抛 `TypeError('Converting circular structure to JSON5')`。

5. **和 JSONC 不是同一方言**：未加引号 key、单引号、`0x`、`Infinity` 是 JSON5 的合同，不是 [[jsonc-parser]] 的默认合同。

## 适用 vs 不适用场景

**适用**：

- 给人维护的配置（Babel / 工具链常见 `.json5`）
- 需要把 JSON5 读成普通对象，或再导出严格 JSON
- 想要一份无运行时依赖、API 接近 `JSON.parse` / `JSON.stringify` 的实现

**不适用**：

- 要在原文上改一个字段并保留注释 → [[jsonc-parser]]
- 机器对机器的协议，必须是 RFC JSON
- 需要未绑定的吞吐或 bundle 数字来选型
- 把作者 README 的采用者名单当成你这边的运行证据

## 固定版本边界

- 本文绑定 `json5/json5@c3a75242...`，tag `v2.2.3` 与 npm `json5@2.2.3` 的 `gitHead` 指向同一提交。
- `engines.node` 为 `>=6`；入口是 `lib/index.js`，无 `exports` 条件导出。
- `main` 上另有 2 个文档/语法提交，版本号仍写 `2.2.3`，未绑进本页。
- 本文未安装依赖、未跑 `tap`，状态保持 `UNVERIFIED`。

## 学到什么

1. **方言和序列化目标可以不是同一个格式**——parse 吃 JSON5，CLI 吐 JSON。
2. **状态机的状态放在哪，决定能不能重入**——模块级光标不是实现细节。
3. **`defineProperty` 是安全补丁，也是对象语义**——`__proto__` 变成普通 key。
4. **“带注释的 JSON”不是一种语法**——先问它允不允许未加引号 key。

## 应用型自测

1. `npx json5` 把含 `Infinity` 的文件打出来，会得到 JSON5 的 `Infinity` 吗？
2. 对象 key 名叫 `__proto__` 时，2.2.3 是改原型，还是写成自有属性？
3. `JSON5.parse` 的光标和栈存在实例上，还是模块作用域？

检查点：

1. 不会。CLI 走 `JSON.stringify`，`Infinity` 变成 `null`。
2. 自有属性。写入用 `Object.defineProperty`。
3. 模块作用域。重叠调用会互相覆盖。

## 延伸阅读

- 规范站点：[spec.json5.org](https://spec.json5.org/)
- 固定源码：[json5/json5](https://github.com/json5/json5) —— 本文绑定提交 `c3a75242772a5026a49c4017a16d9b3543b62776`
- 对照入口：`lib/parse.js`、`lib/stringify.js`、`lib/cli.js`
- [[jsonc-parser]] —— 注释 + 偏移量 + 文本 edit，不扩展到 JSON5 词法
- [[jq]] —— 命令行处理的是 JSON 值，不是这份手写方言

## 关联

- [[jsonc-parser]] —— 另一条 JSON 方言：容错、保注释、算 edit
- [[jq]] —— 已是值之后的过滤，不再管注释
- [[vscode]] —— 编辑器侧的 JSONC 体验，实现不在本仓
- [[biome]] —— 工具链里也会碰到 JSON / JSONC，但是整包 lint/format
- [[node-js]] —— `register` 依赖 Node 的 `require.extensions`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
