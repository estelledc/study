# Terminal color source review (writer EI)

> 用途：记录 `chalk` 与 `picocolors` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ei` 标记 2026-08-27 平行 writer EI，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EI
- evidence：GitHub metadata、npm provenance 与固定提交静态源码 / 测试阅读
- not executed：未安装两仓依赖，未打印到真实 TTY，未运行 ava / `tests/test.js` / matcha benchmark，未测 bundle 或冷启动
- worktrees：本机 `research-worktrees/chalk` 与 `research-worktrees/picocolors`（gitignored），不进入 Git
- slugs：`chalk` 为既有页升级；`picocolors` 为本轮新增。未改 `ora` / `consola`（开放 PR 已占用）

## chalk

- canonical source：`https://github.com/chalk/chalk`
- tag：`v6.0.0`（annotated tag `a52d7e223c...` peel 到提交）
- revision：`661317e6f91fe7c90306c2c48ea9354562ee9146`
- package：`chalk@6.0.0`（MIT，`"type": "module"`，`engines.node >= 22`）
- npm gitHead：与 revision 一致
- also observed：README 仍写 “Chalk 5 is ESM”；以 `package.json` 的 6.0.0 / Node 22 为准
- inspected：
  - `package.json`
  - `source/index.js`
  - `source/utilities.js`
  - `source/index.d.ts`
  - `source/vendor/ansi-styles/index.js`
  - `source/vendor/supports-color/index.js`
  - `source/vendor/supports-color/browser.js`
  - `test/chalk.js`
  - `test/visible.js`
  - `test/level.js`
  - `readme.md`
- observed：
  - `#ansi-styles` / `#supports-color` 是仓内 vendor，运行时无 npm 依赖；
  - `Chalk` 构造器返回 `chalkFactory`：一个用空格 `join` 的函数，再 `setPrototypeOf` 到带样式 getter 的原型；
  - 样式 getter 第一次访问时 `createBuilder`，并用 `defineProperty` 缓存到实例；builder 的 `GENERATOR` 指向根实例，`STYLER` 是 parent 链表，`openAll`/`closeAll` 预拼接；
  - `applyStyle` 在 level≤0 时原样返回（`visible` 则返回空串）；字符串含 ESC 时沿 parent 把 close 替换成对应 open；换行会先关后开，避免 macOS Bleed；
  - `rgb`/`hex`/`ansi256` 在模块加载时按 level 0–3 预生成 converter；level 3 走 16m，level 2 走 256，level 1 再降到 16 色；
  - vendor `supports-color`：`FORCE_COLOR` 数字是精确 level，`true`/空字符串只开检测；`GITHUB_ACTIONS` / `GITEA_ACTIONS` / `CIRCLECI` 直接 level 3；Azure `TF_BUILD`+`AGENT_NAME` 为 1；
  - 本 revision 另有 underline color、`underlineDouble`/`Curly`/`Dotted`/`Dashed`，以及独立的 `chalkStderr`。

## picocolors

- canonical source：`https://github.com/alexeyraspopov/picocolors`
- tag：`v1.1.1`（annotated tag `93bde36cc7...` peel 到提交）
- revision：`7249f8c5d4825550f70bc1ea98652639933d3bbd`
- package：`picocolors@1.1.1`（ISC，CJS `main` + `browser` 字段）
- npm：`picocolors@1.1.1` 的 `gitHead` 是祖先 `6f0a4638348ed20633d623ee973f9c9a96f65104`，`package.json` 仍写 `1.1.0`；tag 提交只改 version 与 `CHANGELOG.md`，`picocolors.js` / browser / d.ts 无 diff
- inspected：
  - `package.json`
  - `picocolors.js`
  - `picocolors.browser.js`
  - `picocolors.d.ts`
  - `types.d.ts`
  - `tests/test.js`
  - `CHANGELOG.md`
  - `README.md`
- observed：
  - 导出的是 `createColors()` 的结果对象：`red(text)` 这种函数，没有链式 getter；
  - `isColorSupported` 是布尔：`NO_COLOR` 或 `--no-color` 关掉；`FORCE_COLOR` / `--color` / `win32` / `(stdout.isTTY && TERM!==dumb)` / `CI` 任一为真则开；空字符串对 `!!env.*` 是 falsy；
  - `formatter(open, close, replace=open)` 在输入里遇到 close 就 `replaceClose`，默认用 open 把外层色重新打开；`bold`/`dim` 的 replace 是 `\x1b[22m` + 再 open，避免 22 把两种强调一起关死；
  - `createColors(false)` 把全部 formatter 换成 `String`；browser 构建是另一份全 `String` 对象；
  - 没有 rgb / hex / 256 / truecolor，也没有 0–3 level；
  - 非字符串输入会 `"" + input`；测试覆盖 `undefined`/`null`/`0` 与已上色长串的 close 替换。
- provenance note：本页绑定 tag revision `7249f8c5...`，与 npm 发布源码树一致，仅多出版本号与 changelog。
