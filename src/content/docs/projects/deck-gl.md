---
title: deck.gl — 大规模地图数据可视化图层库
来源: https://github.com/visgl/deck.gl
日期: 2026-07-08
分类: 可视化与地图
难度: 中级
---

## 是什么

deck.gl 是一个面向浏览器的**大规模数据可视化图层库**：你把一组 JSON 数据交给它，它负责把点、线、面、文字、热力图等图层画到 WebGL2 / WebGPU 画布上。

日常类比：它像给城市沙盘装了一套透明胶片。底下的地图负责街道和地名，上面的胶片一层画出租车轨迹，一层画热力密度，一层画建筑高度；你可以开关、叠放、调颜色，但不用每次重新画整张地图。

一句话说：deck.gl 解决的是“数据很多、地理位置复杂、还要能缩放交互时，前端怎么流畅画出来”。

它可以独立渲染，也可以叠在 Mapbox GL JS、MapLibre、Google Maps 这类底图上。核心不是“提供地图瓦片”，而是“把你的业务数据变成高性能可交互图层”。

## 为什么重要

不理解 deck.gl，下面这些事会很难解释：

- 为什么几万到几百万个点不能直接用普通 DOM 标记画，浏览器会卡到无法交互。
- 为什么地图应用常把“底图”和“业务图层”分开：底图给上下文，deck.gl 负责数据表达。
- 为什么同一份数据可以换成 ScatterplotLayer、HexagonLayer、ArcLayer，而业务代码不用重写渲染引擎。
- 为什么前端可视化也要关心 GPU、buffer、projection、picking 这些看似底层的词。

简单说：deck.gl 把“我有很多地理数据”变成“我声明要哪种图层”，让新手先学会表达数据含义，再逐步理解性能细节。

## 核心要点

1. **Layer 是基本单位**。类比：每种图层是一张透明胶片。ScatterplotLayer 画点，LineLayer 画线，PolygonLayer 画区域；你组合多张胶片，就得到完整可视化。

2. **Accessor 把数据字段变成视觉属性**。类比：表格里“经纬度”决定贴纸放哪，“订单量”决定贴纸多大，“风险等级”决定贴纸颜色。`getPosition`、`getRadius`、`getFillColor` 就是在写这套映射规则。

3. **Deck 管相机、交互和 GPU 更新**。类比：你只说“这些贴纸怎么放”，deck.gl 负责相机缩放、鼠标拾取、只更新变化的数据，并尽量把重复工作留在 GPU 上。

## 实践案例

### 案例 1：用散点图层画门店位置

```js
import {Deck} from '@deck.gl/core';
import {ScatterplotLayer} from '@deck.gl/layers';

const stores = [
  {name: 'A 店', lng: 116.39, lat: 39.90, orders: 120},
  {name: 'B 店', lng: 121.47, lat: 31.23, orders: 260}
];

new Deck({
  initialViewState: {longitude: 118, latitude: 35, zoom: 4},
  controller: true,
  layers: [
    new ScatterplotLayer({
      id: 'stores',
      data: stores,
      getPosition: d => [d.lng, d.lat],
      getRadius: d => d.orders * 3,
      getFillColor: [40, 120, 255, 180],
      pickable: true
    })
  ]
});
```

逐部分看：

- `data` 是普通对象数组，新手不用先学图形学数据结构。
- `getPosition` 把业务字段转成 `[经度, 纬度]`，这是最关键的坐标映射。
- `getRadius` 把订单量转成圆点大小，让“多和少”直接可见。
- `pickable: true` 打开鼠标拾取，后面可以做 tooltip。

### 案例 2：叠在底图上，而不是自己画底图

```jsx
import Map from 'react-map-gl/maplibre';
import DeckGL from '@deck.gl/react';

function CityView({layers}) {
  return (
    <DeckGL
      initialViewState={{longitude: 116.39, latitude: 39.90, zoom: 10}}
      controller
      layers={layers}
    >
      <Map mapStyle="https://demotiles.maplibre.org/style.json" />
    </DeckGL>
  );
}
```

读法：

- `Map` 负责道路、河流、地名等背景信息。
- `DeckGL` 负责业务图层，例如骑行轨迹、热力格子、配送范围。
- 两者共享视角，用户拖动或缩放时，底图和数据层一起移动。

### 案例 3：数据变了，只更新相关属性

```js
new ScatterplotLayer({
  id: 'orders',
  data: points,
  getPosition: d => d.position,
  getRadius: d => d.orderCount,
  updateTriggers: {
    getRadius: [currentHour]
  }
});
```

读法：

- `points` 可能有很多行，不应每次交互都重建全部图层。
- `updateTriggers` 告诉 deck.gl：只有 `currentHour` 变了，半径才需要重新算。
- 这类声明能减少 CPU 到 GPU 的重复传输，是大数据前端流畅的关键。

## 踩过的坑

1. **把 deck.gl 当底图库**：它擅长画数据图层，不负责提供街道瓦片；需要地图背景时要接 MapLibre、Mapbox GL JS 或其他底图。

2. **经纬度顺序写反**：deck.gl 常用 `[longitude, latitude]`，不是 `[latitude, longitude]`；写反会让点飞到错误大陆。

3. **每次 render 都 new 大数组**：React 里无脑重建 `data` 和 `layers` 会触发大量更新；稳定数据引用或拆分变更范围更重要。

4. **过早追求 3D 效果**：Extruded polygon、terrain、lighting 很酷，但新手先把坐标、聚合和 tooltip 跑通，再加三维高度更稳。

## 适用 vs 不适用场景

**适用**：

- 地图上要展示上万到百万级点、线、面，并且需要缩放、悬浮、点击。
- 业务数据有地理坐标，例如出行轨迹、门店分布、物流路线、城市热力。
- 需要多种图层叠加比较，例如底图 + 聚合网格 + 选中区域 + 文本标注。
- 团队愿意用 JavaScript / React 维护前端可视化，而不是只导出静态图片。

**不适用**：

- 只有几十个点，普通 SVG、Canvas 或地图 SDK marker 已经足够。
- 主要做柱状图、折线图、仪表盘，不涉及空间位置和大量图元。
- 需要服务端生成固定图片报表，用户不做缩放和点击交互。
- 没有 WebGL2 支持的运行环境；部分高级集成还会受底图库 WebGL 能力限制。

## 历史小故事（可跳过）

- **2015 年前后**：网约车、物流和城市数据应用开始把大量移动轨迹放到浏览器里，传统 marker 方案很快遇到性能墙。
- **2016 年**：Uber 开源 deck.gl，把内部大规模地理可视化经验拆成可复用图层。
- **2018 年后**：deck.gl 逐步进入 vis.gl 生态，和 luma.gl、loaders.gl、react-map-gl 等项目形成组合。
- **2020 年后**：Mapbox GL JS 许可变化推动 MapLibre 生态成长，deck.gl 也继续支持多种底图集成方式。
- **近几年**：WebGPU、3D Tiles、TileLayer 等方向让 deck.gl 从“画点线面”扩展到更重的空间数据场景。

## 学到什么

1. **可视化先是映射问题**：把业务字段映射成位置、颜色、大小，比一开始研究 GPU 更重要。
2. **底图和数据层要分工**：底图讲“这是哪里”，deck.gl 图层讲“这里发生了什么”。
3. **声明式图层降低复杂度**：写清 `data + accessor + layer`，比手写 WebGL buffer 更适合业务团队。
4. **性能来自少做无用更新**：大数据交互时，稳定数据、合理聚合、精确触发更新比堆硬件更有效。

## 延伸阅读

- 官方文档：[deck.gl documentation](https://deck.gl/docs)。
- GitHub 仓库：[visgl/deck.gl](https://github.com/visgl/deck.gl)。
- 底图集成说明：[Base Maps](https://deck.gl/docs/get-started/using-with-map)。
- Python 封装：[pydeck documentation](https://deckgl.readthedocs.io/)。
- [[webgl]] —— 理解 deck.gl 为什么能比 DOM marker 更适合大量图元。
- [[maplibre]] —— 常见开源底图搭档。

## 关联

- [[webgl]] —— deck.gl 的高性能渲染建立在浏览器 GPU 能力上。
- [[react]] —— React 项目常用 `@deck.gl/react` 管理视图和图层。
- [[maplibre]] —— 负责底图，deck.gl 负责叠加业务数据。
- [[data-visualization]] —— deck.gl 是空间可视化里的图层化方案。
- [[geojson]] —— PolygonLayer、GeoJsonLayer 常直接消费 GeoJSON 数据。
- [[canvas]] —— 小规模图形可用 Canvas，大规模地图图层再考虑 deck.gl。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
