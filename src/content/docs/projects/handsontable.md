---
title: Handsontable — 浏览器里的 Excel
来源: https://github.com/handsontable/handsontable
日期: 2026-06-01
分类: 数据可视化
难度: 中级
---

## 是什么

Handsontable 是一套**让网页表格用起来像 Excel** 的 JavaScript 数据表格库，由波兰公司 Handsoncode 在 2012 年开源。

日常类比：如果说 [[ag-grid]] 是「让浏览器能装百万行数据的展示柜」，[[glide-data-grid]] 是「用画笔直接画出来的高速画布」，那 Handsontable 就是「把 Excel 的整套手感原样搬进浏览器」——你能用 Tab 键跳格子，能拖拽填充柄复制公式，能合并单元格，能输入 `=SUM(A1:A10)` 让它算给你看。

GitHub 约 20k star，TypeScript 写成，**AGPL v3 + 商业双许可**（这一点很重要，下文展开）。

## 为什么重要

把它和上一篇 [[glide-data-grid]] 对照看，会发现三套同类库其实在做三件不同的事：

- **AG Grid**：DOM 虚拟化 + 企业级筛选 / 透视，瞄准金融后台与 BI 仪表盘
- **glide-data-grid**：Canvas 绘制 + 极致性能，瞄准 Notion / Airtable 这类「展示百万行」场景
- **Handsontable**：DOM + 完整 Excel 体验，瞄准「让用户在网页里直接做表」的应用——预算表、库存清单、人事薪资、财务报表

**关键差别**：前两者目标是「展示数据」，Handsontable 目标是「让用户编辑数据」。后者的难度大一个数量级——Excel 几十年积累的快捷键、撤销栈、公式引擎、合并单元格、跨表引用、复制粘贴语义……都得复刻。

它的 **HyperFormula** 公式引擎后来被拆出来独立开源，是浏览器端函数覆盖很广的 Excel 兼容公式引擎之一（约 380+ 个函数）。

## 核心要点

Handsontable 的设计可以拆成 **四件事**：

### 1. 虚拟渲染（DOM 路线）

和 AG Grid 思路类似：屏幕上只渲染可见的几十行，滚动时复用 DOM 节点改内容。极限大约 10 万行。

为什么不像 glide 走 Canvas？因为它的核心卖点是「编辑体验」——光标、IME 输入法、复制粘贴、文本选中、辅助技术，这些跟 DOM 深度绑定。放弃 DOM 等于放弃 Excel 体感。

### 2. HyperFormula 公式引擎

输入 `=SUM(A1:A10)` 它真的会算，并且把依赖关系记在图里：A1 改了，下游所有依赖单元格自动重算。

类比：Excel 的公式引擎是一棵「谁依赖谁」的有向无环图（DAG）。改一个值，引擎按拓扑序通知下游重算，不重算无关单元格。HyperFormula 把这套机制原样搬进浏览器。

### 3. 完整的 Excel 操作语义

- **撤销栈**：每次编辑都进栈，Ctrl+Z / Ctrl+Y 像 Excel 一样回退
- **拖拽填充柄**：选中一格，拖右下角小方块，复制或推导序列（1, 2 → 3, 4, 5）
- **合并单元格**：`mergeCells: [{row: 1, col: 1, rowspan: 2, colspan: 3}]`
- **冻结行列**：`fixedRowsTop: 1` / `fixedColumnsLeft: 1`
- **复制粘贴**：Ctrl+C 出来的是 TSV，能直接粘到真 Excel 里

这些功能单看每一个都不难，难在**所有功能要在一起协同**——选中区域跨过冻结行还能正常拖拽，合并单元格里复制要保留合并状态，撤销要能回退合并操作本身。

### 4. AGPL + 商业双许可

这是最特殊的一点。Handsontable 7.0 之后从 MIT 改为 **AGPL v3**：

- **AGPL v3**：你免费用，但你的应用代码也必须开源（包括 SaaS 产品的服务器端代码）
- **商业许可**：付费购买，闭源使用

这种「用许可证逼商业用户付费，但对遵守开源义务的项目仍可用」的模式，是商业化开源常见打法。注意：AGPL 仍是 OSI 认可的 copyleft；MongoDB 的 SSPL、Elastic 的 ELv2 更偏「源码可用、非 OSI」，不宜和 AGPL 混称为同一种 Copyleft。

**实战影响**：写自家闭源 SaaS，要么买商业 license，要么换库（AG Grid 社区版 MIT、glide-data-grid MIT 都是更友好的选择）。

## 实践案例

### 案例 1：最小可跑的表格

```js
import Handsontable from 'handsontable'
import 'handsontable/dist/handsontable.full.min.css'

const container = document.getElementById('grid')
const hot = new Handsontable(container, {
  data: [
    ['苹果', 10, 5.5],
    ['香蕉', 20, 3.2],
  ],
  colHeaders: ['品名', '数量', '单价'],
  rowHeaders: true,
  licenseKey: 'non-commercial-and-evaluation',
})
```

注意 `licenseKey`——这是 AGPL 模式的实现，不写就报警告。非商业 / 评估场景填这个魔法字符串。

### 案例 2：开公式引擎

```js
import HyperFormula from 'hyperformula'

const hot = new Handsontable(container, {
  data: [
    [1, 2, '=A1+B1'],
    [3, 4, '=A2+B2'],
    ['', '', '=SUM(C1:C2)'],
  ],
  formulas: { engine: HyperFormula },
  licenseKey: 'non-commercial-and-evaluation',
})
```

**逐部分解释**：

- `formulas: { engine: HyperFormula }` 把公式引擎挂进表格。
- `=A1+B1` / `=SUM(C1:C2)` 是单元格里的公式文本，不是普通字符串展示。
- 跑起来 C1=3、C2=7、C3=10；改 A1 后，依赖图会带动 C1、C3 重算。

### 案例 3：合并单元格 + 冻结行

```js
const hot = new Handsontable(container, {
  data,
  fixedRowsTop: 1,
  fixedColumnsLeft: 1,
  mergeCells: [
    { row: 0, col: 1, rowspan: 1, colspan: 3 },
  ],
  manualColumnResize: true,
  manualRowResize: true,
  contextMenu: true,
  licenseKey: 'non-commercial-and-evaluation',
})
```

**逐部分解释**：

- `fixedRowsTop` / `fixedColumnsLeft`：滚动时冻结首行/首列，表头不跟着跑丢。
- `mergeCells`：把一块矩形区域合成一格（这里合并第 0 行的 3 列）。
- `contextMenu: true`：右键菜单开插入/删除/合并/复制粘贴。
- `manualColumnResize` / `manualRowResize`：允许拖列宽行高。

## 踩过的坑

1. **AGPL 是真陷阱**：本地玩具项目没事，一旦上生产 SaaS，法务会拦——要么付钱，要么换库。立项前看清 license
2. **大数据集要关 `autoColumnSize`**：默认会量每个 cell 的实际宽度，10 万行下首屏要算几秒。改成固定 `colWidths: [100, 80, 120]`
3. **`afterChange` hook 在初始化也会触发**：用 `if (source === 'loadData') return` 判断，否则每次刷新页面都会跑业务逻辑
4. **复制粘贴丢精度**：从 Excel 复 `1.7976931348623157e+308`（科学计数法）粘进来变字符串。需要在 `beforePaste` 里手动转 `Number()`
5. **公式引擎不是无限大**：HyperFormula 默认 sheet 上限 4 万行，超了得自己分 sheet；公式数量过多（10 万+）依赖图遍历会慢

## 适用 vs 不适用场景

**适用**：
- 用户要**直接编辑**数据的网页表格——预算表、库存清单、ERP 录入页
- 需要 Excel 公式 / 合并单元格 / 撤销栈 / 复制粘贴这些「Excel 体感」
- 数据量在 1 万 ~ 10 万行之间
- 商业许可预算可控（或项目本身就是开源）

**不适用**：
- 闭源 SaaS 又不想买 license → 选 AG Grid 社区版（MIT）或 [[glide-data-grid]]（MIT）
- 数据量 > 10 万行 + 不需要编辑 → glide-data-grid 的 Canvas 路线
- 重 Pivot / 服务端行模型 → AG Grid 企业版
- 移动端为主 → Handsontable 在小屏体验一般，Excel 风格交互本就为桌面设计

## 历史小故事（可跳过）

- **2012 年**：波兰开发者 Marcin Warpechowski 在 GitHub 开源 Handsontable，初版只有几百行，因为 jQuery 时代缺一个像 Excel 的表格组件，迅速火起来
- **2014 年前后**：成立 Handsoncode 公司商业化运营，社区版仍 MIT
- **2019 年（7.0 版本）**：从 MIT 改为非商业许可后又调整到 AGPL v3。社区一度炸锅，竞争对手 AG Grid 借机吸纳了一批用户
- **2020 年**：把内部公式引擎拆成独立项目 **HyperFormula**，同样 GPLv3 + 商业双许可，成为开源 spreadsheet 公式引擎里函数覆盖很广的一个
- **如今**：商业版稳定盈利，是 JS 生态里少数靠 license 卖钱活下来的开源项目之一

## 学到什么

1. **「展示」和「编辑」是两个数量级的难度**——展示库随便写，编辑库要复刻几十年积累的人机交互细节
2. **license 是产品策略**——MIT / Apache 2 / AGPL / SSPL 不是法律细节，是商业模式选择，立项就要想清楚
3. **公式引擎的本质是依赖图**——HyperFormula 把 Excel 的 DAG + 拓扑重算搬进浏览器，跟 spreadsheet / 反应式编程是同一族
4. **DOM 路线还远没死**——只要核心卖点是「编辑体验」，DOM 仍然是最务实的选择，Canvas 路线的代价太大
5. **开源不等于免费**——AGPL 是给商业使用者的账单，不是慈善

## 延伸阅读

- 仓库：[handsontable/handsontable](https://github.com/handsontable/handsontable)
- 公式引擎：[handsontable/hyperformula](https://github.com/handsontable/hyperformula)
- 文档：[handsontable.com/docs](https://handsontable.com/docs)
- AGPL 解读：[Why we relicensed](https://handsontable.com/blog/articles/2019/3/handsontable-drops-open-source-for-a-non-commercial-license)
- [[ag-grid]] —— DOM 虚拟化 + 企业级 BI，对照阅读
- [[glide-data-grid]] —— Canvas 路线，性能极限对比

## 关联

- [[ag-grid]] —— 同为 DOM 路线，但目标是「展示」而非「编辑」
- [[glide-data-grid]] —— Canvas 路线，性能 vs 编辑体验的另一极
- [[react]] —— Handsontable 提供 React 包装器，但内核是框架无关的 vanilla JS
- [[d3]] —— 数据可视化老牌，与 Handsontable 解的是不同问题（图形 vs 表格）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[canvas-datagrid]] —— canvas-datagrid — 整张表只用一块 canvas 画
- [[tabulator]] —— Tabulator — 纯 JS 交互式表格
