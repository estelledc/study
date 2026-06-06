---
title: CesiumJS — 浏览器里的三维地球与时间动画
来源: 'https://github.com/CesiumGS/cesium'
日期: 2026-05-31
子分类: 数据可视化
分类: 数据可视化
难度: 中级
provenance: pipeline-v3
---

## 是什么

CesiumJS 是一份基于 WebGL 的开源三维地球与地理空间引擎，2011 年由 AGI（Analytical Graphics, Inc.）从内部产品 STK Web 抽出来，按 Apache 2.0 许可对外开放。日常类比：你以前要装一个十几 GB 的桌面地球客户端、再点一堆按钮才能看到一颗卫星绕地球转，Cesium 把这件事压进浏览器一段 JS——打开网页就是真实地球，鼠标滚轮就能从太空一路滑到楼顶。

最小例子：

```js
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

const viewer = new Cesium.Viewer('cesiumContainer');
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(121.47, 31.23, 1500),
  point: { pixelSize: 12, color: Cesium.Color.RED },
  label: { text: '上海', font: '14pt sans-serif' },
});
```

底层是「椭球地球 + 影像与地形瓦片 + glTF 模型 + 时间轴」一整套渲染管线，浏览器原生跑，不装客户端。

## 为什么重要

不理解这套引擎，下面这些事都没法解释：

- 为什么 FlightRadar24、各家国家空管演示页、SpaceX 卫星轨道展示都长得像同一个地球——多数底层就是 Cesium 或它的派生
- 为什么三维地理可视化没像 GIS 桌面那样裂成一堆格式——Cesium 团队主导的 3D Tiles 与 glTF 已经成 OGC 标准
- 为什么"时间动态"在 Cesium 里是一等公民——CZML + Clock + Timeline 把"地理空间 + 时间"两个轴绑成一种数据
- 为什么城市数字孪生、BIM 上网这一波能直接落到浏览器——3D Tiles 让几百 GB 倾斜摄影模型按视野流式加载
- 为什么国防 / 航天 / 民航场景偏爱 Cesium——Apache 2.0 + 可商用 + 内置椭球数学，省掉自己处理 ECEF 坐标的痛

## 核心要点

可以拆成三层来理解：

1. **运行时四件套**：`Viewer`（容器）/ `Scene`（渲染上下文）/ `Globe`（地球本身，含影像与地形）/ `Camera`（相机控制）。一行 `new Viewer(...)` 把这四个都装好，剩下都是往 `Scene` 里加东西。

2. **两套加点东西的 API**：高层 **Entity API** 用声明式 JS 对象写「一个点 / 一架飞机 / 一条轨迹」，引擎自己批渲染；低层 **Primitive API** 直接组几何 + 着色器，性能高、上手陡。一般业务先 Entity，几千实体之后再下沉。

3. **数据格式三件**：**3D Tiles**（OGC 标准，把超大三维场景切成空间索引的瓦片，按视野流式加载，Cesium 团队首创）、**glTF**（单个模型，飞机 / 卫星 / 建筑）、**CZML**（时间动态 JSON，等价于地理空间的 keyframe 动画，告诉地球"这架飞机 12:00:00 在 A、12:00:30 在 B，自己插值"）。

把三层串起来：你拿一份 CZML 描述卫星轨迹，丢到 Entity API，Viewer 会按 Clock 当前时间自动算位置、自动渲染、自动更新 Timeline 拉条。

## 实践案例

### 案例 1：画一颗会动的卫星

```js
const viewer = new Cesium.Viewer('cesiumContainer');
viewer.clock.shouldAnimate = true;

const start = Cesium.JulianDate.fromIso8601('2026-05-31T00:00:00Z');
const stop  = Cesium.JulianDate.addSeconds(start, 3600, new Cesium.JulianDate());

const positionProperty = new Cesium.SampledPositionProperty();
for (let t = 0; t <= 3600; t += 60) {
  const time = Cesium.JulianDate.addSeconds(start, t, new Cesium.JulianDate());
  const lon = -180 + (t / 3600) * 360;
  positionProperty.addSample(time, Cesium.Cartesian3.fromDegrees(lon, 0, 700_000));
}

viewer.entities.add({
  availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start, stop })]),
  position: positionProperty,
  point: { pixelSize: 10, color: Cesium.Color.YELLOW },
  path: { width: 2 },
});
```

引擎会沿采样点插值，并把整条轨迹画成一根线，Timeline 拉条同步前后扫。

### 案例 2：把一座城市搬到地球上（3D Tiles）

```js
const tileset = await Cesium.Cesium3DTileset.fromUrl(
  'https://example.com/city/tileset.json'
);
viewer.scene.primitives.add(tileset);
await viewer.zoomTo(tileset);
```

只要加一个 `tileset.json` URL，引擎按相机视野与 LOD 自己调度子瓦片，几百 GB 的倾斜摄影模型也能在 4G 网络下按需加载。

### 案例 3：加一架 glTF 飞机并贴在轨迹上

```js
viewer.entities.add({
  position: positionProperty,
  orientation: new Cesium.VelocityOrientationProperty(positionProperty),
  model: { uri: '/models/CesiumAir.glb', minimumPixelSize: 64 },
});
```

`VelocityOrientationProperty` 让模型机头自动指向速度方向，省掉手算姿态四元数。

## 踩过的坑

1. **椭球 vs 平面坐标**：经纬度 + 高度需要先转成 ECEF（Earth-Centered Earth-Fixed）笛卡尔坐标，引擎才能渲染。`Cartesian3.fromDegrees(lon, lat, height)` 必须熟，否则一切位置都飘。

2. **JulianDate 不是 Date**：时间用儒略日（Julian Date）表示，跨平台 / 跨时区比 `new Date()` 稳，但调试不直观，常忘了 `JulianDate.toIso8601()` 转字符串。

3. **Entity 太多会卡**：动态实体超过几千就该切 Primitive 批渲染或合并成 instance；继续加 Entity 会一路掉帧到个位数。

4. **Ion token 用量收费**：默认地形与影像走 Cesium Ion，超免费额度要付钱或自托管瓦片（开源 Cesium Terrain Builder / 自己生成 Quantized Mesh）。

5. **包体大**：完整 CesiumJS gzip 后 1-2MB，初次加载慢；生产要用 `@cesium/engine` + `@cesium/widgets` 拆包并按需 `import`。

## 适用 vs 不适用场景

适用：

- 卫星轨迹与空间态势感知（SSA），需要时间轴 + 轨道插值
- 国家空管 / FlightRadar24 类民航实时态势
- 城市 BIM / 数字孪生 / 倾斜摄影模型的 Web 端展示
- 无人机航线规划与回放，需要真实地形 + 高度
- 与 [[deck.gl]] 叠加做大数据可视化时需要一个真实三维底图

不适用：

- 只要 2D 地图 / 矢量底图 → 用 [[maplibre-gl]] / [[mapbox-gl-js]]，包体小一个数量级
- 通用三维场景（产品展示 / 游戏） → 用 [[three-js]]，没地理坐标系开销
- 仅做静态截图或轻量轨迹图 → 用 [[d3]] + 投影库即可
- 移动端弱网弱 GPU → CesiumJS 启动开销不小，要谨慎评估

## 历史小故事（可跳过）

- **2011**：AGI 把内部产品 STK Web 抽出，开源为 Cesium，Apache 2.0
- **2015**：3D Tiles 草案首发，专门解决「KML/glTF 单文件不够大」的瓶颈
- **2019**：3D Tiles 1.0 成为 OGC 社区标准，Esri / Google Earth Studio 等陆续接入
- **2021**：Cesium 被 Bentley Systems 收购，公司层面绑到 BIM 与基建侧
- **2024 起**：3D Tiles Next 演进（更细的 metadata、I3DM 改进、glTF 2.0 KHR 扩展全面对齐）

## 学到什么

1. **地理 + 时间是一等公民**：Cesium 把 Clock / Timeline / availability / SampledPositionProperty 全部内置，逼你按"四维"思考
2. **流式三维比一次性下载更重要**：3D Tiles 的本质是把空间索引 + LOD 标准化，没这一层，城市级模型上不了浏览器
3. **椭球数学不要绕**：经纬度 → ECEF → 屏幕像素，每一步都有坑；用引擎封装好的 API 比自己写矩阵安全
4. **API 分层让上手与极致性能可以分阶段**：先 Entity 写 demo，性能不够再下沉 Primitive，是健康的演进路径

## 延伸阅读

- 官方文档：[CesiumJS Documentation](https://cesium.com/learn/cesiumjs-learn/)
- 沙盒入门：[Cesium Sandcastle](https://sandcastle.cesium.com/)（在线改代码改示例）
- 3D Tiles 规范：[OGC 3D Tiles Spec](https://www.ogc.org/standards/3DTiles)
- CZML 入门：[CZML Guide](https://github.com/CesiumGS/cesium/wiki/CZML-Guide)
- [[maplibre-gl]] —— 2D 矢量地图，扁平场景的对照
- [[deck.gl]] —— GPU 数据可视化层，常叠在 Cesium 上做热力 / 流场

## 关联

- [[mapbox-gl-js]] —— 2D 矢量地图上游，思想互补
- [[maplibre-gl]] —— 2D 矢量地图开源主流，与 Cesium 常组合做"2D + 3D 切换"
- [[deck.gl]] —— GPU 大数据可视化，官方支持以 Cesium 为底图
- [[three-js]] —— 通用 3D 引擎，没地理坐标系内置，与 Cesium 形成对照
