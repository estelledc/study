---
title: pdfmake — 用对象树声明 PDF，浏览器和 Node 都能跑
来源: https://github.com/bpampuch/pdfmake
日期: 2026-06-01
分类: 前端工具
难度: 入门
---

## 是什么

pdfmake 是一个**纯 JavaScript** 的 PDF 生成库。日常类比：你不用管打印机的针怎么动、墨水怎么喷，只要写一份**菜单**——"第一行放标题，下面放一张三列表格，页脚放页码"——pdfmake 照菜单去印。

最小例子：

```js
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
// v0.2.15+ / v0.3：用 addVirtualFileSystem，不要再写 pdfMake.vfs = ...
pdfMake.addVirtualFileSystem(pdfFonts)

const docDefinition = {
  content: [
    { text: '我的报表', style: 'h1' },
    { table: { widths: ['*', 'auto'], body: [['名称', '数量'], ['苹果', 3]] } }
  ],
  styles: { h1: { fontSize: 18, bold: true } }
}
pdfMake.createPdf(docDefinition).download('report.pdf')
```

这份 `docDefinition` 就是**对象树**——pdfmake 的核心抽象。简单环境也可 `import 'pdfmake/build/vfs_fonts'` 靠副作用注册。

## 为什么重要

不用 pdfmake 时，前端导 PDF 一般两条路：

1. **后端生成**：调一个 Java/Python 服务（用 iText/ReportLab），然后把 PDF 流回来。问题：每个报表加个字段都要发版后端。
2. **前端用 jsPDF**：`doc.text(x, y, '...')` 命令式画——你得自己算坐标、自己算翻页、自己处理表格列宽。维护噩梦。

pdfmake 走第三条路：**声明式**。你只描述"想要什么"，引擎负责"怎么画"。这跟 React 之于 jQuery 是一个味道。

## 核心要点

pdfmake 的对象树由几种节点组成：

1. **content**：根数组，按顺序放段落、表格、列、图片，引擎从上到下渲染。
2. **table**：`{ headerRows, widths, body }`。`widths` 支持 `'*'`（剩余空间均分）、`'auto'`（按内容）、固定数字。`headerRows: 1` 让表头在跨页时**自动重复**。
3. **columns**：横向并排放多个块，类似 CSS flexbox 的 `flex-direction: row`，但**不会自动换行**。
4. **styles + defaultStyle**：命名样式表。`{ h1: { fontSize: 18 } }` 注册后，`{ text: '...', style: 'h1' }` 即可引用。`defaultStyle` 是全局兜底。
5. **header / footer**：函数 `(currentPage, pageCount) => content`，每页自动调用一次。
6. **pageBreak**：`'before'` 或 `'after'`，强制分页。

把这几种节点嵌套，就能描述发票、合同、年度报告。

## 实践案例

### 案例 1：带页码的报表

把下面对象交给 `pdfMake.createPdf(doc).download('report.pdf')`：

```js
const doc = {
  header: { text: '2026 年度财报', alignment: 'center' },
  footer: (cur, total) => ({ text: `${cur} / ${total}`, alignment: 'right' }),
  content: [
    { text: '第一章', style: 'h1', pageBreak: 'after' },
    { text: '第二章', style: 'h1' }
  ]
}
```

`header` / `footer` 每页自动重画；`pageBreak: 'after'` 让「第二章」另起一页。

### 案例 2：自动重复表头的长表格

把这段放进 `docDefinition.content`（可与标题等节点并列）：

```js
{
  table: {
    headerRows: 1,
    widths: ['auto', '*', 100],
    body: [
      ['ID', '名称', '金额'],
      ...rows  // 几百行
    ]
  }
}
```

跨页时第一行会在每页顶部**自动重画**——这是 jsPDF 没有的。

### 案例 3：横向并排两栏

同样作为 `content` 里的一个节点：

```js
{ columns: [
    { width: '*', text: '左栏内容' },
    { width: 200, text: '右栏固定 200pt' }
] }
```

类比 CSS Grid 两列，但写法是数组；列数过多只会变窄，不会自动折行。

## 字体怎么塞进去

pdfmake 用 **vfs（virtual file system）** 解决字体问题：把 .ttf 文件转 base64 打进一个 JS bundle，运行时不需要 HTTP 请求。

默认的 `vfs_fonts.js` 只装了 Roboto。要写中文：

```bash
node node_modules/pdfmake/build-vfs.js ./fonts > vfs_fonts.js
```

把思源黑体/Noto Sans CJK 放 `./fonts`，跑这个脚本生成自己的 vfs。代价：bundle 体积暴增几 MB。

## 和 jsPDF / PDFKit 的关系

| 库 | 风格 | 关系 |
|---|---|---|
| jsPDF | 命令式（手动算坐标） | 同代竞品 |
| PDFKit | 命令式（Node 端为主） | **pdfmake 的底层** |
| pdfmake | 声明式对象树 | 在 PDFKit 之上加声明式包装 |

简单说：pdfmake = PDFKit + 一层"读对象树调 PDFKit"的渲染器。

## 踩过的坑

1. **中文字体不内置**：默认 vfs 只有 Roboto，写中文会变方块。必须自己打 vfs，bundle 一下子大几 MB。
2. **table widths 在内容超长时溢出**：`'auto'` 列遇到一个超长字符串会撑爆纸面。需要手动加 `noWrap: false` 或缩字号或改 `widths: '*'`。
3. **columns 不会自动换行**：和 CSS flex-wrap 不同，列数超过宽度只会变窄不会换行成第二行。要换行得自己拆 stack。
4. **v0.2 → v0.3 升级 break**：fonts 加载重写；老代码 `pdfMake.vfs = pdfFonts.pdfMake.vfs` 常失效，应改 `addVirtualFileSystem` 或副作用 import。升级前先看 migration。
5. **图片必须 base64 或预注册**：不能直接给 URL，要么 fetch 后转 dataURL，要么放进 `images: { logo: '...' }` 再用 `image: 'logo'`。

## 适用 vs 不适用场景

**适用**：

- 发票、账单、报表（表格密集，模板化）
- 证书、合同（固定版式 + 动态字段）
- 前端把当前页面的数据导出 PDF（不想发后端）

**不适用**：

- 复杂排版（杂志、书籍）→ 用 LaTeX 或 InDesign
- 需要像素级精确坐标控制 → 用 jsPDF
- 超大文档（几千页）→ pdfmake 全在内存里构建对象树，会爆。用 PDFKit 流式写
- 需要从已有 PDF 上修改 → pdfmake 只能从零生成，改 PDF 要 pdf-lib

## 学到什么

1. **声明式 vs 命令式** 在 PDF 这个领域同样适用——React 思想可以迁移到任何"输出有结构的产物"的场景
2. **vfs（virtual file system）** 是个聪明的工程方案：把资源打进 JS，避开浏览器跨域 / 缓存 / HTTP 的麻烦
3. **抽象层级要对** ——pdfmake 站在 PDFKit 肩膀上，没重新发明 PDF 解析；这是好的库设计
4. **样式表模式**（`styles: { h1: {...} }`）让结构和样式分离，写起来像 CSS

## 历史小故事

- **2014 年**：作者 bpampuch 开源首版
- **2018 年**：v0.1 稳定，被 Angular/Vue 社区接管为事实标准
- **2022 年**：v0.2 适配 Webpack 5 / ESM
- **2024 年**：v0.3 重构 fonts 加载，砍掉部分老 API
- **2026-05**：v0.3.9，至今仍由社区维护

## 延伸阅读

- 官方 Playground：[pdfmake.github.io/docs/playground](https://pdfmake.github.io/docs/0.1/playground/) — 在线改 docDefinition 实时看效果
- GitHub：[bpampuch/pdfmake](https://github.com/bpampuch/pdfmake) — 12k+ stars
- TypeScript 类型：`@types/pdfmake`
- Angular 集成：`ngx-pdfmake`
- 对比阅读 [[playwright]] —— 同样是"在浏览器里精细控制"的另一类工具

## 关联

- [[playwright]] —— Playwright 也能"打印 PDF"，但走浏览器渲染，复杂排版更准；pdfmake 走纯 JS 对象树，速度快不依赖浏览器
- [[chartist]] —— 同样是声明式 + 对象配置思路的前端库
- [[antv-g2]] —— 图表库的"图形语法"和 pdfmake 的"文档语法"是同一种抽象哲学
- [[frappe-gantt]] —— 另一个"声明数据结构 → 自动渲染"的前端工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[antv-g2]] —— AntV G2 — 把 Grammar of Graphics 写成 JavaScript
- [[pdfkit]] —— PDFKit — 用画笔在 PDF 上一笔一笔画
- [[playwright]] —— Playwright — 跨浏览器自动化测试

