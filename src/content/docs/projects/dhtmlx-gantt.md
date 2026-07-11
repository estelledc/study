---
title: DHTMLX Gantt — 给企业级排期用的全功能甘特组件
来源: 'https://github.com/DHTMLX/gantt'
日期: 2026-06-01
分类: 数据可视化
难度: 中级
---

## 是什么

DHTMLX Gantt 是一个**面向企业项目管理、用纯 JavaScript + DIV/HTML 渲染**的甘特图库。日常类比：和 Frappe Gantt 那张"画在 SVG 上的简版日历"不同，它更像 MS Project 搬到浏览器里——能算关键路径、能跳周末、能把人当资源排进任务，还能导出到 .mpp。

它走的是**双许可**路线：标准版 GPL 2.0 开源（在 GitHub 上约 2k 星），Pro / Enterprise 是商业版。关键路径、资源视图、自动调度、工作日历、基线对比这五项是 Pro 才有。

```js
gantt.init('gantt_here')
gantt.parse({
  data: [
    { id: 1, text: '写需求', start_date: '2026-06-01', duration: 5, progress: 0.5 },
    { id: 2, text: '画原型', start_date: '2026-06-06', duration: 5 }
  ],
  links: [{ id: 1, source: 1, target: 2, type: '0' }]   // type 0 = finish-to-start
})
```

## 为什么重要

不理解 DHTMLX Gantt 的设计取舍，下面这些事都没法解释：

- 为什么"看起来一样"的两个甘特图库，一个核心 200 行（Frappe）一个核心数千行——**功能复杂度差一个数量级**
- 为什么企业 PM 系统普遍买商业版而不是开源——关键路径 / 资源 / 工时这三件 Pro 才给
- 为什么它选 DIV 不选 SVG 也不选 Canvas——**虚拟滚动 + DOM 事件 + a11y** 三个要求 DIV 最划算
- 为什么 GPL + 商业双许可这种"祖传"模式 2026 年还在收钱——B 端付得起，OSS 又能引流

## 核心要点

DHTMLX Gantt 的设计可以拆成 **五层**：

1. **数据层**：`tasks` + `links`。task 字段比 Frappe 多得多——`type / parent / open / readonly / constraint_type / constraint_date` 等。link 字段含 `type: '0'|'1'|'2'|'3'`，对应 4 种依赖。

2. **渲染层（DIV/HTML）**：每个 task row 是绝对定位的 `<div>`，用 CSS transform 移动。**不是 SVG**——这点和 Frappe 反着来。原因：要支持万级任务时，DIV + 虚拟滚动只渲染视口内行；SVG 全量进 DOM 一定卡。

3. **smart rendering**：视口外的行不进 DOM，滚动时按需挂载/卸载。这是它能撑数千到上万 task 的核心。Frappe 没这层，所以千级即卡。

4. **扩展插件**：`critical_path` / `auto_scheduling` / `undo` / `keyboard_navigation` / `marker` / `tooltip` 都是按需加载的 extension（`gantt.plugins({...})`）。这种插件式让核心保持瘦，重功能按需付费。

5. **事件总线**：`gantt.attachEvent('onAfterTaskUpdate', (id, task) => save(task))`。和 Frappe 的 `on_date_change` 思路一致——库不直接改后端，业务自己存。

数据 → DIV 渲染 → smart rendering → 插件 → 事件，层层叠加。

## 实践案例

### 案例 1：4 种依赖关系（DHTMLX 标准版就有，Frappe 没有）

```js
gantt.parse({
  data: [
    { id: 1, text: '采购零件', start_date: '2026-06-01', duration: 3 },
    { id: 2, text: '装配',     start_date: '2026-06-04', duration: 5 },
    { id: 3, text: '测试',     start_date: '2026-06-09', duration: 2 }
  ],
  links: [
    { id: 1, source: 1, target: 2, type: '0' },   // FS：采购完才能装配
    { id: 2, source: 2, target: 3, type: '1' }    // SS：装配开始就同步开测试
  ]
})
```

`type: '0'` = finish-to-start，`'1'` = start-to-start，`'2'` = finish-to-finish，`'3'` = start-to-finish。**真实工程排期里 SS / FF 经常出现**——比如装配和测试可以并行启动，Frappe Gantt 表达不了，DHTMLX 标准版就够。

### 案例 2：关键路径（Pro）

```js
gantt.config.highlight_critical_path = true
gantt.init('gantt_here')
```

打开后红线会标出"哪条任务链决定整个项目工期"。算法是经典 CPM——把任务图按依赖拓扑排序，正向算最早开始 / 反向算最晚开始，差为零的就是关键路径上的任务。**这是 PM 软件的灵魂功能**——告诉项目经理"哪些任务延一天整个项目延一天"。Frappe 完全没有。

### 案例 3：工作日历跳周末

```js
gantt.config.work_time = true
gantt.setWorkTime({ day: 6, hours: false })   // 周六不上班
gantt.setWorkTime({ day: 0, hours: false })   // 周日不上班
gantt.setWorkTime({ date: new Date(2026, 9, 1), hours: false })  // 国庆放假
```

打开后**任务条自动跳过非工作日**——拖一个 5 天的任务跨周末，库会自动延伸到下周二而不是占进周六周日。建筑 / 制造 / 政府项目离不开这个。

## 踩过的坑

1. **DIV 路线 ≠ 任意大**：smart rendering 撑万级 task，但单屏可见行 > 几百仍卡。配合分组折叠（`open: false`）压可见行数。

2. **GPL 传染**：标准版 GPL 2.0 意味着引入它的项目源码也得 GPL 开源——这对闭源 SaaS 是雷。要用就得**买商业版或换库**。

3. **关键路径 / 资源视图都是 Pro**：开源版只够画图 + 4 种依赖，复杂排期算法都在收费包里。"我用开源版做企业排期"的想法多半到关键路径就走不下去。

4. **link type 用字符串 '0'-'3' 不是数字**：传 `type: 0` 会被当 falsy 忽略，依赖画不出来。这是社区 issue 区高频踩点。

5. **命令式 API + React/Vue 不太合**：它假设你 `gantt.init('#dom')` 然后调 `gantt.parse(data)` 改图。React 重渲染时容易把容器卸了，需要 `gantt-react-wrapper` 类适配层或 `useEffect` 守住生命周期。

## 适用 vs 不适用场景

**适用**：

- 企业级 PM / ERP / 工程项目排期（数千任务、多资源、关键路径必备）
- 想替代 MS Project 的 Web 端、需要导出 .mpp / .ics
- 预算里有商业版 license（个人 license $599 起、企业版每年几千刀）

**不适用**：

- 纯 OSS 项目（GPL 传染 / 商业版二选一，没第三条路）
- <100 任务且不需要资源/关键路径 → Frappe Gantt 200 行就够
- 已有 React/Vue 代码库且偏声明式 → 看 wx-react-gantt / gantt-task-react 或 bryntum 的 React 套件

## 历史小故事（可跳过）

- **2005**：DHTMLX 公司在白俄罗斯成立（XB Software 旗下），最初做 DHTMLX Suite——DataGrid / Tree / Layout 这些 jQuery 时代的 UI 组件包。
- **~2010**：单独切出 dhtmlxGantt 当独立产品，定 GPL + 商业双许可——同时期 ExtJS / Sencha 也是这个套路。
- **2015-2020**：陆续补 critical path / resource / auto scheduling 三大 Pro 模块，把"看起来像 MS Project"做扎实。
- **2026**：v9.1.4（2026-04-28），GitHub 镜像约 2k 星，但企业市场份额比 Frappe Gantt 高得多——开源星数和商业份额经常是两条线。

20 年下来证明：**双许可 + 企业功能放 Pro** 的模式在 B 端 PM 工具领域仍然能稳定收钱。

## 学到什么

1. **甘特图的难点不在画图，在排期算法**——关键路径 / 资源平衡 / 自动调度 / 工作日历，这四件才是企业版的护城河
2. **DIV 不是落后，是和 SVG/Canvas 三选一里的合理解**——虚拟滚动 + 事件 + a11y 三个需求叠起来 DIV 最省事
3. **插件式核心 + 重功能放扩展** 让免费版好用、付费版卖得动——这是开源商业化的经典分层
4. **GPL + 商业双许可** 在 2026 年仍然管用——B 端付得起钱、OSS 引流、避免被白嫖三件事一并解决

## 自检三问

读完这页，应该能答出：

- DHTMLX Gantt 标准版相比 Frappe Gantt 多了哪一类核心能力？（4 种依赖 / smart rendering / 命令式扩展插件）
- 它为什么选 DIV 不选 SVG？（虚拟滚动只渲染视口内行 + 原生事件 + a11y）
- Pro 才有哪三件 PM 灵魂功能？（关键路径 / 资源视图 / 自动调度，外加工作日历和基线）

## 延伸阅读

- 仓库：[DHTMLX/gantt](https://github.com/DHTMLX/gantt)（GPL 镜像，含 codebase/）
- 官方文档：[dhtmlx.com/docs/products/dhtmlxGantt](https://dhtmlx.com/docs/products/dhtmlxGantt/)（API + 在线 demo）
- 关键路径算法：[CPM Wikipedia](https://en.wikipedia.org/wiki/Critical_path_method)（懂这个再看 Pro 文档不迷路）
- [[frappe-gantt]] —— 200 行 SVG 极简版，对照看复杂度差一个数量级
- [[antv-g2]] —— 配置式语法图表库，对照看"专门切出甘特图"为何值得

## 关联

- [[frappe-gantt]] —— 同类极简对照组：SVG 200 行 vs DIV 数千行 + 插件
- [[antv-g2]] —— 通用图表语法库，凸显甘特图为何要单独做特化产品
- [[chartist]] —— SVG + 零依赖路线，进一步衬托 DIV + smart rendering 的取舍
- [[d3]] —— SVG 数据驱动祖师，DHTMLX 反向选了 DIV 路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
