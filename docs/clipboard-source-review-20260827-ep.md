# Clipboard pair source review (writer EP)

> 用途：记录 `clipboardy` 与 `copy-paste` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ep` 标记 2026-08-27 平行 writer EP。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EP
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test，未调用系统剪贴板，未测 bundle 或性能
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：`clipboardy`、`copy-paste`；npm / GitHub 名与笔记 slug 一致

## clipboardy

- canonical source：`https://github.com/sindresorhus/clipboardy`
- tag：annotated `v5.3.2` → 解引用 `84e8d07ceacba32d95e9072efcb7d486578ac9d2`
- revision：`84e8d07ceacba32d95e9072efcb7d486578ac9d2`（"5.3.2"，2026-07-23）
- package：`clipboardy@5.3.2`（MIT，`"type": "module"`，`engines.node >= 20`）
- npm：`gitHead` 与 tag peel / 本 revision 一致
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `browser.js`
  - `lib/macos.js`
  - `lib/linux.js`
  - `lib/wayland.js`
  - `lib/windows.js`
  - `lib/wsl.js`
  - `lib/termux.js`
  - `test.js`
  - `readme.md`
- observed：
  - 条件 exports：`node` → `index.js`，`default` → `browser.js`；
  - `index.js` 在加载时用 IIFE 选定平台实现：darwin / win32 / android(Termux) / WSL / Wayland / X11；
  - 文本 `write`/`writeSync` 只接受 string，否则 `TypeError`；`read` 传 `stripFinalNewline: false`；
  - macOS 用 `pbcopy`/`pbpaste` + `LC_CTYPE=UTF-8`；
  - Windows 先 PowerShell `Set-Clipboard` / `Get-Clipboard -Raw`，失败再捆绑 `clipboard_{arch}.exe`；
  - WSL 复制走 `clip.exe`，粘贴复用 Windows 实现；
  - X11 用 `xsel --clipboard`，可回退 `fallbacks/linux/xsel`；打不开 display 时明确拒绝 headless；
  - Wayland 用 `wl-copy`/`wl-paste --type text/plain`；`wl-copy` 的 stderr 接到临时文件描述符，避免 fork 后台进程挂住管道（issue #111），失败再回 X11；
  - 图片三项转交 `clipboard-image`；浏览器入口同步方法 throw，图片 API 为 stub。

## copy-paste

- canonical source：`https://github.com/xavi-/node-copy-paste`
- revision：`393ca5c012c7a2aa6b2534b70eff10d95644d200`（"v2.1.1"，2025-04-23）
- package：`copy-paste@2.1.1`（README 声明 MIT；仓库无独立 LICENSE 文件）
- npm：`copy-paste@2.1.1` 的 `gitHead` 与本 revision 一致
- also observed：
  - npm latest `2.2.0` 的 `gitHead=5fd81dfd14f59d0eedeaf8d9c7fb5452c113de48` 在 canonical remote 不可达；
  - GitHub `master` 头 `5283d50b3400c00c76b6553a9475a59e108c1fb6` 的 `package.json` 仍是 `2.1.1`，只多 README TypeScript 说明；
  - 仓库 tag 只到 `v1.5.3`；本审查不猜测 2.2.0 源码。
- inspected：
  - `package.json`
  - `index.js`
  - `promises.js`
  - `platform/darwin.js`
  - `platform/linux.js`
  - `platform/linux-wayland.js`
  - `platform/win32.js`
  - `platform/android.js`
  - `platform/fallbacks/paste.vbs`
  - `test/copypaste.js`
  - `README.md`
- observed：
  - CJS；`copy` 用 `spawn`，无回调 `paste` 用 `execSync`，`maxBuffer` 10 MiB；
  - `copy` 立即返回入参；string/object/array/null/undefined/stream 分流，object/array 走 `util.inspect`；
  - `copy.json` 使用 `JSON.stringify(obj, null, "\t")`；
  - `promises.js` 只包装 callback；`global()` 把 API 挂到 `global`；
  - darwin：`pbcopy`/`pbpaste` + `LANG=en_US.UTF-8`；
  - linux：`xclip -selection clipboard`；`WSL_DISTRO_NAME` 时改 `clip.exe` + `powershell.exe Get-Clipboard` 并截掉末尾两字符；
  - `WAYLAND_DISPLAY` 时改 `wl-copy`/`wl-paste`；无捆绑 xsel/xclip fallback；
  - win32：`clip` + `iconv-lite` UTF-16LE 写入；粘贴经 `cscript paste.vbs`（`htmlfile.ClipboardData` → Base64），再按 cp437 解码并去掉 BOM。
