# CLI prompt / ANSI leftover source review (writer EY)

> 用途：记录 `enquirer` 与 `sisteransi` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ey` 标记 2026-08-27 平行 writer EY，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL EY
- leftover pair：原目标 `enquirer` + `prompts`；`prompts` 已被其他 writer 占用，本轮改为 `enquirer` + `sisteransi`（`sisteransi` 是 terkelg/prompts 的 ANSI 底层同伴，不是 inquirer）
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 mocha / node:test，未打开 TTY raw mode，未测 bundle、冷启动或性能
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git

## enquirer

- canonical source：`https://github.com/enquirer/enquirer`
- revision：`70bdb0fedc3ed355d9d8fe4f00ac9b3874f94f61`
- package：`enquirer@2.4.1`（MIT，`engines.node >=8.6`）
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `lib/prompt.js`
  - `lib/keypress.js`
  - `lib/combos.js`
  - `lib/ansi.js`
  - `lib/prompts/index.js`
  - `lib/prompts/select.js`
  - `lib/prompts/input.js`
  - `lib/prompts/autocomplete.js`
  - `lib/types/array.js`
  - `lib/types/string.js`
  - `test/prompt.select.js`
  - `test/prompt.autocomplete.js`
- observed：
  - 运行时依赖是 `ansi-colors` 与 `strip-ansi`，不是 0 dependency；
  - `lib/prompts/index.js` 用 `defineExport` 注册 19 个类型：AutoComplete、BasicAuth、Confirm、Editable、Form、Input、Invisible、List、MultiSelect、Numeral、Password、Scale、Select、Snippet、Sort、Survey、Text、Toggle、Quiz；`ask()` 把 `type === 'number'` 改写成 `numeral`；
  - `Enquirer.prompt()` 每次新建实例，按数组顺序 `ask()`，把结果 `set` 进 `this.answers`；未知 type 抛 `Prompt "…" is not registered`；
  - `Prompt.run()` 是 Promise：`submit` resolve、`cancel` reject；`keypress.listen` 在 TTY 上 `setRawMode(true)`，用 `readline.emitKeypressEvents`；
  - `combos.ctrl.c` / `escape` 映射到 `cancel`；`enter` / `return` / `ctrl+j` 映射到 `submit`；未知键走 `dispatch`，再没有实现就 `alert()` 写 BEL；
  - `submit()` 里 `validate()` 返回值若不是 `true`：字符串当错误文案，其它值显示 `Invalid input`，然后重新 `render` + `alert`，并不是静默拒绝；
  - `ArrayPrompt.submit()` 把答案写成 `choice.name`（多选是 name 数组）；`Select` 测试对 `{ name: 'chocolate', value: 'CHOCOLATE' }` 断言返回 `'chocolate'`；
  - `AutoComplete` 单选在 `submitted` 的 `format()` 里把 `this.value` 改写成 `this.focused.value`，测试因此拿到 `'CHOCOLATE'`；多选仍走 name；
  - 基类 `render()` 直接 throw `expected prompt to have a custom render method`；自定义类型必须实现 `render`，只写 `dispatch` / `format` 不够；
  - ANSI 帮手在自己的 `lib/ansi.js`（`ansi-colors` + `strip-ansi`），不是 `sisteransi`。
- provenance note：
  - npm `enquirer@2.4.1` 的 `gitHead` 为 `70bdb0fedc3ed355d9d8fe4f00ac9b3874f94f61`，与 `master` HEAD 提交信息 `2.4.1` 一致，canonical remote 可达；
  - GitHub 没有 `2.4.1` tag；最近的版本 tag 是 lightweight `2.4.0` → `296beb3f504ed5273cbb404b82f1d0cd0ea565ae`；
  - `2.4.0..2.4.1` 是 Node 12/14 语法兼容、中文光标宽度、`onExit` 清理、toggle/autocomplete/choice 类型修补，不是新 prompt 类型；
  - 本页绑定 npm `gitHead`，并披露缺 tag。

## sisteransi

- canonical source：`https://github.com/terkelg/sisteransi`
- revision：`305922fd6654df4c77d1e023aa6c55162958eccb`
- package / release：`sisteransi@2.0.0`（MIT；lightweight tag `v2.0.0` 与 npm `gitHead` 同指该提交）
- inspected：
  - `package.json`
  - `src/index.ts`
  - `test/index.ts`
  - `example.js`
  - `readme.md`
- observed：
  - `type: module`，`exports` 指向构建产物 `dist/index.js` / `dist/index.d.ts`；源码审查对象是 `src/index.ts`；`engines.node >=20`；零运行时依赖；
  - 只导出字符串积木：`cursor`、`scroll`、`erase`、`beep`、`clear`；自己不写 stdout、不切 raw mode；
  - `ESC = '\\x1B'`，`CSI = ESC + '['`，`beep = '\\u0007'`，`clear.screen = ESC + 'c'`（RIS）；
  - `cursor.to(x)` 在 `y` 为假值时发 `CSI{x+1}G`；`cursor.to(x, y)` 在 `y` 为真时发 `CSI{y+1};{x+1}H`，因此 `y === 0` 会走列定位而不是 `(x, 0)`；
  - `cursor.move` 按符号拼 `D/C` 与 `A/B`；`up/down/forward/backward` 把 count 写进 CSI 参数；`nextLine` / `prevLine` / `scroll.up` / `scroll.down` 用 `repeat(count)`，`count === 0` 得到空串；
  - `cursor.save` / `restore` 是 `ESC 7` / `ESC 8`，不是 CSI `s`/`u`；
  - `erase.lines(n)` 循环 `2K`，中间行加 `cursor.up()`，最后加 `cursor.left`（`CSI G`）；测试断言 `erase.lines(2) === '\\x1b[2K\\x1b[1A\\x1b[2K\\x1b[G'`；
  - README 写明 2.0 只走 ESM；旧 Node 才留在 1.x；本页不描述 1.0.5 CJS API。
- provenance note：
  - npm `sisteransi@2.0.0` 发布于 2026-06-25，`gitHead` 与 tag `v2.0.0` 均为 `305922fd...`；
  - 本仓库 lockfile 里仍有传递依赖 `sisteransi@1.0.5`，那是 1.x 线，不能外推为 2.0.0 行为。
