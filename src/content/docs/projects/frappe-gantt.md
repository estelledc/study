---
title: Frappe Gantt — 200 行 SVG 写出的甘特图
来源: 'https://github.com/frappe/gantt'
日期: 2026-06-01
分类: 数据可视化
难度: 初级
---

## 是什么

Frappe Gantt 是一个**用 SVG 画甘特图、纯 vanilla JS、零依赖**的小库。日常类比：像一张可拖动的横向日历——每一根横条就是"这个任务从几号干到几号"，鼠标按住条子可以拖到新的日期，松手就改完了。

你写：

```js
new Gantt('#gantt', [
  { id: 't1', name: '写需求', start: '2026-06-01', end: '2026-06-05', progress: 50 },
  { id: 't2', name: '画原型', start: '2026-06-06', end: '2026-06-10', dependencies: 't1' }
])
```

10 行不到，一张能拖拽、能切日/周/月视图、能画依赖箭头的甘特图就出来了。早期版本常被说成「核心 SVG 渲染大约 200 行」——指的是 Bar/Arrow/网格那一层几何逻辑，不是今天整个仓库的行数；仍是入门「甘特图数据结构」很干净的样本。

## 为什么重要

不理解 Frappe Gantt 的设计，下面这些事都没法解释：

- 为什么甘特图核心数据只是 `{start, end, progress, dependencies}` 四个字段，但能撑起整个项目管理软件——因为时间区间 + 依赖图就是项目的本质
- 为什么 ERPNext 母公司要自研而不用 DHTMLX——商业版每年几千美元，开源 SaaS 装不起
- 为什么甘特图选 SVG 不选 Canvas——任务条要能 hover/拖/加 aria-label，DOM 节点天生支持
- 为什么早期核心能压得很短——日期计算 + 矩形定位 + 依赖路径，本质都是简单几何

## 核心要点

Frappe Gantt 的设计可以拆成 **四个组件**：

1. **Task 数据结构**：`{id, name, start, end, progress, dependencies}`。类比：每个任务就是日历上的一段彩条 + 一个完成度百分比。`dependencies` 是字符串列表，指向其他任务的 id。

2. **Bar 类**：把一个 Task 渲染成 SVG `<rect>` + 进度条 + 文字标签。类比：把日历彩条画到屏幕上的那一支笔。Bar 还接管 mousedown/mousemove，把拖拽位移翻译成新的 `start/end`。

3. **Arrow 类**：根据 `dependencies` 在两个 Bar 之间画 SVG `<path>`，画的是"先做完 A 才能开始 B"的折线箭头。类比：连连看里把两张牌连起来的那条折线。

4. **view modes**：默认常见 Day / Week / Month / Year；旧版还带 Quarter Day / Half Day，也可经 `view_modes` 自定义。类比：地图的缩放层级——一格代表 6 小时还是 1 个月，整张图横向密度跟着变。

四件加起来叫 **数据 → 几何 → SVG**，每一步都不绕弯。

## 实践案例

### 案例 1：5 分钟最小起手式

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/frappe-gantt/dist/frappe-gantt.css">
<div id="gantt"></div>
<script type="module">
  import Gantt from 'https://cdn.jsdelivr.net/npm/frappe-gantt/+esm'
  const tasks = [
    { id: 't1', name: '写需求', start: '2026-06-01', end: '2026-06-05', progress: 50 },
    { id: 't2', name: '画原型', start: '2026-06-06', end: '2026-06-10', dependencies: 't1', progress: 0 }
  ]
  new Gantt('#gantt', tasks, { view_mode: 'Day' })
</script>
```

容器用普通 `<div>` 即可——库会在内部 `createSVG` 挂上根 SVG；你也可以直接传已有的 `<svg>`，但不是硬性要求。任务条仍是 SVG 子节点，dev tools 里能选中独立的 `<rect>`。

### 案例 2：拖拽改期回写后端

```js
new Gantt('#gantt', tasks, {
  on_date_change: (task, start, end) => {
    fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ start, end })
    })
  },
  on_progress_change: (task, progress) => { /* 同上 */ }
})
```

库本身只管"拖完之后通知你"，**不直接改数据**。这种"事件外置 + 业务自己存"的设计让它能塞进任何后端栈——REST、GraphQL、WebSocket 都行。

### 案例 3：切换视图模式

```js
const gantt = new Gantt('#gantt', tasks, { view_mode: 'Week' })
document.getElementById('btn-month').onclick = () => gantt.change_view_mode('Month')
```

view mode 切换时，库内部会重新算 "一格代表多长时间" + "总宽度" + "每个 bar 的 x/width"，不用你手动重画。从 Day 切到 Month，1 个月的任务从 30 格压到 1 格。

## 踩过的坑

1. **千级任务会卡**：每个任务是一个 SVG `<g>` 含 rect/text/progress，1000 任务就是 3000+ 节点，浏览器重排会肉眼可见地慢。这是 SVG 路线天生的天花板（同 Chartist）。

2. **依赖箭头只支持 finish-to-start**：MS Project 有 4 种依赖（FS/SS/FF/SF），Frappe Gantt 只画"前一个完成才能开始下一个"。要全 4 种得自己改源码或换商业版。

3. **日期格式必须是 'YYYY-MM-DD' 字符串或 Date 对象**：传 ISO 字符串带时区会被截掉，跨时区项目要在传入前统一转本地。

4. **没有内置撤销**：拖拽改期后没有 Ctrl+Z，业务层自己存一个 "上一次 tasks" 快照。

5. **v0.x 与 v1.x API 有变**：v0 是 `new Gantt('#gantt', tasks, options)` 的全局类；新版换 ESM `import Gantt from 'frappe-gantt'`。看到老教程不带 import 先核版本。

## 适用 vs 不适用场景

**适用**：

- 中小型 SaaS / 内部工具的项目甘特视图（百级任务）
- 教学场景——200 行核心源码读完就懂"甘特图怎么实现"
- ERPNext / Frappe 系产品（母公司自己用）
- 不想引入 React/Vue 框架但要拖拽编辑——它就是 vanilla JS

**不适用**：

- 千级以上任务量 → 走 Canvas 派（dhtmlx-gantt 商业版 / bryntum）或 WebGL
- 需要资源视图（人 × 任务矩阵）→ 必须商业版甘特
- 需要 4 种依赖关系、关键路径、基线对比 → 商业版功能
- 已用 React 且偏好声明式 → 看 `wx-react-gantt` / `gantt-task-react`

## 历史小故事（可跳过）

- **2016 年**：仓库在 GitHub 创建（2016-08）；Frappe / ERPNext 团队为项目模块自研甘特，替代老旧 jQuery 方案。
- **2017-2020 年**：开源后挂在 awesome-erpnext 一类清单，主打「零依赖 + 小核心」；星数逐步涨到数千。
- **2021-2023 年**：v0.6 一带齐 view modes，后续版本加强 popup / ESM；社区 PR 节奏不快但稳。
- **现在**：星数约 **6k** 量级，仍由 ERPNext 内部需求驱动迭代，也被很多教学/小工具当成「甘特图入门样本」。

证明：**为自己产品造一个轮子顺便开源**，可以同时养活产品和社区。

## 学到什么

1. **甘特图的本质就是时间轴 + 任务区间 + 依赖图**——`{start, end, dependencies}` 三个字段撑起整个范畴
2. **数据 → 几何 → SVG** 是清晰的三层——读 source 时按这个顺序跟踪，不会迷路
3. **事件外置（on_date_change 回调）** 让库脱离任何后端栈——这是开源库渗透到不同技术栈的关键设计模式
4. **SVG 优先 + 小核心渲染** 证明：项目管理 UI 不必复杂——选对数据结构后，渲染就是几何题

## 自检三问

读完这页，应该能答出：

- 一个 Task 至少要哪几个字段才能在甘特图里画出来？（id/name/start/end/progress/dependencies）
- 为什么 Frappe Gantt 选 SVG 不选 Canvas？（任务条要能 hover/拖/加 aria-label，DOM 节点天生支持）
- view mode 切换时库内部做了什么？（重算"一格代表多长时间" + 总宽度 + 每个 bar 的 x/width）

## 延伸阅读

- 仓库：[frappe/gantt](https://github.com/frappe/gantt)（README 自带 demo gif）
- 在线 demo：[Frappe Gantt Demo](https://frappe.github.io/gantt/)（拖一下任务条直观感受）
- 母公司产品：[ERPNext](https://github.com/frappe/erpnext)（看真实业务怎么用甘特）
- [[chartist]] —— 同样 SVG + 零依赖路线，对照看"图表"和"甘特图"两种可视化定位
- [[d3]] —— SVG 数据驱动祖师，Frappe Gantt 是更专一的甘特图特化版

## 关联

- [[chartist]] —— 同 SVG + 零依赖派，但目标是通用图表
- [[d3]] —— SVG + 数据驱动祖师，Frappe Gantt 算它的甘特图垂直简化版
- [[antv-g2]] —— 配置式语法图表库，对照看"甘特图"为何值得专门切出来
- [[recharts]] —— React 声明式 + SVG，思路上与 Frappe Gantt 互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
