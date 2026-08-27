# XML parser source review (writer HI)

> 用途：记录 xml2js、fast-xml-parser 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HI
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：yaml / js-yaml，以及 marked、markdown-it、knex、ioredis、redis、BullMQ

## xml2js

- canonical source：`https://github.com/Leonidas-from-XIV/node-xml2js`
- revision：`cf3e061e22e98152b88068c2345bc02581f4d6c7`
- package：`xml2js@0.6.2`
- tag：`0.6.2`（lightweight tag 与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `README.md`
  - `src/xml2js.coffee`
  - `src/defaults.coffee`
  - `src/parser.coffee`
  - `src/builder.coffee`
  - `src/processors.coffee`
  - `src/bom.coffee`
- observed：
  - 作者源在 `src/*.coffee`，npm `files` 只发布 `lib/`，`main` 为 `./lib/xml2js`；
  - 生产依赖是 `sax >=0.6.0` 与 `xmlbuilder ~11.0.0`；`engines.node >= 4.0.0`；
  - 默认走 `defaults["0.2"]`：`explicitArray=true`、`explicitRoot=true`、`attrkey="$"`、`charkey="_"`、`trim=false`、`async=false`、`ignoreAttrs=false`、`emptyTag=''`；
  - `Parser` 继承 `EventEmitter`；忘记 `new` 时构造函数会自己补；`parseString` 用 callback，`parseStringPromise` 包一层 Promise；
  - 空字符串 `trim()` 后直接 `emit("end", null)`；输入先 `bom.stripBOM`；
  - `async:true` 并不换成另一套解析器，只是按 `chunkSize`（默认 10000）经 `setImmediate` 分块 `write`；
  - 属性默认进 `$`；同名子节点经 `assignOrPush` 收成数组；属性描述符用 `Object.create(null)` 再 `defineProperty`；
  - `Builder.buildObject` 委托 `xmlbuilder`；单根且 `rootName` 仍是默认 `root` 时用对象的唯一键当根，否则包一层 `root`；默认 `renderOpts.pretty=true`；
  - `processors.stripPrefix` 用 `/(?!xmlns)^.*:/`，因此 `xmlns:` 前缀不会被剥掉。
- provenance：
  - GitHub tag `0.6.2`、npm `xml2js@0.6.2` 与 `gitHead` 三方均为 `cf3e061e22e98152b88068c2345bc02581f4d6c7`。

## fast-xml-parser

- canonical source：`https://github.com/NaturalIntelligence/fast-xml-parser`
- revision：`3617550adfb280989f482d662b7e9ece55a32a34`
- package：`fast-xml-parser@5.11.1`
- tag：`v5.11.1`（annotated tag 剥皮后与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`
  - `src/fxp.js`
  - `src/fxp.d.ts`
  - `src/xmlparser/XMLParser.js`
  - `src/xmlparser/OptionsBuilder.js`
  - `src/xmlparser/OrderedObjParser.js`
  - `src/xmlparser/node2json.js`
  - `src/xmlbuilder/json2xml.js`
  - `src/validator.js`
  - `src/util.js`
- observed：
  - `type=module`；`import` 走 `src/fxp.js`，`require` 走 `lib/fxp.cjs`；公开导出只有 `XMLParser` / `XMLValidator` / `XMLBuilder`；
  - `src/v6/` 存在，但 `src/fxp.js` 未导出 v6；
  - 生产依赖是 `@nodable/entities`、`fast-xml-builder`、`is-unsafe`、`path-expression-matcher`、`strnum`、`xml-naming`；
  - 默认 `ignoreAttributes=true`、`parseTagValue=true`、`trimValues=true`、`preserveOrder=false`、`maxNestedTags=100`；
  - `parse()` 同步：可选第二参数校验已在类型上标 deprecated；通过后 `OrderedObjParser.parseXml` 得到有序节点，再 `prettify`/`compress` 压成普通对象；
  - `parseTagValue` 先认 `'true'`/`'false'`，其余交给 `strnum`；
  - `processEntities` 会被规范成带限额的对象；实体解码走 `@nodable/entities`，`is-unsafe` 对输入实体返回 `BLOCK`；
  - `__proto__` / `constructor` / `prototype` 在 `sanitizeName` 直接抛错；`hasOwnProperty` 等走 `onDangerousProperty`，默认加 `__` 前缀；
  - `XMLBuilder` 只是 `fast-xml-builder` 的再导出；`XMLValidator` 与 `parse(..., validationOption)` 类型标注改为推荐 `fast-xml-validator`。
- provenance：
  - GitHub latest release `v5.11.1`、npm `fast-xml-parser@5.11.1` 与 `gitHead` 三方均为 `3617550adfb280989f482d662b7e9ece55a32a34`。
