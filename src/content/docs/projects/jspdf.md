---
title: jsPDF — 在内存里从零拼出一份 PDF
来源: https://github.com/parallax/jsPDF
日期: 2026-08-27
分类: projects / 前端导出
难度: 入门到中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/parallax/jsPDF
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4562ce8aa35bd5ecd98cd5e262e3da2af96476f6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.2.1
---

## 是什么

jsPDF 是一个从零**生成** PDF 的 JavaScript 库。日常类比：内存里有一台只出纸、不收纸的打印机——你按坐标写下文字、贴图、画线，最后把对象树序列化成 PDF 1.3。它没有 `load` 已有文件的入口。

你写：

```js
import { jsPDF } from "jspdf";

const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
doc.setFontSize(16);
doc.text("Hello, PDF", 20, 30);
doc.save("hello.pdf");
```

固定 4.2.1 的构造默认是 `unit: "mm"`、`format: "a4"`、`orientation: "p"`。命名纸张存在点值表里（A4 为 `[595.28, 841.89]`）；若传入数字数组，宽高会再乘 `scaleFactor`。`save()` 在浏览器构建里走 FileSaver，在 CJS 构建里走 `fs.writeFileSync`。

## 为什么重要

不读这条生成链，下面几件事会讲错：

- 为什么 SPA 能在前端导出，却仍然**不能**编辑已有 PDF
- 为什么 `format: [210, 297]` 只有在当前 `unit` 是 mm 时才是 A4
- 为什么 `doc.html()` 还要再加载可选的 `html2canvas`
- 为什么中文默认是方框：标准 14 字体不含 CJK

## 核心要点

固定版本的控制流可以拆成五步：

1. **建文档**：构造函数设定单位、纸张、压缩（默认关）和 `putOnlyUsedFonts`（默认 false）。
2. **画用户空间**：兼容模式 y 向下；`text(text, x, y)` 的 y 是基线。`advancedAPI()` 会装一个翻转矩阵。
3. **换页**：`addPage(format, orientation)`；命名格式查点值表，数组格式乘 `scaleFactor`。
4. **插件挂上原型**：`src/index.js` 以 side-effect import 挂上 html、图片、VFS、TTF、AcroForm 等模块。
5. **输出**：`output` / `save` 调用 `buildDocument()`，没有读入已有 PDF 的对称 API。

## 实践示例

### 案例 1：用原生对象画一页

```js
const doc = new jsPDF({ unit: "mm", format: "a4" });
doc.setFontSize(20).text("INVOICE", 20, 25);
doc.setFontSize(10).text("No. 2026-0001", 20, 35);
doc.line(20, 40, 190, 40);
doc.save("invoice.pdf");
```

这些是 PDF 文本和路径，不是截图。坐标按当前 `unit` 解释；默认 mm 时 `(20, 25)` 是距左 20mm、距顶 25mm 的基线。

### 案例 2：数字数组按当前单位缩放

```js
const mm = new jsPDF({ unit: "mm", format: [210, 297] });
const pt = new jsPDF({ unit: "pt", format: [210, 297] });
```

`_addPage` 对数组做 `width = format[0] * scaleFactor`。mm 的 scaleFactor 是 `72 / 25.4`，所以第一份接近 A4；第二份的 210×297 **点**只是一张小纸。命名 `"a4"` 不会再乘一次。

### 案例 3：VFS 挂字体，而不是假定有中文

```js
doc.addFileToVFS("NotoSansSC.ttf", base64);
doc.addFont("NotoSansSC.ttf", "NotoSansSC", "normal");
doc.setFont("NotoSansSC");
doc.text("你好，世界", 20, 30);
```

`ttfsupport` 在 `addFont` 事件里从 `internal.vFS` 取字符串（或再 `loadFile`）。标准字体路径会直接 return，不会去 VFS。

## 踩过的坑

1. **把 html 导出当成内置光栅器**：`html()` 动态 `import("html2canvas")`。`html2canvas` 只在 `optionalDependencies`，主包不保证带上它。
2. **`px` 单位默认是反的**：没有 hotfix `px_scaling` 时 scaleFactor 是 `96 / 72`，打开 hotfix 才是 `72 / 96`。
3. **y 是基线**：`text("A", 10, 10)` 的字形会向上长出 ascent，不是盒子顶边贴在 10。
4. **不能读已有 PDF**：没有 parser。合并、填表、盖已有页要看带文档对象模型的库（例如 pdf-lib）。
5. **不要把主入口写成可任意 tree-shake**：`src/index.js` 会执行一长串模块 import，把 API 挂到同一个构造函数上。

## 适用 vs 不适用场景

**适用**：

- 浏览器或 Node 里从零画发票、证书、简单报表
- 需要 `output("blob")` / `datauristring` / `save` 三种出口
- 文字走 `text()`，图片走 `addImage`

**不适用**：

- 编辑、合并、填已有 PDF → 需要 parser，不是本库
- 复杂 CSS 排版还要可搜索文本 → 不要默认 `html()` 截图像素
- 需要 PDF/UA 结构树或现代 PDF 版本保证：固定实现写的是 1.3
- 把未测量的 bundle 大小或 star 数当成当前合同

## 固定版本边界

- 本文绑定 `parallax/jsPDF@4562ce8a...`，Git tag 与 npm `gitHead` 均为 `v4.2.1` / `jspdf@4.2.1`。
- `package.json` exports 区分 `node`（`dist/jspdf.node.min.js`）与 `browser` / default（`dist/jspdf.es.min.js`）。
- 必选依赖是 `@babel/runtime`、`fflate`、`fast-png`；`html2canvas`、`canvg`、`dompurify` 是可选。
- 本文未安装依赖、运行上游测试、调用 `html2canvas` 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **生成库和编辑库的边界是“有没有 parser”。**
2. **单位表和数组格式走两条路径**，不能把 mm 数字塞进 pt 文档。
3. **html 路径是可选插件，不是核心渲染器。**
4. **默认 14 字体决定了 CJK 必须自己进 VFS。**

## 应用型自测

1. `new jsPDF({ unit: "pt", format: [210, 297] })` 得到的是 A4 吗？
2. 固定 4.2.1 能否 `load` 一份已有 PDF 再 `text` 盖字？
3. 只 `import { jsPDF } from "jspdf"` 且没装 `html2canvas` 时，`doc.html(el)` 是否一定成功？

检查点：

1. 不是。数组会乘 pt 的 scaleFactor 1，得到 210×297 点。
2. 不能。核心只有 `buildDocument()` 输出。
3. 不一定。`html()` 要动态加载可选的 html2canvas。

## 延伸阅读

- 固定源码：[parallax/jsPDF](https://github.com/parallax/jsPDF) —— 本文绑定提交 `4562ce8aa35bd5ecd98cd5e262e3da2af96476f6`
- API 文档：[jsPDF API Reference](https://artskydj.github.io/jsPDF/docs/jsPDF.html)
- [[pdfkit]] —— Node 流式画笔，默认 LETTER 且内置 fontkit
- [[html2canvas]] —— `doc.html()` 可能加载的可选依赖

## 关联

- [[pdfkit]] —— 同类命令式生成，主场在 Node Stream
- [[pdfmake]] —— 声明式 JSON，底层不是 jsPDF
- [[html2canvas]] —— DOM 光栅化搭档，不是 jsPDF 核心

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[pdfkit]] —— PDFKit — 用画笔在 PDF 上一笔一笔画
- [[playwright]] —— Playwright — 用代码操作真实浏览器
