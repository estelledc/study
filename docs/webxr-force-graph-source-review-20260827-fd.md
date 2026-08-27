# A-Frame + 3d-force-graph source review (writer FD)

> 用途：记录 `aframe` 与 `3d-force-graph` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fd` 标记 2026-08-27 平行 writer FD，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- evidence：固定提交静态源码与类型声明阅读
- not executed：未安装两仓依赖，未启动 webpack / rollup，未进入 WebXR session，未创建 WebGL 上下文，未跑 Karma / 上游测试，未测帧率、节点规模或 bundle
- worktrees：本机 `research-worktrees/`（gitignored），blob-filtered + sparse；不进入 Git
- clone notes：`aframevr/aframe` GitHub `size` 约 922MB，只检出 `src/`、`tests/`、`package.json`、`README.md`、`LICENSE`、`CHANGELOG.md`；`vasturiano/3d-force-graph` 只检出 `src/`、`example/`、`package.json`、`README.md`、`LICENSE`
- slugs：仓库笔记 slug 为 `aframe` 与 `3d-force-graph`

## A-Frame

- canonical source：`https://github.com/aframevr/aframe`
- tag：`v1.8.0`（lightweight tag，对象即 commit）
- revision：`77f0513107e00e4738628a2ca8e8f19a38474857`
- package：`aframe@1.8.0`（MIT）
- npm：`aframe@1.8.0` latest，`gitHead` 与 tag 一致
- three alias：`package.json` 依赖 `three` 解析为 `npm:super-three@0.184.0`；入口日志写 supermedium/three.js
- inspected：
  - `package.json`、`README.md`、`src/index.js`
  - `src/core/component.js`
  - `src/core/a-entity.js`
  - `src/core/a-assets.js`
  - `src/core/scene/a-scene.js`
  - `src/components/cursor.js`
  - `src/components/raycaster.js`
  - `src/components/gltf-model.js`
  - `src/systems/gltf-model.js`
  - `src/extras/primitives/primitives/meshPrimitives.js`
- observed：
  - 入口把 `AFRAME` 挂到 `globalThis`，默认等 document ready；`AFRAME_ASYNC` 可跳过；`file:` 协议对资源报 CORS 错；建议 `<script>` 放在 `<head>` 且早于 `<a-scene>`；
  - `registerComponent` 禁止大写名和 `__`；重复注册抛错；object-based 组件用 object pool + `Proxy` 做属性 get/set；
  - `<a-entity>` 的 `object3D` 是 `THREE.Group`（`rotation.order = 'YXZ'`）；`<a-scene>` 的 `object3D` 是 `THREE.Scene`；
  - 场景默认挂 `inspector` / `keyboard-shortcuts` / `screenshot` / `xr-mode-ui` / `device-orientation-permission-ui`；camera system 先于其他 system 初始化；
  - `enterVR` 在有 headset / mobile 且 WebXR 可用时 `requestSession('immersive-vr'|'immersive-ar')`；桌面无 headset 走 fullscreen；
  - 渲染循环：`THREE.Timer` → `tick` → `renderer.render` → `tock`；`ar-mode` 临时清空 scene background；
  - `cursor` 依赖 `raycaster`；默认 `fuse` 仅 `utils.device.isMobile()` 为真；`fuseTimeout` 默认 1500ms；合成 `click` / `mouseenter` 等；
  - `raycaster.objects` 为空时 `querySelectorAll('*')` 并警告应写选择器；
  - `gltf-model` 组件用 `GLTFLoader`，动画数组挂到 scene；Draco / Meshopt / KTX2 由同名 **system** 配置路径；Draco 默认 `gstatic` 1.5.7；Meshopt 默认空路径；
  - `a-box` 等 primitive 由 geometry 名自动注册，本质是带默认 `geometry.primitive` 的 entity；
  - `<a-assets>` 必须是 scene 子节点，默认 timeout 3000ms；
  - 核心仓没有 `animation-mixer`。

## 3d-force-graph

- canonical source：`https://github.com/vasturiano/3d-force-graph`
- tag：`v1.80.0`
- revision：`957c1831157416e88ea9faf8e6a4edfe7b545858`
- package：`3d-force-graph@1.80.0`（MIT）
- npm：`3d-force-graph@1.80.0` latest，`gitHead` 与 tag 一致
- engines：`node >= 12`；runtime `three` 范围为 `>=0.179 <1`
- inspected：
  - `package.json`、`README.md`
  - `src/index.js`
  - `src/index.d.ts`
  - `src/3d-force-graph.js`
  - `src/kapsule-link.js`
- observed：
  - 本包是 Kapsule 壳：`ThreeForceGraph` 负责图对象与力模拟代理，`ThreeRenderObjects` 负责 scene / camera / renderer / controls；
  - 默认灯：`AmbientLight(0xcccccc, Math.PI)` + `DirectionalLight(0xffffff, 0.6 * Math.PI)`；
  - 动画循环：`forceGraph.tickFrame()` → `renderObjs.tick()` → `requestAnimationFrame`；`pauseAnimation` / `resumeAnimation` 取消或重启 rAF；
  - 首次 `onUpdate` 且相机仍在默认 Z 时，把 `camera.position.z` 设为 `Math.cbrt(nodes.length) * 170`（`CAMERA_DISTANCE2NODES_FACTOR`），不是固定 200；
  - `zoomToFit` 调 `forceGraph.getGraphBbox` + `renderObjs.fitToBbox`；
  - `graphData` / `dagMode` / `linkDirectionalParticles` 等经 `kapsule-link` 转发到 `three-forcegraph`；本仓未包含该依赖源码，不对其内部 ID→对象替换做断言；
  - 节点拖拽只在 `enableNodeDrag && enablePointerInteraction && forceEngine === 'd3'` 时用 `three/examples/jsm/controls/DragControls` 安装；
  - 构造选项含 `controlType`（默认 trackball）、`rendererConfig`、`extraRenderers`（给 CSS2D/CSS3D 等第二渲染器）；
  - README / 类型声明：`nodeLabel` 默认 `'name'`，`nodeId` 默认 `'id'`；`dagMode` 取值 `td|bu|lr|rl|zout|zin|radialout|radialin`；
  - `_destructor` 会停动画、清空 `graphData` 并销毁两个内层对象。
