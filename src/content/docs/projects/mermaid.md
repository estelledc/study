---
title: Mermaid — 用文本写图，code review 友好的图表语言
来源: https://github.com/mermaid-js/mermaid + Knut Sveidqvist 2014
日期: 2026-06-01
分类: projects / 数据可视化
难度: 入门
---

## 是什么

Mermaid 是一套**用纯文本描述图表**的 DSL（领域专用语言），渲染器把文本翻译成 SVG。日常类比：写图就像写 Markdown——不用画笔不用拖拽，敲字符就能出流程图、时序图、甘特图。

最小例子：

```
flowchart LR
    A[用户提交] --> B{校验}
    B -->|通过| C[落库]
    B -->|失败| D[返回报错]
```

这 4 行渲染出一张流程图。每个箭头、判断、节点都来自字符。

为什么是它而不是 PowerPoint 画一张图截屏：**文本可以 diff、可以版本控制、可以 code review**。GitHub 在 README/Issue/PR 的 Markdown 渲染器里**原生支持**这种代码块，无需任何插件。

## 为什么重要

不理解 mermaid，下面这些事都没法解释：

- 为什么近几年 GitHub 上几乎所有架构图、状态机、时序图都长一个样——它们都是 mermaid 渲染的
- 为什么文档站（Astro Starlight、Docusaurus、VitePress）几乎都内置 mermaid 而不是别的画图工具
- 为什么 Notion / Obsidian / Typora / 飞书文档都把 mermaid 列为标配，而不是 PlantUML
- 为什么 Knut Sveidqvist 一个瑞典程序员业余项目能成 GitHub 70k 星

## 核心要点

mermaid 的设计可以拆成 **三层**：

1. **图类型 DSL**：每种图（flowchart / sequenceDiagram / classDiagram / stateDiagram-v2 / erDiagram / gantt / pie / journey / gitGraph / mindmap / timeline）有自己的小语法。共 11 种图类型覆盖 80% 工程文档需求。

2. **解析器**：基于 jison（JS 版 yacc）把文本解析成抽象语法树。每种图类型一个 parser，互相独立。

3. **渲染器**：用 d3 + dagre（有向无环图布局算法）把 AST 摆成 SVG。布局自动，你不需要管节点坐标。

整个流程：**字符 → AST → 布局算法 → SVG**。每一步都是确定的函数，没有手工拖拽。

## 实践案例

### 案例 1：flowchart 画系统架构

```
flowchart TB
    Client[移动端] --> Gateway[API 网关]
    Gateway --> Auth[认证服务]
    Gateway --> Order[订单服务]
    Order --> DB[(MySQL)]
    Order --> Cache[(Redis)]
```

`TB` 是 top-bottom 方向（还有 LR/RL/BT）。`[文字]` 是矩形，`[(文字)]` 是圆柱（数据库），`{文字}` 是菱形（判断）。一份 README 的架构图就 6 行。

### 案例 2：sequenceDiagram 画接口时序

```
sequenceDiagram
    participant U as 用户
    participant W as 前端
    participant A as API
    U->>W: 点登录
    W->>A: POST /login
    A-->>W: token
    W-->>U: 跳首页
```

`->>` 是实线（请求），`-->>` 是虚线（响应）。讲清楚一次登录交互比画图工具快 5 倍。

### 案例 3：stateDiagram-v2 画状态机

```
stateDiagram-v2
    [*] --> 待支付
    待支付 --> 已支付: 用户付款
    待支付 --> 已取消: 超时
    已支付 --> 已发货: 仓库出库
    已发货 --> [*]: 用户签收
```

`[*]` 是初始/终止状态。这种图过去要画一下午，现在 6 行写完，订单状态机文档可以跟代码一起 review。

## 踩过的坑

1. **Markdown 反引号嵌套**：节点文字含反引号要用 HTML 实体 `&#96;` 转义，否则代码块提前闭合，渲染失败一片空白。

2. **中文带空格要加引号**：`A[我 的 节点]` 会语法错，要写 `A["我 的 节点"]`。这个错的报错只在 console 里，外面看到的是空白图，新人卡半天。

3. **v8 → v10+ 语法变更**：早期文档用 `graph LR`，新文档用 `flowchart LR`。两者基本兼容但 v10 部分新特性（subgraph 嵌套、点击交互）只在新关键字下生效。看老博客代码贴过来不工作，先换关键字。

4. **大图渲染慢**：节点超过 100 个，dagre 布局算法 O(V·E) 跑得肉眼可见的卡。这种规模建议拆成多张图，或者换 Graphviz。

## 适用 vs 不适用场景

**适用**：

- README / 技术文档里的架构图、状态机、时序图（一份代码 + 一份图，diff 友好）
- code review 里在 PR 描述里贴一张状态变更图（reviewer 点开就看到）
- 笔记软件（Notion / Obsidian / Typora）里整理思路（mindmap / flowchart）
- 团队 wiki 或文档站（Astro Starlight、Docusaurus）的图

**不适用**：

- 需要像素级精细布局（产品发布会的高保真示意图）→ 用 Figma / Excalidraw
- 节点 100+ 的超大图 → 用 Graphviz / Cytoscape
- 数据可视化（柱状图、折线图、地图）→ 用 ECharts / D3 / Plot
- 自由拖拽白板（多人协同头脑风暴）→ 用 FigJam / Miro

## 同类对比（快速选型）

| 工具 | 文本 DSL | 原生 GitHub | 学习成本 | 美观度 |
|------|---------|-------------|---------|--------|
| Mermaid | 有 | 是 | 低 | 中 |
| PlantUML | 有 | 否（要插件） | 中 | 中 |
| Graphviz | 有（dot） | 否 | 中高 | 高 |
| draw.io | 否（拖拽） | 否 | 低 | 高 |
| Excalidraw | 否（手绘风） | 否 | 低 | 手绘风 |

选 mermaid 的核心理由不是它最美、最强，而是**它跟 Markdown 长在一起**——写文档的工具链不需要额外配置。

## 历史小故事（可跳过）

- **2014 年**：Knut Sveidqvist 在瑞典开源，目的就是『让文档里的图也能像 Markdown 一样用文本写』，最初只支持 flowchart 和 sequenceDiagram 两种。
- **2019 年**：拿下 JavaScript Open Source Award『最激动人心的技术应用』。
- **2022 年 2 月**：GitHub 在所有 Markdown 渲染器（README / Issue / PR / Wiki）里**原生支持** mermaid 代码块，不再需要任何外部图床或插件。这是 mermaid 真正出圈的转折点。
- **2023 年起**：Notion / Obsidian / 语雀 / 飞书文档陆续跟进。

## 学到什么

1. **图也可以是源代码**——用文本表达一切，diff 才能工作，code review 才能工作
2. **DSL 的价值在于约束**：mermaid 不让你拖拽，你被迫专注于结构而不是位置
3. **生态绑定 > 功能领先**：PlantUML 比 mermaid 早 10 年、功能更强，但因为不在 GitHub Markdown 里原生支持，份额输了
4. **渲染失败要响**：mermaid 一个长期被吐槽的设计是错误只在 console 里，UI 上一片空白——好的工具应该把错误信息推到用户脸上

## 延伸阅读

- 官方文档：[Mermaid Live Editor](https://mermaid.live/)（在线试，左边写右边出图，最佳学习入口）
- 速查表：[mermaid-js cheat sheet](https://github.com/mermaid-js/mermaid/blob/develop/README.md)
- 设计原作：[Knut Sveidqvist 在 mermaid 早期博客谈动机](https://github.com/knsv/mermaid)
- [[d3]] —— mermaid 渲染层底层就是 d3 操作 SVG
- [[markdown]] —— mermaid 设计哲学的母体：用纯文本表达结构

## 关联

- [[d3]] —— d3 是 mermaid 的 SVG 渲染底座
- [[graphviz]] —— mermaid 的精神祖先，文本画图的开山鼻祖（1991）
- [[plantuml]] —— mermaid 最直接的竞争者，老牌 Java 系
- [[markdown]] —— mermaid 设计哲学就是『图也是 Markdown』

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[drawio]] —— drawio (diagrams.net) — 离线版 Visio
- [[flowchart-js]] —— flowchart.js — 文本生成流程图
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[wadler-prettier]] —— Wadler Prettier — 函数式优雅打印器

