# Babylon.js + CesiumJS source review (writer FH)

> 用途：记录 `babylonjs` 与 `cesium` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fh` 标记 2026-08-27 平行 writer FH，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行 unit / visualization / gulp / karma / playwright，未打开 playground 或 Sandcastle，未连 Cesium Ion，未测 bundle / FPS / 瓦片吞吐
- worktrees：本机 `research-worktrees/`（gitignored），只拉关键路径；两仓 GitHub `size` 均超过 1GB，未做完整 clone
- slugs：`babylonjs`、`cesium`

## Babylon.js

- canonical source：`https://github.com/BabylonJS/Babylon.js`
- tag：`9.23.0`（annotated；剥出 commit `38ed028f40722504a215002fbc2fa89a2c89cf5d`）
- revision：`38ed028f40722504a215002fbc2fa89a2c89cf5d`
- packages：`@babylonjs/core@9.23.0`、`@babylonjs/loaders@9.23.0`（Apache-2.0，`type: module`）
- npm：两包 `gitHead` 均与 tag 提交一致
- inspected：
  - `packages/public/@babylonjs/core/package.json`
  - `packages/public/@babylonjs/loaders/package.json`
  - `packages/dev/core/src/Engines/engine.ts`
  - `packages/dev/core/src/Engines/engine.pure.ts`
  - `packages/dev/core/src/Engines/engineFactory.ts`
  - `packages/dev/core/src/Engines/abstractEngine.pure.ts`
  - `packages/dev/core/src/Engines/webgpuEngine.ts`
  - `packages/dev/core/src/scene.ts`
  - `packages/dev/core/src/scene.pure.ts`
  - `packages/dev/core/src/Cameras/freeCamera.ts`
  - `packages/dev/core/src/Cameras/freeCamera.pure.ts`
  - `packages/dev/core/src/Meshes/meshBuilder.ts`
  - `packages/dev/core/src/Meshes/meshBuilder.pure.ts`
  - `packages/dev/core/src/Meshes/Builders/boxBuilder.ts`
  - `packages/dev/core/src/Meshes/Builders/boxBuilder.pure.ts`
  - `packages/dev/core/src/Loading/sceneLoader.ts`
  - `packages/dev/core/src/Helpers/sceneHelpers.ts`
  - `packages/dev/core/src/Helpers/sceneHelpers.pure.ts`
  - `packages/dev/core/src/XR/webXRDefaultExperience.ts`
  - `packages/dev/core/src/Lights/hemisphericLight.ts`
  - `packages/dev/loaders/src/index.ts`
  - `packages/dev/loaders/src/glTF/index.ts`
  - `packages/dev/loaders/src/glTF/glTFFileLoader.ts`
- observed：
  - 9.x 把实现放在 `*.pure.ts`，薄入口 `export *` 后再 `Register*`；`Scene` / `FreeCamera` / `HemisphericLight` / glTF loader 都是这个形状；
  - `Engine` 构造函数第二参是 antialias，默认 false；`runRenderLoop` 在 `AbstractEngine`，可登记多个回调，第一次才 `_queueNewFrameForRenderLoop`；
  - `EngineFactory.CreateAsync` 先 `WebGPUEngine.IsSupportedAsync`，再 `Engine.IsSupported`，最后 `NullEngine`；
  - `Scene.render` 调用 `_renderFrame`：涨 `_frameId`、`animate()`、更新 camera，再绘制；
  - `MeshBuilder` 是 `{ CreateBox, CreateGround, ... }` 函数表；`CreateBox` 先 `new Mesh` 再 `CreateBoxVertexData.applyToMesh`；
  - 现行追加 API 是模块级 `AppendSceneAsync(source, scene, options)`；`SceneLoader.AppendAsync` 仍在但 deprecated；
  - `createDefaultXRExperienceAsync` 由 `RegisterSceneHelpers` 挂到 `Scene.prototype`，内部 `WebXRDefaultExperience.CreateAsync`；默认打开 UI、pointer、teleport（吃 `floorMeshes`）、near interaction、hand tracking；
  - `FreeCamera.attachControl` 的 canvas 参数已 ignored，只保留 `noPreventDefault`；
  - `@babylonjs/loaders` 导出 BVH / FBX / glTF / OBJ / STL / SPLAT；glTF 入口调用 `RegisterGLTFFileLoader`。

## CesiumJS

- canonical source：`https://github.com/CesiumGS/cesium`
- tag：`1.144`（annotated；剥出 commit `6d5d8b1f0725b6f831b336463f4b11c98023427b`）
- revision：`6d5d8b1f0725b6f831b336463f4b11c98023427b`
- packages：`cesium@1.144.0`、`@cesium/engine@26.2.0`、`@cesium/widgets@16.1.1`（Apache-2.0；均声明 `node: >=22.0.0`）
- npm：三包 `gitHead` 均与 tag 提交一致
- inspected：
  - `package.json`
  - `packages/engine/package.json`
  - `packages/widgets/package.json`
  - `packages/widgets/Source/Viewer/Viewer.js`
  - `packages/engine/Source/Widget/CesiumWidget.js`
  - `packages/engine/Source/Scene/Scene.js`
  - `packages/engine/Source/Scene/Globe.js`
  - `packages/engine/Source/Scene/Camera.js`
  - `packages/engine/Source/Scene/Cesium3DTileset.js`
  - `packages/engine/Source/Scene/Primitive.js`
  - `packages/engine/Source/DataSources/Entity.js`
  - `packages/engine/Source/DataSources/SampledPositionProperty.js`
  - `packages/engine/Source/DataSources/VelocityOrientationProperty.js`
  - `packages/engine/Source/DataSources/CzmlDataSource.js`
  - `packages/engine/Source/Core/JulianDate.js`
  - `packages/engine/Source/Core/Cartesian3.js`
  - `packages/engine/Source/Core/Clock.js`
- observed：
  - 伞包 `cesium@1.144.0` 依赖 `@cesium/engine@^26.2.0` 与 `@cesium/widgets@^16.1.1`；
  - `Viewer` 创建 DOM 与 `Clock`/`ClockViewModel`，再构造 `CesiumWidget`；`entities` getter 转到 widget 默认 DataSource；
  - `Clock` 默认 `shouldAnimate=false`、`canAnimate=true`、`multiplier=1`、`clockStep=SYSTEM_CLOCK_MULTIPLIER`、`clockRange=UNBOUNDED`；未给 stopTime 时为 start + 1 天；
  - `CesiumWidget` 在 `globe !== false` 且未禁用 baseLayer 时默认 `ImageryLayer.fromWorldImagery()`；
  - `Cartesian3.fromDegrees` 转弧度后走 `fromRadians`；height 默认 0，椭球默认 `Ellipsoid.default`；
  - `JulianDate.addSeconds` 要求传入 result 实例；
  - `Cesium3DTileset.fromUrl` 先 `loadJson`，写入 `_geometricError`，再 `new Cesium3DTileset(options)`；另有 `fromIonAssetId`；
  - `SampledPositionProperty` 包 `SampledProperty(Cartesian3)`，默认 `ReferenceFrame.FIXED`、线性插值；
  - `VelocityOrientationProperty` 用 `VelocityVectorProperty(position, true)` 与 `Ellipsoid.default` 求四元数。
