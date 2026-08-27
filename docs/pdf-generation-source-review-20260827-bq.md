# PDF generation source review BQ

> 用途：记录 jsPDF、PDFKit 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer BQ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与类型阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- target vs fallback：首选 `pdf-lib` + `jspdf`。`pdf-lib` 不在开放 PR slug 中，但仓库没有该项目页；新建会抬高 atlas unknown-difficulty / empty-description 预算，并改写多处公开计数文案。因此改走现有双子 `jspdf` + `pdfkit`。
- forbidden overlap：未修改 pdfmake、pdfme 正文，也未改其他开放 PR slug。

## jsPDF

- canonical source：`https://github.com/parallax/jsPDF`
- revision：`4562ce8aa35bd5ecd98cd5e262e3da2af96476f6`
- release tag / package：`v4.2.1` / `jspdf@4.2.1`
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/jspdf.js`
  - `src/modules/html.js`
  - `src/modules/vfs.js`
  - `src/modules/ttfsupport.js`
  - `src/modules/addimage.js`
  - `types/index.d.ts`
- observed：
  - constructor defaults are `unit: 'mm'`, `format: 'a4'`, `orientation: 'p'`, PDF version `1.3`, `compress: false`, `putOnlyUsedFonts: false`;
  - named page formats are stored in points (`a4 = [595.28, 841.89]`); a numeric array is multiplied by `scaleFactor`;
  - `mm` scaleFactor is `72 / 25.4`; `px` is `96 / 72` unless hotfix `px_scaling` flips it to `72 / 96`;
  - default compat mode keeps a y-down user space; `advancedAPI` installs a flip matrix;
  - `src/index.js` side-effect imports html, images, vfs, ttf, acroform and other modules onto `jsPDF.API`;
  - `html()` dynamically imports optional `html2canvas`; `save()` uses FileSaver in the browser build and `fs.writeFileSync` in the CJS build;
  - there is no `load` of an existing PDF; output is `buildDocument()` serialization.
- provenance：
  - GitHub tag `v4.2.1` and npm `gitHead` both identify `4562ce8aa35bd5ecd98cd5e262e3da2af96476f6`;
  - in-tree `package.json` reports `4.2.1`.

## PDFKit

- canonical source：`https://github.com/foliojs/pdfkit`
- revision：`f048bddde0057f0ececa4972d7ccf687ea36b168`
- release tag / package：`v0.20.1` / `pdfkit@0.20.1`
- inspected：
  - `package.json`
  - `lib/document.js`
  - `lib/page.js`
  - `lib/mixins/text.js`
  - `lib/mixins/fonts.js`
  - `lib/font_factory.js`
  - `lib/font/embedded.js`
  - `lib/document.node.js`
  - `lib/document.browser.js`
- observed：
  - `PDFDocument` extends a Readable stream (`#stream`); constructor writes `%PDF-` immediately and, unless `autoFirstPage === false`, calls `addPage()`;
  - default PDF version is 1.3; `compress` defaults to true; default page `size` is `'letter'` with 72 pt margins;
  - `addPage` applies `transform(1, 0, 0, -1, 0, height)` so user space origin is top-left;
  - without `bufferPages`, `addPage` flushes the previous page; `switchToPage(n)` only sees the current `_pageBuffer`;
  - `end()` flushes pages, finalizes fonts/outline/metadata, then writes xref/trailer;
  - `font()` opens standard AFM names or `fontkit.create` for TTF/OTF bytes; `EmbeddedFont` always `font.createSubset()`;
  - `registerFont` only stores a name → src mapping; `fontkit` is a runtime dependency;
  - package exports split Node (`pdfkit.node.mjs` / `pdfkit.js`) from the browser default; engine field says `node >= v20.0.0`.
- provenance：
  - GitHub tag `v0.20.1` and npm `gitHead` both identify `f048bddde0057f0ececa4972d7ccf687ea36b168`;
  - in-tree `package.json` reports `0.20.1`.
