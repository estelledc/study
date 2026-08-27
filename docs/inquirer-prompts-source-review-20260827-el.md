# Inquirer.js + prompts source review (writer EL)

> 用途：记录 `inquirer` 与 `prompts` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-el` 标记 2026-08-27 平行 writer EL，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EL
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、未在真实 TTY 交互、未测 bundle / 冷启动 / 下载量
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：`inquirer` 对应 `SBoudrias/Inquirer.js` 的 `inquirer` 包；`prompts` 对应 `terkelg/prompts`。`@inquirer/prompts` 是同仓现代入口，不是新页面。

## Inquirer.js

- canonical source：`https://github.com/SBoudrias/Inquirer.js`
- tag：`inquirer@14.2.0`（annotated tag `5cefe3486536b28ccf67b669c4e749bf1ac9526a`）
- revision：`51ac389603405e8f9f315ce49416153d95c5fefe`
- packages：`inquirer@14.2.0`、同提交 `@inquirer/prompts@8.7.0`、`@inquirer/core@12.0.1`（均为 MIT）
- npm：`inquirer@14.2.0` latest，`gitHead=51ac389603405e8f9f315ce49416153d95c5fefe`，与 tag peel 一致
- also observed：`@inquirer/prompts@8.7.0` 的 `gitHead` 同指此提交
- engines：`node >=23.5.0 || ^22.13.0 || ^20.17.0`
- inspected：
  - `packages/inquirer/package.json`
  - `packages/inquirer/README.md`
  - `packages/inquirer/src/index.ts`
  - `packages/inquirer/src/ui/prompt.ts`
  - `packages/inquirer/src/types.ts`
  - `packages/prompts/package.json`
  - `packages/prompts/src/index.ts`
  - `packages/core/package.json`
  - `packages/core/src/index.ts`
  - `packages/core/src/lib/create-prompt.ts`
  - `packages/core/src/lib/hook-engine.ts`
  - `packages/core/src/lib/use-state.ts`
  - `packages/core/src/lib/errors.ts`
  - `packages/input/src/index.ts`
  - `packages/confirm/src/index.ts`
- observed：
  - `inquirer` 包 README 自称 legacy；推荐入口是同仓 `@inquirer/prompts` 的具名函数；两套 API 可并存；
  - 默认 `createPromptModule()` 注册的 type 是 `input` / `select` / `number` / `confirm` / `rawlist` / `expand` / `checkbox` / `password` / `editor` / `search`，没有 `list`；
  - `PromptsRunner.run` 接受数组、`{ name: question }` map、单题，或 `isObservableLike` 的题流；RxJS 只是 `inquirer` 包的 devDependency，不是运行时依赖；
  - 缺省 type 为 `input`；已有答案且 `askAnswered !== true` 时跳过；`when === false` 或 `when(answers)` 为假时跳过；
  - `skipTTYChecks` 默认 `true`，TTY 检查需显式关闭才会抛 `TTYError`；
  - `@inquirer/core` 的 `createPrompt` 用 `AsyncLocalStorage` 跑类似 React 的 hook（`useState` / `useKeypress` / `useEffect`），`Object.is` 比较后才重绘；
  - `confirm` 空回车在 `default !== false` 时为 true；匹配是对 theme keywords 的前缀、大小写不敏感；
  - `input` 默认 `prefill: 'tab'`，校验失败默认 `keep`；`required` / `pattern` / `validate` 在回车后异步跑。

## prompts

- canonical source：`https://github.com/terkelg/prompts`
- tag：`v2.4.2`（annotated tag `a33910fe94209cdc130e1928e7a9211be3bdf287`）
- revision：`66ccf0bda0e1aa18d9efcf128018dfbad4f7ca0e`
- package：`prompts@2.4.2`（MIT）
- npm：`prompts@2.4.2` latest，`gitHead` 与 tag peel 一致
- engines：`node >= 6`
- dependencies：`kleur@^3.0.3`、`sisteransi@^1.0.5`
- inspected：
  - `package.json`
  - `readme.md`
  - `index.js`
  - `lib/index.js`
  - `lib/prompts.js`
  - `lib/elements/prompt.js`
  - `lib/elements/confirm.js`
  - `lib/elements/select.js`
  - `lib/util/action.js`
- observed：
  - 入口是单个 CJS 函数 `prompt(questions, { onSubmit, onCancel })`，也挂在 `module.exports.prompt`；
  - 注册类型：`text` / `password` / `invisible` / `number` / `date` / `confirm` / `list` / `toggle` / `select` / `multiselect` / `autocompleteMultiselect` / `autocomplete`；
  - `type` 可以是函数；返回假值则跳过该题；其余字段除 `passOn`（`suggest` / `format` / `onState` / `validate` / `onRender` / `type`）外，函数会被求值；
  - 基类 `Prompt` 把 stdin 切 raw mode，用 `action(key)` 把按键映射到 `submit` / `abort` / `exit` 等方法；`ctrl+c` / `ctrl+d` 为 abort，`escape` 为 exit；
  - 默认 `onCancel` 是 noop：abort 被 catch 后 `quit = !undefined`，直接返回已收集 answers，不把错误再抛出去；
  - `inject` / `override` 供测试灌答案；
  - `confirm` 的 `y`/`n` 立即提交；空回车走 `this.value || false`；
  - `select` 收到字符串 choice 时写成 `{ title, value: idx }`，缺 `value` 的对象也用下标当值。
