---
title: Tabulator — 纯 JS 交互式表格
来源: https://github.com/olifolkerd/tabulator
日期: 2026-06-01
分类: 数据可视化
难度: 入门
---

## 是什么

Tabulator 是一套**用纯 JavaScript 写的交互式表格组件**，把 30 多种列类型、行内编辑、树形展开、分组聚合、CSV/JSON 导出全部内建在一个 ~150 KB 的库里。日常类比：「Excel 给你一张白纸，写公式才有功能；Tabulator 直接给你一张『默认就带筛选、排序、编辑、导出菜单』的纸」。

由英国开发者 Oliver Folkerd 于 2015 年创建，4.0 版本（2019）彻底去掉 jQuery 依赖，变成零依赖纯 JS。今天它在 GitHub 有约 7K star，是企业内部管理后台里最低门槛的表格选项。

它解决的核心问题是：**当数据表只是公司内部用、不需要花 $999/seat/年买 AG Grid 企业版，但又比原生 `<table>` 复杂时，中间这块需求长期没人填好**。Tabulator 就是这块的事实方案。

## 为什么重要

理解 Tabulator 的定位，要看它在表格库光谱里的位置：

- **AG Grid**：金融级，百万行流畅，企业版按 seat 收费，社区版功能受限
- **DataTables（jQuery）**：老牌方案，但绑死 jQuery，新项目不想引
- **TanStack Table**：headless（只给逻辑不给样式），需要自己写 UI
- **Tabulator**：MIT 协议全功能 + 零依赖 + 自带样式 + 30 行配置就能跑

适合的场景非常具体：

- **公司内部 admin 后台**——CRUD 表 + 简单分组 + 偶尔导出 Excel
- **零 npm 环境**——一些公司内网装包困难，Tabulator 可以用 `<script>` 标签直接引 CDN
- **不想学 React/Vue 的后端开发**——后端同学写运维工具，纯 HTML + 一段 `new Tabulator(...)` 就完事
- **预算有限的中小项目**——AG Grid 企业版预算批不下来时的标准替代

它**不是**用来扛百万行高频实时刷新的——那种需求该花钱买 AG Grid 企业版。Tabulator 的甜蜜区是 1 万到 10 万行 + 中频更新的内部工具。

## 核心要点

Tabulator 把"做一张交互表格"拆成 **三块声明式配置**：

### 1. Column Definition（列定义） + 30+ 内置类型

每列声明 `field`（绑数据字段）+ `formatter`（怎么显示）+ `editor`（怎么编辑）。30+ 内置 formatter 覆盖：纯文本 / 数字 / 日期 / 货币 / 链接 / 图片 / 颜色块 / 进度条 / 红绿灯 / 星级 / 复选框 / tickCross 等。

类比：Excel 单元格"格式"菜单里能选的都给你做好了，写一行 `formatter: 'progress'` 就出进度条，不用自己 CSS。

### 2. Row Editing（行内编辑） + 内置编辑器

单元格点一下进入编辑态，内置编辑器有 `input` / `textarea` / `number` / `range` / `tickCross` / `star` / `list`（下拉）/ `date` / `time` / `datetime`。配 `cellEdited` 回调把改完的值发回后端。

这是 Tabulator 跟其他库最直观的差距——AG Grid 行内编辑要写一堆 cellEditor，Tabulator 一行 `editor: 'input'` 就行。

### 3. Tree + GroupBy（树形 + 分组）

- **树形**：数据里写 `_children: [...]`，配 `dataTree: true`，自动出现折叠箭头
- **分组**：配 `groupBy: 'department'`，相同 department 的行自动收到一个可折叠的分组头下，分组头还能聚合（`groupHeader: (value, count, data) => ...`）

这两个功能在 AG Grid 里都属于企业版，在 Tabulator 里全免费。

## 实践案例

### 案例 1：30 行配置跑起完整表格

```html
<link href="https://unpkg.com/tabulator-tables/dist/css/tabulator.min.css" rel="stylesheet">
<script src="https://unpkg.com/tabulator-tables/dist/js/tabulator.min.js"></script>

<div id="example-table"></div>
<script>
const table = new Tabulator('#example-table', {
  data: [
    { id: 1, name: '张三', age: 28, rating: 4, joined: '2024-01-15' },
    { id: 2, name: '李四', age: 35, rating: 5, joined: '2023-09-01' },
  ],
  columns: [
    { title: '姓名', field: 'name', editor: 'input' },
    { title: '年龄', field: 'age', editor: 'number', sorter: 'number' },
    { title: '评分', field: 'rating', formatter: 'star', editor: 'star' },
    { title: '入职', field: 'joined', formatter: 'datetime', editor: 'date' },
  ],
})
</script>
```

打开页面就有：可点击编辑 / 可排序 / 评分列直接显示星星 / 日期列自动格式化。

### 案例 2：分组 + 聚合表头

```js
new Tabulator('#table', {
  data: orders,
  groupBy: 'region',
  groupHeader: (value, count, data) => {
    const total = data.reduce((s, r) => s + r.amount, 0)
    return `${value} <span class="badge">${count} 单</span> 合计 ¥${total}`
  },
  columns: [
    { title: '订单号', field: 'orderId' },
    { title: '金额', field: 'amount', formatter: 'money' },
  ],
})
```

订单按 region 自动收到分组头下，每个分组头显示订单数 + 金额合计，可折叠。

### 案例 3：树形数据 + 行内编辑回写

```js
new Tabulator('#table', {
  data: [{
    name: '研发中心', headcount: 50,
    _children: [
      { name: '前端组', headcount: 12 },
      { name: '后端组', headcount: 25 },
    ]
  }],
  dataTree: true,
  dataTreeStartExpanded: true,
  columns: [
    { title: '部门', field: 'name', editor: 'input' },
    { title: '人数', field: 'headcount', editor: 'number' },
  ],
  cellEdited: (cell) => {
    fetch('/api/dept', { method: 'PUT', body: JSON.stringify(cell.getRow().getData()) })
  },
})
```

部门树自动展开，改完任意单元格自动 PUT 回后端。

## 踩过的坑

1. **CSS 没引导致表格"裸奔"**：JS 跑了但没 import `tabulator.min.css`，结果排序图标/分组箭头全消失。修复：CSS 必须跟 JS 一起引

2. **数据是异步加载的，配 `data: []` 后塞进去无效**：要么初始化时直接给数据，要么用 `table.replaceData(newRows)` 而不是改外部变量

3. **行内编辑后数据没同步回外部**：`cellEdited` 回调里拿到的是新值，但外部 array 不会自动同步——必须自己监听回调写回，或调 `table.getData()` 重新取

4. **打包体积**：如果只用 npm `tabulator-tables`，全功能 ~150 KB（gzip ~50 KB），不算重但也不算轻。可以按需 import 子模块（5.x 后支持），把没用的 formatter / editor 摇掉

5. **大数据量要设 height 才吃到虚拟滚动**：5.x+ 默认 `renderVertical: "virtual"`，但没设表格高度时仍会一次渲完所有行。1 万行以上务必设 `height: "400px"`（或 CSS 高度），别再写已废弃的 `virtualDom: true`

## 适用 vs 不适用

**适用**：

- 公司内部 admin / 后台 / 运维工具——CRUD + 偶尔导出
- 数据量 1 千到 10 万行 + 中频更新（每秒 < 10 次）
- 团队不想引 React/Vue 的纯 HTML 项目
- 需要"开箱即用"的样式和交互，不想自己写 UI

**不适用**：

- 百万行 + 高频实时刷新（金融行情）→ 该买 AG Grid 企业版
- 需要极度定制的视觉（看起来不像表格的表格）→ headless 的 TanStack Table
- 移动端为主的场景 → desktop-first，触屏体验一般

## 历史小故事（可跳过）

- **2015 年**：Oliver Folkerd 开源第一版，当时还依赖 jQuery
- **2019 年**：4.0 去掉 jQuery，变成零依赖纯 JS，企业内网 CDN 引入门槛骤降
- **2024 年**：6.x 加强 ESM tree-shaking 与 spreadsheet 能力
- **2026 年**：维护权移交 Beekeeper Studio 团队，仓库迁至 `tabulator-tables/tabulator`

## 学到什么

1. **"够用就好"是一种产品定位**——不跟 AG Grid 比百万行性能，专攻"中等数据 + 中等需求 + 零预算"这块
2. **零依赖是企业内部工具的硬通货**——很多公司内网装 npm 包要走审批，能 `<script>` 引的库永远更受欢迎
3. **声明式配置 > 命令式 API**——columns / data / groupBy 三个对象描述清楚一切，不用写循环不用写事件绑定
4. **MIT 协议 + 全功能**是开源表格库里少见的——AG Grid 企业版 / Handsontable 商业授权都对内部工具不友好

## 延伸阅读

- 官方文档：[Tabulator Documentation](https://tabulator.info/)
- GitHub 仓库：[tabulator-tables/tabulator](https://github.com/tabulator-tables/tabulator)（原 olifolkerd/tabulator）
- 列类型一览：[Tabulator Formatters](https://tabulator.info/docs/6.2/format)
- [[ag-grid]] —— 企业级表格的金融行业事实标准（对照组）
- [[handsontable]] —— 浏览器里的 Excel（更偏 Excel 体验）

## 关联

- [[ag-grid]] —— AG Grid 占据高端市场，Tabulator 占据中端
- [[handsontable]] —— Handsontable 偏 Excel，Tabulator 偏 admin 后台
- [[glide-data-grid]] —— Canvas 渲染的另一种性能路线
- [[react]] —— Tabulator 有官方 React 包装但纯 JS 也能跑

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
