# String-case source review (writer FG)

> 用途：记录 `scule` 与 `change-case` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fg` 标记 2026-08-27 平行 writer FG，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FG
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test / typecheck / bench，未测 bundle 或 locale 运行时差异
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- target originally assigned：scule + change-case
- fallback considered：清单里没有其他 string-case 双子；这两库本身也不在既有 963 页中。本轮按调用方指定目标新增两页，而不是改写无关工具库。

## 选题

- Study 既有项目页没有 `scule` / `change-case` / `camelcase` / `decamelize` 等 slug。
- 两者都是小型、可固定 revision 的 string-case 库，边界互补：scule 是字符扫描 + 模板字面量类型；change-case 是 Unicode 正则 + locale + object-key 映射。
- 未占用其他平行 writer 的 slug。

## scule

- canonical source：`https://github.com/unjs/scule`
- revision：`90d28593c8426d16beb5dadf3af8d341b6fee107`
- git tag：annotated `v1.3.0`（tag object 剥开后即该提交）
- package：`scule@1.3.0`
- license：MIT
- npm：`scule@1.3.0` latest，`gitHead` 与剥开后的 tag 同指此提交
- also observed：`main` HEAD 在该 tag 之后只有 CI action digest 更新，未另绑
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/types.ts`
  - `test/scule.test.ts`
  - `test/types.test-d.ts`
- observed：
  - 默认 splitter 是 `-` `_` `/` `.`；`splitByCase` 按字符前进，遇到 splitter 或大小写边沿切词；数字对 `isUppercase` 返回 `undefined`，不单独触发边沿；
  - splitter 分支 `continue` 前不改 `previousSplitter`，因此 `foo-bAr` 会切成 `foo` / `b` / `Ar`；
  - 连续 splitter 会留下空段，`kebabCase("foo--bar")` 仍是 `foo--bar`；
  - `pascalCase` / `camelCase` / `trainCase` / `titleCase` 接受 `{ normalize }`；`kebabCase` / `snakeCase` / `flatCase` 一律 `toLowerCase`；
  - `snakeCase` 是 `kebabCase(str, "_")`，`flatCase` 是 `kebabCase(str, "")`；
  - `trainCase` 默认保留连续大写（`WWWAuthenticate` → `WWW-Authenticate`）；`normalize: true` 才变成 `Www-Authenticate`；
  - `titleCase` 用一份英文虚词正则压小写，其余词 `upperFirst`；
  - 运行时类型与 `src/types.ts` 的模板字面量类型并行；空输入返回 `""`，非字符串 `splitByCase` 返回 `[]`；
  - `exports` 同时给 `require` 与 `import`；`sideEffects: false`；没有 `engines`，也没有 object-key helper。
- provenance：
  - GitHub annotated tag `v1.3.0` 与 npm `gitHead` 一致；
  - 身份是 tag + package version + commit SHA。

## change-case

- canonical source：`https://github.com/blakeembrey/change-case`
- revision：`8aaff31471c918d3eac2b40939c601bee37375dd`
- git tag：lightweight `change-case@5.4.4`
- package：`change-case@5.4.4`
- companions at the same revision（未绑定为本页 applicable version）：`title-case@4.3.1`、`sponge-case`、`swap-case`
- license：MIT
- npm：`change-case@5.4.4` latest，`gitHead` 与 tag 同指此提交
- also observed：后续 `main` 还有 title-case / newline 相关提交；本页不跟
- inspected：
  - `README.md`
  - `package.json`
  - `packages/change-case/package.json`
  - `packages/change-case/README.md`
  - `packages/change-case/src/index.ts`
  - `packages/change-case/src/index.spec.ts`
  - `packages/change-case/src/keys.ts`
  - `packages/change-case/src/keys.spec.ts`
  - `packages/title-case/package.json`（只确认它是独立包）
- observed：
  - `split` 用 `\p{Ll}` / `\p{Lu}` 插入 `\0`，再把非字母数字收成分隔；空输入得到 `[]`；
  - `noCase` 是小写 + 默认空格；`kebabCase` / `snakeCase` / `dotCase` / `pathCase` 只换 delimiter；
  - `capitalCase` 每个词首大写其余小写；`trainCase` 就是 `capitalCase({ delimiter: "-" })`，因此 `WWWAuthenticate` → `Www-Authenticate`；
  - `camelCase` / `pascalCase` 用 `pascalCaseTransformFactory`：下标 > 0 且词首是数字时先加 `_`；`mergeAmbiguousCharacters: true` 改走 `capitalCaseTransformFactory`，`version 1.2.10` 变成 `version1210` / `Version1210`；
  - README 把“数字歧义加 `_`”写成 pascal/snake，固定源码里该变换只挂在 camel/pascal；
  - `locale: false` 走 `toLowerCase` / `toUpperCase`，否则 `toLocale*`；`prefixCharacters` / `suffixCharacters` 可保住 `__typename` 两端的 `_`；
  - `separateNumbers` 已 deprecated，等价于 `split: splitSeparateNumbers`；
  - `change-case/keys` 默认 `depth = 1`，数组映射子项，对象用 `Object.create(getPrototypeOf)` 抄原型后再改 key；
  - 包是 pure ESM（`type: module`），`exports` 只有 `.` 与 `./keys`；同提交的 `title-case` 不在此包。
- provenance：
  - Git tag `change-case@5.4.4` 与 npm `gitHead` 一致；
  - 身份是 tag + package version + commit SHA。
