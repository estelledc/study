# open / open-cli source review (writer EQ)

> 用途：记录 `open` 与 `open-cli` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-eq` 标记 2026-08-27 平行 writer EQ，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EQ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 `xo` / `ava` / `tsd`，未调用系统 `open` / PowerShell / `xdg-open`，未测 bundle 或性能
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：`open` 与 `open-cli`；二者是库与 CLI 包装，不是官方捆绑产品
- forbidden overlap：未修改 ora、commander、oclif 或其他同日平行 writer 页面

## open

- canonical source：`https://github.com/sindresorhus/open`
- revision：`f38acc807a8760968310759a203cf14ca4d54727`
- git tag：`v11.0.1`（与 npm `open@11.0.1` `gitHead` 同一提交）
- package：`open@11.0.1`，MIT，ESM，`engines.node >= 20`
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `index.test-d.ts`
  - `readme.md`
  - `test.js`
  - `xdg-open`（vendored 脚本头与发布清单）
- observed：
  - 默认导出 `open(target, options)` 要求 `target` 为 string；`openApp(name, options)` 只带 app，不带 target；
  - 启动用 `childProcess.spawn`，不用 `exec`；
  - darwin 走系统 `open`；win32 与可访问 PowerShell 的 WSL 走 `Start` + Base64 编码命令，不是 cmd `start`；其余平台优先包内可执行 `xdg-open`，Electron / Android / 打包后或本地脚本不可执行时退到系统 `xdg-open`；
  - WSL 只有同时满足「能访问 PowerShell、不在容器、不在 SSH、未指定 app」才切 Windows 集成；
  - `apps` 用 `define-lazy-prop` 按平台解析 chrome / brave / firefox / edge；`safari` 只在 darwin；`browser` / `browserPrivate` 走 `default-browser`，Safari 无命令行隐私模式会抛错；
  - app 数组经 `tryEachApp` 串行尝试，全失败抛 `AggregateError`；fallback 会等 launcher `close` 看退出码，非 fallback 在 `spawn` 后 `unref` 即 resolve；
  - `test.js` 仍出现 `{url: true}`，但 `index.js` / `index.d.ts` 没有该选项。
- provenance：
  - GitHub annotated/lightweight tag `v11.0.1`、npm `gitHead` 与 `package.json` version 均指向 `f38acc807a8760968310759a203cf14ca4d54727`。

## open-cli

- canonical source：`https://github.com/sindresorhus/open-cli`
- revision：`199a2033ae41c65928b8b8bfd7936082a135aa8c`
- git tag：`v9.0.0`（与 npm `open-cli@9.0.0` `gitHead` 同一提交）
- package：`open-cli@9.0.0`，MIT，ESM，`engines.node >= 22`，bin `open-cli` → `cli.js`
- dependency：`open@^11.0.0`（本页不把依赖解析钉到 11.0.1 以外的精确 revision）
- inspected：
  - `package.json`
  - `cli.js`
  - `readme.md`
  - `test.js`
- observed：
  - `meow` 解析 `--wait` / `--background` / `--extension`；`cli.input[0]` 是文件或 URL，`cli.input[1]` 起是 app 名与参数；
  - 无 TTY 输入且 stdin 是 TTY 时打印错误并 `process.exit(1)`；
  - 有位置参数则 `await open(input, options)`；否则把 stdin 读成 buffer，用 `file-type` 猜扩展名，缺省 `txt`，`tempy.temporaryWrite` 落临时文件再 `open`；
  - 不暴露 `newInstance`、`allowNonzeroExitCode`、`apps.browser` / `apps.browserPrivate`；
  - 固定测试只覆盖 `--version` 与 stdin 打开 `cli.js` 自身，不断言系统打开成功。
- provenance：
  - GitHub tag `v9.0.0`、npm `gitHead` 与 `package.json` version 均指向 `199a2033ae41c65928b8b8bfd7936082a135aa8c`。
