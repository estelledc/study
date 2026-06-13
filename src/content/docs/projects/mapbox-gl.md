---
title: "Mapbox GL JS — 浏览器里的高性能 WebGL 地图引擎"
来源: https://github.com/mapbox/mapbox-gl-js
日期: 2026-06-13
分类: 后端 API
子分类: geographic-information-systems
provenance: pipeline-v3
---

## 是什么

Mapbox GL JS 是 **Mapbox 公司开源的浏览器端地图渲染引擎**。日常类比：它像一个"地图的 OpenGL"——过去在网页上画地图只能用切好的静态图片（像一张张 JPG 拼起来），放大缩小就是切换图片，看起来生硬；Mapbox GL JS 把地图数据切成"向量瓦片"（Vector Tiles），用 WebGL 在显卡上实时计算渲染，放大缩小旋转倾斜都丝滑如原生 App。

核心原理三件套：

```
浏览器 <─── WebGL 画布（GPU 渲染）
    ↑
  Mapbox GL JS 引擎
    ↑
  向量瓦片（服务器上的精简地图数据）
    ↑
  Mapbox / 自托管瓦片服务器
```

向量瓦片和传统图片瓦片的区别：图片瓦片是"烤熟的饼"，放大就糊；向量瓦片是"原材料"，浏览器实时拼装。这让地图在任何缩放级别都清晰，同时大幅减少带宽。

## 核心概念

**1. 相机（Camera）**
地图的"眼睛"。控制三个维度：
- `center`：看哪里（经纬度）
- `zoom`：看多近（0 = 整个地球，22 = 一栋房子）
- `pitch`：看多斜（0 = 俯视，60+ = 鸟瞰 3D）
- `bearing`：朝哪转（0 = 正北，90 = 正东）

**2. 样式（Style）**
一张地图长什么样，由 JSON 样式的"层（Layer）"决定。每层定义一类要素的画法：
- `background`：底色
- `water` / `landcover`：水面、绿地
- `roads`：道路（可分层：高速、小路）
- `labels`：文字标注
- `buildings`：3D 楼块

**3. 数据源（Source）**
地图数据的"仓库"。Mapbox GL JS 支持多种源：
- `vector`：向量瓦片（最常见）
- `raster`：图片瓦片
- `geojson`：内联 GeoJSON 数据（标记、路线）
- `image`：单张图片叠加

**4. 图层（Layer）**
在数据之上"画画"的规则。同一种数据可以用多个图层画不同样子（比如同一个 GeoJSON 点数据，一层画蓝色圆点，一层画发光效果）。

**5. 交互（Interaction）**
拖拽平移、滚轮缩放、双击放大、框选缩放——全部开箱即用，也可以自定义。

## 代码示例 1：从零创建一个基本地图

这是最基础的用法，在网页上放一张可交互的世界地图。

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>我的第一张 Mapbox 地图</title>
  <!-- 引入 Mapbox GL JS -->
  <script src='https://api.mapbox.com/mapbox-gl-js/v3.24.1/mapbox-gl.js'></script>
  <link href='https://api.mapbox.com/mapbox-gl-js/v3.24.1/mapbox-gl.css' rel='stylesheet' />
  <style>
    #map { width: 100%; height: 100vh; }
  </style>
</head>
<body>
  <!-- 地图容器：必须是空元素，不能有子节点 -->
  <div id="map"></div>

  <script>
    // 设置访问令牌（在 mapbox.com 免费注册获取）
    mapboxgl.accessToken = 'your-access-token-here';

    // 创建地图实例
    const map = new mapboxgl.Map({
      container: 'map',        // 挂载的 DOM 元素 ID
      style: 'mapbox://styles/mapbox/streets-v12',  // 样式：街道视图
      center: [116.4074, 39.9042],  // 初始中心：北京 [lng, lat]
      zoom: 12,                   // 初始缩放
      pitch: 0,                   // 初始倾斜角（0 = 俯视）
      bearing: 0                  // 初始旋转（0 = 正北）
    });

    // 添加缩放控件（右上角 +/- 按钮）
    map.addControl(new mapboxgl.NavigationControl());
  </script>
</body>
</html>
```

关键点：`center` 的顺序是 `[经度, 纬度]`，和 GeoJSON 一致——不是 `[纬度, 经度]`。这是一个常见陷阱。

## 代码示例 2：叠加 GeoJSON 数据并添加弹窗交互

展示如何在地图上标记自定义点位，点击后弹出信息框。

```javascript
// 假设地图上已创建了 map 实例

// 自定义 GeoJSON 数据：三个城市的位置
const cities = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [116.4074, 39.9042] },  // 北京
      properties: { name: '北京', population: '2154万', desc: '中国首都' }
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [121.4737, 31.2304] },  // 上海
      properties: { name: '上海', population: '2487万', desc: '中国经济中心' }
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [113.2644, 23.1291] },  // 广州
      properties: { name: '广州', population: '1868万', desc: '华南门户' }
    }
  ]
};

// --- 添加数据源 ---
map.addSource('cities', {
  type: 'geojson',
  data: cities
});

// --- 添加圆圈图层：在数据上画蓝色圆点 ---
map.addLayer({
  id: 'city-circles',
  type: 'circle',
  source: 'cities',
  paint: {
    'circle-radius': 12,       // 半径 12 像素
    'circle-color': '#3b82f6', // 蓝色
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff'
  }
});

// --- 添加文字标注层 ---
map.addLayer({
  id: 'city-labels',
  type: 'symbol',
  source: 'cities',
  layout: {
    'text-field': '{name}',    // 读取 GeoJSON properties 中的 name
    'text-font': ['Open Sans Regular'],
    'text-offset': [0, 1.8],   // 文字在点上方向偏移
    'text-anchor': 'top'
  }
});

// --- 点击弹窗交互 ---
// 当用户在 circle 图层上点击时，弹出信息框
map.on('click', 'city-circles', function(e) {
  const city = e.features[0].properties;

  // 创建弹窗，显示城市信息
  new mapboxgl.Popup({ offset: 25 })
    .setHTML(`<strong>${city.name}</strong><br>${city.desc}<br>人口：${city.population}`)
    .setLngLat(e.lngLat)  // 弹窗锚定的经纬度
    .addTo(map);

  // 高亮当前点击的点（可选：改变鼠标指针）
  map.getCanvas().style.cursor = 'pointer';
});

// 鼠标悬停时切换指针
map.on('mouseenter', 'city-circles', function() {
  map.getCanvas().style.cursor = 'pointer';
});
map.on('mouseleave', 'city-circles', function() {
  map.getCanvas().style.cursor = '';
});
```

## 常用相机操作

```javascript
// 飞到一个新位置（带平滑动画）
map.flyTo({ center: [121.4737, 31.2304], zoom: 14, bearing: 45, pitch: 60 });

// 获取当前相机状态
const center = map.getCenter();       // { lng: 116.4, lat: 39.9 }
const zoom = map.getZoom();           // 12
const pitch = map.getPitch();         // 0
const bearing = map.getBearing();     // 0

// 获取当前可视范围
const bounds = map.getBounds();       // LngLatBounds 对象
```

## 在 React 中使用

React 项目中推荐用 `react-map-gl`（Mapbox 官方维护的 React 封装），本质是帮你在 `useEffect` 里创建/销毁 Map 实例，处理 DOM 挂载：

```jsx
import { useState } from 'react';
import Map from 'react-map-gl';

function MyMap() {
  const [viewport, setViewport] = useState({
    latitude: 39.9042,
    longitude: 116.4074,
    zoom: 12
  });

  return (
    <Map
      {...viewport}
      onMove={(evt) => setViewport(evt.viewState)}
      style={{ width: '100%', height: '600px' }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      mapboxAccessToken={process.env.MAPBOX_TOKEN}
    />
  );
}
```

## 为什么选择 Mapbox GL JS

- **性能**：WebGL 渲染，百万级瓦片流畅缩放
- **样式灵活**：JSON 样式文件，可在 Mapbox Studio 可视化编辑后直接使用
- **3D 支持**：内置 3D 楼块、地形、 Globe（球体投影）
- **自托管**：样式可以完全自己管理，不依赖 Mapbox 服务（配合 OpenStreetMap + 自托管瓦片服务器）
- **生态丰富**：官方插件库（聚类 clustering、3D 地形、pmtiles）、社区插件数百个

## 注意事项

- 需要一个 Mapbox Access Token（免费额度足够个人项目）
- `map.on('load', ...)` 是绑定地图事件的最佳时机——样式层在 `load` 事件后才可用
- 中文文字渲染可能需要设置 `localIdeographFontFamily` 避免请求远程字体
- 免费版有月度请求量上限，超量后需付费

## 与 Leaflet 的对比

| | Leaflet | Mapbox GL JS |
|---|---|---|
| 渲染方式 | SVG / Canvas（CPU） | WebGL（GPU） |
| 瓦片类型 | 图片瓦片 | 向量瓦片 |
| 缩放流畅度 | 图片切换，有闪烁 | 实时渲染，丝滑 |
| 自定义样式 | 通过 CSS/JS 操作 DOM | JSON 样式，声明式 |
| 3D 支持 | 无 | 内置 |
| 包大小 | ~40KB gzipped | ~150KB gzipped |

Leaflet 像"瑞士军刀"——轻量通用；Mapbox GL JS 像"专业相机"——功能更强、画质更好，但需要学习成本。选择哪个取决于你要画的地图有多复杂。
