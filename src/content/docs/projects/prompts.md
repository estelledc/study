---
title: prompts — 一条 CJS 函数串完终端问卷
description: 固定 2.4.2：type 可跳题，abort 默认交回已填答案
来源: https://github.com/terkelg/prompts
日期: 2026-08-27
分类: 命令行
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/terkelg/prompts
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 66ccf0bda0e1aa18d9efcf128018dfbad4f7ca0e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.4.2
---

## 是什么

`prompts` 是 Terkel Gjervig 的 Node 终端问卷库。日常类比：你递进一张或一叠问题卡，它按顺序问完，把答案收成普通对象。

固定 `2.4.2` 的入口是 CommonJS 函数：

```js
const prompts = require("prompts")

const answers = await prompts({
  type: "text",
  name: "name",
  message: "项目名？",
})
```

运行时只声明 `kleur` 和 `sisteransi`。`engines` 写 `node >= 6`。npm latest 仍是 2.4.2。

## 为什么重要

不看固定源码，下面几件事会对不上：

- 为什么 `type` 写成函数、返回 `null`，下一题会消失
- 为什么用户按 Ctrl+C，await 常常**不抛错**，只带回已经填过的字段
- 为什么 `choices: ['TS', 'JS']` 交回的是 `0` / `1`，不是字符串
- 为什么测试里能 `prompts.inject(['demo'])` 而不碰终端

## 核心要点

固定版本可以拆成四步：

1. **先求 `type`，假值就跳过**：`type` 可以是 async 函数，参数是上一题答案、当前 `answers` 和本题。`if (!type) continue`。

2. **再展开其它字段**：除 `passOn`（`suggest` / `format` / `onState` / `validate` / `onRender` / `type`）外，函数字段会被 `await` 成具体值。`message` 必须变成字符串。

3. **每种 type 对应一个 EventEmitter 元素**：`lib/prompts.js` 把 `text`、`password`、`invisible`、`number`、`date`、`confirm`、`list`、`toggle`、`select`、`multiselect`、`autocompleteMultiselect`、`autocomplete` 交给 `toPrompt`。基类打开 raw mode，用 `action(key)` 把按键映射到方法名。

4. **取消默认是收摊，不是爆炸**：元素 abort 会 reject。外层 `catch` 后执行 `onCancel`；默认 noop 让 `quit` 为真，**返回已收集 answers**。只有 `onCancel` 返回 `false` 才会继续问。

## 实践示例

### 案例 1：最小文本题

```js
const prompts = require("prompts")

const { name } = await prompts({
  type: "text",
  name: "name",
  message: "包名？",
  initial: "demo",
  validate: (v) => v.length > 0 || "不能空",
})
```

`password` / `invisible` 只是把 `text` 的 `style` 改掉。`list` 仍走 `TextPrompt`，提交时按 `separator`（默认逗号）切成数组。

### 案例 2：用 type 函数跳题

```js
const answers = await prompts([
  { type: "confirm", name: "repo", message: "建 git 仓库？", initial: true },
  {
    type: (prev) => (prev ? "text" : null),
    name: "remote",
    message: "remote URL？",
  },
])
```

第一题选否时，`type` 得到 `null`，`remote` 不会出现。这是源码里的跳题开关，不是 `when`。

### 案例 3：测试灌答案，以及 select 的 value

```js
prompts.inject(["demo"])
const a = await prompts({ type: "text", name: "name", message: "x" })
// a.name === "demo"

const b = await prompts({
  type: "select",
  name: "lang",
  message: "语言？",
  choices: ["TS", "JS"],
})
// 未指定 value 时，选第一项得到 0
```

`override({ name: "demo" })` 会跳过同名题。字符串 choice 被写成 `{ title, value: idx }`。

## 踩过的坑

1. **指望 Ctrl+C 抛异常**：默认 `onCancel` 吃掉 reject，返回部分对象。要中断后续逻辑，自己判断缺字段，或让 `onCancel` 再 throw。
2. **把字符串 choice 的返回值当成标题**：没写 `value` 时，值是下标。
3. **给 `validate` / `format` 当普通字段求值**：它们在 `passOn` 里，会原样传给元素。
4. **`confirm` 空回车当 true**：`submit` 执行 `this.value = this.value || false`；`initial` 缺省时得到 `false`。这和 [[inquirer]] 14.2.0 的 confirm 相反。
5. **把 README 的“轻量”写成你仓库的安装体积**：本文未测 unpacked size，只看到两个声明依赖。

## 适用 vs 不适用场景

**适用**：

- 脚手架或脚本要一条 `await prompts(...)`，并接受 CJS
- 测试要用 `inject` / `override` 灌答案
- 需要 `type` 函数按上一题决定下一题还在不在

**不适用**：

- 要 ESM 具名函数、AbortSignal 或 hook 自定义控件，见 [[inquirer]]
- 目标环境不允许 raw mode / TTY
- 要把 2018–2021 年的 star、下载量或包体数字写成当前结论
- 需要 2.4.2 之后才出现、但本 tag 不存在的 API

## 固定版本边界

- 本文绑定 `terkelg/prompts@66ccf0bd...`，包版本 `2.4.2`；npm `gitHead` 与 annotated tag `v2.4.2` peel 一致。
- `index.js` 只是 `module.exports = require('./lib')`。发布物还带 Babel `dist/`，本文读的是 `lib/`。
- 未安装依赖、未跑 `tape`、未在真实终端按键，状态保持 `UNVERIFIED`。

## 学到什么

1. **跳题写在 `type` 上**——假值直接 `continue`，没有单独的 `when` 字段。
2. **取消策略是可配置的控制流**——默认交回半成品，不是默认抛错。
3. **choice 的 `value` 缺省是下标**——字符串数组看起来友好，返回值却是数字。
4. **测试钩子是一等公民**——`inject` / `override` 和真实元素走同一条 `getFormattedAnswer`。

## 应用型自测

1. `type: () => null` 的题会不会调用对应的 Prompt 类？
2. 默认 `onCancel` 下，用户在第二题 Ctrl+C，`await prompts([...])` 会 reject 吗？
3. `choices: ['A', 'B']` 的 `select` 选中 `'A'` 时，`answers` 里是什么？

检查点：

1. 不会。`!type` 时 `continue`，`prompts[type]` 不会被调用。
2. 不会。catch 之后默认 `quit === true`，返回已有 answers。
3. `0`。字符串 choice 的 `value` 是下标。

## 延伸阅读

- 固定源码：[terkelg/prompts](https://github.com/terkelg/prompts) —— 本文绑定提交 `66ccf0bda0e1aa18d9efcf128018dfbad4f7ca0e`
- [[inquirer]] —— 同主题的 hook / 具名函数路线，confirm 默认相反
- [[enquirer]] —— class-extend 提示库，问卷 API 更像旧 Inquirer
- [[commander]] —— 先解析 argv，再决定要不要进入问卷

## 关联

- [[inquirer]] —— 现代具名 prompt + legacy 编排器
- [[enquirer]] —— 另一条零 RxJS 的提示库
- [[commander]] —— CLI 声明，不画菜单
- [[ora]] —— 进度 spinner，常和问卷前后衔接

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
