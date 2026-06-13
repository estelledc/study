---
title: "flowchart.js — 文本生成流程图"
来源: https://github.com/adrai/flowchart.js
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 入门
provenance: pipeline-v3
---

## 是什么

flowchart.js 是一个**把几行文本翻译成流程图 SVG**的小库。日常类比：你给保安画路线图，不画方块和箭头，只写「从大门走到电梯，碰到刷卡机就刷一下」——保安自己脑子里就把图画出来了。flowchart.js 就是替浏览器干这件事的"保安"。

你写：

```
st=>start: 开始
op=>operation: 处理订单
cond=>condition: 已付款？
e=>end: 完成

st->op->cond
cond(yes)->e
cond(no)->op
```

它在网页上画出一张带圆角矩形、菱形判断、箭头连线的流程图。

整个项目源码不到 2000 行，2014 年由 Adriano Raiano（adrai）开始写，比 Mermaid 还早一年。它依赖一个叫 **Raphael.js** 的老 SVG 库（比 D3 还早），所以总体积只有几十 KB。

## 为什么重要

它是**最小可读的"DSL → 图形"编译器标本**。流程一句话讲清：

1. 把文本读成一棵语法树（**parse**）
2. 给每个节点算出位置（**layout**）
3. 调画图库把方块、菱形、箭头落到屏幕（**render**）

现代工具如 Mermaid / D3 / Excalidraw 内部都做这三件事，但每件都被工程化得复杂。flowchart.js 把它们压到 4 个文件、几百行核心代码——**适合零基础读完一遍，建立"编译器是怎么把字符串变成像素"的整体感**。

读懂它，你能解释清楚：

- 浏览器里的 SVG 是怎么从 JS 调用变出来的
- 一段类似 `a->b` 的纯文本，是经过哪几步变成屏幕上的箭头
- 为什么 Mermaid 后来转去用 D3，而 Raphael 退场

## 核心要点

flowchart.js 的处理管线分 **4 步**：

1. **解析 DSL**：`flowchart.parse.js` 一行一行扫输入文本，分两类——
   - `st=>start: 开始`：节点定义（**变量名 + 类型 + 标签**）
   - `st->op->cond`：连接关系（**箭头链**）
   解析完得到两张表：节点表（id → 类型/文字）和边表（from → to）。

2. **构造形状对象**：`flowchart.functions.js` 是节点工厂。每种类型（start / end / operation / condition / subroutine / inputoutput / parallel）映射到一个 Symbol 子类，封装"我是什么形状"和"我在哪"。

3. **算坐标**：从 start 节点出发，**广度优先**遍历边表，给每个节点累加 y 坐标，碰到 condition 就左右分叉。整个布局算法朴素到能手推。

4. **画 SVG**：`drawSVG(target)` 调 Raphael 的 API 把形状和路径渲染到一个 `<div>` 里——画矩形、画菱形、画带箭头的折线，仅此而已。

**关键设计**：解析、布局、渲染**完全解耦**。你换掉 Raphael 换成 D3，前两步原封不动。这就是「编译器前端 / 后端分离」的微缩版。

## 实践案例

### 案例 1：DSL 长什么样

```
st=>start: 用户访问
op=>operation: 查缓存
cond=>condition: 命中？
db=>operation: 查数据库
e=>end: 返回响应

st->op->cond
cond(yes)->e
cond(no)->db->e
```

7 行文本，画出一张"先查缓存，没命中再查库"的流程图。**没写任何坐标**。

### 案例 2：解析阶段拆开看

输入 `st=>start: 用户访问`，parser 干了什么：

1. 按 `=>` 切两半，左边 `st` 是变量名
2. 右边按 `:` 再切，左边 `start` 是类型，右边 `用户访问` 是标签
3. 写进节点表：`{ id: "st", type: "start", label: "用户访问" }`

输入 `st->op->cond`，parser 干了什么：

1. 按 `->` 切成 `["st", "op", "cond"]`
2. 两两配对写进边表：`[{from:"st",to:"op"}, {from:"op",to:"cond"}]`

整个 parser 没有用任何解析框架（如 PEG.js / nearley），全是字符串 split + 正则——**这是它能压到几百行的关键**。

### 案例 3：condition 节点的 yes/no 分叉

```
cond(yes)->e
cond(no)->op
```

parser 看到节点名后跟括号，把括号内的文字当作"边的标签"。布局阶段读到这个标签，把目标节点放在左侧（no）或右侧（yes），中间用直角折线连。**两路分叉是写死的**——这也是它的天花板，不像 Mermaid 支持任意多分支。

## 踩过的坑

1. **依赖 Raphael 已经停止维护**：Raphael 最后一次更新是 2017 年。flowchart.js 因此长期挂着一个老依赖；新项目通常会被劝去用 Mermaid 或 Mermaid 的子集。

2. **DSL 容错差**：忘了 `:` 或者类型名拼错，parser 不会给出"第 X 行第 Y 列错"的提示，只会画出残缺图甚至直接报 `undefined`。

3. **布局不智能**：节点多了会重叠或拉得很长。它不像 Graphviz 有真正的图布局算法，只是按拓扑顺序顺着流走。

4. **不支持其他图类型**：要时序图、类图、甘特图，不能用它——选 Mermaid。

## 适用 vs 不适用场景

**适用**：

- 文档站点想嵌一张静态流程图、又不想引一个 1MB 的库
- 学习目的——看一个完整的 DSL → SVG 编译过程
- 和 Markdown 编辑器集成，写文字就出图

**不适用**：

- 需要时序图 / 类图 / 状态机 / 甘特图 → 用 Mermaid
- 需要交互式编辑（拖拽节点）→ 用 React Flow / Excalidraw
- 大型企业流程图（几十个节点）→ 布局会乱，去找 Graphviz / dagre

## 历史小故事（可跳过）

- **2014 年**：adrai 在维护 js-sequence-diagrams（基于 Raphael 的时序图库）的同时，把同一套思路套到流程图上，写出 flowchart.js。
- **2015 年**：Knut Sveidqvist 起步 Mermaid，初期也用 Raphael，后来转向 D3 + 自研布局，吃下了所有图类型。
- **2017 年**：Raphael 停止维护，flowchart.js 进入维护态——bug 修但很少加新特性。
- **2024-2026 年**：库依然能用，活在「极简文档站点」「教学示例」「老 wiki 平台」里。

它没赢过商业战，但活成了一份**好读的源码标本**——这正是把它放进学习计划的理由。

## 学到什么

1. **DSL → AST → 渲染** 是一切"文本变图"工具的统一管线，flowchart.js 把它压到最薄，能一晚读完。
2. **解析、布局、渲染要解耦**——这条原则在 Mermaid / Graphviz / D3 都在重演。
3. **小 DSL 用字符串 split 就够**，不必动用解析器生成器。**够用就好** 是工程美德。
4. **库的生死取决于依赖的生死**：Raphael 退场，flowchart.js 也跟着退潮。选库前看清楚下面踩的是什么地基。

## 延伸阅读

- 在线编辑器：[flowchart.js.org](https://flowchart.js.org/)（边写 DSL 边出图，调试 DSL 神器）
- 源码导读起点：[src/flowchart.parse.js](https://github.com/adrai/flowchart.js/blob/master/src/flowchart.parse.js)（先读这个文件 200 行就理解一半）
- Raphael.js 官网：[raphaeljs.com](http://raphaeljs.com/)（看它 API 才知道 flowchart.js 在调什么）
- [[mermaid]] —— 同时代继任者，转 D3 后体量爆炸但功能完整
- [[d3]] —— Mermaid 后端，看它和 Raphael 的差异

## 关联

- [[mermaid]] —— 同领域更新的对手，吃下时序图 / 类图 / 甘特图
- [[d3]] —— 现代 SVG 渲染主力，flowchart.js 用的 Raphael 是它前辈
- [[graphviz]] —— 真正的图布局算法（dot / neato），flowchart.js 的简易布局是它的远房亲戚
- [[mdx]] —— 把这种 DSL 嵌进 Markdown 的常见容器
- [[excalidraw]] —— 交互式手绘风替代品，定位完全不同
