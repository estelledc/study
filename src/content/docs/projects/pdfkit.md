---
title: PDFKit — 用可读流从零画出一份 PDF
来源: https://github.com/foliojs/pdfkit
日期: 2026-08-27
分类: 数据可视化
难度: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/foliojs/pdfkit
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f048bddde0057f0ececa4972d7ccf687ea36b168
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.20.1
---

## 是什么

PDFKit 是一个从零**生成** PDF 的 JavaScript 库。`PDFDocument` 继承 Readable stream：你一边发画图命令，一边 `pipe` 到文件或 HTTP 响应。日常类比：不是先拼完整本再交货，而是印刷机边印边往外推纸。

你写：

```js
import PDFDocument from "pdfkit";
import fs from "node:fs";

const doc = new PDFDocument({ size: "A4", margin: 50 });
doc.pipe(fs.createWriteStream("out.pdf"));
doc.fontSize(20).text("Invoice");
doc.moveTo(50, 80).lineTo(545, 80).stroke();
doc.end();
```

固定 0.20.1 里，构造函数立刻写出 `%PDF-1.3`（可用 `pdfVersion` 改），且除非 `autoFirstPage === false` 就会 `addPage()`。默认纸张是 **LETTER**，默认边距 72 点，默认 `compress: true`。

## 为什么重要

不读这条流式主链，下面几件事会讲错：

- 为什么 `doc.pipe(res)` 能边生成边下载，而不必先拿到完整 `Uint8Array`
- 为什么默认坐标看起来像“左上原点、y 向下”，底层却先做了一次翻转 CTM
- 为什么 `switchToPage` 在默认配置下会越界
- 为什么自定义字体走内置 `fontkit`，而且嵌入时会 subset

## 核心要点

固定版本的控制流可以拆成六步：

1. **建文档**：`new PDFDocument(options)` 继承 Readable，写入文件头，按需加第一页。
2. **用户空间**：`addPage` 执行 `transform(1, 0, 0, -1, 0, height)`，把 PDF 的左下原点翻成左上。
3. **画**：`text` / `moveTo` / `lineTo` / `image` 写进当前页 content stream；`x/y` 默认落在页边距。
4. **字体**：标准名走 AFM；路径或字节走 `fontkit.create`。`EmbeddedFont` 构造时就 `font.createSubset()`。
5. **缓冲页**：未开 `bufferPages` 时，下一次 `addPage` 会 `flushPages()` 结束上一页。
6. **收尾**：`end()` 再 flush、finalize 字体/outline/metadata，然后写 xref 与 trailer。

## 实践示例

### 案例 1：流到文件

```js
import PDFDocument from "pdfkit";
import fs from "node:fs";

const doc = new PDFDocument({ size: "A4", margin: 50 });
doc.pipe(fs.createWriteStream("invoice.pdf"));
doc.fontSize(20).text("发票");
doc.fontSize(10).text("INV-2026-001");
doc.end();
```

漏掉 `end()` 时，xref 不会写出，stream 也不会正常结束。生产代码应听 `finish`，而不是假定同步落地。

### 案例 2：直接 pipe 到 HTTP 响应

```js
app.get("/report.pdf", (req, res) => {
  const doc = new PDFDocument();
  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);
  doc.fontSize(16).text("月度报表", { align: "center" });
  rows.forEach((row) => doc.text(`${row.name}: ${row.value}`));
  doc.end();
});
```

默认纸张是 LETTER。需要 A4 必须显式 `size: "A4"`。数字数组 `size: [595.28, 841.89]` 按点解释，不再乘单位。

### 案例 3：自定义字体与回头写页脚

```js
const doc = new PDFDocument({ bufferPages: true, autoFirstPage: true });
doc.registerFont("CN", "./NotoSansSC-Regular.ttf");
doc.font("CN").text("你好，PDFKit");
doc.addPage();
doc.switchToPage(0);
doc.text("第 1 页", 72, doc.page.height - 60);
doc.end();
```

`registerFont` 只是登记名字。`font("CN")` 才会打开文件。`switchToPage` 只看当前 `_pageBuffer`；没开 `bufferPages` 时上一页已被 flush。

## 踩过的坑

1. **默认不是 A4**：`page.js` 写的是 `size || 'letter'`，边距默认 72pt。
2. **自定义字体其实会 subset**：`EmbeddedFont` 固定 `createSubset()`。旧说法“整份 TTF 原样嵌入”对 0.20.1 不成立。
3. **`switchToPage` 不是全局页表**：默认 `bufferPages` 为空，跨页回写会抛 out of bounds。
4. **坐标是翻过的用户空间**：`moveDown` 增加 `y`。底层 PDF 仍是 y 向上，只是 CTM 先翻了一次。
5. **`font("Helvetica")` 不会报中文错**：标准字体没有 CJK glyph 时，缺字行为要靠渲染器，不是构造期校验。

## 适用 vs 不适用场景

**适用**：

- Node 20+ 里从零画发票、票据、证书，并 `pipe` 出去
- 需要内置 fontkit、表格 mixin，或 PDF/A、PDF/UA 子集开关
- 浏览器构建走 `package.json` 的 default export

**不适用**：

- 编辑、合并、填已有 PDF → 需要带 parser 的库，例如 pdf-lib
- 想默认得到 A4 / 毫米坐标，却不改 `size` / `sizeToPoint`
- 复杂 CSS 打印 → headless 浏览器更接近页面
- 把未测的吞吐或文件大小写成当前合同

## 固定版本边界

- 本文绑定 `foliojs/pdfkit@f048bdd...`，Git tag 与 npm `gitHead` 均为 `v0.20.1` / `pdfkit@0.20.1`。
- 运行时依赖包括 `fontkit`、`linebreak`、`fflate`、`png-js`、`@noble/ciphers`、`@noble/hashes`。
- exports 区分 Node import/require 与浏览器 default；engine 字段写 `node >= v20.0.0`。
- 本文未安装依赖、运行上游测试、生成 PDF 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **流式生成把“文档对象”和“输出句柄”绑在同一个 Readable 上。**
2. **左上原点是 CTM 翻转后的用户空间，不是 PDF 规范改了。**
3. **页缓冲是显式选项；默认立刻结束上一页。**
4. **fontkit 在这里是运行时依赖，嵌入字体默认 subset。**

## 应用型自测

1. `new PDFDocument()` 不传 `size`，第一页是 A4 吗？
2. 默认配置下画完第 1 页再 `addPage()`，还能 `switchToPage(0)` 吗？
3. `doc.font("./Noto.ttf")` 会把整份 TTF 原样写进 PDF 吗？

检查点：

1. 不是。默认 `letter`。
2. 不能。未开 `bufferPages` 时 `addPage` 会 flush 上一页。
3. 不会。`EmbeddedFont` 使用 `font.createSubset()`。

## 延伸阅读

- 固定源码：[foliojs/pdfkit](https://github.com/foliojs/pdfkit) —— 本文绑定提交 `f048bddde0057f0ececa4972d7ccf687ea36b168`
- 站点与 demo：[pdfkit.org](http://pdfkit.org/)
- [[jspdf]] —— 浏览器更常见的从零生成库
- [[pdfmake]] —— 声明式 JSON，底层用 PDFKit
- [[puppeteer]] —— HTML 打印成 PDF 的另一条路

## 关联

- [[jspdf]] —— 同类命令式生成；单位默认 mm，默认 A4
- [[pdfmake]] —— 在 PDFKit 上加声明式排版
- [[puppeteer]] —— 复用网页排版时的重方案

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[jspdf]] —— jsPDF — 在内存里从零拼出一份 PDF
- [[pdfmake]] —— pdfmake — 用对象树声明 PDF，浏览器和 Node 都能跑
