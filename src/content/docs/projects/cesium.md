---
title: CesiumJS — 浏览器里的三维地球与时间动画
来源: 'https://github.com/CesiumGS/cesium'
日期: 2026-05-31
分类: projects / 数据可视化
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/CesiumGS/cesium
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6d5d8b1f0725b6f831b336463f4b11c98023427b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.144.0
---

## 是什么

CesiumJS 是一份开源三维地球与地理空间引擎。固定 1.144.0 的伞包 `cesium` 依赖 `@cesium/engine@26.2.0` 与 `@cesium/widgets@16.1.1`，三份 npm `gitHead` 都指向同一提交 `6d5d8b1f...`。许可 Apache-2.0；三个 package 都声明 `node: >=22.0.0`。

日常类比：以前要装桌面地球客户端才能看卫星绕地球转；这里一段 JS 就能把椭球、影像层、时间轴和实体放进浏览器。打开页面看到的“地球 + 工具条”，来自 widgets 里的 `Viewer`，它先造 DOM，再把真正的渲染交给 `CesiumWidget`。

```js
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

const viewer = new Cesium.Viewer("cesiumContainer");
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(121.47, 31.23, 1500),
  point: { pixelSize: 12, color: Cesium.Color.RED },
});
```

`Viewer` 的 `entities` 只是捷径，指向内部 `CesiumWidget` 默认 DataSource 的实体集合。默认 `Clock.shouldAnimate` 是 `false`，时间不会自己走，除非你打开它。

## 为什么重要

不理解 Viewer → Widget → Scene / Globe / Clock 这条链，下面这些事会对不上：

- 为什么经纬度不能直接当 XYZ 用——`Cartesian3.fromDegrees` 先转弧度，再按椭球半径平方算 ECEF
- 为什么 `new Cesium3DTileset(url)` 不是现行入口——工厂是异步的 `Cesium3DTileset.fromUrl`
- 为什么 Timeline 拉了却看不见运动——时钟默认不推进
- 为什么拆包时不能只留 `cesium` 这个名字：运行时在 `@cesium/engine`，控件在 `@cesium/widgets`

## 核心要点

固定 1.144.0 可以拆成四层：

1. **Viewer 是控件壳**：`packages/widgets/Source/Viewer/Viewer.js` 创建 `cesium-viewer` DOM，构造 `Clock` + `ClockViewModel`，再 `new CesiumWidget(...)`。`scene` / `camera` / `entities` / `dataSources` 都是转到 widget 的 getter。

2. **Clock 把时间做成一等对象**：默认 `canAnimate=true`、`shouldAnimate=false`、`multiplier=1`、`clockStep=SYSTEM_CLOCK_MULTIPLIER`、`clockRange=UNBOUNDED`。没给 stopTime 时，停止点是 start + 1 天。`tick` 只有两个 animate 标志都为真才推进。

3. **坐标必须进 ECEF**：`Cartesian3.fromDegrees(lon, lat, height, ellipsoid?)` 把经纬度转弧度后调用 `fromRadians`；`height` 是椭球上的米，默认椭球是 `Ellipsoid.default`。

4. **加点东西有两层 API**：Entity 用声明式 graphics（`point` / `model` / `path`…）；超大场景走 `scene.primitives`，例如 `Cesium3DTileset.fromUrl` 先拉 `tileset.json` 再 `new Cesium3DTileset(options)`。时间采样位置用 `SampledPositionProperty`（内部 `SampledProperty(Cartesian3)`，默认 `ReferenceFrame.FIXED`，插值默认 `LinearApproximation`）。

## 实践示例

### 案例 1：让一颗采样点沿赤道走一小时

```js
const viewer = new Cesium.Viewer("cesiumContainer");
viewer.clock.shouldAnimate = true;

const start = Cesium.JulianDate.fromIso8601("2026-05-31T00:00:00Z");
const stop = Cesium.JulianDate.addSeconds(start, 3600, new Cesium.JulianDate());

const positionProperty = new Cesium.SampledPositionProperty();
for (let t = 0; t <= 3600; t += 60) {
  const time = Cesium.JulianDate.addSeconds(start, t, new Cesium.JulianDate());
  const lon = -180 + (t / 3600) * 360;
  positionProperty.addSample(time, Cesium.Cartesian3.fromDegrees(lon, 0, 700000));
}

viewer.entities.add({
  availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start, stop })]),
  position: positionProperty,
  point: { pixelSize: 10, color: Cesium.Color.YELLOW },
  path: { width: 2 },
});
```

**逐部分解释**：`JulianDate.addSeconds` 必须传入 result 实例，不会给你新建。默认时钟不走，所以第一行要打开 `shouldAnimate`。采样点按线性插值填中间时刻。

### 案例 2：从 tileset.json 流式加一座城

```js
const tileset = await Cesium.Cesium3DTileset.fromUrl("https://example.com/city/tileset.json");
viewer.scene.primitives.add(tileset);
await viewer.zoomTo(tileset);
```

**逐部分解释**：`fromUrl` 用 `Resource` 拉 JSON、处理 metadata 扩展，再写入 `_geometricError` 后构造 tileset。`zoomTo` 转给 `CesiumWidget.zoomTo`。本轮未拉真实瓦片、未测网络或 LOD 调度。

### 案例 3：用速度方向贴一架 glTF

```js
viewer.entities.add({
  position: positionProperty,
  orientation: new Cesium.VelocityOrientationProperty(positionProperty),
  model: { uri: "/models/CesiumAir.glb", minimumPixelSize: 64 },
});
```

**逐部分解释**：`VelocityOrientationProperty` 内部是 `VelocityVectorProperty(position, true)`，默认椭球 `Ellipsoid.default`，算出的是四元数姿态，不是你手写的 heading。`model.uri` 走 Entity 的 `ModelGraphics`。

## 踩过的坑

1. **经纬度当笛卡尔用**：漏掉 `fromDegrees`，点会落到地球内部或太空。高度单位是米。
2. **`JulianDate.addSeconds(start, 3600)` 不传 result**：debug 构建会 `DeveloperError: result is required`。
3. **以为 `new Viewer()` 会自动播时间**：`Clock` / `CesiumWidget` 都把 `shouldAnimate` 默认写成 `false`。
4. **`new Cesium3DTileset(url)`**：现行工厂是 `fromUrl` / `fromIonAssetId`。构造函数吃的是 options，不吃 URL。
5. **把默认底图、Ion 计费或 gzip 体积写成保证**：默认 `baseLayer` 是 `ImageryLayer.fromWorldImagery()`；具体供应商、配额和包体本轮未核验。

## 适用 vs 不适用场景

**适用**：

- 需要椭球地球、影像/地形层、时间轴和实体轨迹的 Web 地理可视化
- 3D Tiles / glTF / CZML 这类地理空间资产要进浏览器
- 能接受 Node >= 22 的包装边界，并分清 engine / widgets

**不适用**：

- 只要 2D 矢量地图 → [[maplibre-gl]] / [[mapbox-gl-js]]
- 通用产品展示或游戏场景、没有地理坐标系 → [[threejs]] / [[babylonjs]]
- 把未测的帧率、实体数量阈值或包体大小当选型结论
- 运行时还停在 Node 18 / 20——固定包声明 `>=22.0.0`

## 固定版本边界

- 本文绑定 `CesiumGS/cesium@6d5d8b1f0725b6f831b336463f4b11c98023427b`，即 annotated tag `1.144` 剥出的提交。
- npm `cesium@1.144.0`、`@cesium/engine@26.2.0`、`@cesium/widgets@16.1.1` 的 `gitHead` 均同指此 SHA。
- 伞包依赖 `protobufjs`；engine 另有 draco3d、ktx-parse、lerc、meshoptimizer 等运行时依赖。
- `Clock.shouldAnimate` 默认 false；`Cartesian3.fromDegrees` 的 height 默认 0；`SampledPositionProperty` 默认 `ReferenceFrame.FIXED`。
- 本文未安装依赖、未开 Sandcastle、未连 Ion、未跑 gulp/karma/playwright，状态保持 `UNVERIFIED`。

## 学到什么

1. **Viewer 不是 Scene**——壳在 widgets，地球和时钟在 engine / widget。
2. **时间默认是停着的**——要运动先开 `shouldAnimate`。
3. **地理坐标有椭球合同**——度 → 弧度 → ECEF，高度是米。
4. **大场景入口是异步工厂**——tileset 先读 JSON，再进 `primitives`。

## 应用型自测

1. `new Cesium.Viewer(el)` 之后，不改 clock，实体的 `SampledPositionProperty` 会自己随墙钟前进吗？
2. `JulianDate.addSeconds(start, 3600)` 只传两个参数，固定 1.144 接受吗？
3. `new Cesium.Cesium3DTileset("https://example.com/tileset.json")` 是不是现行加载方式？

检查点：

1. 不会。`shouldAnimate` 默认 `false`，`tick` 不会推进。
2. 不接受。`result` 必填。
3. 不是。要用 `Cesium3DTileset.fromUrl`（或 `fromIonAssetId`）。

## 延伸阅读

- 官方文档：[CesiumJS Documentation](https://cesium.com/learn/cesiumjs-learn/)
- Sandcastle：[sandcastle.cesium.com](https://sandcastle.cesium.com/)
- 固定源码：[CesiumGS/cesium](https://github.com/CesiumGS/cesium) —— 本文绑定提交 `6d5d8b1f0725b6f831b336463f4b11c98023427b`
- [[babylonjs]] —— 本地笛卡尔场景、无椭球时钟的对照
- [[maplibre-gl]] —— 2D 矢量地图对照

## 关联

- [[babylonjs]] —— 浏览器 3D 引擎，坐标系不是 ECEF
- [[threejs]] —— 通用场景图，无内置地球
- [[maplibre-gl]] —— 2D 矢量地图
- [[mapbox-gl-js]] —— 2D 地图上游对照
- [[deck.gl]] —— 常叠在地球或地图上的 GPU 图层
- [[gltf-transform]] —— 同生态的 glTF 资产工具链，不是 Cesium 本体

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[gltf-transform]] —— glTF Transform — glTF 资产工具链
- [[openlayers]] —— OpenLayers — 全功能 GIS 前端
- [[panda3d]] —— Panda3D — 用 Python 写 3D 游戏的老牌引擎
