---
title: Inquirer.js — 把终端问答拆成 hook 提示和问题编排
description: 固定 14.2.0：具名 prompt 走 hook 引擎，legacy prompt() 只负责编排
来源: https://github.com/SBoudrias/Inquirer.js
日期: 2026-08-27
分类: 命令行
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/SBoudrias/Inquirer.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 51ac389603405e8f9f315ce49416153d95c5fefe
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 14.2.0
---

## 是什么

Inquirer.js 是一套 Node 终端问答库。日常类比：它把“问一句、收一个答案”做成可复用控件，再另给一条把多道题串起来的流水线。

固定 `14.2.0` 其实是同一提交上的两层入口：

```ts
import { input, confirm } from "@inquirer/prompts"

const name = await input({ message: "项目名？" })
const ok = await confirm({ message: "继续？" })
```

`@inquirer/prompts@8.7.0` 导出具名函数。`inquirer` 包仍提供 `inquirer.prompt(questions)`，README 称它为 legacy，并指向具名 API。

## 为什么重要

不看固定源码，下面几件事会对不上：

- 为什么旧教程写 `type: 'list'`，14.2.0 的默认注册表里却没有这个名字
- 为什么很多人以为 Inquirer 运行时还绑着 RxJS
- 为什么把答案预填进第二参，下一题可能根本不问
- 为什么 `confirm` 直接回车常常得到 `true`

## 核心要点

固定版本可以拆成四层：

1. **具名 prompt 是控件**：`input` / `select` / `confirm` 等各自一份包，由 `@inquirer/core` 的 `createPrompt(view)` 包成 Promise。`view` 每次重绘返回字符串或 `[content, bottomContent]`。

2. **重绘靠 hook，不是 RxJS**：`createPrompt` 用 `AsyncLocalStorage` 跑 `useState` / `useKeypress` / `useEffect`。`useState` 用 `Object.is` 判断要不要 `handleChange`。RxJS 只出现在 `inquirer` 包的 devDependency，题流只需 `isObservableLike`。

3. **`prompt()` 是编排器**：`PromptsRunner` 接受数组、`{ name: question }` map、单题或可迭代题流。缺省 `type` 是 `input`。已有答案且 `askAnswered !== true` 时跳过；`when === false` 或 `when(answers)` 为假也跳过。

4. **默认注册表没有 `list`**：`createPromptModule()` 挂上 `input`、`select`、`number`、`confirm`、`rawlist`、`expand`、`checkbox`、`password`、`editor`、`search`。README 仍写 `list`，以源码注册表为准。

## 实践示例

### 案例 1：推荐入口是具名函数

```ts
import { input, select } from "@inquirer/prompts"

const name = await input({ message: "包名？", required: true })
const lang = await select({
  message: "语言？",
  choices: [
    { name: "TypeScript", value: "ts" },
    { name: "JavaScript", value: "js" },
  ],
})
```

`input` 回车后跑 `required` / `pattern` / `validate`。默认 `prefill: 'tab'`：空输入时 Tab 把 default 填进行内。

### 案例 2：legacy `prompt()` 仍按 name 收答案

```js
import inquirer from "inquirer"

const answers = await inquirer.prompt(
  [
    { type: "input", name: "name", message: "项目名？" },
    {
      type: "confirm",
      name: "git",
      message: "git init？",
      when: (a) => Boolean(a.name),
    },
  ],
  { name: "demo" },
)
```

第二参已经有 `name`，第一题被跳过，`when` 看到的是预填对象。返回的 Promise 还挂着 `ui`，指向这次的 `PromptsRunner`。

### 案例 3：confirm 的空回车不是“没选”

```ts
import { confirm } from "@inquirer/prompts"

const ok = await confirm({ message: "发布？" })
// 直接回车 → true
const no = await confirm({ message: "发布？", default: false })
```

`getBooleanValue` 在空字符串时返回 `defaultValue !== false`。匹配是对 theme keywords（默认 `Yes` / `No`）做前缀、忽略大小写。

## 踩过的坑

1. **继续写 `type: 'list'`**：默认模块会抛 `UnknownPromptTypeError`。现用名字是 `select`。
2. **把 RxJS 当成 14.2.0 的运行时依赖**：题流只要求 Observable-like；`rxjs` 不在 `inquirer` 的 dependencies。
3. **预填答案却指望题再问一遍**：必须设 `askAnswered: true`。
4. **以为非 TTY 会自动失败**：`skipTTYChecks` 默认 `true`；要 `TTYError` 得显式关掉。
5. **把 README 的 Node 范围写宽**：`engines` 是 `>=23.5.0 || ^22.13.0 || ^20.17.0`。

## 适用 vs 不适用场景

**适用**：

- 新代码用 `@inquirer/prompts` 具名函数，一次只问一件事
- 还要兼容旧问卷数组、插件 `registerPrompt` 或 `createPromptModule` 隔离
- 需要 AbortSignal、`cancel()` 或区分 `AbortPromptError` / `ExitPromptError`

**不适用**：

- 目标 Node 低于上述 engines
- 只要一条 CJS 函数加测试灌答案，见 [[prompts]]
- 要把未测的包体或“RxJS 很重”写成 14.2.0 的选型结论

## 固定版本边界

- 本文绑定 `SBoudrias/Inquirer.js@51ac3896...`，`inquirer@14.2.0`；npm `gitHead` 与 annotated tag peel 一致。
- 同提交还有 `@inquirer/prompts@8.7.0`、`@inquirer/core@12.0.1`。
- README 仍把 `inquirer.prompt` 写成可维护但不再主推的 API。
- 未安装依赖、未跑测试、未在真实 TTY 按键，状态保持 `UNVERIFIED`。

## 学到什么

1. **包名和推荐入口已经分开**——`inquirer` 负责问卷编排，控件在 `@inquirer/*`。
2. **重绘合同是 hook，不是 Observable 订阅**——状态变了才 `handleChange`。
3. **文档里的 type 名字要以注册表为准**——`list` 不是 14.2.0 的默认键。
4. **跳过规则是编排器的一部分**——预填、`when`、`askAnswered` 决定题会不会被创建。

## 应用型自测

1. `inquirer.prompt([{ type: 'list', name: 'a', message: 'x', choices: ['1'] }])` 在默认模块里会怎样？
2. `confirm({ message: 'ok?' })` 直接回车，返回值是什么？
3. 14.2.0 的 `inquirer` 运行时一定依赖 `rxjs` 吗？

检查点：

1. 抛 `UnknownPromptTypeError`。默认表是 `select`，不是 `list`。
2. `true`。空输入走 `default !== false`。
3. 不必。`rxjs` 只在 devDependency；题流用本地 interop。

## 延伸阅读

- 现代入口文档：[npmjs.com/package/@inquirer/prompts](https://www.npmjs.com/package/@inquirer/prompts)
- 固定源码：[SBoudrias/Inquirer.js](https://github.com/SBoudrias/Inquirer.js) —— 本文绑定提交 `51ac389603405e8f9f315ce49416153d95c5fefe`
- [[prompts]] —— 单函数 CJS 问卷，测试可 `inject`
- [[enquirer]] —— 另一条 class-extend 提示库，页面仍按旧印象写 Inquirer
- [[commander]] —— 解析 argv，不负责交互问答

## 关联

- [[prompts]] —— 更老的轻量问卷函数
- [[enquirer]] —— 同类提示库，扩展模型不同
- [[commander]] —— CLI 参数树，通常发生在 prompt 之前
- [[ora]] —— 同一条终端上的 spinner，不是问答

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
