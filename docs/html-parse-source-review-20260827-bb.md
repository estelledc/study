# HTML parse source review

> 用途：记录 Cheerio、jsdom 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer BB
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与 README 阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle、layout 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Cheerio

- canonical source：`https://github.com/cheeriojs/cheerio`
- revision：`e3c7aaf9ed64fe3cb9a181e58a41c0fdd6dbfbfc`
- package：`cheerio@1.2.0`
- provenance：GitHub tag `v1.2.0`、package version 与 npm `gitHead` 指向同一提交
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/load.ts`
  - `src/load-parse.ts`
  - `src/parse.ts`
  - `src/options.ts`
  - `src/slim.ts`
  - `src/cheerio.ts`
  - `src/static.ts`
  - `src/utils.ts`
  - `src/parsers/parse5-adapter.ts`
  - `src/api/extract.ts`
  - `src/api/attributes.ts`
- observed：
  - default HTML parsing uses parse5 plus the htmlparser2 tree adapter; `xml` / `xmlMode` set `_useHtmlParser2`;
  - `cheerio/slim` binds `htmlparser2.parseDocument` and never loads parse5;
  - `load()` defaults `isDocument` to true, which can introduce `html` / `head` / `body`;
  - parse5 `scriptingEnabled` defaults true and does not execute JavaScript;
  - `fromURL()` uses undici, allows five redirects, rejects non-2xx and non-HTML/XML MIME types, and sniffs `windows-1252` for HTML or `utf8` for XML;
  - `parseHTML()` defaults `keepScripts` to false and removes `script` nodes;
  - package engines declare Node `>=20.18.1`.

## jsdom

- canonical source：`https://github.com/jsdom/jsdom`
- revision：`6584485f094d5b271553005b68804c93a455c002`
- package：`jsdom@30.0.1`
- provenance：GitHub tag `v30.0.1`、package version 与 npm `gitHead` 指向同一提交
- inspected：
  - `package.json`
  - `lib/api.js`
  - `lib/jsdom/browser/parser/index.js`
  - `lib/jsdom/browser/parser/html.js`
  - `lib/jsdom/browser/Window.js`
  - `lib/jsdom/living/nodes/Document-impl.js`
  - `README.md`
- observed：
  - constructor normalizes HTML, creates a Window, runs `beforeParse`, parses into the existing Document, then `document.close()`;
  - HTML uses parse5; XML uses saxes; default `contentType` is `text/html` and default URL is `about:blank`;
  - `runScripts` defaults off; `"dangerously"` enables embedded scripts and `scriptingEnabled`; `"outside-only"` installs a vm context and a useful `window.eval`;
  - default `resources` do not load subresources, while XHR still works; `"usable"` loads usable subresources and is also the initial-fetch default inside `fromURL()`;
  - `fromURL()` forbids caller-supplied `url` / `contentType` and throws when the response is not ok;
  - CookieJar defaults to `looseMode: true`; `storageQuota` defaults to 5_000_000; `canvas` is an optional peer;
  - package engines declare `^22.22.2 || ^24.15.0 || >=26.0.0`.
