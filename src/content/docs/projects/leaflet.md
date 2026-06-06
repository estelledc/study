---
title: Leaflet — 轻量交互式地图
来源: 'https://github.com/Leaflet/Leaflet'
日期: 2026-05-31
子分类: 数据可视化
分类: 数据可视化
难度: 入门到中级
provenance: pipeline-v3
---

## 是什么

Leaflet 是 Vladimir Agafonkin 2011 年发起的开源 JavaScript 地图库，BSD-2-Clause 协议，压缩后核心只有 **38KB**。日常类比：像一面拼图板——你给它一个网址模板，它就把世界各地的小图片（瓦片）按经纬度拼成一张可以拖、可以缩放、可以点的地图。

最小例子（5 行）：

```html
<div id="map" style="height: 400px"></div>
<script>
  const map = L.map('map').setView([39.90, 116.40], 12)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map)
  L.marker([39.90, 116.40]).addTo(map).bindPopup('北京')
</script>
```

这段代码做了三件事：

- `L.map('map').setView(...)`：把 id 为 map 的 div 变成地图容器，初始视角中心 + 缩放级别
- `L.tileLayer(url)`：声明瓦片源（这里用 OpenStreetMap 的免费瓦片）
- `L.marker(...).bindPopup(...)`：在指定经纬度放一个点，点击弹气泡

整个过程不需要任何后端——浏览器按 `{z}/{x}/{y}` 模板向 OSM 服务器请求 256×256 的 PNG 小图，Leaflet 负责拼接和事件分发。

## 为什么重要

不理解 Leaflet，下面这些事都没法解释：

- 为什么 GitHub / Etsy / Pinterest / Foursquare 这些大站做地图用的是 Leaflet 而不是 Google Maps——授权费 + 数据主权 + 38KB 包大小
- 为什么"在网页上画点 GPS 轨迹"在 2011 年之前要么用 Google API（收费）要么自己写 canvas，2011 年之后基本一行 `L.geoJSON(data)`
- 为什么 OpenStreetMap 官网的"地图编辑器入口页"用 Leaflet——它是 OSM 项目首推的前端
- 为什么手机浏览器双指捏合缩放地图这么顺滑——Leaflet 从第一版就把触摸事件当一等公民，和桌面鼠标走同一套抽象

## 核心要点

Leaflet 的架构可以拆成 **三层**：

1. **Map 容器**：管视图（中心点 / 缩放级别 / 边界）和事件分发，整张图只有一个
2. **Layer 系统**：所有可见内容都是 Layer 的子类——TileLayer（栅格瓦片）/ Marker（点）/ Popup（气泡）/ Polyline（线）/ Polygon（面）/ GeoJSON（数据驱动批量）
3. **Control 控件**：缩放按钮 / 比例尺 / 图层切换器 / 归属信息——用 `map.addControl()` 挂上去

复合工具：

- `L.layerGroup([a, b, c])`：把多个 layer 当成一个，方便整体显示/隐藏
- `L.featureGroup(...)`：和 layerGroup 类似，但能算 `getBounds()`（外接矩形），用于"一键缩放到所有标注"
- `L.geoJSON(data, options)`：吃 GeoJSON 标准（RFC 7946）数据，自动拆成 Marker / Polyline / Polygon

事件模型和 DOM 一致：

```js
map.on('click', e => {
  L.marker(e.latlng).addTo(map)
})
```

`e.latlng` 是 `LatLng` 对象，含 `lat` 和 `lng` 两个数字字段。

## 实践案例

### 案例 1：渲染一份 GeoJSON 数据

```js
const data = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [116.40, 39.90] }, properties: { name: '北京' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [121.47, 31.23] }, properties: { name: '上海' } }
  ]
}

L.geoJSON(data, {
  onEachFeature: (feature, layer) => layer.bindPopup(feature.properties.name)
}).addTo(map)
```

注意 GeoJSON 标准里坐标是 `[lng, lat]`（先经度后纬度），但 Leaflet API 里 `[lat, lng]`（先纬度后经度）。`L.geoJSON` 自动帮你转，但手写 `L.marker([...])` 时要小心。

### 案例 2：点聚合（MarkerCluster 插件）

直接放 1 万个 Marker 浏览器会卡。装 `leaflet.markercluster` 后：

```js
const cluster = L.markerClusterGroup()
data.forEach(p => cluster.addLayer(L.marker([p.lat, p.lng])))
map.addLayer(cluster)
```

近距离的点自动合并成"圆圈+数字"，缩放进去再展开——这是插件生态最常用的之一。

### 案例 3：自定义瓦片源

不想用 OSM 默认样式，可以换 CartoDB / Stamen / 高德 / 百度（需自己处理坐标系偏移）：

```js
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
  attribution: '© CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map)
```

`{s}` 是子域占位符，`subdomains` 列出所有可选值，浏览器并发请求时自动负载均衡。

## 踩过的坑

1. **容器没高度地图不显示**：`<div id="map">` 默认 height 是 0，必须 CSS 给个具体值（或 `100%` + 父元素有高度），否则页面看起来空白。
2. **经纬度顺序反了**：Leaflet `[lat, lng]` vs GeoJSON `[lng, lat]`，混用直接显示在大西洋里。
3. **容器尺寸变化不刷新瓦片**：弹窗打开 / sidebar 切换后地图容器尺寸变，瓦片错位。手动调 `map.invalidateSize()` 触发重排。
4. **混用 http/https 瓦片**：现代浏览器 block 混合内容，瓦片源要么全 https 要么全 http，统一用 https 最稳。
5. **删了 attribution**：OSM 数据协议（ODbL）要求保留归属信息，去掉违法。

## 适用 vs 不适用场景

**适用**：

- 标注、轨迹、热力图、行政区边界这类**栅格瓦片底图 + 矢量覆盖物**的场景
- 包大小敏感的项目（移动端、嵌入第三方页面）
- 需要丰富插件（聚合 / 路径规划 / 绘制 / 实时位置）但不想自己造轮子
- 只要二维平面地图不要 3D 倾斜视角

**不适用**：

- 需要矢量瓦片 + WebGL 的高性能场景（大量 polygon、3D 建筑）→ 用 Mapbox GL JS / MapLibre GL
- 复杂投影 / 海图 / 测绘级别精度 → 用 OpenLayers
- 完全离线 + 操作系统原生地图 → 用平台 SDK
- 只要展示一个静态图（无交互） → 直接 `<img src="static-map.png">` 即可，不必引入库

## 历史小故事（可跳过）

- **2010 年**：Vladimir Agafonkin 在乌克兰 CloudMade 工作时，发现"轻量易用的开源 JS 地图库"是个空缺——Google Maps 闭源 + OpenLayers 太重。
- **2011 年 5 月**：Leaflet 0.1 发布，10KB 核心，立刻被 OSM 社区采用作为默认前端。
- **2013 年**：作者跳槽到 Mapbox 继续维护，0.7 版稳定 API。
- **2016 年**：1.0 发布，支持任意投影（之前只支持 Web Mercator）。
- **至今**：~41k stars，被全球数十万站点使用，是最广泛部署的开源地图库之一。

## 学到什么

1. **38KB 能做什么**——核心只做"瓦片 + Layer + 事件"三件事，其他全交给插件。这是开源库"小核心 + 大生态"的范本
2. **DOM 不是性能墙**——SVG + img tile 的非 WebGL 方案在中等规模数据下性能足够，包大小和兼容性是实打实的赢
3. **协议绑定是软实力**——OSM 数据 + Leaflet 前端，两者各自开源、互相成就
4. **API 三件套（map / layer / control）很泛化**——后来很多前端图形库（[[d3]]、[[echarts]]）也借鉴了"容器 + 图层 + 控件"的拆法

## 延伸阅读

- 官方教程：[Leaflet Quick Start](https://leafletjs.com/examples/quick-start/)（10 分钟跑通第一个地图）
- API 参考：[Leaflet Reference](https://leafletjs.com/reference.html)（按字母顺序列所有类和方法）
- 插件市场：[Leaflet Plugins](https://leafletjs.com/plugins.html)（800+ 插件分类列表）
- 对比文章：[Leaflet vs Mapbox GL vs OpenLayers](https://www.maptiler.com/news/2019/02/web-mapping-libraries-compared/)
- [[d3]] —— 通用数据可视化框架，地理模块（d3-geo）和 Leaflet 经常混用
- [[vega-lite]] —— 声明式可视化语法，地图能力相对薄弱时常和 Leaflet 拼

## 关联

- [[d3]] —— d3-geo 提供投影计算，Leaflet 提供交互容器，常组合用
- [[echarts]] —— 国内地图可视化竞品，自带 GL 后端，包大但开箱即用
- [[vega-lite]] —— 声明式语法，地图层不如 Leaflet 灵活但其他图更强
- [[chart-js]] —— 同属"小核心 + 易上手"的开源前端图形库
