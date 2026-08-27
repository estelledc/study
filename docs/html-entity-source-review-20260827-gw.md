# HTML entity source review (writer GW)

> 用途：记录 he、entities 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：GW
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、CLI、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## he

- canonical source：`https://github.com/mathiasbynens/he`
- revision：`36afe179392226cf1b6ccdb16ebbb7a5a844d93a`
- package：`he@1.2.0`
- inspected：
  - `package.json`
  - `README.md`
  - `src/he.js`（encode / decode / escape / unescape、option merge、codePointToSymbol）
  - `he.js`（构建后 `version`）
  - `data/encode-map.json`（`` ` `` → `grave`）
  - `bin/he`
- observed：
  - tag `v1.2.0`、构建后 `he.version` 与 npm `he@1.2.0` 的 `gitHead` 指向同一提交；
  - `main` 为构建产物 `he.js`；`src/he.js` 是 Grunt 模板，正则与 map 由 `scripts/` 注入；
  - `encode.options` 默认 `useNamedReferences=false`、`decimal=false`、`encodeEverything=false`、`allowUnsafeSymbols=false`、`strict=false`；
  - 默认 `encode` 用十六进制数字引用转义 `"&'<>`` 以及非可打印 ASCII / 非 ASCII；
  - `escape` 只替换 `"&'<>``，且 `'` → `&#x27;`、`` ` `` → `&#x60;`；
  - `unescape` 是 `decode` 的别名；
  - `decode` 处理带分号命名引用、遗留无分号命名引用、十进制 / 十六进制数字引用和 ambiguous ampersand；
  - `isAttributeValue` 且下一字符为 `=` 时，无分号命名引用原样保留；
  - `codePointToSymbol` 把代理区与 `> 0x10FFFF` 变成 `U+FFFD`，`strict` 则抛 `Parse error`；
  - 仓库无 `engines` 字段；最近 tag 停留在 2021-09 的 v1.2.0。
- provenance：tag / package / npm `gitHead` 内部一致，无需拆发布树。

## entities

- canonical source：`https://github.com/fb55/entities`
- revision：`2322ee76c431b990facb259b61b9ff4eb89ef3c9`
- package：`entities@8.0.0`
- inspected：
  - `package.json`
  - `readme.md`
  - `src/index.ts`
  - `src/decode.ts`
  - `src/decode-codepoint.ts`
  - `src/encode.ts`
  - `src/escape.ts`
- observed：
  - tag `v8.0.0`、`package.json` version 与 npm `gitHead` 指向同一提交；
  - ESM、`sideEffects: false`、`engines.node >= 20.19.0`；
  - 根导出 `decode()` / `encode()` 默认 `EntityLevel.XML`，不是 HTML；
  - `decodeHTML` 默认 `DecodingMode.Legacy`；`decodeXML` 固定 `Strict`，并别名为 `decodeXMLStrict`；
  - `encode()` 默认 `EncodingMode.Extensive`：XML 走 `encodeXML`，HTML 走 `encodeHTML`；
  - `encodeHTML` 用生成 trie + ASCII bitset；无命名实体时写 `&#x…;`；
  - `encodeXML` / `escape` 是同一函数；`escapeUTF8` 只转 `"&'<>`；
  - `escapeAttribute` 转 `"&` 与 `U+00A0`；`escapeText` 转 `&<>` 与 `U+00A0`；
  - `EntityDecoder` 可分段 `write()`，未完成返回 `-1`；
  - `replaceCodePoint` 注释写明改编自 he 的 `codePointToSymbol`；
  - `he` 只出现在 devDependencies / benchmark，不是运行时依赖。
- provenance：tag / package / npm `gitHead` 内部一致。
