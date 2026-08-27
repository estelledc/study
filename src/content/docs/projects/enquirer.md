---
title: enquirer — 用类继承把终端问答做成状态机
description: 19 种 prompt 的类继承问答库；select 交 name，validate 失败会重绘
来源: 'https://github.com/enquirer/enquirer'
日期: 2026-05-30
分类: projects / 命令行
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/enquirer/enquirer
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 70bdb0fedc3ed355d9d8fe4f00ac9b3874f94f61
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.4.1
---

## 是什么

enquirer 是一个 **Node.js 终端问答库**：你给它一份 `type` / `name` / `message` 配置，它接管 stdin，按键改状态、擦行重画，回车后把答案交回 Promise。日常类比：像把网页里的 `<input>` / `<select>` 搬进黑底终端，但渲染器是自己拼的 ANSI 字符串，不是 DOM。

固定 2.4.1 的入口是 CommonJS：

```js
const { prompt } = require("enquirer");
const answers = await prompt({
  type: "input",
  name: "username",
  message: "你叫什么？",
});
```

`prompt()` 每次 `new Enquirer()`，再按数组顺序 `ask()`。它**不是** 0 运行时依赖：`package.json` 声明了 `ansi-colors` 与 `strip-ansi`。ANSI 帮手在仓库自己的 `lib/ansi.js`，不是 [[sisteransi]]。

## 为什么重要

不看固定入口，旧印象会把三件事写错：

- 为什么有人说它“零依赖、12 种类型”——2.4.1 实际是两份运行时依赖、`lib/prompts/index.js` 注册 19 个类型
- 为什么 `{ name: 'TS', value: 'ts' }` 的 select 答案经常不是你以为的 `value`
- 为什么自定义一个 prompt 只写 `dispatch` 会直接 throw——基类 `render()` 没有默认实现

一句话：enquirer 的合同是 **EventEmitter 问答器 + raw-mode 按键队列 + 必须自己实现的 render**。

## 核心要点

固定源码可以拆成四段（`index.js` → `lib/prompt.js` → `lib/keypress.js`）：

1. **实例串问**：`Enquirer.prompt(questions)` 新建实例；`ask()` 把 `type === 'number'` 改写成 `numeral`，再 `new this.prompts[type](opts)`。没注册的 type 直接 assert 失败。

2. **按键变动作**：`keypress.listen` 在 TTY 上 `setRawMode(true)`，用 `readline.emitKeypressEvents`。`combos` 把 `ctrl+c` / `escape` 映到 `cancel`，把 `enter` / `return` / `ctrl+j` 映到 `submit`。对不上的键走 `this[action]` 或 `dispatch`，再没有就 `alert()` 写 BEL。

3. **Promise 两端**：`run()` 听 `submit` resolve、听 `cancel` reject。所以中途 Ctrl+C 不是“返回 undefined”，而是这条 Promise 失败。

4. **提交校验会重绘**：`validate()` 返回值不是 `true` 时，字符串当错误文案，其它值显示 `Invalid input`，然后 `render()` + `alert()`，`submitted` 被打回 false。返回 `false` **不会**静默吞掉回车。

`lib/prompts/index.js` 注册的 19 个类型是：AutoComplete、BasicAuth、Confirm、Editable、Form、Input、Invisible、List、MultiSelect、Numeral、Password、Scale、Select、Snippet、Sort、Survey、Text、Toggle、Quiz。

## 实践示例

### 案例 1：静态 `prompt()` 串三个问题

```js
const { prompt } = require("enquirer");

const answers = await prompt([
  { type: "input", name: "name", message: "项目名？" },
  { type: "select", name: "lang", message: "语言？", choices: ["JS", "TS"] },
  { type: "confirm", name: "git", message: "git init？" },
]);
```

**逐部分解释**：数组按顺序 `ask()`，答案写进同一个 `answers` 对象。字符串 choice 会被 `toChoice` 收成 `{ name }`。外层必须 `try/catch`：用户 Ctrl+C 走 `cancel`，Promise reject。

### 案例 2：select 交的是 `name`，不是 `value`

```js
const answer = await new (require("enquirer").Select)({
  name: "flavor",
  message: "口味？",
  choices: [
    { name: "chocolate", value: "CHOCOLATE" },
    { name: "vanilla", value: "VANILLA" },
  ],
}).run();
// 固定测试断言：选中 chocolate 时 answer === "chocolate"
```

`ArrayPrompt.submit()` 写的是 `this.value = this.selected.name`（多选是 name 数组）。旧教程里“返回 value 字段”说的是另一条路：`AutoComplete` 单选在 `submitted` 的 `format()` 里才把 `this.value` 改写成 `focused.value`。不要把两条链抄混。

### 案例 3：自定义类型必须实现 `render`

```js
const { Prompt } = require("enquirer");

class Counter extends Prompt {
  constructor(options = {}) {
    super(options);
    this.value = options.initial || 0;
  }
  async dispatch(ch) {
    if (ch === "+") this.value += 1;
    else if (ch === "-") this.value -= 1;
    else return this.alert();
    return this.render();
  }
  format() { return String(this.value); }
  async render() {
    this.clear(this.state.size);
    this.write([await this.prefix(), await this.message(), this.format()].join(" "));
    this.restore();
  }
}

const n = await new Counter({ name: "n", message: "+/- 调数字", initial: 3 }).run();
```

基类 `render()` 是 `throw new Error('expected prompt to have a custom render method')`。只 override `dispatch` / `format` 会在 `initialize()` 里炸掉。自己 `process.stdout.write` 还会和 `this.write` 抢同一块屏幕。

## 踩过的坑

1. **Ctrl+C 是 reject**：`run()` 把 `cancel` 绑到 `reject`。没 `try/catch` 就是 unhandled rejection。
2. **select 默认交 name**：`{ name: 'TS', value: 'ts' }` 在 Select/MultiSelect 上得到 `'TS'`。想要另一份字段，自己在 `result()` 里映射，或看清是不是 Autocomplete 单选那条 `format()` 改写。
3. **`validate` 返回 false 会显示 `Invalid input`**：只有返回 `true` 才过；返回字符串才有自定义错误。不是“false 就静默”。
4. **`type: 'number'` 只是别名**：`ask()` 把它改成 `numeral`。文档或类型定义里写的正式名是 `numeral`。
5. **不要把“零依赖 / 12 类型 / 固定冷启动毫秒”写进结论**：2.4.1 有两份运行时依赖、19 个类型；本轮没跑 benchmark。

## 适用 vs 不适用场景

**适用**：

- 需要 quiz / scale / snippet / survey 这些内置类型，而不是只问 input/select
- 愿意用 class extend 加一种新 prompt，并自己实现 `render`
- 还在 Node 8.6+ 的老 CLI，不能上 ESM-only 的新库

**不适用**：

- 只要几个极简问题、并已经绑定 terkelg/prompts 那条 ESM 栈——那是另一张卡片，本页不写它
- 要全屏 TUI 而不是单行问答 → [[ink]]
- 只要转义码、不要问答状态机 → [[sisteransi]]
- 团队已经把 inquirer 的 RxJS 问卷当内部标准，迁移成本不在本页范围内

## 固定版本边界

- 本文绑定 `enquirer/enquirer@70bdb0fe...`（提交信息 `2.4.1`）。npm `enquirer@2.4.1` 的 `gitHead` 与该提交一致。
- GitHub **没有** `2.4.1` tag；最近版本 tag 是 `2.4.0` → `296beb3f...`。`2.4.0..2.4.1` 是兼容与光标修复，不是新类型表。
- `engines.node >=8.6`；依赖 `ansi-colors@^4.1.1`、`strip-ansi@^6.0.1`。
- 本文未跑 mocha、未开真实 TTY，状态保持 `UNVERIFIED`。

## 学到什么

1. **“零依赖”要以 `package.json` 为准**——README 印象不能覆盖 lock 里的 `ansi-colors` / `strip-ansi`
2. **choice 的 `name` 和 `value` 是两条提交链**——Select 交 name，Autocomplete 单选才在 format 时改写成 value
3. **基类钩子不是装饰**：`render` 必须实现，`validate !== true` 会重绘，`cancel` 会 reject
4. **底层 ANSI 库和问答库不是同一个合同**——enquirer 自带 `lib/ansi.js`，[[sisteransi]] 是另一条纯字符串路线

## 应用型自测

1. 固定 2.4.1 里，`{ type: 'select', choices: [{ name: 'TS', value: 'ts' }] }` 回车后，`answers` 里更可能是 `'TS'` 还是 `'ts'`？
2. 自定义 Prompt 只 override `dispatch` 和 `format`，第一次 `run()` 会怎样？
3. `validate` 返回 `false`，用户会看到什么？

检查点：

1. `'TS'`。`ArrayPrompt.submit()` 写的是 `selected.name`。
2. 抛 `expected prompt to have a custom render method`。
3. 危险色的 `Invalid input`，并重新等待输入，不是静默。

## 延伸阅读

- 固定源码：[enquirer/enquirer](https://github.com/enquirer/enquirer) —— 本文绑定提交 `70bdb0fedc3ed355d9d8fe4f00ac9b3874f94f61`
- 类型表：仓库 `lib/prompts/index.js`（19 个 `defineExport`）
- [[sisteransi]] —— 只产 ANSI 字符串、不接管 stdin 的对照
- [[ora]] —— 同行擦写，但是 spinner 不是问卷

## 关联

- [[sisteransi]] —— prompts 栈的 ANSI 积木；enquirer 没用它
- [[ora]] —— 同一类终端擦写，职责是进度而不是问答
- [[ink]] —— React 进终端，定位全屏 TUI
- [[yargs]] —— 参数解析；和问卷是“先 flags、再追问”两层
- [[listr2]] —— 任务树，文档里提到可挂 enquirer 当 prompt

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ora]] —— ora — 终端 spinner 用 ANSI 反复擦写同一行
- [[sisteransi]] —— sisteransi — 只返回 ANSI 字符串的光标积木
- [[yargs]] —— yargs — Node.js 命令行参数解析的事实标准
