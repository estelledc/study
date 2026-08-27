# Spreadsheet / CSV source review

> 用途：记录 exceljs、Papa Parse 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer BV
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、未读写真实 xlsx/csv、未测 worker / bundle / 吞吐
- worktrees：本机 `research-worktrees/`，不进入 Git

## exceljs

- canonical source：`https://github.com/exceljs/exceljs`
- revision：`ac96f9a61e9799c7776bd940f05c4a51d7200209`
- package：`exceljs@4.4.0`
- tag：annotated `v4.4.0` → 同一 commit；npm `gitHead` 一致
- inspected：
  - `package.json`
  - `excel.js`
  - `lib/exceljs.nodejs.js`
  - `lib/exceljs.browser.js`
  - `lib/doc/workbook.js`
  - `lib/doc/cell.js`
  - `lib/doc/enums.js`
  - `lib/xlsx/xlsx.js`
  - `lib/csv/csv.js`
  - `lib/stream/xlsx/workbook-writer.js`
  - `lib/stream/xlsx/workbook-reader.js`
- observed：
  - Node 入口在 major version < 10 时抛错，并指向 ES5 import；`package.json` engines 仍写 `>=8.3.0`；
  - 文档模型 `Workbook.xlsx.read()` 先把整个 stream concat 成 Buffer，再 `JSZip.loadAsync`，随后按 zip 条目走 XForm；
  - 文档模型 `write()` 默认 `useSharedStrings=true`、`useStyles=true`；`stream.xlsx.WorkbookWriter` 默认 `useSharedStrings=false`，styles 走 `StylesXform.Mock`，除非 `useStyles=true`；
  - 浏览器入口只导出 `Workbook` 与 enums，没有 `stream.xlsx`；
  - 单元格 `Value.getType()` 识别 Null/String/Number/Boolean/Date/Hyperlink/Formula/RichText/SharedString/Error；其余对象走未列入 `ValueType` 的 `JSONValue`，写出时 `JSON.stringify` 并按 String 存；
  - 公式只保存 `formula` / `result`，没有计算引擎；
  - `workbook.csv` 是 `fast-csv` + dayjs 的薄封装，读入时把能 `Number()` 的字段收成数字，并把若干 Excel 错误字面量收成 `{error}`。
- provenance：tag、package 与 npm `gitHead` 指向同一 4.4.0 revision。

## Papa Parse

- canonical source：`https://github.com/mholt/PapaParse`
- revision：`555c1c1b6175e7a043adf8694983776a1e6fdeeb`
- package：`papaparse@5.7.0`
- tag：lightweight `5.7.0`；npm `gitHead` 一致
- inspected：
  - `package.json`
  - `papaparse.js`
  - `CHANGELOG.md`
  - `tests/node-tests.js`
  - `tests/test-cases.js`
- observed：
  - UMD factory；`Papa.parse` / `Papa.unparse` 是唯二公共入口；
  - 输入分流：字符串 + `download` → `NetworkStreamer`；普通字符串 → `StringStreamer`；File → `FileStreamer`；Node readable → `ReadableStreamStreamer`；`Papa.NODE_STREAM_INPUT` → `DuplexStreamStreamer`（浏览器构建不导出）；
  - `worker: true` 且 `WORKERS_SUPPORTED` 时把 factory `toString()` 打进 Blob Worker，调用方拿不到同步返回值；
  - 未设 `step`/`chunk` 时 `chunkSize` 被置 `null`，结果累积到 `complete`；
  - 未指定 delimiter 时用 preview 10 行猜逗号、制表符、竖线、分号、RECORD_SEP、UNIT_SEP，优先行间字段数稳定，平均字段数只打破平局；失败则 `,` 并记 `UndetectableDelimiter`；
  - `dynamicTyping` 只认 `true`/`TRUE`/`false`/`FALSE`、安全整数范围内的 float，以及严格 ISO 日期；空串变 `null`；
  - `unparse` 默认 `writeHeader=true`、delimiter `,`、newline CRLF、`escapeFormulae=false`；5.5.5 起 Date 走 `toISOString()`。
- provenance：tag、package 与 npm `gitHead` 指向同一 5.7.0 revision。
