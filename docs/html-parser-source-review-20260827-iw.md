# HTML parser source review (writer IW)

> 用途：记录 htmlparser2、parse5 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：IW
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、html5lib suite、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- reserved lanes：HM–ID 不用；本页不写 marked、markdown-it、knex、ioredis、redis、BullMQ、xml2js、fast-xml-parser

## htmlparser2

- canonical source：`https://github.com/fb55/htmlparser2`
- revision：`c73fec0c0586647cd1269d2598e2ba4203d0207f`
- package：`htmlparser2@12.0.0`
- tag：annotated `v12.0.0` 剥皮提交与 npm `gitHead` 同指上述 commit（tag 对象本身是 `d210690686ead3f3004b521998e7b42be46e808f`）
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/Parser.ts`
  - `src/Tokenizer.ts`
  - `src/WritableStream.ts`
  - `src/WebWritableStream.ts`
- observed：
  - ESM（`type=module`）、`sideEffects=false`、`engines.node >= 20.19.0`；生产依赖是 `domelementtype` / `domhandler` / `domutils` / `entities`；
  - 根导出 `Parser`、`parseDocument`、`createDocumentStream`、`parseFeed`，并再导出 `DomHandler` / `DomUtils`；流入口是子路径 `./WritableStream` 与 `./WebWritableStream`；
  - `parseDocument` 新建 `DomHandler` 后 `Parser.end(data)`；`parseFeed` 默认 `{ xmlMode: true }`，再把 `parseDocument(...).children` 交给 `getFeed`；
  - `Parser` 默认 `xmlMode=false`、`decodeEntities=true`；`lowerCaseTags` / `lowerCaseAttributeNames` 默认 `!xmlMode`；`recognizeSelfClosing` / `recognizeCDATA` 默认 `xmlMode`；
  - HTML 模式用 `openImpliesClose` 启发式关标签，不是完整 WHATWG 树构建；void 元素立即 `onclosetag(..., true)`；已打开的第二个 `<form>` 被压成空 `tagname`；
  - `</p>` 无匹配时会先隐式打开再关上；`</br>` 会补一对 open/close；HTML 非 foreign 上下文把 `image` 调成 `img`；SVG 用 `svgTagNameAdjustments`；
  - 重复属性只保留第一次（`Object.hasOwn`）；`ontext` 可对同一段文本多次触发；`write`/`end` 在结束后会走 `onerror`。
- provenance：
  - GitHub latest release `v12.0.0`、npm `htmlparser2@12.0.0` `gitHead` 与剥皮提交一致。

## parse5

- canonical source：`https://github.com/inikulin/parse5`
- revision：`0d56627fc924d40f560fd260ade0e1a935e2369c`
- package：`parse5@8.0.1`（monorepo 工作区包；根 `package.json` 名为 `parse5-build-scripts`）
- tag：lightweight `v8.0.1` 与 npm `gitHead` 同指上述 commit
- inspected：
  - 根 `package.json`
  - `docs/list-of-packages.md`
  - `packages/parse5/package.json`
  - `packages/parse5/lib/index.ts`
  - `packages/parse5/lib/parser/index.ts`
  - `packages/parse5/lib/serializer/index.ts`
  - `packages/parse5/lib/tree-adapters/default.ts`
  - `packages/parse5/lib/common/html.ts`
  - `packages/parse5-htmlparser2-tree-adapter/package.json`
  - `packages/parse5-htmlparser2-tree-adapter/lib/index.ts`
- observed：
  - 核心包只依赖 `entities`；`type=module`；`exports["."]` 指向 `dist/index.js`；未声明 `engines`；
  - 公开入口是 `parse` / `parseFragment` / `serialize` / `serializeOuter` 与 `defaultTreeAdapter`；`Parser` / `Tokenizer` 标 `@internal`；
  - `Parser.parse` 一次 `tokenizer.write(html, true)`；插入模式从 `INITIAL` 走到 `BEFORE_HTML` / `BEFORE_HEAD` / `IN_HEAD` / `AFTER_HEAD` / `IN_BODY` 等；
  - 默认 `scriptingEnabled=true`、`sourceCodeLocationInfo=false`、`treeAdapter=defaultTreeAdapter`、`onParseError=null`；设了 `onParseError` 会强制打开 location；
  - 无 context 的 `parseFragment` 用 `<template>` 当 fragment context，并用 `documentmock` 当假 document，避免改调用方 document；
  - 默认树节点用 `nodeName` / `tagName` / `attrs[]` / `namespaceURI` / `childNodes`；`serialize` 只串子节点，void 元素返回空串；`serializeOuter` 才含元素自身；
  - 同提交还带 `parse5-htmlparser2-tree-adapter@8.0.1`，可把 WHATWG 树接到 `domhandler` 节点。
- provenance：
  - GitHub latest release `v8.0.1`、npm `parse5@8.0.1` `gitHead` 与 lightweight tag 一致。
