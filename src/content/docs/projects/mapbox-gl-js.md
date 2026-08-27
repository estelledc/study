---
title: Mapbox GL JS — 矢量瓦片 + WebGL 客户端渲染地图
来源: https://github.com/mapbox/mapbox-gl-js
日期: 2026-05-31
分类: projects / 数据可视化
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/mapbox/mapbox-gl-js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2d7d5d25a4e2f8bc7fb778381e15764b97d4fc65
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.29.0
---

## 是什么

Mapbox GL JS 是一个用 WebGL 画矢量地图的浏览器库。日常类比：传统在线地图像翻预先印好的相册；它发给你的是几何和属性，浏览器再按 Style Spec 现场画，所以同一份瓦片可以旋转、倾斜，并在运行时换皮肤。

你写：

```js
import mapboxgl from 'mapbox-gl';

mapboxgl.accessToken = 'YOUR_TOKEN';
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/standard',
  center: [121.47, 31.23],
  zoom: 11,
  pitch: 45
});
```

固定 3.29.0 的默认 style 是 `mapbox://styles/mapbox/standard`。坐标顺序是 `[lng, lat]`。许可是 Mapbox TOS：v2+ 需有效账号与 access token。本轮未申请 token、未创建 WebGL 上下文。

## 为什么重要

不理解这套客户端渲染链，下面这些事都没法解释：

- 为什么默认 style 已不是旧教程里的 `streets-v12`
- 为什么 Worker 默认是 2 个，而不是 `hardwareConcurrency`
- 为什么 `queryRenderedFeatures` 查不到缩出视野或被碰撞隐藏的 symbol
- 为什么 npm `gitHead` 和 GitHub `v3.29.0` tag 不是同一个 SHA

## 核心要点

固定源码把主链拆成四步：

1. **Map + Transform**：构造时合并默认项。`center` 默认 `[0, 0]`，`zoom` / `pitch` / `bearing` 默认 0，`maxZoom` 22，`maxPitch` 85。未传 style 且非 `testMode` 时，回落到 `config.DEFAULT_STYLE`。

2. **Source**：`addSource(id, spec)` 交给 `Style`。核心类型包括 `vector`、`raster`、`raster-dem`、`geojson`、`image`、`video`、`canvas` 和 `custom`。

3. **Style Layer**：`addLayer(layer, beforeId?)` 按类型建层。3.29.0 的 typed layer 包括 fill / line / symbol / circle / heatmap / raster / fill-extrusion / hillshade / background / building / model / sky / slot / clip / raster-particle。绘制顺序就是层顺序。

4. **Worker 布局 + Painter 绘制**：Worker 反序列化 PBF、做 layout、建 `Bucket` 和 `FeatureIndex`；主线程 `Painter#renderPass()` 按层取 shader 并 `drawElements()`。`WorkerPool.workerCount` 默认 2，必须在创建 Map 前设置。

`queryRenderedFeatures` 只返回**当前已渲染**的要素：`visibility: none`、当前缩放范围外、以及因文字/图标碰撞被隐藏的 symbol 都不会出现。

## 实践示例

### 案例 1：load 之后加 GeoJSON 圆点

```js
map.on('load', () => {
  map.addSource('shops', { type: 'geojson', data: '/data/shops.geojson' });
  map.addLayer({
    id: 'shops-circle',
    type: 'circle',
    source: 'shops',
    paint: {
      'circle-radius': 6,
      'circle-color': ['match', ['get', 'category'], 'cafe', '#e74c3c', '#999']
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

`addSource` / `addLayer` 是运行时改样式的入口。`match` 是 Style Spec 表达式，不会改源数据。

### 案例 2：3D 拉伸与地形

```js
map.addLayer({
  id: '3d-buildings',
  source: 'composite',
  'source-layer': 'building',
  type: 'fill-extrusion',
  minzoom: 14,
  paint: {
    'fill-extrusion-height': ['get', 'height'],
    'fill-extrusion-base': ['get', 'min_height']
  }
});
map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.3 });
```

`fill-extrusion` 用属性拉高多边形。`setTerrain` 把 DEM source 接到相机；没有对应 source 时，这只是 API 形状，不是本轮运行证据。

### 案例 3：在创建 Map 前限制 Worker

```js
mapboxgl.workerCount = 2;
const map = new mapboxgl.Map({ container: 'map' });
```

默认已经是 2。源码写明不信任 `hardwareConcurrency`。`prewarm()` 之前改 `workerCount` / `workerUrl` 才有效。

## 踩过的坑

1. **把 v1 教程的默认 style 抄过来**：3.29.0 默认是 Standard，不是 `streets-v12`。旧 URL 仍可作为显式 `style`，但不再是缺省合同。

2. **以为 Worker 默认等于 CPU 核数**：`WorkerPool.workerCount = 2`。旧笔记这句是错的。

3. **token 只写在文档里**：构造器读 `options.accessToken` 或全局 `mapboxgl.accessToken`。TOS 许可不是 BSD；社区开源延续看 [[maplibre-gl]]。

4. **用 `queryRenderedFeatures` 当空间数据库**：它查的是当前视口里已经画出来的东西，不是完整 source。

5. **绑定 npm `gitHead`**：`mapbox-gl@3.29.0` 的 `gitHead` 在 GitHub 不可达。本文绑定 tag 提交 `2d7d5d25...`，并披露其 `GitOrigin-RevId`。

## 适用 vs 不适用场景

**适用**：

- 需要旋转、倾斜、数据驱动样式或 Standard 底图的 Web 地图
- 把 [[deck-gl]] / [[kepler-gl]] 叠在矢量底图上
- 能接受 Mapbox 账号、token 与 TOS 数据收集条款

**不适用**：

- 只要栅格底图 + 少量覆盖物、且要 BSD 核心 → [[leaflet]]
- 要继续走开源 GL JS 分叉 → [[maplibre-gl]]
- 完整三维地球与时间动画 → [[cesium]]
- 本轮未证明离线缓存或无 token 的 Mapbox 样式可用

## 固定版本边界

- 本文绑定 GitHub tag `v3.29.0` / `mapbox/mapbox-gl-js@2d7d5d25...`。
- npm `gitHead` `e0492c02...` 在 canonical remote 不可达；提交说明把它标为 `GitOrigin-RevId`。未猜测内部 mirror。
- 许可文件写明 v2+ 使用 Mapbox TOS；仓库仍包含 v1.13 及更早的 BSD-3 片段。
- 导出条件区分默认 bundle 与 `mapbox-gl/esm`。本文未安装依赖、创建 WebGL、发 Mapbox API 或跑 Vitest。

## 学到什么

1. **数据和画法必须拆开**——Source 给几何，Style Layer 给 paint/layout。这和 [[leaflet]] 把瓦片 PNG 当最终像素不同。
2. **线程边界写在架构里**——PBF 解析和 bucket layout 在 Worker，draw call 在主线程。
3. **默认值会漂**——3.29.0 的默认 style、Worker 数和坐标顺序都不能靠 2019 年教程外推。
4. **可达 revision 优先于 npm 字段**——`gitHead` 不是 GitHub 对象时，只能披露，不能伪造。

## 应用型自测

1. 不传 `style` 也不开 `testMode`，3.29.0 会加载 `streets-v12` 吗？
2. 创建 Map 之后再设 `mapboxgl.workerCount = 8`，当前实例会扩到 8 个 Worker 吗？
3. 一个 symbol 因碰撞被藏起来，`queryRenderedFeatures` 还能查到它吗？

检查点：

1. 不会。缺省是 `mapbox://styles/mapbox/standard`。
2. 不会作用于已经创建的池；文档要求在创建 Map / `prewarm()` 之前设置。
3. 不会。碰撞隐藏的 symbol 不在“当前已渲染”集合里。

## 延伸阅读

- 文档：[Mapbox GL JS API](https://docs.mapbox.com/mapbox-gl-js/api/)
- Style Spec：[Mapbox Style Specification](https://docs.mapbox.com/style-spec/)
- 固定源码：[mapbox/mapbox-gl-js](https://github.com/mapbox/mapbox-gl-js) —— 本文绑定提交 `2d7d5d25a4e2f8bc7fb778381e15764b97d4fc65`
- [[maplibre-gl]] —— v1.13 之后的开源分叉
- [[leaflet]] —— DOM 栅格瓦片对照

## 关联

- [[leaflet]] —— 栅格 + Layer 模型，默认 `[lat, lng]`
- [[maplibre-gl]] —— TOS 变更后的社区延续
- [[deck-gl]] —— 常见 GPU 叠加层
- [[kepler-gl]] —— 在 GL 底图上做探索界面
- [[openlayers]] —— 更完整的 GIS 协议与投影

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[projects/cesium]] —— CesiumJS — 浏览器里的三维地球与时间动画
- [[kepler-gl]] —— kepler.gl — 拖拽式百万点 GIS 探索界面
- [[leaflet]] —— Leaflet — 轻量交互式地图
- [[maplibre-gl]] —— MapLibre GL JS — Mapbox v1 时代的社区分叉
