# JSON-number source review (writer IF)

> 用途：记录 lossless-json、json-bigint 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：IF
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- pair：`lossless-json` 与 `json-bigint`。未选用 json5 / jsonc-parser，也未把 marked、markdown-it、knex、ioredis、redis、BullMQ 写成对照目标。
- lane：IF；intern 占用 HM–ID，本轮不使用 HN。

## lossless-json

- canonical source：`https://github.com/josdejong/lossless-json`
- revision：`a19ae09763876582d120d2f3de4cbd7741faa427`
- package：`lossless-json@4.3.1`
- provenance：GitHub tag `v4.3.1` 与 npm `gitHead` 同指该提交
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/parse.ts`
  - `src/stringify.ts`
  - `src/LosslessNumber.ts`
  - `src/numberParsers.ts`
  - `src/utils.ts`
  - `src/revive.ts`
  - `src/config.ts`
  - `src/types.ts`
  - `src/parse.test.ts`
  - `src/LosslessNumber.test.ts`
- observed：
  - no runtime dependencies; `exports` map import to `lib/esm/index.js` and require to `lib/umd/lossless-json.js`; `sideEffects` is false;
  - default `parse` keeps every JSON number as `LosslessNumber` (string payload + `isLosslessNumber`);
  - third argument is either a `parseNumber` function or `{ parseNumber, onDuplicateKey }`; README one-shot example uses `numberParser`, which the implementation ignores;
  - `parseNumberAndBigInt` maps integer text to `bigint` and everything else to `Number.parseFloat`;
  - `valueOf` returns `parseFloat` for safe / truncate_float values, `BigInt` for unsafe integers, and throws on overflow / underflow;
  - `stringify` emits `LosslessNumber` / `bigint` via `toString()` without quotes; `LosslessNumber` has no `toJSON`;
  - duplicate keys throw unless the two values are deep-equal, or `onDuplicateKey` returns a replacement;
  - `config()` throws: circular-ref support was removed.

## json-bigint

- canonical source：`https://github.com/sidorares/json-bigint`
- revision：`390482a8b6b460f98c61c3b65915dbd91fc8e7b2`
- package：`json-bigint@1.0.0`
- provenance：GitHub tag `v1.0.0` 与 npm `gitHead` 同指该提交
- inspected：
  - `package.json`
  - `README.md`
  - `index.js`
  - `lib/parse.js`
  - `lib/stringify.js`
  - `test/bigint-parse-test.js`
  - `test/proto-test.js`
- observed：
  - runtime dependency `bignumber.js@^9.0.0`; CommonJS only (`main=index.js`);
  - factory `require('json-bigint')(options)` returns `{ parse, stringify }`; module-level `parse` / `stringify` use empty options;
  - parser is a Crockford recursive-descent fork; objects are `Object.create(null)`;
  - numbers whose raw text length is `> 15` become `BigNumber`, native `BigInt`, or string; shorter numbers stay IEEE-754 unless `alwaysParseAsBig`;
  - `useNativeBigInt` on the long path calls `BigInt(string)`; on the short+always path it calls `BigInt(number)`;
  - default `protoAction` / `constructorAction` is `error`, using Bourne / secure-json-parse suspect regexes (including `\u005f_proto__`);
  - default duplicate keys last-write-win; `strict: true` throws;
  - parse failures throw a plain `{ name: 'SyntaxError', message, at, text }` object, not `new SyntaxError`;
  - shared `stringify` treats `BigNumber` (via pre-`toJSON` flag) and native `bigint` as unquoted JSON numbers.
