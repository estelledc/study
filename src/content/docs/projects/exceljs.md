---
title: ExcelJS — 用文档模型和 XForm 读写 xlsx
description: 绑定 exceljs 4.4.0 的 Workbook、XForm 与流式读写边界
来源: https://github.com/exceljs/exceljs
日期: 2026-08-27
分类: 解析
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/exceljs/exceljs
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ac96f9a61e9799c7776bd940f05c4a51d7200209
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.4.0
---

## 是什么

ExcelJS 是一个读写 Office Open XML（`.xlsx`）的 JavaScript 库。日常类比：它不是浏览器里的 Excel 界面，而是把工作簿拆成「内存文档模型」和「zip 里的 XML 零件」，再用 XForm 在两者之间搬运。

你写：

```js
const ExcelJS = require("exceljs");
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Sales");
sheet.addRow(["sku", "qty"]);
sheet.getCell("A2").value = "A-01";
await workbook.xlsx.writeFile("out.xlsx");
```

固定 4.4.0 的 Node 入口在 `excel.js`：Node major < 10 直接抛错并指向 ES5 import。浏览器包只导出 `Workbook` 与 enums，没有 `stream.xlsx`。

## 为什么重要

不理解 ExcelJS，下面这些事都没法解释：

- 为什么 `workbook.xlsx.read(stream)` 看起来像流式 API，却先把整个文件读进 Buffer
- 为什么文档模型默认写 shared strings / styles，而 `WorkbookWriter` 默认不写
- 为什么 `{formula, result}` 只是存盘，不会在 Node 里算出新值
- 为什么 CSV 路径和 [[papaparse]] 不是同一套解析器

## 核心要点

ExcelJS 的执行链可以拆成五步：

1. **选入口**：文档模型走 `Workbook`；大文件写出/读入走 `ExcelJS.stream.xlsx.WorkbookWriter` / `WorkbookReader`。

2. **建内存模型**：`Workbook` → `Worksheet` → `Row` → `Cell`。`Value.getType()` 识别 Null、String、Number、Boolean、Date、Hyperlink、Formula、RichText、SharedString、Error。

3. **读 xlsx**：`XLSX.read()` 把 stream concat 后 `JSZip.loadAsync`，再按 `xl/workbook.xml`、shared strings、styles、sheetN.xml 等条目解析，最后 `reconcile()` 把关系、绘图和表拼回模型。

4. **写 xlsx**：`prepareModel()` 之后按 Content Types → rels → sheets → shared strings → drawings → styles → workbook 追加进 zip。文档模型默认 `useSharedStrings=true`、`useStyles=true`。

5. **可选 CSV**：`workbook.csv` 用 `fast-csv` 读写；读入时把能 `Number()` 的字段收成数字，并把 `#REF!` 等字面量收成 `{error}`。

## 实践示例

### 案例 1：写入公式只保存表达式和已有结果

```js
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Calc");
sheet.getCell("A1").value = 2;
sheet.getCell("B1").value = { formula: "A1*10", result: 20 };
await workbook.xlsx.writeBuffer();
```

固定实现没有计算引擎。Excel 打开后才会重算；读回时拿的是文件里已写入的 `result`。

### 案例 2：流式写出必须显式打开 styles

```js
const ExcelJS = require("exceljs");
const writer = new ExcelJS.stream.xlsx.WorkbookWriter({
  filename: "big.xlsx",
  useSharedStrings: true,
  useStyles: true,
});
const sheet = writer.addWorksheet("Logs");
sheet.addRow(["ts", "msg"]).commit();
await writer.commit();
```

`WorkbookWriter` 默认 `useSharedStrings=false`，styles 走 `StylesXform.Mock`。不显式打开就不要假设字体、numFmt 会进 zip。

### 案例 3：普通对象不会变成结构化单元格

```js
sheet.getCell("A1").value = { sku: "A-01", qty: 3 };
```

对不上已知形状时走内部 `JSONValue`：内存里 `cell.value` 仍是原对象，写出时 `JSON.stringify` 并按 String 存。`Enums.ValueType` 没有 JSON。

## 踩过的坑

1. **把 `xlsx.read(stream)` 当真正的流式解析**：它会先耗尽 stream。大文件应看 `stream.xlsx.WorkbookReader`，且默认 `styles: 'ignore'`，shared strings 未就绪时还会把 sheet 落到临时文件。

2. **把 Writer 默认当成文档模型默认**：两边 shared strings / styles 开关相反。

3. **以为公式会在 Node 里算出来**：只序列化 `formula` 与已有 `result`。CSV 写出同样优先 `result`。

4. **在浏览器包里找 `ExcelJS.stream`**：`lib/exceljs.browser.js` 没有这条导出。

5. **把 `package.json` engines `>=8.3.0` 当运行保证**：Node 入口对 major < 10 直接失败。

## 适用 vs 不适用场景

**适用**：

- Node 10+ 生成带样式、合并单元格、图片或批注的 `.xlsx`
- 需要同时碰文档模型和可选的流式写出
- 只要读写 OOXML，不要浏览器里的 Excel 编辑器

**不适用**：

- 只要 CSV——应直接用 [[papaparse]] 或 `fast-csv`，不必绕 xlsx 模型
- 需要像 [[handsontable]] 那样在网页里编辑格子
- 需要本地公式引擎或完整 Excel 宏 / VBA
- 只能用浏览器包，却要流式读写大文件

## 固定版本边界

- 本文绑定 `exceljs/exceljs@ac96f9a61e...`，tag 与 package 均为 `4.4.0`，npm `gitHead` 一致。
- 依赖 `jszip`、`archiver`、`unzipper`、`saxes`、`fast-csv`、`dayjs`、`tmp`、`uuid`。
- 文档模型读路径缓冲整个 zip；Writer 用 Archiver，Reader 用 unzipper。
- 本文未安装依赖、运行上游测试或读写真实工作簿，状态保持 `UNVERIFIED`。

## 学到什么

1. **看起来像流的 API 仍可能先缓冲**——`read(stream)` 的名字不能代替实现。
2. **同一库的两条写出路径可以有相反默认**——shared strings 与 styles 必须按入口读。
3. **公式单元格是存盘格式，不是计算器**——`result` 是证据，不是保证。
4. **CSV 附件不等于 CSV 库**——ExcelJS 的 csv 只是 `fast-csv` 门面。

## 应用型自测

1. `workbook.xlsx.read(stream)` 会在第一个 worksheet 条目到达时就开始 `reconcile` 吗？
2. 不传选项的 `WorkbookWriter` 会写出 styles.xml 里的真实字体吗？
3. `cell.value = {foo: 1}` 写入 xlsx 后，单元格的 `ValueType` 是 JSON 吗？

检查点：

1. 不会。`read()` 先 concat 再 `JSZip.loadAsync`，全部条目处理完才 `reconcile()`。
2. 不会。默认 `StylesXform.Mock`，需要 `useStyles: true`。
3. 不是。`ValueType` 没有 JSON；写出按 String 存 JSON 文本。

## 延伸阅读

- 固定源码：[exceljs/exceljs](https://github.com/exceljs/exceljs) —— 本文绑定提交 `ac96f9a61e9799c7776bd940f05c4a51d7200209`
- [[papaparse]] —— 纯 CSV 的输入分流与 worker 合同
- [[handsontable]] —— 浏览器里编辑表格，不负责 xlsx zip
- [[jspdf]] —— 另一条「在 JS 里拼文件格式」的对照

## 关联

- [[papaparse]] —— CSV 专用解析器；ExcelJS 的 csv 只是附属门面
- [[handsontable]] —— 编辑体验 vs 文件格式
- [[ag-grid]] —— 展示百万行，不写 OOXML
- [[jspdf]] —— 生成 PDF 的同类「文档装配」问题
- [[duckdb-wasm]] —— 前端分析 CSV/Parquet，不生成 xlsx

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papaparse]] —— Papa Parse — 按输入选择 streamer 的 CSV 解析器
