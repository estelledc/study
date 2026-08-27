# Web graphics source review (writer AI)

> 用途：记录 Three.js、PixiJS 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer AI
- evidence：GitHub release/tag metadata、npm latest 版本号、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、浏览器渲染或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git；three.js 与 pixijs 均用 blob-filter + sparse checkout，只取 `src/`、`package.json`、`README.md`
- excluded slugs：A–AH 已分配主题对，以及开放 PR 中的 `zustand`、`jotai`、`haystack`、`langfuse`、`aichat`、`shell-gpt`、`mcp-ts-sdk`、`ollama`、`react-hook-form`、`tanstack-form`、`tanstack-query`、`swr`

## Three.js

- canonical source：`https://github.com/mrdoob/three.js`
- revision：`2431a09f46f34c560bc8e44b33be0e567723d5b9`
- package：`three@0.185.1`
- tag：`r185`（annotated object 指向上述 commit；提交说明为 `r185 (bis)`）
- `src/constants.js`：`REVISION = '185'`
- inspected：
  - `package.json`
  - `src/Three.js`
  - `src/Three.WebGPU.js`
  - `src/constants.js`
  - `src/core/Object3D.js`
  - `src/core/BufferGeometry.js`
  - `src/core/Raycaster.js`
  - `src/objects/Mesh.js`
  - `src/objects/InstancedMesh.js`
  - `src/cameras/PerspectiveCamera.js`
  - `src/materials/Material.js`
  - `src/materials/MeshBasicMaterial.js`
  - `src/materials/MeshStandardMaterial.js`
  - `src/math/ColorManagement.js`
  - `src/renderers/WebGLRenderer.js`
  - `src/renderers/webgpu/WebGPURenderer.js`
- observed：
  - 默认 `three` 入口只再导出 `Three.Core` 与 `WebGLRenderer`；`WebGPURenderer`、节点材质和 TSL 在 `three/webgpu` / `three/tsl`；
  - `WebGLRenderer` 注释写明自 `r163` 起不支持 WebGL 1，走 WebGL 2；
  - `render(scene, camera)` 先 `scene.updateMatrixWorld()`，相机无 parent 时再更新相机矩阵，然后 `projectObject`、排序、`setupLights`、画背景与 scene；`camera` 必须是 `THREE.Camera`；
  - `setAnimationLoop` 把回调交给内部 `WebGLAnimation` 与 XR manager；传入 `null` 会 `animation.stop()`；
  - `Mesh` 默认 `BufferGeometry` + `MeshBasicMaterial`；`MeshBasicMaterial` 不受光照；`MeshStandardMaterial` 是 metallic-roughness PBR，默认 `roughness=1`、`metalness=0`，文档要求最好给 environment map；
  - `Object3D.add` 会先 `removeFromParent()` 再挂到新父节点；
  - `PerspectiveCamera` 默认 `fov=50`、`aspect=1`、`near=0.1`、`far=2000`；
  - `Raycaster.setFromCamera` 接受 NDC `[-1, 1]`；透视相机从 `matrixWorld` 取 origin，方向经 `unproject`；
  - `InstancedMesh` 用同一 geometry/material 的不同 world transform 降 draw call；
  - `BufferGeometry.dispose()` 只派发 `dispose` 事件，由渲染器释放 GPU 缓冲；`Mesh` 本身没有 `dispose()`；
  - `ColorManagement.enabled` 默认为 `true`，工作色域为 `LinearSRGBColorSpace`。
- provenance：
  - GitHub tag `r185` 剥开后与 npm `three@0.185.1` 的 `gitHead` 同为 `2431a09f...`；
  - npm 另有 `0.185.0`，`gitHead=6c3f7f528cdc...`，与 `r185` 不一致；本页绑定内部一致的 `0.185.1` / `r185`；
  - 未 clone `examples/`、`build/`、`docs/`；完整仓库约 1.6GB，本审查只用 8.6MB sparse tree。

## PixiJS

- canonical source：`https://github.com/pixijs/pixijs`
- revision：`3b6b5635deb9edd09f3eafd548b1e82685853ea7`
- package：`pixi.js@8.20.1`
- tag：`v8.20.1`（annotated object 指向上述 commit）
- inspected：
  - `package.json`
  - `src/app/Application.ts`
  - `src/app/TickerPlugin.ts`
  - `src/rendering/renderers/autoDetectRenderer.ts`
  - `src/rendering/renderers/shared/instructions/RenderPipe.ts`
  - `src/rendering/renderers/shared/system/SharedSystems.ts`
  - `src/scene/container/Container.ts`
  - `src/scene/particle-container/shared/ParticleContainer.ts`
  - `src/assets/Assets.ts`
  - `src/ticker/Ticker.ts`
  - `src/filters/FilterSystem.ts`
  - `src/scene/graphics/shared/utils/convertFillInputToFillStyle.ts`
- observed：
  - `Application` 构造函数若仍传 options，debug 构建会标 `v8_0_0` 弃用，要求改走 `await init()`；
  - `init()` 调用 `autoDetectRenderer`，再按注册顺序跑 Application plugins（含 `TickerPlugin`、`ResizePlugin`）；
  - 默认 renderer 优先级是 `['webgl', 'webgpu', 'canvas']`；字符串 `preference` 会插到队首并保留其余回退，数组则只尝试列出的后端；
  - `TickerPlugin` 默认 `autoStart: true`，由 ticker 调 `app.render()` → `renderer.render({ container: this.stage })`；`app.view` 已弃用，应使用 `app.canvas`；
  - `Ticker.deltaTime` 是无量纲标量（约 60 FPS 时 ≈ 1），由 `deltaMS * Ticker.targetFPMS` 得到，不是毫秒；
  - `ParticleContainer.addChild` / `addChildAt` 会抛错，必须 `addParticle`；默认 `dynamicProperties.position=true`，`rotation/vertex/uvs/color=false`；
  - `FilterSystem` 用 `TexturePool` 做离屏目标；源码注明 RenderGroup 与 filter 不兼容，嵌套且需要 blending 的 filter 也有已知限制；
  - Graphics 路径是 `rect(...).fill(...)`，不是 v7 的 `beginFill().drawRect()`；
  - 共享管线包含 `BatcherPipe`、`RenderGroupPipe`、`RenderGroupSystem`、`CustomRenderPipe`。
- provenance：
  - GitHub latest tag `v8.20.1` 与 npm latest `pixi.js@8.20.1` 的 `gitHead` 同为 `3b6b5635...`；
  - 生产依赖包括 `eventemitter3`、`earcut`、`tiny-lru` 等，不是零依赖；
  - 未 clone examples/playground；sparse tree 约 14MB。
