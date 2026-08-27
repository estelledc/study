# Router / trie source review GC

> 用途：记录 `radix3` 与 `rou3` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gc` 标记 2026-08-27 平行 writer GC。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GC
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行 vitest / bench / `new Function` 编译器，未测 bundle 或路由吞吐
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- lineage：`unjs/radix3` 的 GitHub API / `git ls-remote` 均解析到 `h3js/rou3`；两页是同一可达仓库上的两个包时代，不是两个无关 trie 实现

## radix3

- canonical source：`https://github.com/unjs/radix3`（GitHub 重定向到 `h3js/rou3`）
- reachable clone：`https://github.com/h3js/rou3`
- revision：`293d3ae4d0d8719e4df62d921b2effdc2dc4567a`
- package：`radix3@1.1.2`（MIT）
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/types.ts`
  - `src/router.ts`
  - `src/matcher.ts`
  - `tests/router.test.ts`
  - `tests/matcher.test.ts`
- observed：
  - `createRouter({ strictTrailingSlash, routes })` 返回带 `ctx` / `insert` / `lookup` / `remove` 的对象；没有 HTTP method 维；
  - 默认把尾斜杠收成无斜杠（空结果回退 `/`）；`strictTrailingSlash: true` 才区分；
  - 纯静态路径写入 `ctx.staticRoutesMap`，`lookup` 先走这张表；
  - `:name` 与单独 `*` 是 `PLACEHOLDER`（一段）；`**` / `**:name` 是 `WILDCARD`（吃掉剩余段）；
  - 未命名 `*` 记 `_0`、`_1`…；未命名 `**` 记 `_`；
  - 同层精确 child 优先于 placeholder；多个 placeholder 时按 `maxDepth === remaining` 选（#95）；
  - `lookup` 把 `data` 展开后附带可选 `params`，未命中返回 `null`；
  - `toRouteMatcher(router).matchAll` 另做多匹配，顺序是 wildcard → dynamic → static；
  - `remove` 用 `Object.keys(node.children)` 判断 Map 是否为空，对 `Map` 恒为 `[]`，子节点清扫不完整；测试只断言 `lookup` 结果，并 TODO 了 placeholder remove；
  - 标注 tag `v1.1.2` 落在祖先 `56a908e8...`，该提交 `package.json` 仍是 `1.1.1`；npm `gitHead` 指向本页绑定的 release 提交。
- provenance：
  - npm `radix3@1.1.2` `gitHead` = `293d3ae4...`，与 `package.json` 的 `name/version` 一致；
  - Git 轻量 tag `v1.1.2` 不是该提交，已在正文披露，未猜测或改绑 tag。

## rou3

- canonical source：`https://github.com/h3js/rou3`
- revision：`68f6d87de9533b1bb3e06d95c53184a41f4a515c`
- git tag：`v0.9.2`（annotated tag 对象 `373d2eb6...`，剥皮后即此提交）
- package：`rou3@0.9.2`（MIT）
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/types.ts`
  - `src/context.ts`
  - `src/object.ts`
  - `src/compiler.ts`
  - `src/operations/add.ts`
  - `src/operations/find.ts`
  - `src/operations/find-all.ts`
  - `src/operations/remove.ts`
  - `src/operations/_utils.ts`
  - `test/find.test.ts`
  - `test/find-all.test.ts`
  - `test/_utils.ts`
- observed：
  - 导出的 `createRouter()` **不接收 options**；README 里的 `createRouter(/* options */)` 与源码不符；
  - `addRoute` / `findRoute` / `removeRoute` / `findAllRoutes` 是独立函数，方法维是第一参数；
  - `addRoute` 把 method `toUpperCase()`，缺前导 `/` 会补上；`{...}` 与 `:name?` / `:name+` / `:name*` 先展开再递归插入；
  - `findRoute` 返回 `{ data, params }`，不是把 payload 摊到顶层；静态命中直接返回 `MethodData`（含 `data` / `paramsRegexp`）；
  - 方法桶先取 `methods[method]`，没有再回落 `methods[""]`；同节点上带方法的路由会挡住无方法路由；
  - 查找顺序：静态 child → param → wildcard；`findAllRoutes` 按 wildcard → param → static → 终点，约定少具体到多具体；
  - 查找默认剥尾斜杠，**没有** `strictTrailingSlash`；`.` / `..` 默认不归一，需 `{ normalize: true }`；
  - `compileRouter` 用 `new Function` JIT；数据过多时改走单数组参数以免超过引擎形参上限；
  - `NullProtoObj` 冻空原型，避免 `__proto__` 段污染；
  - npm `rou3@0.9.2` 无 `gitHead`；身份靠 tag 剥皮 SHA + `package.json` `0.9.2`。
- provenance：
  - `git show v0.9.2:package.json` 为 `rou3@0.9.2`，提交信息 `chore(release): v0.9.2`，当前 `origin/main` 亦指此 SHA。
