# DOM implementation source review (writer DI)

> 用途：记录 happy-dom、linkedom 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DI
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、SSR、bundle、canvas 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- pair：happy-dom 与 linkedom；未审查 jsdom

## happy-dom

- canonical source：`https://github.com/capricorn86/happy-dom`
- revision：`00fcf21b00da1ba1ed89f1b940592c32de21708d`
- git tag：lightweight tag `v20.11.8` 直接指向该提交
- package：npm `happy-dom@20.11.8` 的 `gitHead` 与该提交一致
- inspected：
  - 根 `package.json`
  - `packages/happy-dom/package.json`
  - `packages/happy-dom/src/index.ts`
  - `packages/happy-dom/src/version.ts`
  - `packages/happy-dom/src/window/Window.ts`
  - `packages/happy-dom/src/window/GlobalWindow.ts`
  - `packages/happy-dom/src/window/DetachedWindowAPI.ts`
  - `packages/happy-dom/src/browser/Browser.ts`
  - `packages/happy-dom/src/browser/BrowserPage.ts`
  - `packages/happy-dom/src/browser/DefaultBrowserSettings.ts`
  - `packages/happy-dom/src/browser/types/IOptionalBrowserSettings.ts`
  - `packages/happy-dom/src/html-parser/HTMLParser.ts`
  - `packages/happy-dom/src/nodes/html-script-element/HTMLScriptElement.ts`
  - `packages/@happy-dom/global-registrator/src/GlobalRegistrator.ts`
  - `packages/@happy-dom/jest-environment/package.json`
  - `README.md`
- observed：
  - monorepo workspaces 含 `packages/happy-dom` 与 `packages/@happy-dom/*`（jest-environment、global-registrator、server-renderer、node-canvas-adapter）；工作区 `package.json` 版本为占位 `0.0.0`，`src/version.ts` 同样是占位，发布版本以 npm / tag 为准；
  - `Window` 继承 `BrowserWindow`，构造时创建 `DetachedBrowser`，把 viewport / settings 挂到 detached page 的 `mainFrame`，并暴露 `window.happyDOM`（`DetachedWindowAPI`）；
  - `Browser` 持有 `contexts[]`，默认一个 `BrowserContext`；`newPage()` 走 default context，`newIncognitoContext()` 追加独立 context；`close()` 清空 contexts；
  - `BrowserPage` 把 `content` / `url` / `goto` / `evaluate` / `waitUntilComplete` 委托给 `mainFrame`；
  - 默认 `enableJavaScriptEvaluation` 为 `false`；`disableJavaScriptEvaluation` 已 deprecated，不再是默认关闭开关；
  - `HTMLParser` 是手写 `MARKUP_REGEXP` 扫描器，不是 htmlparser2；`evaluateScripts` 默认 false，`<script>` 是否执行还要看 settings；
  - `GlobalRegistrator.register()` 把 `GlobalWindow` 的可枚举属性写到 `globalThis`，重复 register 会 throw；
  - Node engines 为 `>=20.0.0`；核心依赖含 `entities`、`whatwg-mimetype`、`ws`、`buffer-image-size`。
- provenance：
  - GitHub lightweight tag `v20.11.8`、npm `happy-dom@20.11.8` 的 `gitHead`、以及该 commit SHA 三者一致且可达；
  - 本页只绑定 `happy-dom` 核心包；`@happy-dom/*` 工作区版本仍是 `0.0.0`，不把它们的 npm latest 外推为本 revision 的独立证据。

## linkedom

- canonical source：`https://github.com/WebReflection/linkedom`
- revision：`fcd88e02b6dd3e616f5de512b15713b663d16ab7`
- git tag：annotated tag `v0.18.13` 解引用到该提交
- package：npm `linkedom@0.18.13` 的 `gitHead` 与该提交一致
- inspected：
  - `package.json`
  - `README.md`
  - `deep-dive.md`
  - `esm/index.js`
  - `esm/cached.js`
  - `esm/dom/parser.js`
  - `esm/shared/parse-from-string.js`
  - `esm/shared/symbols.js`
  - `esm/shared/matches.js`
  - `esm/interface/node.js`
  - `esm/mixin/parent-node.js`
  - `esm/html/document.js`
- observed：
  - `parseHTML(html, globals)` 调用 `new DOMParser().parseFromString(html, 'text/html', globals).defaultView`，返回的 `window` / `document` 不是 Node 全局；
  - `DOMParser` 按 MIME 选择 `HTMLDocument` / `SVGDocument` / `XMLDocument`；HTML 解析走 `htmlparser2`，属性默认不强制小写；
  - `ParentNode` 用 `NEXT` / `PREV` 双向链，并用 `END` sentinel 标出元素边界；`childNodes` / `children` 每次遍历生成 `NodeList`，不保留子数组；
  - `querySelector` / `querySelectorAll` 沿 `NEXT` 线性扫描，匹配函数由 `css-select` 经 `prepareMatch` 提供；`<template>` 内部被跳到 `END`；
  - `linkedom/cached` 用 WeakMap 缓存 `childNodes`、`children`、`querySelector`、`querySelectorAll`，并在 `insertBefore` / 属性变更时 `reset`；
  - `parseJSON` / `toJSON` 是独立的 JSDON 往返，不是 `JSON.parse(document)`；
  - `exports` 提供 `.`、`./cached`、`./worker`；`canvas` 是 optional peer；Node engines 为 `>=16`。
- provenance：
  - GitHub annotated tag `v0.18.13` 与 npm `linkedom@0.18.13` 的 `gitHead` 都指向 `fcd88e02...`；
  - README 中的吞吐 / 内存说法未在本轮测量，不写入项目页结论。
