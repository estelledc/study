---
title: Babylon.js — 浏览器里的 3D 游戏和可视化引擎
来源: https://github.com/BabylonJS/Babylon.js
日期: 2026-07-08
分类: graphics
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/BabylonJS/Babylon.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 38ed028f40722504a215002fbc2fa89a2c89cf5d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.23.0
---

## 是什么

Babylon.js 是一份 TypeScript 写的浏览器 3D 引擎。固定 9.23.0 把实现拆成 `@babylonjs/core`（场景、相机、网格、引擎）和 `@babylonjs/loaders`（glTF / FBX / OBJ 等插件）两套发布包；仓库内部则用 `*.pure.ts` 放无副作用实现，再由薄入口做 `Register*` 注册。

日常类比：普通网页像一张海报；Babylon.js 像摄影棚——`Engine` 管电源和快门循环，`Scene` 是片场，相机、灯和 mesh 都挂在同一场里，最后画到 `<canvas>`。

```ts
import { Engine, Scene, FreeCamera, HemisphericLight, MeshBuilder, Vector3 } from "@babylonjs/core";

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
new FreeCamera("camera", new Vector3(0, 2, -6), scene).setTarget(Vector3.Zero());
new HemisphericLight("light", new Vector3(0, 1, 0), scene);
MeshBuilder.CreateBox("box", { size: 2 }, scene);
engine.runRenderLoop(() => scene.render());
```

`Engine` 构造函数第二参是 antialias，默认 `false`；上面的 `true` 显式打开抗锯齿。`runRenderLoop` 定义在 `AbstractEngine`：同一引擎可以登记多个回调，第一次登记才启动 `requestAnimationFrame` 队列。

## 为什么重要

不理解这条 Engine → Scene → render 合同，下面这些事会对不上：

- 为什么 `new Engine(canvas)` 走的是 WebGL 路径，而想优先 WebGPU 要另走 `EngineFactory.CreateAsync`
- 为什么盒子能造出来、`.glb` 却加载失败——加载器是独立包，靠副作用注册插件
- 为什么 `scene.createDefaultXRExperienceAsync` 不是 Scene 本体字段，而是 `RegisterSceneHelpers` 挂上去的
- 为什么 9.x 到处出现 `.pure.ts`：同一符号可以按“无副作用实现”或“带 Register 的入口”两种方式导入

## 核心要点

固定 9.23.0 可以拆成四步：

1. **Engine 选择后端**：`new Engine(canvas, antialias?)` 继承 ThinEngine / AbstractEngine，走 WebGL。`EngineFactory.CreateAsync` 先 `await WebGPUEngine.IsSupportedAsync`，支持则 `WebGPUEngine.CreateAsync`，否则退回 `Engine.IsSupported` 再退 `NullEngine`。

2. **Scene 拥有本帧**：构造时把自身推进 `engine.scenes`（`virtual: true` 除外）。`scene.render()` 只是包一层 `_renderFrame`：涨 `_frameId`、跑 `animate()`、更新 `activeCamera` / `activeCameras`，再进入真正的绘制。

3. **MeshBuilder 是函数表**：`meshBuilder.pure.ts` 导出的是 `const MeshBuilder = { CreateBox, CreateGround, ... }`，每个 `Create*` 来自对应 `Builders/*.pure.ts`。`CreateBox` 先 `new Mesh(name, scene)`，再用 `CreateBoxVertexData` 填顶点。

4. **加载与 XR 都是注册上去的能力**：`AppendSceneAsync(source, scene, { rootUrl })` 是现行模块级 API；类上的 `SceneLoader.AppendAsync` 仍在，但标了 deprecated。`createDefaultXRExperienceAsync` 由 `RegisterSceneHelpers` 写到 `Scene.prototype`，内部调用 `WebXRDefaultExperience.CreateAsync`。

## 实践示例

### 案例 1：最小盒子

```ts
import { Engine, Scene, FreeCamera, HemisphericLight, MeshBuilder, Vector3 } from "@babylonjs/core";

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
const camera = new FreeCamera("camera", new Vector3(0, 2, -6), scene);
camera.setTarget(Vector3.Zero());
camera.attachControl(true);
new HemisphericLight("light", Vector3.Up(), scene);
MeshBuilder.CreateBox("box", { size: 2 }, scene);
engine.runRenderLoop(() => scene.render());
```

**逐部分解释**：`FreeCamera` 构造里 `inputs.addKeyboard().addMouse()`；`attachControl` 的 canvas 参数已忽略，只保留 `noPreventDefault` 的兼容重载。`HemisphericLight` 的方向是半球朝向，不是点光源位置。

### 案例 2：把 glTF 追加进当前场景

```ts
import { AppendSceneAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";

await AppendSceneAsync("robot.glb", scene, { rootUrl: "/assets/" });
```

**逐部分解释**：`@babylonjs/loaders` 的 glTF 入口会 `RegisterGLTFFileLoader()`。不注册插件时，loader 不知道 `.glb`。旧的 `SceneLoader.AppendAsync(rootUrl, filename, scene)` 仍能编译，源码注释要求改用模块级 `AppendSceneAsync`。同包还导出 BVH / FBX / OBJ / STL / SPLAT。

### 案例 3：默认 WebXR 体验

```ts
import { MeshBuilder } from "@babylonjs/core";

const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
const xr = await scene.createDefaultXRExperienceAsync({ floorMeshes: [ground] });
```

**逐部分解释**：helper 默认打开 Enter/Exit UI、pointer selection、传送（`floorMeshes` 交给 teleportation feature）、near interaction 和 hand tracking。任一开关可用 `disableDefaultUI` / `disableTeleportation` 等关掉。失败时源码只 `Logger.Error`，仍返回已构造的 `WebXRDefaultExperience` 对象。

## 踩过的坑

1. **把 `new Engine` 写成“自动选 WebGPU”**：`Engine` 是 WebGL 路径。要按硬件挑选，用 `EngineFactory.CreateAsync`；它先问 WebGPU，再问 WebGL，最后 `NullEngine`。
2. **只装 `@babylonjs/core` 就去加载 `.glb`**：glTF 插件在 `@babylonjs/loaders`，靠副作用注册。少了这一步，场景加载器找不到插件。
3. **继续把 `SceneLoader.AppendAsync` 当现行主 API**：9.23.0 已标 deprecated，模块级 `AppendSceneAsync(source, scene, options)` 才是正向入口。
4. **`attachControl(canvas, true)` 以为还在绑 canvas**：第一参被标成 ignored，真正生效的是 `noPreventDefault`。
5. **把未测的帧率、面数或手机发热写成结论**：本轮只读了固定提交，没有跑 playground、visualization test 或设备采样。

## 适用 vs 不适用场景

**适用**：

- 浏览器里的 3D 展示、轻量游戏、产品预览、WebXR 入口，希望 TypeScript 场景 API 而不是手写 WebGL
- 需要同一套 Scene 合同同时碰 WebGL 与可选 WebGPU
- 模型走 glTF，并能接受 loaders 作为独立包

**不适用**：

- 只要场景图、自己管 renderer → [[threejs]] 更薄
- 地理椭球、时间轴、3D Tiles 流式地球 → [[cesium]]
- 把未绑定的 FPS / 包体 / 星数当成选型依据
- 还按 4.x / 5.x 的 `SceneLoader` 类 API 写新代码

## 固定版本边界

- 本文绑定 `BabylonJS/Babylon.js@38ed028f40722504a215002fbc2fa89a2c89cf5d`，即 annotated tag `9.23.0` 剥出的提交；npm `@babylonjs/core@9.23.0` 与 `@babylonjs/loaders@9.23.0` 的 `gitHead` 同指此 SHA。
- 发布包 Apache-2.0、`type: module`；`@babylonjs/core` 未声明 `engines` / `peerDependencies`。
- 源码实现在 `packages/dev/core`（内部包名 `@dev/core@1.0.0`），发布包装在 `packages/public/@babylonjs/*`。
- `Engine` antialias 默认 false；`FreeCamera` 注释建议新代码看 `UniversalCamera`。
- 本文未安装依赖、未跑 unit / visualization test、未测 WebGPU 或包体，状态保持 `UNVERIFIED`。

## 学到什么

1. **后端选择是工厂，不是默认构造函数**——`new Engine` 与 `EngineFactory.CreateAsync` 合同不同。
2. **9.x 用 Register + pure 拆副作用**——导入路径决定会不会执行插件/helper 注册。
3. **加载器是插件表，不是 Scene 内置格式支持**——少一次 import，`.glb` 就不会被识别。
4. **XR 默认体验是一串 feature 开关**——传送、近场、手部追踪都有独立 disable 位。

## 应用型自测

1. `new Engine(canvas)` 不传第二参，抗锯齿默认开吗？
2. 只 `import { AppendSceneAsync } from "@babylonjs/core/Loading/sceneLoader"`、不导入 loaders，固定 9.23.0 能解析 `.glb` 吗？
3. `EngineFactory.CreateAsync` 在 WebGPU 与 WebGL 都不支持时会抛错吗？

检查点：

1. 不开。构造函数文档写明 antialias 默认 `false`。
2. 不能指望它自动会。glTF 插件要 `@babylonjs/loaders/glTF` 的 `RegisterGLTFFileLoader`。
3. 不会抛这一句。它退回 `new NullEngine(...)`。

## 延伸阅读

- 官方文档：[Babylon.js Documentation](https://doc.babylonjs.com/)
- Playground：[playground.babylonjs.com](https://playground.babylonjs.com/)
- 固定源码：[BabylonJS/Babylon.js](https://github.com/BabylonJS/Babylon.js) —— 本文绑定提交 `38ed028f40722504a215002fbc2fa89a2c89cf5d`
- [[threejs]] —— 更薄的场景图 + 默认 WebGL 2 renderer
- [[cesium]] —— 地理椭球与时间轴是一等公民的对照

## 关联

- [[threejs]] —— 对照“完整引擎”和“场景图 + renderer”
- [[cesium]] —— 对照本地笛卡尔场景与 ECEF 地球
- [[webgpu]] —— `EngineFactory` 优先尝试的后端
- [[webgl]] —— `Engine` 默认路径
- [[gltf]] —— `@babylonjs/loaders` 最常用的交换格式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hydra-synth]] —— Hydra — 实时视觉合成 livecoding
- [[luxcorerender]] —— LuxCoreRender — 物理光线追踪
- [[playcanvas]] —— PlayCanvas — Web 3D 引擎与可视化应用
- [[spectorjs]] —— Spector.js — WebGL/WebGPU 调试器
