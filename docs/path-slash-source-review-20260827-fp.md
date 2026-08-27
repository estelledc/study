# Path slash source review (writer FP)

> 用途：记录 `slash` 与 `normalize-path` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fp` 标记 2026-08-27 平行 writer FP，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FP
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行 `xo` / `ava` / `tsd` / `mocha`，未测 Windows 真机、bundle 或吞吐
- worktrees：本机 `/tmp/research-worktrees/`（不进入 Git）
- slugs：`slash`、`normalize-path`

## slash

- canonical source：`https://github.com/sindresorhus/slash`
- git tag：`v5.1.0`（annotated；tag object `da65898f1693625370b780165b316834fbb5a2d6`）
- revision：`98b618f5a3bfcb5dd374b204868818845b87bb2f`
- package：`slash@5.1.0`（MIT）
- npm：`slash@5.1.0` latest，`gitHead=98b618f5a3bfcb5dd374b204868818845b87bb2f`，与 tag 解引用提交一致
- engines：`node >= 14.16`；`"type": "module"`；`exports: "./index.js"`
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `index.test-d.ts`
  - `test.js`
  - `readme.md`
- observed：
  - 默认导出一个函数：扩展长度前缀 `\\?\`（`path.startsWith('\\\\?\\')`）原样返回，否则 `path.replace(/\\/g, '/')`；
  - 不折叠重复分隔符，不剥尾斜杠，不解析 `.` / `..`，不检查参数类型；
  - `test.js` 覆盖混合分隔符、全反斜杠、含 `★` 的路径，以及 `\\\\?\\c:\\aaaa\\bbbb` 保持不变；
  - `index.d.ts` 声明 `(path: string) => string`。
- provenance：
  - annotated tag `v5.1.0` 解引用到上述 revision，`package.json` 报 `5.1.0`；
  - npm `gitHead` 与该提交一致。

## normalize-path

- canonical source：`https://github.com/jonschlinkert/normalize-path`
- git tag：`3.0.0`（lightweight tag）
- revision：`ea100bbecf851e2cc89e54e295e91af7b835fe63`
- package：`normalize-path@3.0.0`（MIT，CJS `main: index.js`）
- npm：`normalize-path@3.0.0` latest，`gitHead=0979eb807a1725d83d5a996347d41067cf773d1f`
- engines：`node >= 0.10.0`；零运行时依赖
- inspected：
  - `package.json`
  - `index.js`
  - `test.js`
  - `example.js`
  - `README.md`
  - `2.1.1` tag `da1a45e` 的 `index.js`（对照 v3 内联）
- observed：
  - `module.exports = function(path, stripTrailing)`；非字符串抛 `TypeError('expected path to be a string')`；
  - 单独的 `\\` 或 `/` 返回 `/`；`length <= 1` 原样返回；
  - win32 namespace：`len > 4 && path[3] === '\\'` 且前两字是 `\\\\`、第三字是 `?` 或 `.` 时，剥掉前两个反斜杠并加前缀 `//`，好让后续 `path.parse` 仍看见两个前导斜杠；
  - `split(/[/\\]+/)` 折叠重复分隔符；`stripTrailing !== false` 时丢掉末尾空段；
  - 不解析 `.` / `..`；`test.js` 里 `../../foo/bar` 与 `C:Letter.txt` 保持相对形态；
  - 相对 `2.1.1`，v3 去掉 `remove-trailing-separator` 依赖，并把 namespace 前缀逻辑写进同一函数。
- provenance：
  - npm `gitHead` 是 tag `3.0.0` 的直接祖先；两提交的 tree diff 只有 `package.json` 的 `version`：`2.1.1` → `3.0.0`；
  - `index.js` 在 gitHead 与 tag 之间字节相同；
  - 本审查绑定自报 `3.0.0` 的 tag 提交，不绑定仍写 `2.1.1` 的 npm `gitHead`；
  - `origin/master` 在审查日另有后续 merge，但 `index.js` 与 `3.0.0` 相同；未绑定 master。
