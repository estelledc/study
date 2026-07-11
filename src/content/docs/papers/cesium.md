---
title: CesiumJS — 把会动的 3D 地球塞进浏览器
来源: AGI / Cesium GS, 开源 2011，Apache 2.0；OGC 3D Tiles 1.0 (2019)
日期: 2026-05-31
分类: 可视化
难度: 中级
---

## 是什么

**CesiumJS**（简称 Cesium）是一套**用 WebGL 在浏览器里画一个会转、会跑时间、能贴卫星图、能挂三维模型的真地球**的开源库。日常类比：Google Earth 桌面客户端搬上网页，并且把它的"代码"开放给你改。

你写：

```js
const viewer = new Cesium.Viewer('cesiumContainer');
viewer.entities.add({
  name: 'ISS',
  position: Cesium.Cartesian3.fromDegrees(116.4, 39.9, 400000),
  model: { uri: 'iss.glb' }
});
```

打开网页，就有一个 1:1 的地球，国际空间站悬在北京上空 400 公里。**没装任何客户端、没安装插件**——靠 WebGL。

## 为什么重要

不理解 Cesium，下面这些事都没法做：

- 卫星轨迹可视化、空间态势感知（SSA）的 web 端首选
- FlightRadar24 / 国家空管 那种"飞机在地球上爬"的页面，背后是 Cesium 或它的私有版
- 数字孪生城市（Smart City）需要把 BIM 模型贴到真实经纬度——3D Tiles 标准就是 Cesium 团队推的
- 给 Three.js 和 deck.gl 补"我有一个真地球"的能力（Three.js 是通用 3D，没有地理坐标系）

## 核心要点

Cesium 的世界由 **四件套** 组成：

1. **Viewer**：最外层容器，自带时间轴、图层选择、相机控件。一行 `new Viewer(...)` 起步。
2. **Scene**：渲染管线本身——决定光照、雾、大气、太阳位置。
3. **Globe**：地球表面，挂地形（terrain）和影像（imagery）两层。
4. **Camera**：观察者位置，可飞到任意经纬度高度。

往里塞东西有 **两条路**：

- **Entity API**（高层声明式）：你说 "这是一个飞机，从北京到上海，3 分钟"，Cesium 自动插值、画轨迹、跑动画。适合上千以下对象。
- **Primitive API**（低层批量）：你给一堆顶点+索引，Cesium 直接交给 GPU。适合上万级的散点 / 轨迹。

时间维度由 **Clock + JulianDate** 驱动——所有 Entity 的位置、姿态都可以是"时间的函数"，时间轴一拖，整个场景一起回放。这套机制是 Cesium 区别于纯 3D 引擎的灵魂。

## 实践案例

### 案例 1：画一颗卫星 24 小时的轨迹

```js
const property = new Cesium.SampledPositionProperty();
for (const sample of orbitSamples) {
  property.addSample(
    Cesium.JulianDate.fromIso8601(sample.t),
    Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.alt)
  );
}
viewer.entities.add({
  position: property,
  path: { width: 2, leadTime: 3600, trailTime: 3600 },
  model: { uri: 'satellite.glb' }
});
viewer.clock.shouldAnimate = true;
```

`SampledPositionProperty` 帮你做时间插值——给 60 个采样点，它能在任意中间时刻给出位置。这就是 CZML 背后的核心数据结构。

### 案例 2：流式加载一座 3D 城市

```js
const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(96188);
viewer.scene.primitives.add(tileset);
```

`3D Tiles` 是一种**金字塔式**的格式：远看用低精度块，近看自动换高精度块。**纽约整城几百万栋楼**也能在网页里浏览，因为永远只下载视野里要看的那一小撮。这是 Cesium 团队 2015 年发明、2019 年成为 OGC 国际标准的格式。

### 案例 3：贴一架 glTF 飞机

```js
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(120, 30, 8000),
  orientation: Cesium.Transforms.headingPitchRollQuaternion(...),
  model: { uri: 'a320.glb', minimumPixelSize: 64 }
});
```

glTF 是 Khronos 的 "JPEG of 3D"——Cesium 原生支持。模型自动按距离缩放（`minimumPixelSize` 防止飞远看不见）。

## 踩过的坑

1. **Ion token 收费**：默认 `Cesium.Ion.defaultAccessToken` 走 Cesium 官方的地形 + 影像服务，超免费额度要付钱。生产可换 [Mapbox 影像 / 自建 Quantized Mesh 地形 / OSM Buildings] 替代。

2. **经纬度不是 XYZ**：Cesium 内部用 **ECEF**（Earth-Centered Earth-Fixed）笛卡尔坐标——X 朝赤道经度 0、Z 朝北极。`Cartesian3.fromDegrees(lon, lat, h)` 是经纬度 → ECEF 的转换器，写错顺序整个东西在地心。

3. **Entity 数量上限**：单 Viewer 几千个动态 Entity 就开始卡。要画几万颗卫星 / 飞机要切 Primitive + 自己批 instanced rendering。

4. **时间用 JulianDate 不用 Date**：所有时间相关 API（Clock、SampledPositionProperty）只吃 JulianDate。`JulianDate.fromIso8601('2026-05-31T00:00Z')` 是入口，搞混会得到 NaN 一片。

5. **包体大**：完整 CesiumJS gzip 后 1-2MB。要按需 import 子模块（`@cesium/engine` / `@cesium/widgets` 拆包），或上 dynamic import。

## 适用 vs 不适用场景

**适用**：

- 卫星 / 航空 / 无人机 轨迹回放
- 数字孪生城市、BIM 上图
- 国防 / 应急 态势可视化
- 任何"需要时间维度 + 真地球"的 web 应用

**不适用**：

- 纯 2D 地图（路径规划、热力图）→ MapLibre GL JS / Leaflet 更轻
- 数据可视化叠加为主、不在乎地球曲率 → deck.gl（可与 Cesium 互通）
- 只要画 3D 模型不要地球 → Three.js / Babylon.js
- 移动端弱设备 → WebGL 性能可能不够，考虑原生 SDK

## 历史小故事（可跳过）

- **2011 年**：Analytical Graphics, Inc.（AGI，做卫星仿真软件 STK 30 年）把内部 web 模块开源为 Cesium。当时 WebGL 1.0 刚发布一年。
- **2015 年**：Cesium 团队提出 **3D Tiles** 草案——解决 glTF 单文件加载海量城市数据的问题。
- **2019 年**：3D Tiles 1.0 通过 OGC（Open Geospatial Consortium）成为社区标准。
- **2021 年**：Cesium 被 Bentley Systems（基建软件巨头）收购，但代码继续 Apache 2.0 开源。
- **2024 年至今**：3D Tiles Next 演进，加 metadata、I3DM 实例化模型改进。

## 学到什么

1. **真地球 + 时间轴** 是 Cesium 的两个不可替代点——纯 3D 引擎可以画地球壳，但没人替你管"卫星 5 分钟后在哪"
2. **3D Tiles** 是 Cesium 团队的最大行业贡献——"把金字塔压缩 + LOD 想法搬到 3D"，OGC 标准让 ArcGIS / Unreal 都能读
3. **两层 API（Entity vs Primitive）** 是工程取舍——声明式好写但不够快，命令式快但要自己批
4. **WebGL 让 Google Earth 级别的能力进了浏览器**，不需要客户端，是 web 平台 2011 年后能力扩张的一个缩影

## 延伸阅读

- 官方教程：[Cesium Sandcastle](https://sandcastle.cesium.com/)（每个 API 一个能跑的 demo，改完即时预览）
- 3D Tiles 标准：[OGC 3D Tiles 1.0 Spec](https://www.ogc.org/standard/3dtiles/)
- 入门书：[Cesium 中文网 教程](https://cesium.xin/)（中文社区维护）
- glTF 标准：[Khronos glTF 2.0](https://www.khronos.org/gltf/)
- [[gltf-format]] —— glTF 模型规范（Cesium 模型格式）
- [[kepler-architecture-2012]] —— Uber 的地理可视化（与 deck.gl 同源）

## 关联

- [[gltf-format]] —— Cesium 加载的 3D 模型格式
- [[deckgl]] —— 数据可视化层，可与 Cesium 集成
- [[maplibre-gl]] —— 2D 矢量瓦片，扁平地图替代
- [[three-js]] —— 通用 WebGL 3D，无地理坐标系
- [[webgl]] —— Cesium 的渲染底座

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
