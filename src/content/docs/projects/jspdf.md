---
title: jsPDF — 浏览器里直接生成 PDF
来源: 'https://github.com/parallax/jsPDF'
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 入门到中级
provenance: pipeline-v3
---

## 是什么

jsPDF 是 James Hall（MrRio）2010 年开源、社区接手维护的纯 JavaScript PDF 生成库，约 30k stars，MIT。日常类比：像在浏览器里塞了一台便携激光打印机——你按 API 喂它 "在第 X 页第 Y 行写一句话、贴一张图、画一条线"，它在内存里拼出合法的 PDF 二进制数据，最后让用户点下载。**全程没服务器**。

最小例子：

```js
import { jsPDF } from 'jspdf'

const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
doc.setFontSize(16)
doc.text('Hello, PDF', 20, 30)
doc.save('hello.pdf')
```

四行做完三件事：开一张 A4、在 (20mm, 30mm) 写一句话、把生成的 Blob 触发浏览器下载。`doc` 对象在内存里维护一棵 PDF 对象树，`save` 时把它序列化成符合 PDF 1.3 规范的二进制数据。整个过程**不发任何网络请求**，也不依赖任何后端。

## 为什么重要

不理解 jsPDF，下面这些事都没法解释：

- 为什么"前端导出 PDF"在 SPA 里几乎成了默认能力——不再需要后端拼模板生成 PDF 再回传
- 为什么发票 / 凭证 / 报表 / 证书类需求会优先在客户端实现——数据已经在前端，往返一圈反而更慢
- 为什么很多 React / Vue 项目里看到 `jspdf + html2canvas` 这对组合——一个负责"把 DOM 截成图"，一个负责"把图塞进 PDF"
- 为什么用 jsPDF 写中文要折腾半天——默认字体只有 Helvetica / Times，**完全没有 CJK 字形**

## 核心要点

jsPDF 的 API 可以分成三层：

1. **画布层**：`text / line / rect / circle / setFont / setFontSize / setTextColor`，所有定位用 mm / pt / in，**y 轴向下**且 `text` 的 y 是**基线**不是顶部
2. **页层**：`addPage(format, orientation)` 切下一页，`setPage(n)` 跳回任意页改内容
3. **图像层**：`addImage(src, format, x, y, w, h)`，`src` 可以是 dataURL / HTMLImageElement / HTMLCanvasElement——这是与 [[html2canvas]] 接驳的关键

输出有三种：`save('a.pdf')` 触发下载、`output('blob')` 拿到 Blob 自己处理、`output('datauristring')` 拿到 base64 直接嵌 `<iframe>` 预览。

生态里两个常配：

- **html2canvas**：把任意 DOM 节点光栅化成 canvas，再 `addImage` 进 PDF。最通用但**所有文字变像素**，PDF 里不能复制不能搜索
- **jspdf-autotable**：表格插件，自动分页 / 表头重复 / 斑马纹，写后台导出报表必装

v2（2020）起内置 `doc.html(element)` 方法封装了 html2canvas 调用并自动分页；v3（2024）转 ESM 优先，可 tree-shake。

## 实践案例

### 案例 1：纯 API 画一张发票

```js
const doc = new jsPDF({ unit: 'mm', format: 'a4' })

doc.setFontSize(20).text('INVOICE', 20, 25)
doc.setFontSize(10).text('No. 2026-0001', 20, 35)
doc.line(20, 40, 190, 40)

const items = [
  ['Item A', 2, 50],
  ['Item B', 1, 80],
]
let y = 50
items.forEach(([name, qty, price]) => {
  doc.text(name, 20, y)
  doc.text(String(qty), 120, y)
  doc.text(String(price), 160, y)
  y += 8
})

doc.save('invoice.pdf')
```

文字、表格、分割线全是 PDF 原生对象，**生成的 PDF 可以选中文字、可以搜索**，体积通常只有几 KB。这是 jsPDF 最值钱的用法——但只对**没有中文 + 布局简单**的场景成立。

### 案例 2：DOM 截图模式（html2canvas + addImage）

```js
import html2canvas from 'html2canvas'

const node = document.querySelector('#report')
await document.fonts.ready
const canvas = await html2canvas(node, { scale: 2 })
const imgData = canvas.toDataURL('image/png')

const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
const pageW = 210
const imgH = (canvas.height * pageW) / canvas.width
pdf.addImage(imgData, 'PNG', 0, 0, pageW, imgH)
pdf.save('report.pdf')
```

适合"已经精心排版的 HTML 页面，原样导出"。代价：所有文字变像素、A4 高度内容超出要手动按 `pageHeight` 切片 + `addPage` 循环贴。**`document.fonts.ready` 不能省**——webfont 没加载完就截图，会回退到默认字体。

### 案例 3：嵌入中文字体

```js
import notoSansSC from './NotoSansSC-Regular.ttf?base64'

doc.addFileToVFS('NotoSansSC.ttf', notoSansSC)
doc.addFont('NotoSansSC.ttf', 'NotoSansSC', 'normal')
doc.setFont('NotoSansSC').text('你好，世界', 20, 30)
```

VFS（Virtual File System）是 jsPDF 内部的内存文件系统，要先 `addFileToVFS` 注册再 `addFont` 声明。Noto Sans SC Regular 子集化前 ~10MB、子集化后能压到 ~500KB。**忘了子集化会让前端 bundle 直接膨胀十几 MB**。

## 踩过的坑

1. **中文字符全变方框 / 问号**：默认 14 种 PDF 标准字体（Helvetica / Times / Courier 各 4 字重 + Symbol / ZapfDingbats）**全都没有 CJK 字形**。必须 `addFileToVFS + addFont` 嵌入 TTF，且要用 fonttools / pyftsubset 子集化。

2. **html2canvas 截出来的 PDF 不能搜文字**：DOM 已被光栅化为像素。需要"可搜索"就别走截图路线，老老实实用 jsPDF 原生 `text()` 一行行画。

3. **`doc.text(x, y)` 的 y 是基线**：你以为 y=10 文字顶在 10mm 处，实际上文字往上"长出"约一个字号的 ascent。新人画完发现文字超出页眉，原因在此。

4. **页面尺寸单位陷阱**：`format: 'a4'` 不等于 `[210, 297]`——前者按当前 `unit` 解释，后者强制 mm。混着写时坐标会全错。

5. **超长 canvas 单页贴不下**：截 2000px 高的 dashboard，整张塞 A4 会被裁。要按 `pageHeight * (canvas.width / pageW)` 切片循环 `addPage + addImage`，或直接用 v2 的 `doc.html()` 让它自动分页。

6. **WebFont 没加载完就截图**：CSS 里 `@font-face` 是异步的，html2canvas 不会等。截图前必须 `await document.fonts.ready`，否则 PDF 里出现的是 fallback 字体，跟设计稿对不上。

## 适用 vs 不适用场景

**适用**：

- SPA 里发票 / 收据 / 凭证 / 报表导出，数据在客户端、不想往返后端
- 把 dashboard / 看板的某个面板"打个快照"分享出去
- 证书 / 票券批量生成（同一模板换数据，循环调 `addPage`）
- canvas 类工具（白板、流程图、图表）的"另存为 PDF"功能

**不适用**：

- 精排版 + 中文 + 复杂布局：用服务端 [[playwright]] / Puppeteer 走 Chrome 打印保真度更高
- 50 页以上长文档：浏览器内存吃不消，PDF 体积也会爆
- 需要解析 / 编辑 / 填表已有 PDF：jsPDF 只写不读，要看 pdf-lib / pdfjs-dist
- 需要无障碍标签（PDF/UA）：jsPDF 对结构化标签支持很弱，合规场景换 pdfmake 或服务端方案

## 学到什么

1. **"前端生成文档"已是默认选项**：当数据已在浏览器，把渲染也放在前端比走一趟后端更快、更省机器
2. **PDF 路线分两派——画 vs 截**：`text/line/rect` 派文件小、可搜索、但没法还原复杂 CSS；`html2canvas` 派像素级保真但变成图片。两条路各有适配场景，**没有银弹**
3. **底层标准的细节会反弹到上层 API**：单位、坐标、基线、字体子集化，每一条踩坑背后都是 PDF 1.3 规范的硬约束——封装库藏不住底层
4. **嵌字体是 CJK 前端导出的硬税**：不交这个税就只能截图。子集化 + 按需懒加载是把税率压低的唯一办法

## 延伸阅读

- 官方文档：[jsPDF API Reference](https://artskydj.github.io/jsPDF/docs/jsPDF.html)
- GitHub 仓库：[parallax/jsPDF](https://github.com/parallax/jsPDF)
- 配套截图库：[html2canvas](https://html2canvas.hertzen.com/)
- 表格插件：[jspdf-autotable](https://github.com/simonbengtsson/jsPDF-AutoTable)
- 替代方案：[pdfmake](https://github.com/bpampuch/pdfmake)（声明式）/ [pdf-lib](https://pdf-lib.js.org/)（读 + 写）/ [react-pdf](https://react-pdf.org/)（React 渲染器）

## 关联

- [[html2canvas]] —— DOM 截图最常用的搭档，`doc.addImage` 收的就是它的 canvas
- [[playwright]] —— 当 jsPDF 撑不住复杂排版时，服务端 headless 浏览器打印是更稳的退路
- [[pdfkit]] —— Node 端的"画"派 PDF 库，思路与 jsPDF 同源
- [[react-pdf]] —— 把"声明组件树 → PDF"做成 React 渲染器，另一种抽象层级
