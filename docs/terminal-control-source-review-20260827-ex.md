# Terminal control source review (writer EX)

> 用途：记录 `ansi-escapes` 与 `log-update` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ex` 标记 2026-08-27 平行 writer EX。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer EX
- evidence：GitHub metadata、npm latest 对照、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行 ava / node:test / tsd / xo，未在真实 TTY 观察光标或重绘，未测 bundle 或性能
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：新建 `ansi-escapes` 与 `log-update`；二者原先不在 963 页清单中

## ansi-escapes

- canonical source：`https://github.com/sindresorhus/ansi-escapes`
- tag：annotated `v7.3.0` → `75070bdb8d89d0d6679ff97127499a53960267e8`，解引用提交 `73e652efe7a353bdf25f456e592c858e4648db3d`
- package：`ansi-escapes@7.3.0`（MIT）；`type: module`；`engines.node >=18`
- npm：`ansi-escapes@7.3.0` latest，`gitHead` 与解引用提交一致
- dependency：`environment@^1.0.0`（`isBrowser`）
- inspected：
  - `package.json`
  - `index.js`
  - `base.js`
  - `index.d.ts`
  - `base.d.ts`
  - `test.js`
  - `readme.md`
- observed：
  - `index.js` 把 `base.js` 同时做成 named export 与 `export * as default` 命名空间；
  - CSI 前缀是 `\u001B[`，OSC 是 `\u001B]`，BEL 是 `\u0007`；
  - `cursorTo(x)` 无 `y` 时发 CHA（列 = `x + 1`）；有 `y` 时发 CUP（行 = `y + 1`，列 = `x + 1`），API 是 0 基；
  - `cursorMove` 按符号选方向：`x<0` → `D`，`x>0` → `C`，`y<0` → `A`，`y>0` → `B`；
  - `cursorLeft` 是 `ESC + 'G'`（CHA 回列 1），不是 README 示例里的 `\u001B[1000D`；
  - Apple Terminal（`TERM_PROGRAM === 'Apple_Terminal'`）的 save/restore 用 `\u001B7` / `\u001B8`，其它环境用 `ESC s` / `ESC u`；
  - `eraseLines(n)` 对每一行发 `eraseLine`，除最后一行外再 `cursorUp()`，最后 `cursorLeft`；
  - `clearScreen` 是 RIS `\u001Bc`；`clearViewport` 是 `eraseScreen` + `ESC H`；
  - `clearTerminal`：旧 Windows（`os.release()` major < 10，或 Windows 10 build < 10586）用 `eraseScreen` + `ESC 0f`，否则 `eraseScreen` + `ESC 3J` + `ESC H`；
  - 备屏 `?1049h/l`，同步输出 `?2026h/l`；
  - `link` / `image` / iTerm / ConEmu OSC 在 tmux 或 `TERM` 以 `screen`/`tmux` 开头时经 `wrapOsc` 包 DCS；
  - `image()` 用 `Buffer.from(data)` 再拼 `OSC 1337;File=inline=1`，并写入 `size`；
  - `setCwd()` 是 `iTerm.setCwd` 与 `ConEmu.setCwd` 的拼接；浏览器里默认 `cwd` 会 throw。
- provenance note：
  - 三方身份一致：annotated tag、解引用提交、npm `gitHead`；
  - README 的 `cursorLeft` 示例与固定源码不一致，正文以 `base.js` 为准。

## log-update

- canonical source：`https://github.com/sindresorhus/log-update`
- tag：annotated `v8.0.0` → `11350d2800947726d404e6df224fa4d9f2846bba`，解引用提交 `4f7a1460893a7557aee8f7202956218c3e770a5a`
- package：`log-update@8.0.0`（MIT）；`type: module`；`engines.node >=22`
- npm：`log-update@8.0.0` latest，`gitHead` 与解引用提交一致
- dependencies：`ansi-escapes@^7.3.0`、`cli-cursor@^5.0.0`、`slice-ansi@^9.0.0`、`string-width@^8.2.0`、`strip-ansi@^7.2.0`、`wrap-ansi@^10.0.0`
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `test.js`
  - `readme.md`
- observed：
  - 默认导出是 `createLogUpdate(process.stdout)`；另有 `logUpdateStderr` 与 `createLogUpdate(stream, options)`；
  - 多参数用空格 `join`；正文若不以 `\n` 结尾会补一个；再 `wrapAnsi(..., {trim:false, hard:true, wordWrap:false})`；
  - 高度裁剪先 wrap 再按 `stream.rows ?? defaultHeight ?? 24` 留最后 N 行；`rows === 0` 得到空帧；
  - `isTTY === true` 时每次 `write` 外包 `CSI ?2026h/l`；非 TTY 仍会写光标/擦除序列，只是不加同步输出；
  - 默认同宽且未裁剪时对行做前后缀 diff，用 `ansi-escapes` 拼一块 patch；行数变化会把后缀一并重写；
  - 首帧、前缀长度为 0、宽度变化或发生高度裁剪时退回 `eraseLines(previousLineCount) + 整帧`；
  - 同内容且同宽是 no-op；
  - `persist` 先擦旧帧，再写**不裁高度**的 wrap 文本并 `reset`；`done` 只 `reset` 并按需 `cliCursor.show`，不擦当前帧；`clear` 擦后 `reset`；
  - `showCursor` 默认 `false`，渲染前 `cliCursor.hide()`。
- provenance note：
  - 三方身份一致：annotated tag、解引用提交、npm `gitHead`；
  - 旧教学里“每帧整棵树重打”描述的是更早用法；固定 8.0.0 在可 diff 时只重画变化块。
