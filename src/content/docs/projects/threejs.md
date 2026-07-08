---
title: Three.js — 轻量 3D 渲染引擎
来源: 'https://github.com/mrdoob/three.js'
日期: 2026-07-08
分类: 前端 / 三维图形
难度: 入门到进阶
---

## 是什么

Three.js 是一个让网页“会画 3D”的工具箱。你可以把它想成“把复杂的 WebGL 指令重写成更好记的 API”。  

不熟悉图形 API 的人最容易记住它的角色：你不用直接写大量 shader / 缓冲区绑定 / 矩阵上传，先用 `Scene`、`Camera`、`Renderer` 组成一条清晰流水线。  

```js
import * as THREE from 'three'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(0, 1, 5)

const renderer = new THREE.WebGLRenderer()
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const geo = new THREE.BoxGeometry(1, 1, 1)
const mat = new THREE.MeshStandardMaterial({ color: 0x44aa88 })
const mesh = new THREE.Mesh(geo, mat)
scene.add(mesh)

renderer.setAnimationLoop(() => {
  mesh.rotation.y += 0.01
  renderer.render(scene, camera)
})
```

这是“最小可跑 3D 场景”：场景、网格、相机、渲染循环齐活。  

## 为什么重要

在工程上，Three.js 一直能解释“轻量”这件事：  

1. 大多数业务想要的是可交付效果，不是发明一个完整引擎；  
2. 它把复杂度压平，让前端也能快速做数据可视化、交互地图、产品演示；  
3. 一套生态（Docs、Manual、Examples）和插件机制足够让项目不至于“写到一半没资料”。  

它的核心价值不是“最好玩”，而是“上手快且生态够大”。  

## 核心要点

### 1）核心构成：Scene / Camera / Mesh / Material / Light

几乎所有场景都围绕这几件事：

- `Scene`：放东西的舞台  
- `Camera`：决定你从哪个视角看  
- `Mesh`：几何体 + 材质  
- `Renderer`：把结果画到 Canvas  
- `Light`：让材质体现明暗和层次  

### 2）渲染循环

Three.js 不会替你“想象”动画时机；你需要 `setAnimationLoop` 提供每帧更新。  

```js
renderer.setAnimationLoop(() => {
  object.position.x = Math.sin(performance.now() * 0.001)
  renderer.render(scene, camera)
})
```

### 3）几何体与材质分离

`Geometry` 决定形状，`Material` 决定视觉表现。这种解耦让可复用性很高，模型换材质不用改拓扑。  

### 4）材质体系

- `MeshBasicMaterial` 快速原型，不受光照影响。  
- `MeshStandardMaterial` 用 PBR 工作流时更接近现实。  
- `PointsMaterial` 适合点云可视化。  

### 5）多渲染器

虽然默认主流是 WebGL，也支持 WebGPU 渐进接入，另外还有 SVG / CSS3D 生态组件。  

## 实践案例

### 案例 1：做一个可交互仪表盘点

你可以把数据库返回的数据转成 `SphereGeometry` + `Line`，用 `Raycaster` 做 hover 交互。  

- 数据项 -> 坐标 -> 点对象
- 鼠标移动 -> `raycaster.setFromCamera` -> 命中测试 -> 显示 tooltip  

### 案例 2：地理数据轻量三维展示

若要展示建筑热力分布，不必一上来就推 GPU 大型框架。先用 `CylinderGeometry` 或低面片网格做原型，确认交互先行。  

### 案例 3：教育场景可视化

把树状结构转为“浮动球 + 连线”；课程里能直观看到层级关系。  

### 案例 4：产品宣传页微交互

对高转化页面来说，小范围粒子/缓动就能带来“动静结合”的体验，Three.js 的优势在“足够快地表达 3D”。  

## 踩过的坑

1. **每帧创建对象**：在动画循环里频繁 `new` 会触发 GC，掉帧明显。  
2. **忘记销毁监听器**：`controls.dispose()` / `renderer.dispose()` 不做，单页应用会越来越卡。  
3. **材质错用**：`MeshBasicMaterial` 做复杂照明场景会失真，反过来 WebGL 性能也被浪费。  
4. **单位不一致**：尺寸比例和坐标系方向不统一会导致模型“漂”。  
5. **坐标误用**：`PerspectiveCamera` 的近远裁剪面设太窄导致物体闪烁消失。  
6. **Resize 未处理**：窗口变化后不调用 `camera.aspect` 与 `renderer.setSize`，会变形。  
7. **不懂性能层级**：大量 Mesh 不分批更新，超出 GPU 上下文上限。  

## 适用和不适用

### 适用场景

- 需要网页端轻量 3D 展示，尤其是可交互场景；  
- 需要快速从“纯前端”切到“3D 可视化”而无需组建底层图形管线；  
- 团队以 JS 为主，研发速度优先；  
- MVP 阶段要把效果说清楚并快速验证。  

### 不适用场景

- 你要做 AAA 级别渲染（如复杂实时光追、大规模粒子流）；  
- 强实时物理模拟且延迟预算极低，建议考虑专用引擎；  
- 需要深度跨平台本地部署（移动端原生场景复杂时）。  

## 历史小故事

2010 年前后，Web 3D 常常要自己搭 WebGL 管线。three.js 的出现把“能否自己写 shader”这道门槛拉低，社区逐渐把重心从底层语法改到交互设计。  

这导致一个有趣的演变：  

- 2010s：先有“库”；  
- 2020s：出现大量示例、插件和模板；  
- 现在：WebGPU 逐步成熟，three.js 也在往更现代图形 API 迁移。  

## 学到什么

1. 工具价值不是替代技术，而是降低决策摩擦；  
2. 3D 体验先搭骨架（Scene/Camera/Material），再优化细节；  
3. 能跑就好，但要提前规划销毁与重用，性能才会在迭代中稳住。  

## 延伸阅读

- 官方文档：https://threejs.org/docs/  
- 示例站点：https://threejs.org/examples/  
- Manual：https://threejs.org/manual/  
- 官方 Wiki：https://github.com/mrdoob/three.js/wiki  
- 对比方向：Three.js 与 Babylon.js 的生态差异  

## 关联

- [[webgl]] —— 三维渲染的底层语义抽象  
- [[webgpu]] —— 下一代浏览器图形入口  
- [[d3]] —— 2D 与 3D 可视化的互补实践  

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[threejs-examples]] —— 常见例程（材质、光照、交互）
- [[webxr]] —— 若将 3D 场景扩展到沉浸式交互
