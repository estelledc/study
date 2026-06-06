---
title: Mapbox GL JS — 矢量瓦片 + WebGL 客户端渲染地图
来源: 'https://github.com/mapbox/mapbox-gl-js'
日期: 2026-05-31
子分类: 数据可视化
分类: 数据可视化
难度: 中级
provenance: pipeline-v3
---

## 是什么

Mapbox GL JS 是 Mapbox 公司 2014 年发起的 Web 地图渲染库。日常类比：传统在线地图像翻一本预先印好的相册——服务器把每一格地图拍成一张 PNG（raster tile），你拖动时就翻到下一张照片；Mapbox GL JS 换了套路，发给你的不是照片，而是"街道这条线从 (10,20) 到 (30,40)、是高速公路、限速 80"这种几何数据（vector tile），浏览器拿到后用 WebGL 现场画。结果是同一份瓦片可以缩放、旋转、倾斜成 3D，文字始终保持清晰，配色甚至可以运行时换。

最小例子：

```js
import mapboxgl from 'mapbox-gl';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [121.47, 31.23],   // 上海经纬度
  zoom: 11,
  pitch: 45,                  // 倾斜 45 度看 3D
});
```

style 是一份 JSON（Style Spec），描述"哪些数据源 + 怎么画"；center/zoom/pitch 决定相机视角。整个交互（拖、转、缩、倾）都在客户端 GPU 算，不再回服务端。

注意许可：v1.x 是 BSD-3 开源，v2.0（2020-12）后改成 Mapbox TOS 专有，需 API token；社区从 v1.13 fork 出 **MapLibre GL JS**，API 几乎一致、继续 BSD-3 开源。下文讲的是两边共有的核心思想。

## 为什么重要

不理解矢量瓦片 + WebGL 渲染这套思路，下面这些事都没法解释：

- 为什么现代地图（Mapbox / 高德 H5 / Google Maps WebGL 版）能丝滑旋转、3D 倾斜、夜间一键切色——预渲染 PNG 做不到这些
- 为什么 [[deck.gl]] / Kepler.gl / [[d3]] 地理可视化都把 Mapbox/MapLibre 当底图层——它定义了 Web 矢量地图的事实接口
- 为什么 Style Spec 这份 JSON 协议被整个生态继承（MapLibre / Tangram / OpenMapTiles）——声明式样式让"换皮肤"变成换 JSON
- 为什么 GIS 行业 2015 年后大量从 Leaflet 迁过来——Leaflet 是 raster 时代的王者，做不了 3D / 旋转 / 数据驱动样式
- 为什么 [[postgis]] / tippecanoe 这类后端工具流行起来——它们负责把原始 GeoJSON 切成多 zoom 的 vector tile

## 核心要点

Mapbox GL JS 是**四层架构**，看懂这四层基本上看懂整个矢量地图栈：

1. **Source（数据源）**：从哪里拿数据。`vector` / `raster` / `raster-dem`（地形高度）/ `geojson` / `image` / `video`。vector source 拉 `.mvt` / `.pbf`（Protocol Buffers 编码的几何）
2. **Tile（瓦片）单元**：z/x/y 三个数索引——zoom 0 全世界 1 张，zoom 22 厘米级。Web Mercator (EPSG:3857) 投影把球面拍成正方形，便于一切二
3. **Layer（图层）+ Style**：每个 layer 声明"用哪个 source、画成什么样"。layer 类型有 fill / line / symbol（文字+图标）/ circle / heatmap / raster / fill-extrusion（3D 楼）。paint/layout 字段用 Expression DSL 写"数据驱动样式"
4. **Painter（WebGL 调度器）**：每帧按 layer 顺序调 GPU 着色器，把 tile 几何画到 canvas

线程模型同样关键：

- **主线程**：相机控制、事件分发、WebGL draw call
- **Worker 线程**：tile 下载后的解析、几何简化、空间索引（rbush）、文字 shaping——重活全在这里，不卡帧

Style Spec 的 Expression DSL 是"数据驱动"的核心：

```json
"circle-radius": [
  "interpolate", ["linear"], ["zoom"],
  5,  ["*", ["get", "population"], 0.0001],
  15, ["*", ["get", "population"], 0.001]
]
```

读法：根据 zoom 在 5 和 15 之间线性插值，半径从 `population × 0.0001` 渐变到 `× 0.001`。整套 DSL 让"圆点大小随人口和缩放级别变"这种逻辑写在 JSON 里、运行时即可生效，不用重切瓦片。

## 实践案例

### 案例 1：加一个 GeoJSON 图层 + 点击交互

```js
map.on('load', () => {
  map.addSource('shops', {
    type: 'geojson',
    data: '/data/shops.geojson'
  });
  map.addLayer({
    id: 'shops-circle',
    type: 'circle',
    source: 'shops',
    paint: {
      'circle-radius': 6,
      'circle-color': ['match', ['get', 'category'],
        'cafe', '#e74c3c', 'bar', '#3498db', '#999']
    }
  });
  map.on('click', 'shops-circle', (e) => {
    const f = e.features[0];
    new mapboxgl.Popup()
      .setLngLat(f.geometry.coordinates)
      .setHTML(f.properties.name)
      .addTo(map);
  });
});
```

`addSource` + `addLayer` 是动态加图层的唯一入口；`match` 表达式按属性切色——同一份 GeoJSON 可以画无数种不同样式。

### 案例 2：3D 楼层 + 地形阴影

```js
map.addLayer({
  id: '3d-buildings',
  source: 'composite',
  'source-layer': 'building',
  type: 'fill-extrusion',
  minzoom: 14,
  paint: {
    'fill-extrusion-height': ['get', 'height'],
    'fill-extrusion-base': ['get', 'min_height'],
    'fill-extrusion-color': '#aaa',
    'fill-extrusion-opacity': 0.8
  }
});
map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.3 });
```

`fill-extrusion` 用属性里的高度把 2D 多边形拉成 3D 体；`setTerrain` 让整张地图按 DEM（数字高程模型）起伏——这是 raster tile 时代彻底做不到的事。

### 案例 3：自己切 vector tile

把 100 万个商铺 GeoJSON 变成可缩放的矢量瓦片：

```bash
tippecanoe -o shops.mbtiles \
  --maximum-zoom=14 --minimum-zoom=4 \
  --drop-densest-as-needed shops.geojson
```

tippecanoe 是 Mapbox 出的 CLI，自动选每个 zoom 显示哪些点（高 zoom 全显，低 zoom 抽稀），输出 `.mbtiles`（SQLite 包了一堆 .pbf）。配 tileserver-gl 起一个本地 tile 服务，前端就能直接 `type: 'vector', tiles: ['http://...']` 接上。

## 踩过的坑

1. **token 与许可**：v2+ 不挂 `accessToken` 直接黑屏；公司项目想绕这个就上 MapLibre GL JS（fork、API 99% 兼容、零 token）
2. **WebGL context lost 后没自处理**：长时间隐藏 tab 或 GPU 切换时，浏览器会回收 context，需要监听 `webglcontextlost` 后调 `map.remove()` 重建
3. **layer 顺序就是绘制顺序**：水面图层加在道路之后会盖住道路；记住"先地、再水、再路、再楼、最上是文字"
4. **map.queryRenderedFeatures 只查可见瓦片**：缩出去的对象查不到；要全量查得用 source 自己的索引或后端
5. **Worker 数量默认 = CPU 核数**：移动端电池吃紧，可设 `mapboxgl.workerCount = 2` 限制
6. **GeoJSON source 巨大时主线程卡**：超过几 MB 就该走 tippecanoe 切成 vector tile，别让浏览器解析整份 JSON
7. **symbol layer 文字重叠**：默认会自动隐藏冲突文字（collision detection），想强制全显式 `text-allow-overlap: true`，但密集场景视觉灾难

## 适用 vs 不适用场景

**适用**：

- 城市级、国家级交互地图（拖、转、缩、3D 倾斜）
- 数据驱动的地理可视化（[[deck.gl]] / Kepler.gl 当叠加层）
- 需要运行时换皮肤、白天黑夜模式、品牌定制
- 移动端 WebView（Mapbox 也有同协议的 iOS/Android SDK）

**不适用**：

- 纯静态出图、印刷品 → matplotlib / [[d3]] 投影
- 极简需求 + 想免费 + 不需要 3D → Leaflet + OSM raster tile 更轻
- 完整 3D 球体（行星/卫星视角）→ Cesium 更专业
- 离线优先、弱网 → 需自己缓存 tile，方案复杂；或选 MBTiles + 原生 SDK

## 学到什么

1. **数据 vs 像素的分层**：raster 时代服务端把"什么+怎么画"一起决定（出 PNG），vector 时代把"什么"（几何 + 属性）和"怎么画"（style）拆开——这是声明式渲染思想在地图上的体现，和 [[react]] / [[vega-lite]] 同一类
2. **客户端做重计算的边界**：把 tile 解析、几何简化、文字 shaping 推到 Worker 线程是关键设计；主线程只剩相机和 draw call——这是 Web 端把 GPU 用满的标准做法
3. **JSON 协议吃下整个生态**：Style Spec 这份 JSON 标准让 MapLibre / Tangram / OpenMapTiles 可以共用同一份样式文件——协议本身比代码值钱

## 延伸阅读

- 官方 Style Spec：[Mapbox Style Specification](https://docs.mapbox.com/style-spec/)（一切样式查这里）
- 开源 fork：[MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js)（v2 转闭源后的社区延续，BSD-3）
- vector tile 规范：[Mapbox Vector Tile Specification](https://github.com/mapbox/vector-tile-spec)（.mvt 的 Protocol Buffers 协议，行业事实标准）
- 切瓦片工具：[tippecanoe](https://github.com/felt/tippecanoe)（GeoJSON → MBTiles，处理亿点级输入）
- 教科书：[OpenLayers Cookbook] / [Volodymyr Agafonkin 在 Mapbox blog 的几何算法系列]（rbush / 简化 / kd-tree 实现）
- [[deck.gl]] —— Uber 的可视化层，常叠在 Mapbox 底图上做大数据
- [[d3]] —— 声明式图形库，地理投影模块可对照 Web Mercator

## 关联

- [[deck.gl]] —— GPU 加速的可视化叠加层，最常见 Mapbox 上层用户
- [[d3]] —— d3-geo 提供丰富投影，对照 Mapbox 只用 Web Mercator 的简化
- [[postgis]] —— 上游空间数据库，常 + tippecanoe 切出矢量瓦片
- [[react]] —— 声明式渲染思想同源，react-map-gl 是 React wrapper
- [[vega-lite]] —— 同样"JSON 描述图，引擎实时画"的设计哲学
