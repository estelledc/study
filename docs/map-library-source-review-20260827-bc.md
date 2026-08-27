# Map library source review (writer BC)

> 用途：记录 Leaflet 与 Mapbox GL JS 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer BC
- evidence：GitHub metadata、npm 元数据、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、未渲染地图、未申请 token、未测量 bundle 或性能
- worktrees：本机 `research-worktrees/`，不进入 Git

## Leaflet

- canonical source：`https://github.com/Leaflet/Leaflet`
- revision：`d15112c9e8ac339f0f74f563959d0423d291308d`
- package：`leaflet@1.9.4`
- provenance：
  - npm `latest` / `gitHead` 均为 `d15112c9...`
  - GitHub annotated tag `v1.9.4` 剥开后指向同一提交
  - 仓库另有 `v2.0.0-alpha` / `v2.0.0-alpha.1`；本文不绑定 alpha
- inspected：
  - `package.json`
  - `README.md`
  - `src/Leaflet.js`
  - `src/map/Map.js`
  - `src/map/index.js`
  - `src/layer/Layer.js`
  - `src/layer/LayerGroup.js`
  - `src/layer/FeatureGroup.js`
  - `src/layer/GeoJSON.js`
  - `src/layer/tile/GridLayer.js`
  - `src/layer/tile/TileLayer.js`
  - `src/geo/LatLng.js`
  - `src/geo/crs/CRS.EPSG3857.js`
  - `src/control/Control.js`
  - `src/control/Control.Zoom.js`
  - `src/control/Control.Attribution.js`
- observed：
  - public export surface is Map / Layer / Control / geo / geometry；factory is `L.map()`;
  - default CRS is `EPSG3857`; `LatLng` takes `(lat, lng)`; GeoJSON `coordsToLatLng` reads `[lng, lat]`;
  - `TileLayer` extends `GridLayer` (`tileSize` 256, default `maxZoom` 18, `subdomains` `'abc'`);
  - `LayerGroup` batches add/remove; `FeatureGroup` adds event parent + `getBounds()`;
  - default `zoomControl` and `attributionControl` are on; `invalidateSize()` refreshes after container resize;
  - 1.9.4 core has no WebGL renderer and no MarkerCluster implementation.

## Mapbox GL JS

- canonical source：`https://github.com/mapbox/mapbox-gl-js`
- revision：`2d7d5d25a4e2f8bc7fb778381e15764b97d4fc65`
- package：`mapbox-gl@3.29.0`
- provenance：
  - GitHub lightweight tag `v3.29.0` 指向上述提交，提交说明含 `GitOrigin-RevId: e0492c026d0d8e3245611efd2562cdeedd047c62`
  - npm `latest` 的 `gitHead` 是 `e0492c02...`，在 canonical GitHub 仓库不可达
  - 本文绑定可达的 GitHub tag 提交，不伪造内部 mirror SHA
- inspected：
  - `package.json`
  - `LICENSE.txt`
  - `README.md`
  - `ARCHITECTURE.md`
  - `src/index.ts`
  - `src/ui/map.ts`
  - `src/util/config.ts`
  - `src/util/worker_pool.ts`
  - `src/source/source.ts`
  - `src/style/create_style_layer.ts`
- observed：
  - `Map` default style is `mapbox://styles/mapbox/standard` (`config.DEFAULT_STYLE`);
  - constructor uses `[lng, lat]`; default `center [0,0]`, `zoom 0`, `pitch 0`, `maxZoom 22`, `maxPitch 85`;
  - `accessToken` comes from `options.accessToken` or `mapboxgl.accessToken`; license is Mapbox TOS for v2+;
  - workers parse/layout tiles; painter draws style-layer by style-layer; `WorkerPool.workerCount` defaults to 2;
  - `addSource` / `addLayer` mutate the live `Style`; `queryRenderedFeatures` only returns currently rendered features;
  - `setTerrain` exists; 3.29 layer types include fill / line / symbol / circle / heatmap / raster / fill-extrusion / building / model / sky / slot / clip / raster-particle.
