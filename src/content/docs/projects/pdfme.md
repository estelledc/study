---
title: pdfme — TypeScript 模板化 PDF
来源: 'pdfme/pdfme v5.x, 2026-06 读, MIT'
日期: 2026-06-01
分类: 数据可视化
难度: 中级
---

## 是什么

pdfme 是一个**让你像填表单一样生成 PDF**的 TypeScript 库。日常类比：像用 Word 邮件合并——先做一张固定的"底版"，标好哪里放姓名、哪里放金额，运行时把不同顾客的数据塞进去，每人一份 PDF。

它的核心数据模型只有三件东西：

- **basePdf**：一张静态的 PDF 底版（可以是空白 A4，也可以是公司抬头模板）
- **schemas**：一个 JSON 数组，写明"在第几页第几像素放一个文本框/二维码/表格"
- **inputs**：实际数据，按 schema 顺序一一对应

把这三个塞进 `generate()` 函数，就吐出一份 PDF 二进制数据。

它由四个 npm 包组成：`@pdfme/generator`（生成）、`@pdfme/ui`（Designer / Form / Viewer 三个 React 组件）、`@pdfme/common`（类型定义）、`@pdfme/schemas`（内置元素：text / image / qrcode / table / svg / barcode）。

## 为什么重要

不理解 pdfme 这种"模板 + 数据"分离思路，下面这些事都没法解释：

- 为什么电商订单/财务发票场景**几乎不用 jsPDF**——jsPDF 让你用代码画每条线，1000 单就要画 1000 次，模板化方案只要画 1 次
- 为什么"PDF 生成"和"PDF 编辑器"在 pdfme 里是同一个引擎——schemas 数组既能给 Designer 当画布、又能给 generator 当填充地图
- 为什么前端能直接生成 PDF 不用后端转换——浏览器有 [pdf-lib](https://pdf-lib.js.org/)，pdfme 包了一层让普通业务也用得起
- 为什么财务报表团队会被 pdfme 吸引——他们要的不是"画 PDF"而是"非工程师也能调字段位置"

## 核心要点

pdfme 的设计可以拆成 **三层**：

1. **Template = basePdf + schemas**：把"长什么样"和"放什么数据"完全解耦。类比：信封模板 vs 收件人地址清单——同一个信封套不同地址。

2. **Designer / Form / Viewer 三件套都吃同一份 schemas**：Designer 让你拖拽生成 schemas、Form 让最终用户填值、Viewer 给只读预览。三个组件复用同一份 JSON 协议，没有内部翻译层。

3. **底层站在 pdf-lib 肩膀上**：真正写出 PDF 二进制的是 [pdf-lib](https://pdf-lib.js.org/)（纯 TS 的 PDF 操作库），字体子集化交给 [fontkit](https://github.com/foliojs/fontkit)。pdfme 自己只做"schemas → pdf-lib 调用"的翻译。类比：pdfme 是装修工头，pdf-lib 是搬砖的师傅。

## 实践案例

### 案例 1：5 分钟生成第一份 PDF

逐步：① `npm i @pdfme/generator @pdfme/common @pdfme/schemas` ② 写 template ③ `generate` ④ 拿到 `Uint8Array`。

```ts
import { generate } from '@pdfme/generator';
import { BLANK_PDF } from '@pdfme/common'; // 空白 A4 底版常量
import { text } from '@pdfme/schemas';

const template = {
  basePdf: BLANK_PDF,
  schemas: [[
    { name: 'orderNo', type: 'text', position: { x: 20, y: 20 }, width: 80, height: 10 },
    { name: 'amount',  type: 'text', position: { x: 20, y: 35 }, width: 80, height: 10 },
  ]],
};

const inputs = [{ orderNo: 'A20260601-001', amount: '￥128.00' }];
const pdf = await generate({ template, inputs, plugins: { text } });
// pdf 是 Uint8Array，可以下载也可以传后端
```

`schemas` 是**数组的数组**——外层一页、内层该页字段；坐标单位是毫米（见踩坑）。

### 案例 2：把 Designer 嵌进自己的后台

```tsx
import { Designer } from '@pdfme/ui';
import { text, image, qrcode } from '@pdfme/schemas';

const designer = new Designer({
  domContainer: document.getElementById('container')!,
  template,
  plugins: { text, image, qrcode },
});

designer.onSaveTemplate((newTemplate) => {
  // 后台保存 newTemplate，下次填发票时复用
});
```

运营在浏览器里拖出"客户名/金额/二维码"位置，保存的就是一份纯 JSON——没有图形二进制。下次工程不改代码也能换模板。

### 案例 3：批量生成与服务端渲染

`generate()` 在 Node 同样能跑（用 [@pdfme/converter](https://pdfme.com) 之外的核心包即可），所以可以这样组装一条流水线：

```ts
// 服务端：每天凌晨给 1 万张订单批量出 PDF
const orders = await db.orders.todayUnbilled();
const pdfs = await Promise.all(
  orders.map(o => generate({ template, inputs: [o], plugins }))
);
await s3.uploadMany(pdfs);
```

实测一份普通发票 50ms 内出，1 万张分批跑也是分钟级。瓶颈往往不在 pdfme，在字体加载和图片解码。

## 踩过的坑

1. **中文字体必须自己注入**：默认字体不含中文，直接写会变方框。正确做法是 `generate({ ..., options: { font: { Noto: { data: fontBytes, fallback: true } } } })`（从 `@pdfme/common` 的 `Font` 类型），不是 `Font.register()`。

2. **Designer 与 React 绑得死**：UI 包是 React 组件。Vue / Svelte 想用要么 iframe 套一层，要么自己读 schemas JSON 自己画——目前社区还没成熟的非 React 适配。

3. **复杂表格分页弱**：v4 之前 table 元素不会自动跨页，长表格直接被截。v5 起表格 schema 加了行级分页，但仍然不如 LaTeX / Carbone 灵活。

4. **schemas 坐标用 mm**：不是像素也不是 pt，是毫米（向下为 y 正方向）。和 CSS 直觉相反，调位置时容易写反。

## 适用 vs 不适用场景

**适用**：
- 电商订单/物流面单/财务发票/收据/证书——固定版面 + 字段填充
- 非工程师维护模板（运营自己拖位置）
- 前端就要出 PDF 不想搭后端转换链路
- 模板数量多（几十到几百种），一份代码全覆盖

**不适用**：
- 需要复杂动态布局（多列流式排版、段落自动断页）→ 用 [[react-pdf]] 或 LaTeX
- 后端 PDF 数据量很大（百万级别）→ 用 Carbone / [[wkhtmltopdf]] 做服务端渲染
- 需要从 PDF 抽数据（OCR / 解析）→ pdfme 只生成不解析，要 [[pdf-lib]] / pdfminer
- Vue / Svelte 主栈 → 想要 Designer 体验自己包一层成本不小

## 历史小故事（可跳过）

- **2021 年**：日本开发者 hand-dot 在做发票 SaaS 时受不了"前端画 PDF 改个位置就要发版"，开始写自己的模板引擎
- **2022 年**：v1 开源，先做出 Designer 这一项就吸引了第一批用户——多数 PDF 库都没有可视化编辑器
- **2023 年**：v3 把 generator 和 ui 拆开，让纯后端用户能只装核心包；同年加入 schemas 插件机制
- **2024 年**：v4 加 table、barcode、svg；社区出了 React-Native / Electron 适配
- **2025 年**：v5 重写表格分页、稳定 plugin API；GitHub 星标过 3.8k

主要由 hand-dot 一人维护，commits 集中、merge 节奏稳定。这种"个人精品库"风格在 PDF 生态里少见（多数是公司项目或孤儿）。

## 学到什么

1. **模板 + 数据分离比纯代码生成更有产品力**——技术上简单，但让非工程师能参与，业务复用倍增
2. **同一份 JSON 协议能驱动编辑器 + 生成器**——schemas 既给 Designer 当画布、又给 generator 当地图，省一半代码
3. **站在巨人 pdf-lib 上做产品层**——不重造底层，专注做"模板抽象 + UI 编辑器"，3.8k star 一人维护可持续
4. **PDF 生态有空白**：可视化模板编辑器 + 浏览器原生生成这个组合，开源里几乎只有 pdfme，说明产品需求和技术供给之间缝隙大

## 延伸阅读

- 官方文档：[pdfme.com](https://pdfme.com)（Playground 可以直接在浏览器试 Designer）
- GitHub：[pdfme/pdfme](https://github.com/pdfme/pdfme)（看 examples 目录最快）
- 底层 [pdf-lib 文档](https://pdf-lib.js.org/) —— 想做 pdfme 没覆盖的 PDF 操作（合并/水印/签名）必读
- [[react-pdf]] —— JSX 描述布局生成 PDF，pdfme 的"代码派"对照
- [[pdf-lib]] —— pdfme 的底层引擎，独立用也强
- [[dnd-kit]] —— Designer 拖拽底层（pdfme 自家拖拽 + dnd-kit 模式相近）

## 关联

- [[react-pdf]] —— JSX 写 PDF，无可视化编辑器，互补定位
- [[pdf-lib]] —— pdfme 底层；想拓展插件必先懂它
- [[excalidraw]] —— 同样是"前端原生 + 模板可拖拽"思路，但目标是白板不是 PDF
- [[tldraw]] —— canvas + 协议驱动渲染，pdfme 把同一思路用在 PDF 上
- [[react-hook-form]] —— pdfme Form 组件思路类似，把 schema 当表单源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
