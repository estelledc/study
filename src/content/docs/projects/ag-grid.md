---
title: AG Grid — 企业级数据表格
来源: https://github.com/ag-grid/ag-grid
日期: 2026-05-29
分类: 数据可视化
难度: 中级
---

## 是什么

AG Grid 是一套**让网页能像 Excel 一样展示和操作百万行数据的表格组件**。日常类比：「Excel 是单机版表格，每个人在自己电脑上打开 .xlsx；AG Grid 是 Web 版的 Excel——百万行数据可以在浏览器里流畅滚动，还能多人同时看同一份。」

AG Grid 最早由 Niall Crosby 在金融前端项目里做出来，后来由 AG Grid Ltd 维护。今天很多企业后台、BI 报表、交易明细页会选它，是因为它把大表格常见功能做成了现成组件。

它解决了一件原生 HTML `<table>` 做不到的事：**百万行数据塞进 DOM 会卡死浏览器**。AG Grid 用一种叫"虚拟滚动"的技术，让浏览器只渲染你**当前能看到的那 30 行**，剩下的几十万行只在内存里存着，滚动到哪儿才渲染哪儿。

## 为什么重要

如果只把它当"好看的表格"，会低估它。下面几件事它都是行业默认：

- **企业级大表格的常见选择**：金融、后台管理、BI 报表都需要排序、过滤、分组、编辑同时存在。自己从零拼这些功能，最后常常变成一个难维护的小型表格框架
- **百万级数据的滚动思路**：原生 HTML table 渲染 1 万行就开始卡，10 万行直接崩。AG Grid 通过虚拟滚动和服务端行模型，把"一次渲染全部"改成"只处理当前窗口"
- **跨框架兼容**：React / Vue / Angular / Svelte 全部官方支持。同一份配置代码（columnDefs / rowData）在四个框架下接口几乎一样
- **社区版免费 + 企业版付费**：基础功能（排序 / 过滤 / 分页 / 编辑）社区版够用；Pivot（数据透视）/ Master-Detail（主从表）/ Excel 导出 / 服务端行模型这些重型功能走企业版授权

不理解 AG Grid 的人，会去手写一个 `<table>` 然后在 1 万行的时候发现页面卡死，再去找 react-table / TanStack Table，最后还是绕回 AG Grid。

## 核心要点

AG Grid 的设计可以拆成 **三个核心机制**：

### 1. 虚拟滚动（Virtual Scrolling）

假设你有 100 万行数据。原生表格会创建 100 万个 `<tr>` 元素塞进 DOM，浏览器立刻卡死。

AG Grid 的做法：

- 屏幕上只能看到 30 行 → DOM 里只放 30 个 `<tr>`
- 用户滚动 → 计算"现在应该显示第几行" → 把那 30 个 `<tr>` 的内容**复用**改成新数据
- 整个滚动过程，DOM 节点数永远是 30，不是 100 万

类比：电影院 200 个座位（DOM 节点），观众有 10 万人（数据行）。每场电影只能坐 200 个，下一场再换一批。

### 2. Column Definition + Cell Renderer（列定义 + 单元格渲染器）

AG Grid 把"列长什么样"和"单元格里塞什么"拆开：

- **Column Definition**：声明这一列叫什么、绑哪个字段、宽度多少、能不能排序过滤
- **Cell Renderer**：声明单元格里渲染什么——纯文本？带图标的按钮？颜色根据值变化的进度条？

这种拆分让你可以**复用渲染器**——所有"价格"列共用一个 `PriceRenderer`，所有"状态"列共用一个 `StatusBadgeRenderer`。

### 3. Server-Side Row Model（服务端行模型）

社区版的"客户端模型"是把所有数据一次拉到浏览器内存，适合 < 10 万行。

企业版的"服务端模型"是**只在你滚动到那一段时才向后端要那一段**——叫**无限分页**。配合后端的 cursor / offset 分页接口，可以撑住"理论上无限大"的数据集。后端每次只返回 100 行，前端用户感觉好像在看一张完整的百万行表。

## 实践案例

### 案例 1：React 里一行配置就跑起来

```jsx
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

const rowData = [
  { name: '张三', age: 28, city: '北京' },
  { name: '李四', age: 35, city: '上海' },
]

const columnDefs = [
  { field: 'name', headerName: '姓名' },
  { field: 'age', headerName: '年龄', sortable: true },
  { field: 'city', headerName: '城市', filter: true },
]

<div className="ag-theme-alpine" style={{ height: 400 }}>
  <AgGridReact rowData={rowData} columnDefs={columnDefs} />
</div>
```

打开页面就有了：可排序 / 可过滤 / 可调列宽 / 可拖动列顺序的完整表格。

### 案例 2：自定义单元格渲染器

```jsx
const PriceRenderer = ({ value }) => {
  const color = value > 100 ? 'red' : 'green'
  return <span style={{ color, fontWeight: 'bold' }}>¥{value.toFixed(2)}</span>
}

const columnDefs = [
  { field: 'product', headerName: '商品' },
  { field: 'price', headerName: '价格', cellRenderer: PriceRenderer },
]
```

价格列就变成了"红绿配色 + 加粗 + 两位小数"。

### 案例 3：服务端无限分页

```jsx
const datasource = {
  getRows: (params) => {
    const { startRow, endRow, sortModel, filterModel } = params.request
    fetch(`/api/orders?start=${startRow}&end=${endRow}`)
      .then((r) => r.json())
      .then((data) => {
        params.success({ rowData: data.rows, rowCount: data.total })
      })
  },
}

<AgGridReact
  rowModelType="serverSide"
  serverSideDatasource={datasource}
  cacheBlockSize={100}
/>
```

后端每次只发 100 行，前端可以"假装"看到几百万行。

## 踩过的坑

1. **Context state 频繁 rerender**：用 React Context 管 grid 状态时，`onCellValueChanged` 触发太频繁，整个 grid 跟着重渲染。修复：把 grid props（rowData / columnDefs）挂到顶层 useMemo / useState，回调用 ref 隔离

2. **企业版 License Key 忘配**：用了企业版功能但没填 license，控制台会刷一堆红色警告，水印浮在 grid 上方。修复：`LicenseManager.setLicenseKey('your-key')` 在 app 入口调一次

3. **Theme 选错了**：AG Grid 自带四套主题（Alpine / Balham / Material / Quartz），CSS 文件得**单独 import 对应的那份**。新人常常 import 了 `ag-theme-alpine.css` 但 div 上写的 className 是 `ag-theme-balham`，结果整个表格没样式

4. **Bundle 太大**：默认会把所有 features 都打进去（社区版 + 企业版的 JS 加起来 ~2 MB）。修复：用 `@ag-grid-community/core` + 按需注册模块（`ModuleRegistry.registerModules([ClientSideRowModelModule])`），只打你真用的那几个

5. **Cell editor 状态管理坑**：双击进入编辑模式后，按 Tab 跳到下一格，AG Grid 会**先 commit 当前格的值再切换**——如果你的 `onCellValueChanged` 是异步的（比如调 API 验证），可能产生竞态。修复：用 `singleClickEdit: false` + 显式 commit 按钮

## 适用 vs 不适用场景

**适用**：
- 金融 / 后台管理 / BI 报表——数据量 > 1 万行 + 需要排序过滤分组
- 需要 Excel-like 交互（行内编辑 / 复制粘贴 / Pivot）
- 多框架团队——React / Vue / Angular 共用一份 grid 知识

**不适用**：
- 数据量 < 1000 行 + 只需要展示——原生 `<table>` 或 `react-table` 就够了，AG Grid 太重
- 需要极度自定义的视觉（不像表格的表格）—— grid 的 DOM 结构是固定的，硬掰会很痛苦
- 移动端为主——AG Grid 在 desktop 上设计，触屏体验一般，建议用 [[refine]] 或专门的移动端表格库

## 历史小故事（可跳过）

- **2015 年**：Niall Crosby 在伦敦做金融前端项目时，受不了 jQuery + DataTables 在复杂 grid 上的性能和维护成本，开始把自己的表格方案产品化
- **2016 年**：成立 AG Grid Ltd，开源社区版 + 商业化企业版。早期客户全是金融行业
- **2020 年代**：React / Vue / Angular / Svelte 生态都能用同一套核心 API，"开源核心 + 企业功能授权" 的模式稳定下来
- 今天：GitHub 和 npm 上仍然活跃，是企业前端做复杂数据表格时最常被比较的方案之一

## 学到什么

1. **虚拟滚动是处理大数据集的通用解法**——不只是表格，长列表 / 聊天记录 / 时间线都能用这招
2. **拆"列定义"和"单元格渲染"** 让 grid 既统一又灵活——单一职责 + 组合
3. **开源 + 付费插件** 是一种可持续的商业模式——核心免费养社区，重型功能付费养团队
4. **跨框架抽象** 能扩大用户基数——同一套 API 跑在 React / Vue / Angular / Svelte 上

## 延伸阅读

- 官方文档：[AG Grid Documentation](https://www.ag-grid.com/documentation/)
- React 版仓库：[ag-grid/ag-grid](https://github.com/ag-grid/ag-grid)
- 性能对比：[Niall Crosby — Why AG Grid is Fast](https://www.ag-grid.com/blog/inside-the-grid-cellrenderer/)
- [[react]] —— React 是 AG Grid 最主流的宿主框架
- [[tanstack-query]] —— 服务端数据模型常用 TanStack Query 拉数据

## 关联

- [[react]] —— AG Grid 在 React 生态最活跃
- [[vue]] —— Vue 版 AG Grid 共享同一套 columnDefs API
- [[angular]] —— Angular 是 AG Grid 最早支持的框架
- [[tanstack-query]] —— 服务端模型常配合它做缓存和重试

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[canvas-datagrid]] —— canvas-datagrid — 整张表只用一块 canvas 画
- [[glide-data-grid]] —— glide-data-grid — Canvas 画出来的百万行表格
- [[handsontable]] —— Handsontable — 浏览器里的 Excel
- [[react]] —— React UI 组件库
- [[tabulator]] —— Tabulator — 纯 JS 交互式表格
- [[tanstack-query]] —— TanStack Query — 数据获取与缓存库
- [[vue]] —— Vue.js — 渐进式 UI 框架

