# DOM utility source review

> 用途：记录 jQuery、cash-dom 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## jQuery

- canonical source：`https://github.com/jquery/jquery`
- revision：`4f2fae08f23b54ce09322e62e73cce6161b8d3cb`
- package：`jquery@4.0.0`
- inspected：
  - `package.json`
  - `src/jquery.js`
  - `src/core.js`
  - `src/core/init.js`
  - `src/core/parseHTML.js`
  - `src/core/isObviousHtml.js`
  - `src/selector.js`
  - `src/event.js`
  - `src/ajax.js`
  - `src/deferred.js`
  - `src/deprecated.js`
  - `src/exports/global.js`
- observed：
  - `jQuery(selector, context)` is a factory that returns `new jQuery.fn.init(selector, context)`; the prototype is array-like with `pushStack` / `end`;
  - `init` handles empty values, a single `nodeType` element, a ready function, obvious HTML (`<...>`), `rquickExpr` HTML or `#id`, then `$(context).find(selector)`;
  - `rquickExpr` prefers `#id` over HTML so `location.hash` cannot be parsed as markup (trac-9521); `$(html)` calls `parseHTML(..., keepScripts=true)` against the provided document;
  - `parseHTML` without a context builds an empty `DOMParser` document to stop immediate script / inline-handler execution; `$(html)` usually supplies `document`, so that isolation does not apply;
  - `find` first tries `getElementById` / `getElementsByTagName` / `getElementsByClassName`, then `querySelectorAll` with a `:scope` or temporary id prefix for descendant/sibling combinators, then a compiled `select()` matcher that still lives in-tree;
  - events parse `type.namespace`, keep one `addEventListener` handle per element/type, and dispatch through `jQuery.event`; delegation uses `special.delegateType` and selector matching;
  - ajax defaults to `GET`, `async: true`, `processData: true`, `global: true`, and `application/x-www-form-urlencoded; charset=UTF-8`; converters include `text json: JSON.parse`; the return value is a Deferred-based jqXHR;
  - `Deferred` uses `jQuery.Callbacks("once memory")` for done/fail and exposes Promises/A+ `then` / `catch`;
  - package `type` is `module`; exports expose `.`, `./slim`, `./factory`, and `./factory-slim` for Node / bundler / ESM;
  - `isIE` branches remain in selector and `:selected`; `jQuery.proxy` and `holdReady` remain in `deprecated.js`;
  - README at this revision still labels the 4.x row as Beta even though the tag and `package.json` report `4.0.0`.
- provenance note：
  - npm reports `jquery@4.0.0` with `gitHead=cfd8e3a885dca7b406791c1eed472af9dd717e8e`;
  - that `gitHead` is not a reachable commit on `jquery/jquery`;
  - GitHub annotated tag `4.0.0` peels to `4f2fae08f23b54ce09322e62e73cce6161b8d3cb`, whose `package.json` reports `4.0.0`;
  - this review binds the reachable tag commit and does not invent a tree for the unreachable npm `gitHead`.

## cash-dom

- canonical source：`https://github.com/fabiospampinato/cash`
- revision：`61e3b8f26ca11fecb47c9f0a404228375966a931`
- package：`cash-dom@8.1.5`
- inspected：
  - `package.json`
  - `src/core/cash.ts`
  - `src/core/find.ts`
  - `src/core/parse_html.ts`
  - `src/core/variables.ts`
  - `src/core/type_checking.ts`
  - `src/methods.ts`
  - `src/events/on.ts`
  - `src/data/data.ts`
  - `src/manipulation/html.ts`
  - `src/manipulation/helpers/insert_element.ts`
  - `src/manipulation/helpers/insert_selectors.ts`
  - `src/manipulation/helpers/eval_scripts.ts`
  - `src/extra/get_script.ts`
- observed：
  - `Cash` is a class; `cash` is `Cash.prototype.init`, and `cash.fn === Cash.prototype` so `cash() instanceof Cash`;
  - string input uses `idRe` → `getElementById`, `htmlRe` (`/<.+>/`) → `parseHTML`, otherwise `find`; a function argument is `ready`;
  - `find` only shortcuts class/tag via `getElementsByClassName` / `getElementsByTagName`, then calls `querySelectorAll`; there is no compiled pseudo / positional matcher;
  - `parseHTML` writes into a typed container (`tr`/`td`/`tbody`/…) via `innerHTML` and `detach()`s the children; source comments still list TODOs about fragments and inline handlers;
  - `.html(markup)` uses `innerHTML` unless the string matches `/<script[\s>]/`, in which case it `empty().append()` so `insertElement(..., evaluate=true)` can `evalScripts`;
  - `evalScripts` clones matching script nodes into `document.head` and removes them; only the first inserted copy in a multi-anchor insert is evaluated (`!indexFinal`);
  - `on` parses namespaces, remaps focus/hover names, walks `parentNode` for delegation, and treats `return false` as `preventDefault` plus `stopPropagation`;
  - `.data()` reads/writes `dataset` helpers rather than a separate expando cache;
  - default `src/methods.ts` `@no-require`s `extra/get_script.ts` and `extra/shorthands.ts`, so `cash.getScript` and click-style event shortcuts are not in the default build;
  - there is no ajax, Deferred, or animated effects module; `show` / `hide` / `toggle` only change display.
- provenance note：
  - npm `cash-dom@8.1.5` reports `gitHead=61e3b8f26ca11fecb47c9f0a404228375966a931`;
  - GitHub tag `8.1.5` on `fabiospampinato/cash` is the same commit, and `package.json` reports `8.1.5`;
  - this review binds that shared revision.
