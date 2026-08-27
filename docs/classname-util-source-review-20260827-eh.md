# className util source review

> 用途：记录 clsx、classnames 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EH
- evidence：GitHub metadata、npm package metadata、固定提交静态源码、类型声明与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、browser benchmark 或性能测量
- worktrees：本机 `research-worktrees/`，不进入 Git

## clsx

- canonical source：`https://github.com/lukeed/clsx`
- revision：`925494cf31bcd97d3337aacd34e659e80cae7fe2`
- git tag：`v2.1.1`
- package：`clsx@2.1.1`
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/lite.js`
  - `clsx.d.ts`
  - `clsx.d.mts`
  - `bin/index.js`
  - `readme.md`
  - `test/index.js`
  - `test/lite.js`
  - `test/classnames.js`
- observed：
  - npm `clsx@2.1.1` `gitHead` equals tag `v2.1.1`; `master` is identical to this commit;
  - default export and named `clsx` are the same function; `toVal` accepts string/number, recursively walks arrays, and `for-in`s object keys whose values are truthy;
  - `toVal` does not call `hasOwnProperty` and does not invoke a custom `toString`;
  - functions, `null`, `undefined`, `0`, `NaN` and standalone booleans are discarded; `Infinity` becomes `"Infinity"`;
  - `clsx/lite` keeps only non-empty strings and ignores numbers, objects, arrays and functions;
  - published files are `dist/*` plus type declarations; `bin/index.js` minifies ESM/CJS/UMD with terser;
  - `engines.node` is `>=6`; types also mention `bigint`, but runtime `typeof` is not `string`/`number`/`object`;
  - tests include a classnames compatibility suite; this review did not run it.
- provenance：
  - Git tag `v2.1.1` and npm `clsx@2.1.1` identify the same reachable revision.

## classnames

- canonical source：`https://github.com/JedWatson/classnames`
- revision：`2e3683264bab067d13938b5eb03a96391a089cb4`
- git tag：`v2.5.1`
- package：`classnames@2.5.1`
- inspected：
  - `package.json`
  - `index.js`
  - `dedupe.js`
  - `bind.js`
  - `index.d.ts`
  - `README.md`
  - `HISTORY.md`
  - `tests/index.mjs`
  - `tests/dedupe.mjs`
  - `tests/bind.mjs`
- observed：
  - npm latest is `2.5.1` and `gitHead` equals tag `v2.5.1`;
  - the package is CommonJS and ships `index.js` / `bind.js` / `dedupe.js` as IIFE with CJS, AMD and `window.classNames` fallbacks;
  - default `parseValue` returns string/number as-is, recurses arrays, uses `hasOwn` for plain objects, and calls a non-native `toString` when it differs from `Object.prototype.toString` and its source string does not contain `[native code]`;
  - `classnames/bind` maps string/number tokens and object keys through `this[token] || token`;
  - `classnames/dedupe` accumulates a null-prototype set, splits strings on `/\s+/`, and later falsy object keys can clear earlier tokens;
  - integer-like keys on that set are enumerated before other keys, so `dedupe('a', 1, 'b')` is `"1 a b"` in the checked tests;
  - default `classNames` does not dedupe; README claims the dedupe build is slower, but this review did not measure it.
- provenance conflict：
  - GitHub tag `v2.5.2` (`5b2c8d6d98edd289cdaf4c05e0479211f1d05268`) exists and is three commits ahead, changing mainly `dedupe.js` to string concatenation;
  - npm has no `classnames@2.5.2`; dist-tag `latest` remains `2.5.1`;
  - this review therefore binds the internally consistent and published `v2.5.1` tag/package/revision.
