---
title: Vega — 整张图就是一棵 JSON
来源: 'https://github.com/vega/vega'
日期: 2026-05-31
分类: 数据可视化
难度: 中级
---

## 是什么

Vega 是一个**用 JSON 描述图表**的可视化系统。你不写画图代码，你写一份"规格说明"——告诉它"数据在这里、横轴接这一列、纵轴接那一列、画成圆点"——它自己读这份 JSON、自己渲染出 SVG 或 Canvas。日常类比：像点装修——你提交一份"客厅要北欧风、白墙、原木家具"的需求清单，施工队读完自己装；你不需要去搬砖也不用挑哪块砖摆哪。

它由 University of Washington 的 Interactive Data Lab（Jeffrey Heer 团队）2013 年启动，是 grammar of graphics 在 JS 世界里**最学术**的一支——背后有 Reactive Vega（InfoVis/TVCG 2015–2016）与 Vega-Lite（InfoVis 2016 Best Paper）两篇高引论文，不是"先做后想"的产品，是"先想清楚再做"的研究系统。

```json
{
  "data": {"values": [{"x": 1, "y": 2}, {"x": 2, "y": 5}]},
  "mark": "circle",
  "encoding": {"x": {"field": "x"}, "y": {"field": "y"}}
}
```

四行 JSON → 一张完整散点图。这是 Vega-Lite（Vega 的高阶简写）；底层 Vega 更冗长但表达力也更全。

## 为什么重要

不理解 Vega，下面这些事都没法解释：

- 为什么 Python 数据科学界主流可视化库 Altair 不画图、只**生成 JSON**——它生成的就是 Vega-Lite spec，再交给 Vega 渲染
- 为什么 Kibana / Jupyter / VS Code Notebook **直接内置** Vega 渲染器——JSON 可以序列化、可以缓存、可以跨进程传
- 为什么 LLM 让"画一个 X vs Y 的散点图"在 ChatGPT 里能直接出图——背后输出的格式就是 Vega-Lite JSON
- 为什么 [[observable-plot]] 在 2021 年才出现——Plot 借鉴了 Vega-Lite 思想但选择了"代码不是 JSON"的路线

## 核心要点

Vega 的整张 spec 折叠成 **五个概念**：

1. **Data（数据源）**：从 URL 拉、内联写、或者从另一个数据集派生。类比：菜的食材，可以现买可以从冰箱拿。

2. **Transform（变换）**：在数据进 mark 前加工——filter / aggregate / bin / stack / window。类比：洗菜切菜腌制，是上锅前的所有步骤。

3. **Scale（尺度）**：把数据值（数字 / 字符串 / 日期）转成屏幕坐标 / 颜色 / 大小。Vega **从数据类型自动推**（连续数字 → 线性轴，日期 → 时间轴，字符串 → 类别轴）。

4. **Mark（图元）**：你想画什么形状——rect / circle / line / area / text / path。类比：菜单上的菜名。

5. **Signal（信号）**：响应式的命名变量，承载交互。鼠标位置、当前选中的类别、缩放比例都是 signal；signal 变了，依赖它的 scale / mark 自动重算。类比：电子表格的单元格，A1 改了 B1 的公式自己跟着算。

前四个是静态图表，加上第五个就是交互系统。Vega 把"画图"和"交互"用同一种 JSON 语法捏到了一起。

## 实践案例

### 案例 1：Vega-Lite 的简洁 vs Vega 的完整

同一张柱状图，Vega-Lite 版：

```json
{
  "data": {"values": [{"a": "A", "b": 28}, {"a": "B", "b": 55}]},
  "mark": "bar",
  "encoding": {"x": {"field": "a"}, "y": {"field": "b"}}
}
```

Vega 版（编译器吐出的等价骨架，字段写全一点方便对照）：

```json
{
  "data": [{"name": "table", "values": [{"a": "A", "b": 28}]}],
  "scales": [
    {"name": "xscale", "type": "band", "domain": {"data": "table", "field": "a"}, "range": "width"},
    {"name": "yscale", "type": "linear", "domain": {"data": "table", "field": "b"}, "range": "height"}
  ],
  "axes": [{"orient": "bottom", "scale": "xscale"}, {"orient": "left", "scale": "yscale"}],
  "marks": [{
    "type": "rect", "from": {"data": "table"},
    "encode": {"enter": {"x": {"scale": "xscale", "field": "a"}, "y": {"scale": "yscale", "field": "b"}}}
  }]
}
```

对照：Vega-Lite 的 `encoding.x/y` 被拆成 **scale + axis + mark.encode** 三块。**为什么留两层**：Lite 给人写，Vega 给工具生成；底层更显式、更可程序化构造。

### 案例 2：Signal 让交互成为 spec 的一部分

```json
{
  "signals": [
    {"name": "hover", "value": null,
     "on": [{"events": "rect:mouseover", "update": "datum.category"}]}
  ],
  "marks": [{
    "type": "rect",
    "encode": {
      "update": {"fill": {"signal": "datum.category === hover ? 'red' : 'gray'"}}
    }
  }]
}
```

`hover` 是一个 signal，鼠标移到柱子上时记录当前类别名；然后柱子的填色用一句 `signal` 表达式判断"我是不是当前 hover 的那个"。**没有写一行 JS 事件监听**，整个交互是声明的。

### 案例 3：Altair（Python）→ Vega-Lite JSON

```python
import altair as alt
# diamonds 换成任意 DataFrame 即可（列名对上就行）
chart = alt.Chart(diamonds).mark_circle().encode(
    x="carat", y="price", color="cut"
)
chart.to_json()  # 吐一份 Vega-Lite spec
```

Altair 本身**不画一个像素**，它只是把 Python 链式调用翻译成 Vega-Lite JSON，再交给 Vega 渲染器。这是"Python 数据栈 + JS 可视化栈"用 JSON 当 ABI（两边都能读的中间格式）的标准模式。

## 踩过的坑

1. **JSON 冗长**：手写底层 Vega spec 30 行起步，比 D3 还啰嗦。日常画图请用 Vega-Lite；只有需要 Vega-Lite 表达不出的（自定义 scale 组合 / 复杂 signal 网络）才下沉到 Vega。

2. **Signal 依赖排错难**：signal 之间可以互相引用，形成响应式图。一个 signal 没更新，可能要追三层"谁监听了谁"。Vega 提供了 dataflow 调试视图但门槛高。

3. **性能上限和 [[observable-plot]] 类似**：默认 SVG 渲染，>10k 数据点开始卡。Canvas 后端有但只覆盖核心 marks，不全。大数据请用 [[d3]] + Canvas 或 deck.gl。

4. **"声明式纯净"是双刃剑**：好处是 spec 可序列化、可被工具生成；坏处是想插一段命令式逻辑（比如"鼠标点击时弹个自定义 modal"）必须借宿主 JS——Vega 内部没有逃生舱口。

## 适用 vs 不适用场景

**适用**：
- 工具 / 编译器 / LLM **生成图表**——JSON 可以模板化、可以序列化、可以跨语言
- Notebook 渲染器内嵌（Jupyter / VS Code / Observable）
- BI / 报表系统底层（Kibana 内置 Vega 面板；Hex 等 notebook BI 也常嵌 Vega 渲染）
- Python 数据科学走 Altair → Vega-Lite → Vega 这条链
- 学术可视化原型——配套论文、可复现 spec

**不适用**：
- 日常**手写**画图 → 用 [[observable-plot]] / [[echarts]] / [[chart-js]]
- 大数据 / >10k 点流畅交互 → 用 [[d3]] + Canvas，或 deck.gl
- React 组件式 API → 用 [[recharts]] / [[visx]]
- 需要插命令式逻辑的高度定制图 → 用 [[d3]]

## 历史小故事（可跳过）

- **1999 年**：Leland Wilkinson 出版《The Grammar of Graphics》，提出"图表是一种语法"。
- **2005 年**：Hadley Wickham 在 R 实现 ggplot2，让 grammar of graphics 走进数据科学日常。
- **2009 年**：Mike Bostock 在 UW IDL 做 Protovis（D3 前身），把 grammar 思想搬进 JS。
- **2011 年**：Bostock 离开 UW 做 [[d3]]，选择"低层武器"路线。
- **2013 年**：Heer 团队启动 Vega，做"声明式 JSON 版的 Protovis"。
- **2015–2016 年**：Reactive Vega 论文（InfoVis/TVCG）把交互做成 dataflow；同年 Vega-Lite 拿 InfoVis 最佳论文，定义统计图简化语法。
- **2018 年**：Altair（Python）成为 Vega-Lite 主流入口，Python 数据科学界默认可视化栈之一。
- **2021 年**：[[observable-plot]] 出现，借鉴 Vega-Lite 思想但回到 JS API 路线，分流但理念近。

## 学到什么

1. **"图表 = JSON" 的 ABI 价值**：让 Python / R / JS / LLM 可以**共享同一份图**——这是 Vega 在工程上比 Plot 更深远的影响
2. **声明式 + 响应式**双底座：grammar 解决"画什么"，signal 解决"动什么"，两者都用 JSON 表达
3. **学术系统的工程影响**：UW IDL 一篇论文 → 一个研究原型 → Altair / Kibana / Jupyter 全采用，是"研究反哺工业"的样本
4. **多层 API 是策略不是冗余**：Vega-Lite（人写）+ Vega（机器生成）+ D3（底层）三层叠加，目标用户错位但底座共享

## 延伸阅读

- 官方文档：[vega.github.io/vega](https://vega.github.io/vega/)（含 350+ 示例 spec 可改可跑）
- 入门首选：[vega.github.io/vega-lite](https://vega.github.io/vega-lite/)（先学这个再下沉到 Vega）
- 论文：[Reactive Vega (IEEE InfoVis 2015)](http://idl.cs.washington.edu/papers/reactive-vega-architecture)（Heer 团队亲自写架构）
- 论文：[Vega-Lite (IEEE InfoVis 2016 Best Paper)](http://idl.cs.washington.edu/papers/vega-lite)（统计图简化语法的设计动机）
- Python 入口：[altair-viz.github.io](https://altair-viz.github.io/)（Python 数据栈用 Vega-Lite 的标准方式）

## 关联

- [[observable-plot]] —— 同一套 grammar of graphics 思想，JS API 路线（vs Vega 的 JSON 路线）
- [[d3]] —— 底层武器，Vega 内部很多渲染细节复用 D3 模块
- [[echarts]] —— 配置式可视化库，与 Vega 同样"JSON 即图"但思路不同（前者预设、后者通用）
- [[plotly-js]] —— 另一种"JSON 即图"路线，更偏交互式仪表盘
- [[amcharts5]] —— 商业图表库，对照 Vega 的学术路线
- [[chart-js]] —— Canvas 渲染入门级图表，Vega 的"重型版"对立面

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
