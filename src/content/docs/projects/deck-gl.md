---
title: deck.gl — Uber 大规模数据可视化
来源: 'https://github.com/visgl/deck.gl'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
难度: 中级
---

## 是什么

deck.gl 是 Uber 开源、现由 vis.gl / OpenJS Foundation 维护的 **WebGL2/WebGPU 大数据可视化框架**。日常类比：[[d3]] / [[recharts]] 像在小画板上用马克笔逐笔描点——几千个点还行，百万点就卡；deck.gl 则像**投影灯把整面墙当画布**：你把数据表交给它，GPU 一次性 instancing 画出百万散点、十万多边形或 3D 建筑，还能叠在 Mapbox / MapLibre / Google Maps 底图上。

它把可视化拆成三层直觉：

- **data**：通常是 JSON 对象数组，或 loaders.gl 的二进制列式格式（百万行也吃得下）
- **layers**：ScatterplotLayer、PathLayer、HexagonLayer 等「图层乐高」
- **views**：地图视角、正交小窗、第一人称等观察方式

底层渲染走 [[luma-gl]]，地理投影走 math.gl，文件解析走 loaders.gl——整条 vis.gl 栈为「地理 + 海量点」而生。kepler.gl、streetscape.gl 都是搭在它上面的产品级 UI。

## 为什么重要

不理解 deck.gl，下面几件事很难讲清楚：

- 为什么 Uber 要把「千万 GPS 轨迹点 + 实时车辆」画在浏览器里，而不是导出到 QGIS 或桌面 GIS
- 为什么同样 100 万点，SVG（[[visx]] / [[observable-plot]]）会卡死，deck.gl 仍能保持 60fps——instancing + GPU buffer + 按需更新
- 为什么 Mapbox / MapLibre 文档里总提「custom layer」或 overlay——deck.gl 就是最常见的 overlay 方案之一
- 为什么 v9 开始强调 WebGPU：同一套 Layer API，底层从 WebGL2 平滑迁移到 WebGPU，应用层几乎不用改

## 核心概念

1. **Layer（图层）**  
   一个 Layer 实例 = 一种几何 + 一套 accessor。`id` 唯一；`data` 是数据源；`get*` 开头的 prop 是 accessor，把每一行数据映射成位置、颜色、半径等。Layer **不可变**：改 props 就 `new` 一个同 id 的新实例，deck.gl 做 diff 只重算变化部分。

2. **Deck / DeckGL**  
   `Deck`（纯 JS）或 React 的 `DeckGL` 接收 `layers[]` 和 `viewState`，在透明 canvas 上渲染。可 standalone（无地图），也可与底图 interleave / overlay。

3. **ViewState 与 Controller**  
   `longitude` / `latitude` / `zoom` / `pitch` / `bearing` 描述相机；`controller: true` 启用拖拽缩放。React 里把 viewState 放进 state，交互回调里 `setViewState` 即可。

4. **Accessor 三种写法**  
   - 常量：`getRadius: 100`  
   - 字段名：`getFillColor: 'color'`（等价于 `d => d.color`）  
   - 函数：`getPosition: d => [d.lng, d.lat, d.alt ?? 0]`  
   地理坐标默认 `[lng, lat]` 或 `[lng, lat, altitude]`，deck.gl 内部做 Web Mercator 投影。

5. **二进制 data（高性能路径）**  
   v7+ 起 `data` 可以是 `{ length, attributes: { getPosition: { value, size } } }` 这种列式结构，避免百万个 JS 对象的开销。loaders.gl 读 Arrow / Parquet / GeoJSON 后常直接喂这种格式。

6. **Picking 与交互**  
   `onClick` / `onHover` 回调里 `info.object` 指向被点的数据行；`pickable: true` 开启 GPU picking。大屏 BI、轨迹探索都靠这条链路。

7. **模块分包**  
   `@deck.gl/core`（渲染管线）、`@deck.gl/layers`（基础图层）、`@deck.gl/aggregation-layers`（Hexagon / Grid / Heatmap）、`@deck.gl/geo-layers`（Tile3D、MVT、Terrain）、`@deck.gl/react`、`@deck.gl/mapbox`（Mapbox GL 专用 glue）。按需安装，生产环境靠 tree-shaking 瘦身。

8. **GPU Instancing（百万点不卡的核心）**  
   传统 WebGL 每个点画一次 draw call；deck.gl 把「同一种几何」（圆、线、多边形）做成一份 GPU buffer，用 **instancing** 一次 draw 复制百万份，只在 shader 里读每行的 accessor 结果做偏移/着色。Uber 2016 开源博客把这条路线讲得很直白：Layer 栈里每一层都是「同一类图元的批量副本」，所以轨迹 + 建筑 + 热力可以同时叠在一张透视地图上。

9. **底图集成的三种模式**（与 Mapbox / MapLibre 联用时必知）

   | 模式 | 谁当根组件 | 适用场景 |
   |------|------------|----------|
   | **interleaved** | `@deck.gl/mapbox` 的 `MapboxOverlay`，图层画进 Mapbox 的 WebGL2 上下文 | 需要与 Mapbox 文字标注正确遮挡、3D 建筑物前后关系 |
   | **overlaid** | 同上，但 deck 在 Mapbox controls 容器里单独 canvas | 要用 Mapbox 原生控件/插件，又不需要深度 interleave |
   | **reverse-controlled** | `DeckGL` 为根，`Map` 作 child（react-map-gl 常见写法） | React 栈最省事；viewport 由 deck 驱动，底图跟随 |

   零基础建议：React 项目先用 **reverse-controlled**（下文案例 2）；只有 label 被点盖住时，再切 `@deck.gl/mapbox` interleaved。

## 与 d3 / ECharts / Three.js 怎么选

| 维度 | deck.gl | d3 / visx | ECharts | Three.js |
|------|---------|-----------|---------|----------|
| 渲染 | WebGL2/WebGPU | 多数 SVG | Canvas | WebGL 场景图 |
| 数据规模 | 10⁵–10⁷ 点 | ~10⁴ | ~10⁵（看图表类型） | 看优化 |
| 地理 | 一等公民 | 需 d3-geo 手拼 | geo 组件 | 需自研 |
| 心智 | 声明式图层栈 | 数据绑定 + DOM/SVG | 配置项 JSON | 3D 场景 |
| 典型场景 | 轨迹、热力、3D _TILE | 定制信息图 | 仪表盘 | 游戏 / 数字孪生 3D |

**经验法则**：带地图的海量点 / 路径 / 3D tiles → deck.gl；印刷级定制小图 → d3；常规 BI 折柱饼 → ECharts；要完整 3D 角色场景 → Three.js。

## 实践案例

### 案例 1：纯 JS 散点图（Standalone）

不依赖 React，也不强制底图——最小可运行骨架：

```js
import {Deck} from '@deck.gl/core';
import {ScatterplotLayer} from '@deck.gl/layers';

const DATA = Array.from({length: 5000}, (_, i) => ({
  position: [
    -122.4 + Math.random() * 0.2,
    37.75 + Math.random() * 0.15
  ],
  radius: Math.random() * 50 + 10,
  color: [255 * Math.random(), 80, 200]
}));

const deck = new Deck({
  initialViewState: {
    longitude: -122.45,
    latitude: 37.78,
    zoom: 11,
    pitch: 30
  },
  controller: true,
  layers: [
    new ScatterplotLayer({
      id: 'scatter',
      data: DATA,
      pickable: true,
      stroked: false,
      getPosition: d => d.position,
      getRadius: d => d.radius,
      getFillColor: d => d.color,
      radiusMinPixels: 2,
      radiusMaxPixels: 20
    })
  ],
  onClick: info => {
    if (info.object) console.log('picked', info.object);
  }
});
```

**要点**：`radiusMinPixels` / `radiusMaxPixels` 限制屏幕像素半径，避免 zoom 很大时圆点遮满屏；`pickable` + `onClick` 实现「点选数据行」。

### 案例 2：React + MapLibre 叠加 Hexagon 聚合

典型产品栈：`DeckGL` 透明 canvas 叠在 MapLibre 上，用 HexagonLayer 把百万点聚合成六边形柱：

```tsx
import {useState} from 'react';
import {DeckGL} from '@deck.gl/react';
import {HexagonLayer} from '@deck.gl/aggregation-layers';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

type Point = {lng: number; lat: number};

export function TripHexMap({points}: {points: Point[]}) {
  const [viewState, setViewState] = useState({
    longitude: -73.98,
    latitude: 40.75,
    zoom: 11,
    pitch: 45,
    bearing: 0
  });

  const layers = [
    new HexagonLayer<Point>({
      id: 'hex',
      data: points,
      pickable: true,
      extruded: true,
      radius: 200,
      elevationScale: 50,
      getPosition: d => [d.lng, d.lat],
      getElevationWeight: 1,
      getColorWeight: 1
    })
  ];

  return (
    <DeckGL
      viewState={viewState}
      onViewStateChange={({viewState: vs}) => setViewState(vs as typeof viewState)}
      controller
      layers={layers}
    >
      <Map
        {...viewState}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        style={{width: '100%', height: '100%'}}
      />
    </DeckGL>
  );
}
```

**要点**：`extruded: true` 把聚合计数拉成 3D 柱；`radius` 单位是米（Web Mercator 空间）；子组件 `Map` 作为 `DeckGL` 的 child，viewport 自动对齐——这是 React 集成的推荐姿势。

### 案例 3：PathLayer + TripLayer 动画轨迹

GPS 轨迹、物流路径是 Uber 最早用 deck.gl 的场景。`PathLayer` 画静态折线；`TripLayer` 在路径上按时间戳播放「光点」：

```tsx
import {PathLayer} from '@deck.gl/layers';
import {TripsLayer} from '@deck.gl/geo-layers';

const trips = [
  {
    path: [
      [-122.45, 37.78],
      [-122.44, 37.79],
      [-122.43, 37.80]
    ],
    timestamps: [0, 500, 1000] // 毫秒，与 currentTime 对齐
  }
];

const layers = [
  new PathLayer({
    id: 'route',
    data: trips,
    getPath: d => d.path,
    getColor: [0, 128, 255],
    widthMinPixels: 2
  }),
  new TripsLayer({
    id: 'vehicles',
    data: trips,
    getPath: d => d.path,
    getTimestamps: d => d.timestamps,
    getColor: [255, 200, 0],
    opacity: 0.9,
    trailLength: 180,
    currentTime: animationTime // 每帧 requestAnimationFrame 递增
  })
];
```

**要点**：`currentTime` 与 `getTimestamps` 同一单位；`trailLength` 控制尾迹长度（毫秒）。动画循环里只更新 `currentTime` 并 `setLayers`，不必每帧重传整条 path。

### 案例 4：Script Tag 快速试验（Observable / CodePen）

官方 standalone bundle 暴露全局 `deck`，适合原型：

```html
<script src="https://unpkg.com/deck.gl@latest/dist.min.js"></script>
<script>
  const {DeckGL, ScatterplotLayer} = deck;
  new DeckGL({
    mapStyle: 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
    initialViewState: {longitude: 2.35, latitude: 48.86, zoom: 11},
    controller: true,
    layers: [
      new ScatterplotLayer({
        data: [{position: [2.3522, 48.8566], color: [0, 128, 255], radius: 120}],
        getPosition: d => d.position,
        getFillColor: d => d.color,
        getRadius: d => d.radius
      })
    ]
  });
</script>
```

## 常见坑

1. **Layer 上直接改 props 不生效**：必须 `new ScatterplotLayer({...sameId, data: newData})` 再传给 `Deck`/`DeckGL`。  
2. **忘记同 id**：换 Layer 类型但 id 冲突会导致生命周期混乱。  
3. **地理坐标顺序**：始终是 `[longitude, latitude]`，不是 lat-first 的 GeoJSON 习惯写反。  
4. **大数据仍用 JSON 数组**：超过 ~10⁵ 行考虑二进制列或 loaders.gl + `updateTriggers` 精细控制刷新。  
5. **与 React Strict Mode 双挂载**：开发环境 effect 跑两次可能重复创建 Deck；用 ref 存实例并在 cleanup 里 `finalize()`。  
6. **底图 token 与 CORS**：Mapbox token、瓦片域名白名单要在部署环境配好，否则只有 deck 图层、底图空白。

## 生态与版本脉络

- **2016**：Uber 内部可视化需求开源，Layer 组合 + Mapbox overlay 架构定型。  
- **2018–2020**：kepler.gl 爆火，aggregation-layers、TripLayer 等成为标准工具。  
- **2024 v9**：基于 luma.gl v9，为 WebGPU 铺路；新增 `@deck.gl/widgets` UI 控件。  
- **姊妹项目**：[[luma-gl]]（GPU）、loaders.gl（IO）、math.gl（矩阵/投影）、react-map-gl（React 地图胶水）。

## 学习路径（零基础）

1. 跑官方 examples 里 `get-started` 的 pure JS 模板，确认本地能出散点。  
2. 读 Layer catalog：先 Scatterplot / Path / Polygon，再 Hexagon / Heatmap。  
3. 接一个 MapLibre 底图，练 viewState 双向绑定。  
4. 用 loaders.gl 读 CSV/GeoJSON，把 `data` 换成真实文件。  
5. 需要编辑/Graph 时再看 deck.gl-community 扩展包。

## 自测题

1. 为什么 deck.gl 强调 Layer 不可变，这和 React 的 immutable update 有什么相似处？  
2. `getPosition` 返回 `[lng, lat, 0]` 和返回 `[lng, lat]` 在 2D 地图模式下有何区别？  
3. HexagonLayer 的 `radius` 与 ScatterplotLayer 的 `getRadius` 单位/语义有何不同？  
4. 什么情况下应该用 `@deck.gl/geo-layers` 的 Tile3DLayer 而不是自己传点数组？

## 参考资料

- 官方文档：https://deck.gl/docs  
- Layer 目录：https://deck.gl/docs/api-reference/layers  
- GitHub：https://github.com/visgl/deck.gl  
- 姊妹笔记：[[luma-gl]]、[[visx]]、[[d3]]、[[observable-plot]]
