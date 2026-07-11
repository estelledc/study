---
title: kepler.gl — 拖拽式百万点 GIS 探索界面
来源: https://github.com/keplergl/kepler.gl
日期: 2026-06-01
分类: 数据可视化
难度: 中级
---

## 是什么

kepler.gl 是 **Uber 2018 年开源的高性能地理空间可视化工具**。日常类比：像 Excel 数据透视表，但专做地图——把 CSV/GeoJSON 拖进浏览器，自动识别经纬度列，几秒就能把上百万个点画在地图上。

技术栈三件套：

```
浏览器 ── React UI（拖拽面板）
         ↓
       deck.gl（WebGL 图层渲染，跑在 GPU）
         ↓
       Mapbox / MapLibre（底图瓦片）
```

你写：拖一个 CSV 进网页 → kepler.gl 看到 `lat`、`lng` 两列 → 自动出散点图。再拖一拖时间过滤器，看出租车订单一天的潮汐。**不写一行代码**。

这种 "把 BI 工具的拖拽体验搬到地理数据" 的能力，让它从 Uber 内部工具变成 OpenJS Foundation 的旗舰开源项目。

## 为什么重要

不理解 kepler.gl，下面这些事都没法解释：

- 为什么浏览器能 60fps 渲染 100 万点——传统 D3 + Canvas 早就卡死了
- 为什么 deck.gl 这种 "声明式图层" 抽象比手写 WebGL 更可扩展
- 为什么 Uber / Lyft / 滴滴这些出行公司都把它当地理数据探索的事实标准
- 为什么底图（Mapbox）和数据层（deck.gl）解耦后，能各自独立演进

## 核心要点

kepler.gl 的架构可以拆成 **四层**：

1. **图层化（Layer）**：点 / 六边形聚合 / 热力 / 弧线 / 轨迹 / GeoJSON 等十几种图层叠加。每种图层是一个 deck.gl Layer 类，封装好 WebGL shader。

2. **GPU 数据流**：原始数据 **传 GPU 一次**，靠 attribute（每个点的坐标）+ uniform（全局参数如缩放）渲染。CPU 不再每帧循环百万点——这是百万级流畅的关键。

3. **Redux 大状态**：所有过滤器 / 图层配置 / 视角 / 时间窗都进 Redux store，可以序列化为一个 JSON 配置文件。把这个 JSON 发给同事，对方打开就是同一份分析结果。

4. **底图与数据层解耦**：Mapbox / MapLibre 出底图瓦片，deck.gl 在上面叠一层 WebGL canvas。两层独立，换底图不影响数据层。

四层加起来叫 **图层化 GIS 探索范式**。

## 实践案例

### 案例 1：拖一个 CSV 出热力图

打开 kepler.gl 网页版，把一年 Uber 行程 CSV 拖进去：

```csv
trip_id,pickup_lat,pickup_lng,timestamp
1,37.78,-122.41,2024-01-01T08:30:00
2,37.79,-122.40,2024-01-01T08:35:00
...
```

kepler.gl 自动识别 `pickup_lat`、`pickup_lng` 两列 → 给你一个点图层。再选 "Heatmap" 类型 → 3 秒出热力图。**全程零代码**。

### 案例 2：嵌入到自家 React 应用

```jsx
import KeplerGl from 'kepler.gl'
import {Provider} from 'react-redux'
import store from './store'

function App() {
  return (
    <Provider store={store}>
      <KeplerGl
        id="map"
        mapboxApiAccessToken={TOKEN}
        width={1200}
        height={800}
      />
    </Provider>
  )
}
```

把 KeplerGl 组件加到自家 Redux store 里，就成了产品的一个页面。Uber 内部很多工具都这么嵌。

### 案例 3：时间过滤器看潮汐

数据带 `timestamp` 列时，kepler.gl 自动给一个 **时间滑块**。拖一拖：

- 早 7-9 点：散点集中在郊区（住宅区出发）
- 晚 6-8 点：散点集中在 CBD（下班离开）
- 凌晨：稀疏，集中在机场和酒吧街

这种 "时间维度 + 空间维度" 同时探索，是 GIS 工具的核心价值。

## 踩过的坑

1. **Mapbox token 限速**：免费版超量后底图直接白屏。生产环境要么付费要么迁 MapLibre（开源 fork，自托管瓦片）。新项目建议直接 MapLibre，省心。

2. **百万点是上限不是起点**：kepler.gl 文档说 "支持百万级"，实测超过 5M 点浏览器堆内存就吃满。真正大数据要先在后端聚合（H3 / 六边形），把 100M 点降到 10K 个聚合格子。

3. **Redux store 巨大**：导出配置时直接 `JSON.stringify(store)` 可能超过 100MB——里面包含原始数据。要用 kepler 提供的 `schemaManager.save()` 裁剪，只存图层配置不存数据。

4. **自定义图层要会 deck.gl**：kepler 自带十几种图层够用 80% 场景。但要画 "带动画的弧线" 这种自定义效果，必须下到 deck.gl 写 GLSL shader——这是另一个学习曲线。

## 适用 vs 不适用场景

**适用**：

- 探索式 GIS 数据分析（数据科学家拖一拖看分布）
- 嵌入到自家产品的地图模块（出行 / 物流 / 城市规划）
- 百万级点的可视化（人口密度 / 交通流量 / 信号塔）
- 团队协作分析（导出 JSON 配置，对方打开同一份视图）

**不适用**：

- 亿级点（要先后端聚合，或换 ArcGIS / CARTO 这种重型工具）
- 需要复杂空间查询（点是否在多边形内 / 路网最短路径）→ 用 PostGIS / Turf.js
- 静态出版图（论文配图）→ 用 Matplotlib / QGIS
- 移动端为主（kepler 桌面体验最佳，移动端 UI 局促）

## 历史小故事（可跳过）

- **2016 年**：Uber 数据可视化团队发现现有 GIS 工具（ArcGIS / QGIS）对工程师不友好。开始内部造轮子。
- **2018 年**：在 FOSS4G NA 大会上开源 kepler.gl，搭配 deck.gl（2016 年已开源）。第一周 GitHub 星数破 5K。
- **2019 年**：捐给 Linux Foundation 的 Urban Computing Foundation（城市计算基金会）。
- **2021 年**：独立站点 kepler.gl 上线，作为 OpenJS Foundation 项目。Uber 不再是唯一维护方。
- **2024 年**：v3 大重构——TypeScript 化、MapLibre 一等支持、模块拆分（kepler-table / map-state / layers 各自独立 npm 包）。

## 学到什么

1. **拖拽式探索是 BI 工具的核心**——kepler.gl 把这个范式搬到 GIS，省掉数据科学家写 Python 出图的步骤
2. **GPU 渲染让浏览器能扛百万点**——deck.gl 的 instancing 技术比 D3 + Canvas 快 100 倍
3. **声明式图层比命令式画图更可组合**——把 "怎么画" 抽象成 Layer 类，新需求加图层不改框架
4. **底图和数据层解耦很重要**——Mapbox 限速时迁 MapLibre 不影响业务代码

## 延伸阅读

- 官方文档：[kepler.gl Documentation](https://docs.kepler.gl/)（有 Demo 数据集，拖一拖就懂）
- 视频教程：[Uber Engineering — kepler.gl Tutorial](https://www.youtube.com/results?search_query=kepler.gl+tutorial)
- deck.gl 核心：[deck.gl GitHub](https://github.com/visgl/deck.gl)（kepler 的渲染引擎）
- [[mapbox-gl-js]] —— kepler 的底图引擎
- [[d3]] —— 早一代浏览器可视化王者

## 关联

- [[mapbox-gl-js]] —— 提供底图瓦片，kepler 在上面叠数据层
- [[d3]] —— 上一代浏览器可视化框架，kepler 用 GPU 接力
- [[react]] —— kepler 用 React 写 UI 面板
- [[redux]] —— kepler 把所有探索状态进 Redux store

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[projects/cytoscape-js]] —— Cytoscape.js — 浏览器里画图（节点 + 边）的图论库
- [[luma-gl]] —— luma.gl — 给 WebGPU/WebGL 用的中低层 GPU 工具箱
- [[open3d]] —— Open3D — 现代点云 / 几何库
- [[regl]] —— regl — 函数式 WebGL 封装
