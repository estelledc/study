---
title: Recharts — 用 JSX 直接拼出图表的 React 组件库
来源: 'https://github.com/recharts/recharts'
日期: 2026-05-30
分类: 数据可视化
难度: 初级
---

## 是什么

Recharts 是一个**让你用 React 组件拼图表**的库。日常类比：像搭乐高积木——你不画图、也不写画图配方，就把"折线"、"坐标轴"、"提示框"这些零件按需拼起来，图就出来了。

你写：

```jsx
<LineChart data={data} width={600} height={300}>
  <XAxis dataKey="name" />
  <YAxis />
  <Tooltip />
  <Line dataKey="pv" stroke="#8884d8" />
</LineChart>
```

5 分钟，一条折线就上线。Recharts 内部把 d3（业内最强的"算图表数学"的库）包装成 React 组件，你只需懂 JSX，不需懂 d3。

## 为什么重要

不理解 Recharts 的设计，下面这些事都没法解释：

- 为什么很多 React 后台管理项目默认选它（Twitch / Cloudflare 等 dashboard 常见）
- 为什么 ECharts 性能更好但 React 项目还是优先选它——因为"用 props 改图"比"改 option 对象"更 React
- 为什么自定义 Tooltip 常常是接入后的第一件事——默认样式停留在 2016 年
- 为什么数据点超过 10k 就卡——SVG 每个点都是 DOM，是天花板不是 bug

## 核心要点

Recharts 的设计可以拆成 **三层组件**：

1. **顶层 Container**：`<LineChart>` `<BarChart>` `<PieChart>` `<ComposedChart>` 等十余种，是用户最先写的"图表容器"。类比：你选一个"饭盒"——决定要装的是折线、柱状还是饼图。

2. **画数据的 Series**：`<Line>` `<Bar>` `<Area>` 等，必须放在 Container 里。每个 Series 必带一个 `dataKey` prop，告诉库"从 data 数组的每个对象里取哪个字段"。类比：饭盒里放的"菜"——一份饭盒可以放多道菜（多条线）。

3. **辅助 Helper**：`<XAxis>` `<YAxis>` `<Tooltip>` `<Legend>` `<CartesianGrid>` 等，跨图表共享。它们之间通过 React Context 通信，所以位置写哪都行。类比：餐桌上的"调料和餐巾"——给所有菜共用。

三层加起来叫 **declarative API**——你描述想要什么，库决定怎么画。

## 实践案例

### 案例 1：5 分钟最小起手式

```jsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Mon', pv: 400 },
  { name: 'Tue', pv: 300 },
  { name: 'Wed', pv: 600 },
];

export default function MyChart() {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="pv" stroke="#8884d8" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**逐部分解释**：`ResponsiveContainer` 让图自动占满父容器宽度；`dataKey="name"` 告诉 X 轴从每条数据取 `name` 字段；`<Line dataKey="pv">` 折线取 `pv` 字段。这就是公开 API 的 80%。

### 案例 2：自定义 Tooltip（接入后常做的第一件事）

先写好自己的组件，再塞进 `content`：

```jsx
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white shadow rounded p-2 border">
      <p className="font-bold">{label}</p>
      {payload.map(p => <p key={p.name}>{p.name}: {p.value}</p>)}
    </div>
  );
}

// 用在图表里：
<Tooltip content={<CustomTooltip />} />
```

库把 `active`（鼠标是否悬浮中）、`payload`（当前数据点）、`label`（X 轴值）注入你的组件，你自己决定怎么渲染。

### 案例 3：双 Y 轴（ComposedChart 的杀手场景）

```jsx
<ComposedChart data={data}>
  <XAxis dataKey="name" />
  <YAxis yAxisId="left" />
  <YAxis yAxisId="right" orientation="right" />
  <Bar yAxisId="left" dataKey="pv" fill="#8884d8" />
  <Line yAxisId="right" type="monotone" dataKey="uv" stroke="#82ca9d" />
</ComposedChart>
```

`yAxisId` 是字符串 ID，让两套 Y 轴和不同 Series 配对——左 Y 轴是访客数（柱），右 Y 轴是停留时长（折线）。这是 Recharts 处理多坐标轴的核心约定。

## 踩过的坑

1. **ResponsiveContainer 在 flex 父容器里高度坍缩到 0**——图表直接消失。原因是 ResizeObserver 报回 height=0；workaround 是给 wrapper 加 `min-height: 300px`。

2. **>10k 点首屏卡顿**——SVG 每个点都是 DOM 节点，没有像 react-window 那样的虚拟列表机制。业务层必须先做 down-sampling（10k 抽到 1k）再喂给库。

3. **默认 Tooltip 样式过时**——白底黑字 + 1px 灰边框是 2016 年 Material Design 风。几乎所有生产项目第一件事就是写自定义 `content` 替换。

4. **大数据集首屏闪烁**——5000 点折线图从 0 长到完整需要 1.5s，前 200ms 看着像空白。解决：`<Line isAnimationActive={false}>` 关掉初始动画。

## 适用 vs 不适用场景

**适用**：
- React 项目里画后台管理 / BI 报表 / 简单 dashboard
- 数据点 < 5000、要求 5 分钟出图
- 团队不懂 d3，但都熟 React props 模型
- SSR 友好（Next.js / Remix 服务端能直接 renderToString 输出 SVG）

**不适用**：
- 数据点 > 10k 的大屏可视化 → 用 ECharts（Canvas + WebGL）
- 想做复杂的自定义可视化（自定义 marker / 联动动画）→ 用 visx 或直接 d3
- 非 React 框架（Vue / Angular / Svelte）→ 没有移植，用 ECharts 的 wrapper
- 3D / 地理 / 科学绘图 → 用 Plotly / deck.gl

## 历史小故事（可跳过）

- **2016 年**：Recharts v0.1 开源，定位 "React 时代的 Chart.js 替代品"，第一次把 "JSX 即图表" 做成范式
- **2018 年**：v1 稳定，社区开始大规模采用，Twitch / Cloudflare 的 dashboard 都在用
- **2020 年**：v2 强化 TypeScript，`dataKey` 等字段类型推断更严（写错 key 编译期就报错）
- **2024 年**：v3 发布，状态管理重写，动画内联进库并移除 `react-smooth` 依赖（后续 3.x 再增强动画定制）
- **现在**：约 27k stars，社区维护（无单一商业公司背书），稳定版在 3.9.x 线迭代

后来 visx（Airbnb，更底层）和 Nivo（更全套）出来分流复杂场景，但 Recharts 仍是 React 入门图表库的默认选择。

## 学到什么

1. **declarative API 的本质 = 用 React children 当 DSL**——不发明新配置语言，把 JSX 子组件当 grammar，是 React 生态最自然的扩展方式
2. **抽象的代价是 escape hatch 难做**——库把 d3 包成黑盒，用户想绕过去自己用 d3 几乎没办法，复杂自定义只能转 visx
3. **性能优化总滞后于 API 设计**——v1 完全不考虑 reconciliation 成本，每次 hover 重渲染整棵子树，v2.10+ 才补上 React.memo
4. **跨框架移植难度 = API 跟框架特性的耦合度**——Recharts 深度依赖 React Children + Context，没法移植 Vue；ECharts 是 vanilla JS，所以各框架 wrapper 都很薄

## 延伸阅读

- 主仓库 + README：[recharts/recharts](https://github.com/recharts/recharts)
- 官方文档 + 示例画廊：[recharts.org](https://recharts.org/)
- 视频入门：[Recharts Crash Course (Codevolution)](https://www.youtube.com/results?search_query=recharts+crash+course)（30 分钟过完所有 API）
- [[d3]] —— Recharts 的数学引擎，所有 scale / shape 都是 d3 子包
- [[visx]] —— Airbnb 的更底层 React 可视化原语，复杂场景的下一站
- [[echarts]] —— option-driven 的图表库代表，Recharts 的"对面那条路"

## 关联

- [[d3]] —— Recharts 把它的 scale / shape 包成 React 组件，自己不算图表数学
- [[echarts]] —— declarative JSX vs option 对象，是 React 时代图表库的两条主路线
- [[visx]] —— framework vs library 的分歧——Recharts 给开箱组件，visx 给原语
- [[react-spring]] —— 主流 React 动画库；Recharts 早期用自家 react-smooth，v3 起动画内联进库
- [[observable-plot]] —— Observable 团队的图表新作，bundle 更小但生态规模小

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[amcharts5]] —— amCharts 5 — TypeScript 重写的商业级图表库
- [[antv-f2]] —— AntV F2 — 移动端 Canvas 图表，G2 同语法的轻量子集
- [[antv-g2]] —— AntV G2 — 把 Grammar of Graphics 写成 JavaScript
- [[antv-g6]] —— AntV G6 — 把"关系数据"画成会自己摆位置的图
- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[billboard-js]] —— billboard.js — c3.js 的 TypeScript 继任者
- [[chart-js]] —— Chart.js — Canvas 渲染入门级图表
- [[chartist]] —— Chartist — 极简 SVG 图表
- [[frappe-gantt]] —— Frappe Gantt — 200 行 SVG 写出的甘特图
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[plotly-js]] —— Plotly.js — 一个 JSON 描述任何图表的浏览器全家桶
- [[vega]] —— Vega — 整张图就是一棵 JSON
- [[visx]] —— visx — 把 d3 拆成 30 块乐高的 React 可视化原语
