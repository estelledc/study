---
title: Leaflet — 轻量交互式地图
来源: https://github.com/Leaflet/Leaflet
日期: 2026-05-31
分类: projects / 数据可视化
难度: 入门到中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/Leaflet/Leaflet
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d15112c9e8ac339f0f74f563959d0423d291308d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.9.4
---

## 是什么

Leaflet 是一个面向浏览器的交互式地图库。日常类比：像一块拼图板——你给它瓦片 URL 模板和经纬度，它把栅格小图拼成可拖、可缩放、可点的平面地图。

你写：

```js
const map = L.map('map').setView([39.90, 116.40], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);
L.marker([39.90, 116.40]).addTo(map).bindPopup('北京');
```

`L.map()` 把容器变成 `Map`；`setView([lat, lng], zoom)` 设定中心与缩放。固定 1.9.4 默认 CRS 是 `EPSG3857`。本轮只读源码，未渲染页面，状态保持 `UNVERIFIED`。

## 为什么重要

不理解 Leaflet，下面这些事都没法解释：

- 为什么同一套 API 能同时吃栅格瓦片、Marker、矢量 Path 和 GeoJSON
- 为什么手写 `L.marker([lng, lat])` 会落到大西洋，而 `L.geoJSON` 却能显示正确
- 为什么容器尺寸变了以后必须调用 `invalidateSize()`
- 为什么点聚合、路径规划和绘制工具不属于 1.9.4 核心合同

## 核心要点

Leaflet 1.9.4 可以拆成四层：

1. **Map**：管中心、缩放、CRS、pane 和事件。默认打开 `zoomControl`、`attributionControl`，以及 drag / scrollWheelZoom / touchZoom / keyboard / doubleClickZoom / boxZoom / tapHold 这组 handler。

2. **Layer**：可见内容都挂在 `Layer` 上。`addTo(map)` 只是调用 `map.addLayer(this)`。`TileLayer` 继承 `GridLayer`，默认 `tileSize` 256、`maxZoom` 18、`subdomains` `'abc'`。

3. **Control**：独立于 Layer 的角落控件。`Control` 默认 `position` 是 `topright`；attribution 默认在 `bottomright`，并会收集各层 `getAttribution()`。

4. **Geo / Geometry**：`LatLng` 构造函数是 `(lat, lng, alt?)`；GeoJSON 入口用 `coordsToLatLng` 把 `[lng, lat]` 转成 `LatLng(lat, lng)`。

`LayerGroup` 只做批量 add/remove。`FeatureGroup` 额外转发成员事件，并提供 `getBounds()`。`L.geoJSON` 继承 `FeatureGroup`，按 geometry 生成 Marker / Polyline / Polygon。

## 实践示例

### 案例 1：渲染一份 GeoJSON

```js
const data = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [116.40, 39.90] }, properties: { name: '北京' } }
  ]
};

L.geoJSON(data, {
  onEachFeature: (feature, layer) => layer.bindPopup(feature.properties.name)
}).addTo(map);
```

GeoJSON 坐标是 `[lng, lat]`。`coordsToLatLng` 读 `coords[1]` 作 lat、`coords[0]` 作 lng。手写 `L.marker` 时顺序相反。

### 案例 2：容器尺寸变化后重排

```js
sidebar.classList.toggle('open');
map.invalidateSize();
```

固定实现先比较新旧 `getSize()`。中心像素偏移为 0 则直接返回；否则默认 `pan: true`、`animate: false`。sidebar / 弹窗改变容器高度后，不调用它会出现空白或瓦片错位。

### 案例 3：自定义瓦片模板与子域

```js
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
  attribution: '© CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);
```

`{s}` 按 `subdomains` 轮询。官方 1.9.4 示例已使用无子域的 `tile.openstreetmap.org`；是否仍允许抓 OSM 瓦片，以当前 OSM 使用政策为准，本文未验证。

## 踩过的坑

1. **把 README 的 39KB 写成当前测量值**：1.9.4 README 自报约 39 KB gzip JS + 4 KB gzip CSS。本轮未跑 `bundlemon`，不能把它当验收数字。

2. **经纬度顺序混用**：`LatLng` / `setView` / `L.marker` 是 `[lat, lng]`；GeoJSON 是 `[lng, lat]`。`L.geoJSON` 会转换，手写 Marker 不会。

3. **容器没高度或尺寸变了不刷新**：`<div id="map">` 高度为 0 时看起来是空白。动态改尺寸后要 `invalidateSize()`。

4. **把插件能力写成核心**：`leaflet.markercluster`、绘制和路由都不在 `d15112c9` 的 `src/` 里。1.9.4 也没有 WebGL painter。

5. **删掉 attribution**：控件默认开启，是因为它会聚合图层的 `attribution`。OSM 等数据源的法律要求不因关掉控件而消失。

## 适用 vs 不适用场景

**适用**：

- 栅格底图 + Marker / Polyline / Polygon / GeoJSON 覆盖物
- 需要默认触摸缩放、滚轮缩放和键盘平移，但不需要 3D pitch
- 包体和插件生态优先，且能接受 DOM/`<img>` 瓦片模型

**不适用**：

- 矢量瓦片 + WebGL、运行时换皮肤、3D 倾斜 → 看 [[mapbox-gl-js]] 或 [[maplibre-gl]]
- 复杂投影、WMS 工作流或测绘级控件 → 看 [[openlayers]]
- 需要核心点聚合或离线原生地图 SDK

## 固定版本边界

- 本文绑定 `Leaflet/Leaflet@d15112c9...`，npm / annotated tag 均为 `1.9.4`。
- GitHub 另有 `v2.0.0-alpha`；升级到 2.x 前需重新固定 revision。
- 核心无运行时依赖；构建产物声明在 `dist/leaflet-src.js` 与 `dist/leaflet.css`。
- 本文未安装依赖、运行 Karma、加载瓦片或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **小核心靠分层，不靠魔法**——Map / Layer / Control / CRS 分开后，插件才能在不改主链的情况下加能力。
2. **坐标顺序是合同，不是风格**——同一库内部同时存在 `[lat, lng]` 与 GeoJSON `[lng, lat]`。
3. **默认控件也是 API 的一部分**——attribution 和 zoom 默认打开，关掉它们不会取消数据源义务。
4. **README 体积不是证据**——自报 gzip 数字必须和固定构建命令分开写。

## 应用型自测

1. `L.marker([116.40, 39.90])` 会把点放在北京吗？
2. `L.layerGroup([a, b]).getBounds()` 在 1.9.4 核心里一定可用吗？
3. sidebar 改变 `#map` 宽度后，不调用任何方法，瓦片会自动重排吗？

检查点：

1. 不会。`LatLng` 把第一个数当 lat，该点会落到错误半球。
2. 不一定。`getBounds()` 在 `FeatureGroup`，不在 `LayerGroup`。
3. 不会自动按新尺寸重排；需要 `invalidateSize()`。

## 延伸阅读

- 文档：[Leaflet Reference](https://leafletjs.com/reference.html)
- 固定源码：[Leaflet/Leaflet](https://github.com/Leaflet/Leaflet) —— 本文绑定提交 `d15112c9e8ac339f0f74f563959d0423d291308d`
- [[mapbox-gl-js]] —— 矢量瓦片 + WebGL 的另一条主链
- [[maplibre-gl]] —— Mapbox v1 的社区分叉
- [[openlayers]] —— 更重的 GIS 前端

## 关联

- [[mapbox-gl-js]] —— WebGL 矢量地图；默认坐标是 `[lng, lat]`
- [[maplibre-gl]] —— 开源矢量渲染，对照 Leaflet 的 DOM 瓦片模型
- [[openlayers]] —— 同领域更完整的投影与协议覆盖
- [[d3]] —— d3-geo 提供投影，常和 Leaflet 容器组合
- [[deck-gl]] —— 大规模 GPU 图层，通常不走 Leaflet 核心

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mapbox-gl-js]] —— Mapbox GL JS — 矢量瓦片 + WebGL 客户端渲染地图
- [[openlayers]] —— OpenLayers — 全功能 GIS 前端
