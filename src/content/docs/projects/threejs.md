---
title: Three.js — 浏览器 3D 场景图与 WebGL2 渲染器
来源: https://github.com/mrdoob/three.js
日期: 2026-07-08
分类: 前端 / 三维图形
难度: 入门到进阶
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/mrdoob/three.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2431a09f46f34c560bc8e44b33be0e567723d5b9
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.185.1
---

## 是什么

Three.js 把浏览器里的 3D 收成一棵场景图：`Scene` 是棚、`Camera` 是镜头、`Mesh` 是物体、`Light` 是灯、`WebGLRenderer` 是快门。日常类比：你要拍产品照，不必自己焊灯架、手写 WebGL 2 状态机——先搭摄影棚，再决定每一帧按哪个相机出图。

```js
import * as THREE from 'three'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000)
camera.position.set(0, 1, 5)

const renderer = new THREE.WebGLRenderer()
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)

const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0x44aa88 })
)
scene.add(mesh)

renderer.setAnimationLoop(() => {
  mesh.rotation.y += 0.01
  renderer.render(scene, camera)
})
```

`Mesh` 构造函数默认材质就是 `MeshBasicMaterial`，不受光照。若改成 `MeshStandardMaterial` 却不给灯或 environment map，画面会接近全黑——这是跟做时最常见的第一坑，不是“库坏了”。

## 为什么重要

不读固定 0.185.1 源码，Three.js 很容易被讲成「随便 new 就能出 3D」：

- 为什么默认 `import 'three'` 没有 `WebGPURenderer`——它在 `three/webgpu`，和 TSL/节点材质走另一条入口
- 为什么 `Mesh()` 不给材质也能看见盒子——默认是不受光的 `MeshBasicMaterial`
- 为什么循环必须走 `setAnimationLoop`——内部还要同步 XR session 的 start/stop
- 为什么上千个相同盒子不该各建一个 `Mesh`——`InstancedMesh` 才是同一 geometry/material 的实例化合同

## 核心要点

固定版本可以看成五步：

1. **场景图**：`Object3D.add` 会先 `removeFromParent()`，再把子节点挂到新父节点。一个对象不能同时属于两棵树。

2. **可绘制物**：`Mesh` = `BufferGeometry` + `Material`。几何管拓扑，材质管着色；默认材质是 Basic，不是 Standard。

3. **相机**：`PerspectiveCamera` 默认 `fov=50`、`near=0.1`、`far=2000`。`near` 不能为 0。窗口变化后要改 `camera.aspect` 并 `updateProjectionMatrix()`，再 `renderer.setSize`。

4. **WebGL 2 渲染**：`WebGLRenderer.render(scene, camera)` 先更新世界矩阵，再 `projectObject`、排序、`setupLights`、画背景与物体。自 r163 起不支持 WebGL 1。`camera` 必须是 `THREE.Camera`。

5. **循环与后端**：`setAnimationLoop(cb)` 启动内部 `WebGLAnimation`；传入 `null` 会停。WebGPU / 节点材质不在默认包，要从 `three/webgpu` 进。

## 实践示例

### 案例 1：Standard 材质必须有光或环境

```js
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x44aa88, roughness: 1, metalness: 0 })
)
scene.add(mesh)
scene.add(new THREE.AmbientLight(0xffffff, 0.4))
scene.add(new THREE.DirectionalLight(0xffffff, 0.8))
```

`MeshStandardMaterial` 走 metallic-roughness PBR，默认 `roughness=1`、`metalness=0`。源码说明最好再给 environment map。没有灯也没有 env map 时，不要用“渲染器没工作”解释全黑。

### 案例 2：Raycaster 用 NDC，不是像素

```js
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
function onMove(e) {
  pointer.x = (e.clientX / innerWidth) * 2 - 1
  pointer.y = -(e.clientY / innerHeight) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(points)
}
```

透视相机下，origin 取 `camera.matrixWorld` 的位置，方向经 `unproject` 再归一化。`x/y` 必须在 `[-1, 1]`。`hits[0]` 是最近命中。

### 案例 3：相同几何用 InstancedMesh

```js
const mesh = new THREE.InstancedMesh(geometry, material, 1000)
const m = new THREE.Matrix4()
for (let i = 0; i < 1000; i++) {
  m.makeTranslation(i % 32, 0, (i / 32) | 0)
  mesh.setMatrixAt(i, m)
}
scene.add(mesh)
```

`InstancedMesh` 的合同是「同一 geometry/material，不同 world transform」。一千个独立 `Mesh` 会变成一千次绘制准备；这不是风格问题，是 draw call 合同。

## 踩过的坑

1. **把默认入口当成全功能包**：`import * as THREE from 'three'` 没有 `WebGPURenderer`。WebGPU 与 TSL 在 `three/webgpu` / `three/tsl`。
2. **Standard 当默认材质**：`new Mesh(geometry)` 默认 Basic，不受光；换成 Standard 后必须补灯或 env map。
3. **以为 `geometry.dispose()` 会删 JS 对象**：它只派发 `dispose` 事件，GPU 缓冲由渲染器释放。`Mesh` 本身没有 `dispose()`，材质和贴图要各自 `dispose()`。
4. **手写 `requestAnimationFrame` 绕过 `setAnimationLoop`**：XR session 开始时内部 animation 会停，结束再启；绕过这条路径会丢兼容性。
5. **把 npm `0.185.0` 和 tag `r185` 当成同一提交**：`0.185.0` 的 `gitHead` 是另一枚 commit；`r185` 与 `0.185.1` 才对齐。

## 适用 vs 不适用场景

**适用**：

- 网页端产品展示、教学示意、数百到数千 mesh 的可视化
- 团队以 JS 为主，需要 Scene / Camera / Mesh / 拾取这套稳定心智模型
- 先走 WebGL 2，再评估是否迁到 `three/webgpu`

**不适用**：

- 需要完整关卡编辑器、内置物理与网络同步的游戏引擎
- 必须从默认入口拿到 WebGPURenderer
- 把「没灯的 Standard 材质」当成渲染失败来排障
- 尚未在目标设备上跑过的固定 FPS / 面数结论

## 固定版本边界

- 本文绑定 `mrdoob/three.js@2431a09f46f34c560bc8e44b33be0e567723d5b9`，`REVISION` 为 `185`，npm 包为 `three@0.185.1`。
- GitHub tag `r185` 与 npm `0.185.1` 的 `gitHead` 一致；`three@0.185.0` 指向另一提交，不纳入本页。
- 默认入口是 WebGL 2 renderer；WebGPU 是条件导出，不是同一份 UMD。
- `ColorManagement.enabled` 默认为 `true`，工作色域为 `LinearSRGBColorSpace`。
- 本文未安装依赖、运行 puppeteer 单测、打开 examples 或测量 draw call，状态保持 `UNVERIFIED`。

## 学到什么

1. **场景图是所有权树**——`add` 会先脱离旧父节点，不是“再注册一次”。
2. **默认材质不受光**——Basic 与 Standard 的第一帧行为完全不同。
3. **渲染入口不等于后端全集**——WebGL 2 是默认合同，WebGPU 要另开入口。
4. **dispose 是事件，不是析构**——JS 对象还在，GPU 资源靠监听者释放。

## 应用型自测

1. `new THREE.Mesh(new THREE.BoxGeometry())` 不传材质、场景里也没灯。按固定 0.185.1，盒子会因为“没灯”而全黑吗？
2. `import * as THREE from 'three'` 之后 `new THREE.WebGPURenderer()`，默认入口能构造吗？
3. `new THREE.PerspectiveCamera()` 不传参数。`fov` / `near` / `far` 分别是多少？

检查点：

1. 不会因此全黑。默认材质是 `MeshBasicMaterial`，不受光照。
2. 不能。`WebGPURenderer` 不在默认 `src/Three.js` 导出里，要从 `three/webgpu` 进。
3. `50` / `0.1` / `2000`。文档示例里的 `45` 或 `60` 都不是构造函数默认值。

## 延伸阅读

- 官方文档：[threejs.org/docs](https://threejs.org/docs/)
- 固定源码：[mrdoob/three.js](https://github.com/mrdoob/three.js) —— 本文绑定提交 `2431a09f46f34c560bc8e44b33be0e567723d5b9`
- [[pixi]] —— 同主题的 2D 场景图 + 多后端对照
- [[babylonjs]] —— 更偏完整引擎向的浏览器 3D

## 关联

- [[pixi]] —— 2D 场景图 / 批处理对照；Three.js 管 3D mesh 与相机
- [[babylonjs]] —— 浏览器 3D 引擎对照
- [[playcanvas]] —— 另一条 Web 3D 引擎路线
- [[aframe]] —— 声明式 WebVR 场景，底层常落到 Three.js

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aframe]] —— A-Frame — 用 HTML 搭 Web VR 场景
- [[appleseed]] —— appleseed — 物理渲染器
- [[ar-js]] —— AR.js — 浏览器里跑 Web AR 标记追踪
- [[assimp]] —— Assimp — 把 3D 模型格式统一成 aiScene 的导入库
- [[babylonjs]] —— Babylon.js — 浏览器里的 3D 游戏和可视化引擎
- [[colmap]] —— COLMAP — 多视图 SfM/MVS 重建
- [[draco]] —— Draco — Google 3D 网格压缩
- [[filament]] —— Filament — Google 跨平台 PBR 引擎
- [[glsl-canvas]] —— glslCanvas — Book of Shaders 配套库
- [[glslify]] —— glslify — 给 GLSL 用的 npm 模块系统
- [[hydra-synth]] —— Hydra — 实时视觉合成 livecoding
- [[lottie]] —— lottie-web — 把 AE 动画变成网页可播放的 JSON
- [[luma-gl]] —— luma.gl — 给 WebGPU/WebGL 用的中低层 GPU 工具箱
- [[mind-ar-js]] —— MindAR — 不装原生 SDK 的浏览器图像/人脸 AR
- [[mitsuba3]] —— Mitsuba 3 — 研究向可微渲染器
- [[ogre]] —— OGRE — 老牌 C++ 3D 渲染引擎
- [[openscad]] —— OpenSCAD — 脚本式 CAD
- [[pcl]] —— PCL — 点云算法的学术工具箱
- [[playcanvas]] —— PlayCanvas — Web 3D 引擎与可视化应用
- [[rapier]] —— Rapier — Rust 现代 2D/3D 物理引擎
- [[regl]] —— regl — 函数式 WebGL 封装
- [[rive]] —— Rive — 把矢量动画做成可交互组件的运行时
- [[shader-park]] —— Shader Park — 程序化 SDF 着色器 DSL
- [[spectorjs]] —— Spector.js — WebGL/WebGPU 调试器
- [[spine-runtimes]] —— Spine Runtimes — 2D 骨骼动画运行时
- [[twgl]] —— TWGL — 极薄 WebGL helpers
