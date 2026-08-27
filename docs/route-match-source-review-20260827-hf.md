# Route-match source review (writer HF)

> 用途：记录 PARALLEL writer HF 在 2026-08-27 对 `path-to-regexp`、`route-recognizer` 两页做 STATIC_REVIEW 所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer HF
- review_mode：`STATIC_REVIEW`
- evidence：GitHub tag metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、size-limit 或 bench
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：`radix3`、`rou3`、`itty-router`、`find-my-way`、`marked`、`markdown-it`、`knex`

## path-to-regexp

- canonical source：`https://github.com/pillarjs/path-to-regexp`
- revision：`cbf30259e6d34d6135f9e7dbaa3371e7188f9936`
- package：`path-to-regexp@8.4.2`
- tag：`v8.4.2`（lightweight tag 直接指向上述 commit）
- inspected：
  - `package.json`
  - `Readme.md`
  - `src/index.ts`（parse、compile、match、pathToRegexp、flatten、toRegExpSource、stringify、PathError）
  - `src/index.spec.ts`（相邻 param、组合上限）
- observed：
  - tag `v8.4.2`、`package.json` version 与 npm `gitHead` 指向同一提交；
  - 无运行时依赖；`exports` / `main` / `typings` 指向 `dist/`；size-limit 写过 `2 kB`，本轮未测；
  - `parse` 产出 `text` / `param` / `wildcard` / `group`；`:name` 与 `*name` 必须带名字，也可用 `:"quoted"`；
  - `?` `+` `()` `[]` `!` 会抛 `PathError`；可选改用 `{...}`，通配必须具名；
  - `pathToRegexp` 把 group flatten 成最多 256 种组合，超过抛 `Too many path combinations`；
  - 默认 `end=true`、`trailing=true`、`sensitive=false`、`delimiter="/"`；
  - `match` 用 `Object.create(null)` 填 params；wildcard 按 delimiter `split` 后再 decode；
  - 相邻 param 缺 text 时抛 `Missing text before "<name>" param`；
  - `compile` 缺参抛 `Missing parameters`；wildcard 值必须是非空字符串数组。
- provenance：
  - npm `path-to-regexp@8.4.2` 的 `gitHead` 为 `cbf30259e6d34d6135f9e7dbaa3371e7188f9936`，与 tag `v8.4.2` 剥皮提交一致。

## route-recognizer

- canonical source：`https://github.com/tildeio/route-recognizer`
- revision：`6832b404a3095fbed0caf97a2fa4cf7fe5e0ffa8`
- package：`route-recognizer@0.3.4`
- tag：`v0.3.4`（lightweight tag 直接指向上述 commit）
- inspected：
  - `package.json`
  - `README.md`
  - `lib/route-recognizer.ts`（parse、State、add、recognize、sortSolutions、generate、query string）
  - `lib/route-recognizer/dsl.ts`
  - `lib/route-recognizer/normalizer.ts`
  - `lib/route-recognizer/util.ts`
  - `tests/recognizer-tests.ts`（查询串、trailing slash、ENCODE 开关）
- observed：
  - tag `v0.3.4`、`package.json` version 与 npm `gitHead` 指向同一提交；
  - 无运行时依赖；发布入口是 `dist/route-recognizer.js` 与 ESM 对位文件；构建走 Ember CLI / Broccoli，本轮未执行；
  - `add` 把路径切成 Static / Dynamic / Star / Epsilon，再挂到字符级 NFA；
  - Dynamic 正则片段是 `([^/]+)`，Star 是 `(.+)`；识别后按更少 star、更少 dynamic、更多 static 排序；
  - `recognize` 丢掉 `#`，把 `?` 后交给 `parseQueryString`；无 `=` 的键变成 `"true"`，非法 decode 变成 `""`；
  - `ENCODE_AND_DECODE_PATH_SEGMENTS` 默认 true；`normalizeSegment` 解码后仍把 `%` 与 `/` 重新编码；
  - `map` DSL 最终仍调用 `add`；`handler` 对库不透明；
  - 同名 `options.as` 的重复检查被注释掉，后写覆盖 `this.names`；
  - 源码 `VERSION` 仍是 `VERSION_STRING_PLACEHOLDER`。
- provenance：
  - npm `route-recognizer@0.3.4` 的 `gitHead` 为 `6832b404a3095fbed0caf97a2fa4cf7fe5e0ffa8`，与 tag `v0.3.4` 剥皮提交一致。
