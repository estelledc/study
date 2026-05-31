---
title: PDFKit — 用画笔在 PDF 上一笔一笔画
来源: https://github.com/foliojs/pdfkit
日期: 2026-06-01
分类: 数据可视化
难度: 入门
---

## 是什么

**PDFKit** 是一个 Node.js（也能在浏览器跑）的 PDF 生成库，你拿到一个 `doc` 对象后，**像用画笔一样**对它发命令：写文字、画线、嵌图片、换页。最后 `pipe` 到文件流，PDF 就生成好了。

日常类比：想象你坐在一张白纸前，手里一支笔——你说"在 (50, 100) 写下『发票』两个字"、"画一条从这里到那里的横线"、"贴一张 logo 图在右上角"——纸上就一笔一笔出现这些东西。PDFKit 就是把这种**命令式画图**搬到 PDF 文件里。

它和你可能更早见过的 [jsPDF]、[pdfmake] 是同一类用途（生成 PDF），但**风格不同**：

- **PDFKit**：低层、画笔式、想画哪儿画哪儿
- **pdfmake**：高层、声明式、写一份 JSON 文档定义，由它替你排版（pdfmake 底层用的就是 PDFKit）
- **jsPDF**：浏览器端老牌，API 风格介于两者之间

作者 Devon Govett 同时也是 Parcel 打包器和 react-aria 的作者，PDFKit 是他早期作品（2012 年起）。

## 为什么重要

后端生成 PDF 是常见需求：发票、报表、合同、考试卷、机票登机牌。痛点是：

- **HTML 转 PDF（Puppeteer / wkhtmltopdf）很重**——要拉一个无头浏览器，启动要秒级，并发开多个吃内存
- **想精确控制位置和字体（如发票上『金额合计』必须在右下角）**，HTML + CSS 反而别扭
- **批量生成（如 1 万张账单）**需要稳定、可流式输出、不阻塞事件循环的方案

PDFKit 在这三件事上都到位：

- 纯 Node.js，没有浏览器进程开销
- 命令式画图，坐标精确到点
- 输出是 Node Stream，可以边生成边发给客户端，不必等整份做完才回响应

## 核心要点

PDFKit 的心智模型是 **"一支会动的画笔在一张可加页的纸上画"**。三个关键概念：

1. **doc 对象 + Stream**：`new PDFDocument()` 拿到一个文档，它本身是 Node Readable Stream，`doc.pipe(fs.createWriteStream('out.pdf'))` 把生成的数据流写入文件
2. **页面 + 坐标系**：原点 (0, 0) 在**左上角**，y 向下增长，单位是 **PostScript point**（1 inch = 72 point）。`doc.addPage()` 加新页
3. **链式画图 API**：`doc.fontSize(12).text('Hello')` / `doc.moveTo(x1,y1).lineTo(x2,y2).stroke()` / `doc.image('logo.png', 50, 50)`

最常用的几类命令：

- **文字**：`text(str, x, y, options)`，options 里能控制对齐、宽度、行距
- **矢量**：`moveTo` / `lineTo` / `bezierCurveTo` / `rect` / `circle`，画完用 `stroke()` 描边或 `fill()` 填充
- **图像**：`image(src, x, y, options)`，支持 PNG / JPEG，options 控制宽高、缩放策略
- **字体**：`registerFont` 注册 TTF，`font('MyFont')` 切换；不注册就只能用 14 个 PDF 标准字体（不支持中文）
- **页面**：`addPage()` / `switchToPage(n)`，可回头改之前的页

## 实践案例

### 案例 1：30 行做一份带 logo 和签名线的发票

```js
const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument({size: 'A4', margin: 50});
doc.pipe(fs.createWriteStream('invoice.pdf'));

doc.image('logo.png', 50, 45, {width: 80});
doc.fontSize(20).text('发票', 200, 50, {align: 'right'});

doc.fontSize(10)
   .text('编号: INV-2026-001', 50, 150)
   .text('日期: 2026-06-01', 50, 165);

doc.moveTo(50, 700).lineTo(550, 700).stroke();
doc.text('签名: ___________', 50, 720);

doc.end();
```

`doc.end()` 之后 stream 关闭，文件落地。整套**没用任何模板引擎**，全靠坐标 + 命令。

### 案例 2：用 Stream 直接响应 HTTP 请求

```js
app.get('/report.pdf', (req, res) => {
  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);  // 直接管道到响应

  doc.fontSize(16).text('月度报表', {align: 'center'});
  doc.moveDown();
  data.forEach(row => doc.text(`${row.name}: ${row.value}`));

  doc.end();
});
```

**好处**：首包延迟很低，浏览器一边收一边渲染；服务端不必把整份 PDF 缓存在内存里。

### 案例 3：嵌入中文字体

PDF 标准 14 字体只覆盖拉丁字符，**直接写中文会显示成空白或问号**。需要注册 TTF：

```js
doc.registerFont('CN', './NotoSansSC-Regular.ttf');
doc.font('CN').fontSize(14).text('你好，PDFKit');
```

注意 TTF 文件会被**整体嵌入** PDF，一个常用中文字体 5-10 MB，最终 PDF 会变大。生产环境常用 **subset 字体**（只嵌入用到的字符）来减小体积。

## 踩过的坑

1. **坐标系 y 向下**：和数学习惯相反，新手常把"向上 100"写成 `+100` 结果跑下面去了。记住"原点左上、y 向下"。

2. **中文显示空白**：默认 14 字体不含中文。解决：注册 TTF。如果忘了注册又写中文，PDFKit **不会报错**，只会画出空白，调试很费时间。

3. **链式调用看似漂亮，错位很难查**：`doc.text('A').text('B')` 第二个 text 紧跟在第一个之后，不会自动换行。要 `.moveDown()` 或显式给 y 坐标。

4. **图片尺寸不对**：`image('a.png')` 不给 width/height 时按原始像素 1:1 放，**不是按 DPI 换算 mm**。一张 300dpi 的 logo 直接贴会大到撑满半页。务必带 `{width: ...}`。

5. **文件没生成 / 损坏**：常见原因是漏调 `doc.end()` 或在 stream 还没 flush 完就退出进程。生产里要监听 `'finish'` 事件再结束。

6. **`switchToPage(n)` 改回前页**：默认 `bufferPages: false`，回不去；要 `new PDFDocument({bufferPages: true})` 才能回头改之前的页（如最后才知道总页数，写"第 X / Y 页"页脚）。

## 适用 vs 不适用

**适用**：

- 后端生成结构相对固定的 PDF：发票、报表、票据、证书
- 需要精确控制位置和字体的场景
- 高并发批量生成（流式、低内存）
- 想避免 Puppeteer / wkhtmltopdf 这类重方案

**不适用**：

- 想直接把网页"打印"成 PDF——用 Puppeteer 更简单（HTML+CSS 复用现有页面）
- 复杂排版（多列、表格自动换页、目录索引）——上 [pdfmake]（声明式）或 react-pdf
- 浏览器端导出 PDF——用 jsPDF 或 react-pdf，PDFKit 浏览器版本配置稍麻烦
- 编辑已存在的 PDF（加水印、合并、拆分）——用 pdf-lib，PDFKit 只管"从零生成"

## 学到什么

1. **命令式 vs 声明式**：PDFKit 给你画笔，pdfmake 给你模板。底层留命令式 API，再叠声明式封装，是工具栈的常见分层
2. **Stream 是 Node.js 输出 PDF 的好搭配**：边生成边发，不必整份留内存
3. **PDF 坐标系是 PostScript 遗产**：72 dpi、点为单位、原点左上——和印刷传统对齐
4. **字体嵌入是 PDF 文件大小膨胀的常见根源**——subset 是生产环境必修课

## 延伸阅读

- 仓库与文档：[foliojs/pdfkit](https://github.com/foliojs/pdfkit)（README 有完整 API 列表）
- 在线 demo：[pdfkit.org](http://pdfkit.org/demo/browser.html)（浏览器里实时看效果）
- 声明式封装：[pdfmake](https://github.com/bpampuch/pdfmake)（底层就是 PDFKit）
- [[jspdf]] —— 浏览器端同类库
- [[puppeteer]] —— HTML 转 PDF 的另一条路

## 关联

- [[pdfmake]] —— 在 PDFKit 之上加了声明式 JSON DSL
- [[jspdf]] —— 浏览器端 PDF 生成的老牌替代
- [[puppeteer]] —— 用无头浏览器把 HTML 转 PDF，重但灵活
- [[pdf-lib]] —— 编辑已有 PDF 的同生态库
