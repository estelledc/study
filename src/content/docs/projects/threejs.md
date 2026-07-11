---
title: Three.js — 轻量 3D 渲染引擎
来源: 'https://github.com/mrdoob/three.js'
日期: 2026-07-08
分类: 前端 / 三维图形
难度: 入门到进阶
---

## 是什么

Three.js 是浏览器里的**轻量 3D 工具箱**：把底层 WebGL（网页画 3D 的原生接口）收成更好记的对象。

日常类比：你要拍产品照，不必自己焊灯架、调光圈、手算透视——搭一个摄影棚就行。Three.js 里 `Scene` 是棚、`Camera` 是相机、`Light` 是灯、`Mesh` 是被拍的物体、`Renderer` 是快门按下后出图的那一步。

```js
import * as THREE from 'three'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000)
camera.position.set(0, 1, 5)

const renderer = new THREE.WebGLRenderer()
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)

scene.add(new THREE.AmbientLight(0xffffff, 0.4))
scene.add(new THREE.DirectionalLight(0xffffff, 0.8))

const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x44aa88 })
)
scene.add(mesh)

renderer.setAnimationLoop(() => {
  mesh.rotation.y += 0.01
  renderer.render(scene, camera)
})
```

注意：`MeshStandardMaterial` 靠光照显色；没灯时画面会近乎全黑——这是跟做时最常见的第一坑。

## 为什么重要

不理解 Three.js，下面这些事都不好解释：

- 为什么前端能在网页里做可交互 3D，却不必手写整套管线
- 为什么产品演示、数据大屏、地图可视化常先选它而不是完整游戏引擎
- 为什么「会 JS」就能进 3D：生态（Docs / Manual / Examples）把门槛压低了
- 为什么 WebGPU 成熟后它仍在：同一套 Scene 模型可渐进换渲染后端

## 核心要点

1. **五件套搭骨架**：`Scene`（舞台）+ `Camera`（视角）+ `Mesh`（几何+材质）+ `Light`（明暗）+ `Renderer`（画到 Canvas）。缺灯或忘 `render`，场景再漂亮也出不了图。
2. **渲染循环自己推**：用 `setAnimationLoop` 每帧改变换再 `render`；库不会替你“想象”动画时机。
3. **几何与材质分离**：`Geometry` 管形状，`Material` 管外观。换皮不用改拓扑——像同一模具换涂料。
4. **材质选型**：`MeshBasicMaterial` 不受光（原型快）；`MeshStandardMaterial` 走 PBR（基于物理的着色，更像真实材质）；`PointsMaterial` 适合点云。
5. **多渲染后端**：默认 WebGL；可渐进接 WebGPU；另有 CSS3D / SVG 等旁路组件。

## 实践案例

### 案例 1：旋转立方体（最小可跑）

按「是什么」里的代码逐步核对：

1. 创建 `Scene` / `PerspectiveCamera` / `WebGLRenderer`，把 `domElement` 挂到页面
2. 加 `AmbientLight` + `DirectionalLight`（Standard 材质必需）
3. `BoxGeometry` + `MeshStandardMaterial` 组成 `Mesh` 并 `scene.add`
4. `setAnimationLoop` 里改 `rotation.y` 再 `render`

能转起来，说明五件套已通。若全黑，先查有没有灯。

### 案例 2：Raycaster 做 hover 拾取

把数据点建成 `SphereGeometry` 小球；鼠标移动时：

```js
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
function onMove(e) {
  pointer.x = (e.clientX / innerWidth) * 2 - 1
  pointer.y = -(e.clientY / innerHeight) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(points)
  // hits[0] 即最近命中；据此改色或显示 tooltip
}
```

Raycaster（射线拾取）= 从相机射出一根“手指”，看先碰到谁——交互仪表盘的基础。

### 案例 3：地理热力柱原型

用 `CylinderGeometry` 按经纬度摆柱、高度映射数值。先低面片确认缩放与拾取，再换成精细模型或 InstancedMesh——避免一上来上重型引擎。百级柱体通常够用；上千根优先实例化。

## 踩过的坑

1. **每帧 `new` 对象**：loop 里频繁创建几何/材质会触发 GC，掉帧明显。
2. **忘记 dispose**：SPA 切页不做 `geometry.dispose()` / `material.dispose()` / `renderer.dispose()`，显存与监听器泄漏。
3. **Standard 材质没灯**：跟做全黑，误以为“库坏了”。
4. **近远裁剪过窄**：`PerspectiveCamera` 的 near/far 设错，物体闪烁或突然消失。
5. **Resize 未同步**：窗口变化后不改 `camera.aspect` 与 `renderer.setSize`，画面拉伸。
6. **上千独立 Mesh 不分批**：draw call 爆炸；合并几何或用 InstancedMesh。

## 适用 vs 不适用场景

**适用**：
- 网页端轻量 3D（产品展示、教学示意、百到数千 mesh 的可视化）
- 团队以 JS 为主，要在数天内做出可交互 MVP
- 需要 Raycaster 拾取、轨道控制、加载 glTF 等常见能力

**不适用**：
- AAA 级实时光追 / 大规模开放世界（考虑专用引擎）
- 强实时物理且延迟预算极紧（毫秒级），Three.js 物理多为插件级
- 必须以原生 App 深绑移动 GPU 时，WebView 方案往往不够

## 历史小故事（可跳过）

- **2010 前后**：Ricardo Cabello（mrdoob）开源 three.js，把“自己写 WebGL 管线”的门槛拉低。
- **2010s**：Examples 与社区插件把重心从底层语法转到交互与视觉。
- **2020s**：glTF 成为默认模型交换；生态模板化。
- **现在**：WebGPURenderer 渐进可用，同一套场景图迁向更现代图形 API。

## 一些可能的疑问

**问：为什么加了立方体还是黑的？**

多半用了 `MeshStandardMaterial` 却没加灯。先加环境光，或临时换成 `MeshBasicMaterial` 验证几何是否在视野内。

**问：Three.js 和游戏引擎什么关系？**

它是场景图 + 渲染封装，不是完整游戏引擎。没有内置关卡编辑器、完整物理与网络同步；适合网页可视化与轻交互，不适合 3A 管线。

**问：该从 WebGL 还是 WebGPU 入门？**

先 WebGLRenderer 跟完官方例子；等场景稳定再试 WebGPURenderer。API 心智模型（Scene/Camera/Mesh）不变，换的是后端。

## 学到什么

1. 工具价值是降低决策摩擦，不是替代图形学本身。
2. 先搭 Scene/Camera/Light/Mesh/Renderer 骨架，再谈材质与性能。
3. 能跑只是起点：dispose、复用、控制 draw call，迭代才稳。

## 延伸阅读

- 官方文档：https://threejs.org/docs/
- 示例：https://threejs.org/examples/
- Manual：https://threejs.org/manual/
- 仓库：https://github.com/mrdoob/three.js
- 对比：Babylon.js 更偏完整引擎向；Three.js 更偏轻量场景图

## 关联

- [[webgl]] —— 浏览器 3D 的底层绘图接口；Three.js 是其上的场景图封装
- [[webgpu]] —— 下一代浏览器图形 API；Three.js 正渐进接入
- [[d3]] —— 2D 数据可视化常与 Three.js 3D 展陈互补
- [[gltf]] —— 现代 3D 资源交换格式，Three.js 加载器一等公民
- [[canvas]] —— 2D 画布；理解 Renderer 输出目标时的对照物

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
