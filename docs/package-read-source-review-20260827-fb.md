# Package-read source review (writer FB)

> 用途：记录 `read-pkg` 与 `load-json-file` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fb` 标记 2026-08-27 平行 writer FB，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FB
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test / xo / ava / tsd，未测 BOM 文件、bundle 或性能
- worktrees：本机 `research-worktrees/read-pkg` 与 `research-worktrees/load-json-file`（gitignored），不进入 Git
- slugs：仓库笔记 slug 为 `read-pkg` 与 `load-json-file`；`read-package-up` / `write-package` / `write-json-file` / `parse-json` 不是本页

## read-pkg

- canonical source：`https://github.com/sindresorhus/read-pkg`
- tag：`v10.1.0`（annotated tag，peel 后与提交一致）
- revision：`ae4bbc6588ba8707f931fc141d2b1d3bf0c8c703`
- package：`read-pkg@10.1.0`（MIT，ESM，`node >=20`）
- npm：latest 同号，`gitHead` 与 revision 一致；`origin/main` 同指此提交
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `readme.md`
  - `test/test.js`
  - `test/package.json`
  - `.github/workflows/main.yml`
- observed：
  - 只解析 `path.resolve(toPath(cwd) ?? '.', 'package.json')`，不向上找最近 manifest；向上查找是 sibling `read-package-up`；
  - `cwd` 经 `unicorn-magic/node` 的 `toPath`，测试用 `pathToFileURL` 与字符串路径得到同一对象；
  - 默认 `normalize: true`，把字符串交给 `parse-json`，再调用 `normalize-package-data`；测试夹具 `name: "unicorn "` 规范化后变成 `unicorn` 并出现 `_id`；
  - `parsePackage` 接受 object 或 string；object 先 `structuredClone`，array / `null` / function 抛 `TypeError`；
  - 实现直接读 `fs` / `fs/promises`，不依赖 `load-json-file`；
  - 发布物只有 `index.js` + `index.d.ts`，`sideEffects: false`，CI 矩阵是 Node 20 / 24。

## load-json-file

- canonical source：`https://github.com/sindresorhus/load-json-file`
- tag：`v7.0.1`（annotated tag，peel 后与提交一致）
- revision：`eeac7ad786731a6c7e4a50b414ebb43c847bf6f6`
- package：`load-json-file@7.0.1`（MIT，ESM，`node ^12.20.0 || ^14.13.1 || >=16.0.0`）
- npm：latest 同号，`gitHead` 与 revision 一致
- also observed：`origin/main` 比标签超前 2 个提交（`5f75a3a` 去掉 strip-bom 链接、`de8256b` 修注释拼写），未发新版本，未绑定
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `index.test-d.ts`
  - `readme.md`
  - `test.js`
  - `.github/workflows/main.yml`
- observed：
  - 零运行时依赖；`exports` 只有 `./index.js`，类型靠旁边的 `index.d.ts`，没有 `exports.types`；
  - `readFile` / `readFileSync` 读 Buffer，再用 `TextDecoder().decode` 去掉 UTF-8 BOM，而不是 `fs.readFile(..., 'utf8')` 或 `buffer.toString()`；
  - 解析走原生 `JSON.parse`，可选 `beforeParse(string)` 与 `reviver`；测试对 `package.json` 的 `name` 做字符串替换 / reviver 替换；
  - 不规范化 package 字段，也不向上搜索目录；
  - README 仍链到 `strip-bom`，实现已改为 `TextDecoder`；main 上后来删了该链接，但不在 7.0.1 里。
