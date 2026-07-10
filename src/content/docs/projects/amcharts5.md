---
title: amCharts 5 — TypeScript 重写的商业级图表库
来源: 'amCharts 官网与 GitHub 仓库, https://www.amcharts.com/ + https://github.com/amcharts/amcharts5'
日期: 2026-05-31
分类: projects / 数据可视化
难度: 中级
---

## 是什么

amCharts 5 是一个**商业级 JavaScript 图表库**，用 TypeScript 从零重写。日常类比：像一家"高级西餐厅"——菜单覆盖 100 多道菜（折线/柱/饼/雷达/桑基/树图/股票 K 线/世界地图……），每一道都摆盘讲究、动画连贯，但端上桌时盘子边缘印着餐厅 logo——想撕掉得另付费。

它和前面看过的 [echarts](./echarts) / [chart-js](./chart-js) / [chartist](./chartist) 同属"声明式图表库"家族，但定位偏精致动画与商业场景：金融 K 线、地图钻取、品牌仪表盘。

GitHub 约 1.1k stars，看起来不大；真实使用量在 npm 下载和企业内嵌里——这是一个"低社区声量、高商业渗透"的库。

## 为什么重要

不理解 amCharts 5 的设计取舍，下面这些事都没法解释：

- 为什么开源 Apache 2.0 协议，运行时却**强制显示 logo**——开源核心 + 商业徽标是怎么共存的
- 为什么 Bloomberg 风格的股票看盘界面（K 线 + 成交量 + 50 多种技术指标 + 画线工具）能用一个 `XYStockChart` 直接拼出来
- 为什么世界地图能"点中国进省份"再"点广东进城市"，背后是什么数据格式
- 为什么 v4 项目升 v5 几乎要重写——三次大改（v3/v4/v5）的库怎么处理向后兼容

## 核心要点

amCharts 5 的所有 API 表面可以归到 **3 个核心抽象**：

1. **Root（画布根）**：每张图都从 `am5.Root.new(div)` 开始。Root 持有渲染上下文（Canvas 或 SVG）、主题列表、动画时钟。一个页面 N 张图就 N 个 Root。

2. **Chart（图表实例）**：挂在 Root 下面。常见有 `XYChart`（直角坐标，覆盖折线/柱/散点/区域）、`PieChart`、`MapChart`、`XYStockChart`（股票专用）、`Sankey`、`Hierarchy`（树/旭日/打包圆）。

3. **Sprite（万物之源）**：所有可视对象——轴、Tooltip、图例、标签、甚至一根折线——都继承自 `Sprite`。Sprite 自带 **states**（normal / hover / active / disabled，鼠标悬停切状态）和 **themes**（外部规则批量改属性）两个钩子。

把这三层搞清楚，剩下的都是查文档调参。

## 实践案例

### 案例 1：3 层 API 拼一张折线图

```ts
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";

const root = am5.Root.new("chartdiv");
root.setThemes([am5themes_Animated.new(root)]);

const chart = root.container.children.push(
  am5xy.XYChart.new(root, { panX: true, panY: true, wheelX: "panX" })
);
const xAxis = chart.xAxes.push(am5xy.DateAxis.new(root, { baseInterval: { timeUnit: "day", count: 1 }, renderer: am5xy.AxisRendererX.new(root, {}) }));
const yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, { renderer: am5xy.AxisRendererY.new(root, {}) }));
const series = chart.series.push(am5xy.LineSeries.new(root, { xAxis, yAxis, valueXField: "date", valueYField: "value" }));
series.data.setAll([{ date: 1700000000000, value: 10 }, { date: 1700086400000, value: 23 }]);
```

注意三层结构：`Root → Chart → Series/Axis`。每一层都用 `Class.new(parent, config)` 创建，没有 jQuery 风格链式，全是显式构造。

### 案例 2：主题系统怎么让动画"全图表协调"

```ts
root.setThemes([am5themes_Animated.new(root), am5themes_Dark.new(root)]);
```

一行代码切夜间 + 动画。原理：Theme 内部是一组 `rule(类型, 标签).set(属性, 值)` 调用，在 Sprite 创建时被注入。换主题相当于换一组规则。

对比 ECharts 的主题——ECharts 主题是一个 JSON 字典，浅合并到 option；amCharts 主题是程序对象，能根据图表类型 / 状态 / 嵌套层级**条件性**赋值，更细。

### 案例 3：股票图一行换出 Bloomberg 工具栏

```ts
const chart = root.container.children.push(am5stock.StockChart.new(root, {}));
const mainPanel = chart.panels.push(am5stock.StockPanel.new(root, {}));
const valueSeries = mainPanel.series.push(am5xy.CandlestickSeries.new(root, { /* ... */ }));
chart.set("stockSeries", valueSeries);
am5stock.IndicatorControl.new(root, { stockChart: chart, legend: legend });
am5stock.DrawingControl.new(root, { stockChart: chart });
```

`IndicatorControl` 自动加一个下拉菜单，里面 50+ 技术指标（MA / MACD / RSI / Bollinger / Ichimoku 等）一键叠加；`DrawingControl` 给一套画线工具（趋势线 / 斐波那契回调 / Gann 扇）。这套封装是 amCharts 在金融场景的杀手锏。

### 案例 4：地图钻取的 TopoJSON 数据流

```ts
import am5geodata_worldLow from "@amcharts/amcharts5-geodata/worldLow";
const polygonSeries = chart.series.push(
  am5map.MapPolygonSeries.new(root, { geoJSON: am5geodata_worldLow })
);
polygonSeries.mapPolygons.template.events.on("click", (ev) => {
  const id = ev.target.dataItem?.dataContext?.id; // "CN", "US"...
  loadCountryGeoJSON(id);
});
```

世界地图打包在 `@amcharts/amcharts5-geodata` 单独包，按需 import，省 bundle。点击国家拿到 ISO 代码，再异步加载省份级 GeoJSON——钻取就是这种**事件 + 替换数据源**的组合，不是黑魔法。

## 踩过的坑

1. **logo 移除要付费**：开源协议是 Apache 2.0，但运行时角落有 amCharts logo + 链接，**不付商业 license 改不掉**（代码里有运行时校验）。个人开源项目不愿付费就别用，会显得不专业。

2. **v4 → v5 不是升级是重写**：API 完全换了名字（`am4core.create` → `am5.Root.new`），series 注册方式、主题、事件全变。v4 项目升 v5 等于重写图表层。

3. **bundle 大小看似小实则膨胀快**：基础 XY 折线包约 150KB；加 Animated 主题 + Stock 模块 + 地图 geodata，轻松到 700KB+。tree-shaking 帮你省的是"没用到的图表类型"，不是"用到的图表里没用到的功能"。

4. **TypeScript 类型严格但报错难懂**：`Class.new(root, config)` 里 config 类型是 `ISettings`，深嵌套，写错一个键会冒出 200 行类型错误。新手常被劝退。

5. **中文社区几乎为零**：百度搜不到几篇靠谱中文教程，遇坑只能去官方论坛或 GitHub Issues 啃英文。

## 适用 vs 不适用场景

**适用**：
- 金融 / 股票 / 交易类应用——需要 Bloomberg 风格 K 线 + 技术指标 + 画线工具
- 地图可视化 + 主题切换——需要球面投影、钻取、热力填色
- 公司 BI / 仪表盘——愿意付商业 license 换精致动画 + 品牌一致

**不适用**：
- 个人开源 / 学生项目——不想带 logo 又不愿付费 → 用 [echarts](./echarts) 或 [chart-js](./chart-js)
- 极致定制（艺术化可视化）→ 用 [d3](./d3)
- 极小 bundle（嵌入 widget / 邮件预览）→ 用 [chartist](./chartist) 或 uPlot
- 国内项目优先生态对齐 → ECharts 中文社区压倒性优势

## 历史小故事（可跳过）

- **2004 年**：拉脱维亚里加的 amCharts 公司起家做 Flash 图表，给企业卖商业 license
- **2012 年**：Flash 衰落，发布 amCharts 3（jQuery + SVG）
- **2018 年**：amCharts 4 用 TypeScript + Canvas/SVG 双渲染，但代码里仍混了 JS
- **2021 年**：amCharts 5 全量 TypeScript 重写，引入 Sprite 统一对象模型 + 主题系统 + ES module tree-shaking

20 年来公司一直走"开源核心 + 移除 logo 收费"路线，没融资，没 IPO，靠 license 收入活到今天——一种少见的可持续开源商业模式。

## 学到什么

1. **Sprite 统一对象模型**：把"轴/标签/系列/Tooltip"全部塞进一棵继承树，是把 100+ 图表 API 表面收敛的关键设计——和 [echarts](./echarts) 用 option JSON 收敛完全是另一条路
2. **主题作为程序对象**：比 JSON 主题灵活得多，能条件赋值；代价是用户需要懂主题代码而非改 JSON
3. **开源协议 vs 商业徽标**：Apache 2.0 不阻止运行时 logo——协议管"代码能不能用"，不管"用了之后界面长什么样"。这是商业开源的常见操作
4. **重写比兼容更便宜**：amCharts 三次大改都不向后兼容，省了维护两套 API 的成本——小团队商业库的现实选择

## 延伸阅读

- 官方文档：[amCharts 5 Docs](https://www.amcharts.com/docs/v5/) — 入口结构清晰，按 Chart 类型分章
- Stock 模块教程：[Stock Chart Tutorial](https://www.amcharts.com/docs/v5/charts/stock/) — 看 Bloomberg 风格怎么搭出来
- 主题源码：[GitHub themes 目录](https://github.com/amcharts/amcharts5/tree/master/src/.internal/themes) — 主题作为代码长什么样
- 地图数据：[amcharts5-geodata](https://github.com/amcharts/amcharts5-geodata) — 200+ 国家 TopoJSON 怎么打包

## 关联

- [[echarts]] —— 同为声明式图表库，对比设计哲学（Sprite vs option JSON）
- [[chart-js]] —— 更轻量的 Canvas 库，定位个人项目
- [[chartist]] —— 极简 SVG 库，bundle 极小但功能少
- [[d3]] —— 底层"乐高"，amCharts 是"成品菜"
- [[plotly-js]] —— 同样商业级图表库，定位科学绘图
- [[recharts]] —— React 生态声明式图表，更轻

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
