---
title: MapLibre GL JS — Mapbox v1 时代的社区分叉
来源: 'https://github.com/maplibre/maplibre-gl-js'
日期: 2026-05-31
分类: projects / 数据可视化
难度: 中级
---

## 是什么

MapLibre GL JS 是一份 Web 矢量地图渲染库，2020 年底从 [[mapbox-gl-js]] v1.13 fork 出来、用 BSD-3 许可继续开源。日常类比：原本免费请大家喝的咖啡店突然挂出"今后只对会员开放"的牌子，常客把咖啡机搬出来重开了一家「同一个豆子、同一种磨法」的店——MapLibre 干的就是这件事。fork 时点是 Mapbox 把 v2.0 改成 Mapbox TOS 专有许可、要求 API token 才能用；社区把 v1.x 的最后一个开源版本接过来，组建 MapLibre Organization 继续推进。

最小例子（API 与 Mapbox v1 几乎逐字相同）：

```js
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [121.47, 31.23],
  zoom: 11,
  pitch: 45,
});
```

不需要任何 token；style URL 指向任意符合 MapLibre Style Spec 的 JSON。底层依旧是「下发矢量瓦片 → 浏览器 WebGL 现场画」这套流水线，与 Mapbox GL JS v1 同构。

## 为什么重要

不理解这次 fork 与之后的演化，下面这些事都没法解释：

- 为什么 2021 年起 AWS Location Service / Microsoft Azure Maps / Stadia Maps / MapTiler 不约而同把 MapLibre 当默认客户端——它把矢量地图栈从单一公司手里解耦，落到联合治理的开源组织
- 为什么 MapLibre Style Spec 被当成事实标准——OpenMapTiles / OpenFreeMap / Protomaps PMTiles 这些瓦片源都按这套 JSON 输出，下游随便换渲染端
- 为什么 [[deck.gl]] / Kepler.gl 这类可视化库改名换 prop，把底图默认从 mapbox-gl 切到 maplibre-gl——免 token、可商用、API 兼容
- 为什么"vector tile + WebGL 客户端渲染"这套范式在被 fork 之后反而走得更远——3D terrain、globe projection、CSS color、distance-field glyph 都是 fork 之后才合入主线
- 为什么这是开源治理史上少见的成功案例——同类的 Elasticsearch / Redis 分叉常陷入两边特性追跑，MapLibre 反而靠多公司联合治理走出独立轨道

## 核心要点

可以拆成三层来理解：

1. **协议层（Style Spec）**：一份 JSON 文档约定「数据源 + 图层 + 样式表达式」，与 v1 时代 Mapbox 公布的格式完全兼容。这层是 fork 能成立的基础——只要约定不变，后端瓦片和前端渲染就能各自演化。

2. **渲染层（GL JS / Native）**：Web 端是 maplibre-gl-js（WebGL2，兼容 WebGL1），移动端是 maplibre-gl-native（iOS / Android / Qt 共享一套 C++ 内核）。两者读同一份 style.json，行为应当一致。

3. **生态层**：上游瓦片有 OpenMapTiles（OSM 抽出多 zoom MBTiles）、Protomaps PMTiles（单文件可直接放 S3，零服务端）、OpenFreeMap（公益 CDN）；下游可视化有 deck.gl / Kepler.gl / react-map-gl（v7 起官方支持 maplibre-gl）。

把这三层串起来：你写一份 style.json，前端用 maplibre-gl-js 渲染；瓦片可以来自任何符合规范的 source；同样这份 JSON 拿到手机上也能跑。

## 实践案例

### 案例 1：把 Mapbox 站点迁到 MapLibre

旧代码：

```js
import mapboxgl from 'mapbox-gl';
mapboxgl.accessToken = 'pk.xxx';
new mapboxgl.Map({ style: 'mapbox://styles/mapbox/streets-v12', /* ... */ });
```

迁移后：

```js
import maplibregl from 'maplibre-gl';
new maplibregl.Map({
  style: 'https://tiles.openfreemap.org/styles/liberty',
  /* 其他参数原样保留 */
});
```

代码层只改两处：包名、style URL；token 字段直接删除。绝大多数 layer / source / event API 命名一致。

### 案例 2：用 PMTiles 做"零服务端"地图

[[pmtiles]] 把整套瓦片打包成单文件，配 MapLibre 的协议扩展即可在浏览器直接读 S3 / R2 上的 `.pmtiles`：

```js
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

new maplibregl.Map({
  container: 'map',
  center: [121.47, 31.23],
  zoom: 10,
  style: {
    version: 8,
    sources: {
      protomaps: {
        type: 'vector',
        url: 'pmtiles://https://example.com/shanghai.pmtiles',
      },
    },
    layers: [
      {
        id: 'roads',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        paint: { 'line-color': '#888', 'line-width': 1 },
      },
    ],
  },
});
```

三步：注册 `pmtiles` 协议 → source 用 `pmtiles://https://...` → layer 按 `source-layer` 画线。完全没瓦片后端，部署成本只有「上传一个文件 + 静态站点」。

### 案例 3：Globe projection 与 3D terrain

fork 之后社区合入 globe projection（地球球体投影）与 raster-dem 高程瓦片：

```js
map.setProjection({ type: 'globe' });
map.setTerrain({ source: 'terrarium', exaggeration: 1.4 });
```

两行就把平面地图切成 3D 地球或带高程的山脉视图。这些特性 Mapbox 在 v2 / v3 的专有版本里也有，但 MapLibre 的实现完全在 BSD-3 仓库里，可以阅读、可以自托管。

## 踩过的坑

1. **不是 100% 等价 Mapbox v2**：fork 自 v1.13，所以 Mapbox v2 之后引入的特性（fog、camera 动画曲线等专有 API）需要看 MapLibre 是否单独实现——不是简单"补丁版"。

2. **style URL 不要再写 `mapbox://`**：MapLibre 不解析这个协议前缀。把 style 改成完整 https URL 或自己 host 一份 JSON。

3. **glyph / sprite 路径是绝对 URL**：很多旧 style 文件里写的是 `mapbox://...`，迁过来要改成具体的字体 / icon CDN，否则文字渲染失败、图标全黑。

4. **WebGL2 vs WebGL1**：MapLibre 5.x 默认尝试 WebGL2，旧设备会回落 WebGL1，行为略不同。需要稳态时显式 `canvasContextAttributes: { contextType: 'webgl' }`。

5. **react-map-gl 的版本对应**：v6 只识别 mapbox-gl，v7 起才支持显式传入 maplibre-gl。复制旧示例时容易踩到包不匹配。

## 适用 vs 不适用场景

适用：

- 公司不想或不能给每个用户消耗 Mapbox token / 配额
- 自托管瓦片（OpenMapTiles / Protomaps）想要一个能读这些数据的现成客户端
- 数据可视化叠加（[[deck.gl]] / Kepler.gl）需要矢量底图、且不想引入闭源依赖
- 移动端原生壳子（iOS / Android），想和 Web 共享一套 style.json

不适用：

- 已经深度用 Mapbox v2/v3 专有特性（fog、Standard style 等）—— 切过来要重新评估等价物
- 只需要静态截图地图——直接用 raster tile 服务（Stamen / Stadia static）成本更低
- 需要室内地图 / 路径规划等业务级 SDK——MapLibre 只解决"渲染"，路由、地理编码要另外接

## 历史小故事（可跳过）

- **2014**：Mapbox 公布 vector tile 规范与 mapbox-gl-js v0.x，矢量地图开始替代 raster tile
- **2020-12**：Mapbox 发布 v2.0，改用 Mapbox TOS 专有许可，要求 access token，社区一周内 fork 出 MapLibre
- **2021**：MapLibre Organization 成立，AWS / Microsoft / MapTiler / Stadia 等厂商加入治理
- **2022-2024**：globe projection、3D terrain、distance-field glyph 等特性陆续合入 main
- **2025**：MapLibre 5 系列稳定，react-map-gl / deck.gl 默认底图全面切到 maplibre-gl

短短四年，从"被动接住开源火炬"变成"独立向前推进矢量地图标准"。

## 学到什么

1. **协议比实现更难被替换**：Style Spec 这份 JSON 让前后端解耦，使得 fork 拿到的不只是代码，还有整个生态的接口
2. **联合治理比单一公司更稳**：多家云厂商共担维护，谁也不会突然又改许可
3. **fork 不是终点而是起点**：globe / terrain / pmtiles 协议这些都是 fork 后长出来的，证明社区 capacity 不止"维持现状"
4. **API 兼容是降低迁移成本的关键**：90% 代码不动就能切走，是用户敢迁的前提

## 延伸阅读

- 官方文档：[MapLibre GL JS Docs](https://maplibre.org/maplibre-gl-js/docs/)
- Style Spec：[MapLibre Style Spec](https://maplibre.org/maplibre-style-spec/)
- Protomaps PMTiles：[pmtiles 单文件瓦片协议](https://protomaps.com/docs/pmtiles)
- OpenFreeMap：[公益 MapLibre 瓦片 CDN](https://openfreemap.org/)
- [[mapbox-gl-js]] —— 上游 v1 时代的同构实现
- [[deck.gl]] —— GPU 数据可视化层，常与 MapLibre 叠加

## 关联

- [[mapbox-gl-js]] —— fork 的源头，v1 时代 API 与思想完全继承
- [[deck.gl]] —— GPU 大数据可视化，默认底图层支持 MapLibre
- [[d3]] —— 通用可视化框架，地理可视化常与 MapLibre 互补
- [[postgis]] —— 后端空间数据库，配合 tippecanoe / pg_tileserv 输出 MapLibre 可读的 vector tile
