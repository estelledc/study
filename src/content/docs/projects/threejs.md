---
title: three.js — Web 3D 事实标准
来源: 'https://github.com/mrdoob/three.js'
日期: 2026-06-06
子分类: 渲染与图形
分类: 图形学
难度: 初级
provenance: pipeline-v3
---

## 是什么

**three.js** 是一个让浏览器画 3D 的 JavaScript 库。日常类比：原生 WebGL 像给你一台裸机相机——你得自己装镜头、调光圈、洗胶片；three.js 像一部傻瓜相机，Scene、Camera、Mesh、Renderer 四块积木拼好就能拍。

你写：

```javascript
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 10);
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.2, 0.2, 0.2),
  new THREE.MeshNormalMaterial()
);
scene.add(mesh);
const renderer = new THREE.WebGLRenderer();
renderer.render(scene, camera);
```

它把"编译着色器、上传顶点缓冲、算投影矩阵"这些脏活藏起来，你只关心**场景里有什么、相机在哪、每帧怎么动**。mrdoob（Ricardo Cabello）2010 年前后发布，GitHub ~108k stars，几乎所有 Web 3D 教程从它开始。

## 为什么重要

不理解 three.js，下面这些事都没法解释：

- 为什么产品页上的 3D 商品旋转、数据大屏里的地球仪，大多能在浏览器里直接跑
- 为什么学 WebGL 的人通常先过 three.js 再下潜到 GLSL——它把场景图心智模型教给你了
- 为什么 React 生态有 `@react-three/fiber` 这种"把 three.js 当 React 组件树"的框架
- 为什么同一个 glTF 模型能在 three.js、Blender 预览、游戏引擎之间来回搬

## 核心要点

three.js 的心智模型可以拆成 **三步**：

1. **场景图（Scene Graph）**：所有 3D 对象挂在 `Scene` 下面，父子关系自动继承位置/旋转/缩放。类比：舞台布景——移动舞台，上面的演员跟着动。

2. **相机 + 渲染器**：`Camera` 决定"从哪看"，`Renderer` 把场景拍成 2D 像素画到 `<canvas>` 上。`PerspectiveCamera` 有近大远小，`OrthographicCamera` 像工程制图没有透视。

3. **动画循环**：`renderer.setAnimationLoop(animate)` 每帧调用 `animate`，你在里面改 mesh 的 rotation，再 `renderer.render(scene, camera)`。类比：翻页动画——每页改一点状态，再重画一帧。

三步加起来，就是"组件化 Scene API"范式——也是后来 React Three Fiber 直接复用的结构。

## 实践案例

### 案例 1：旋转立方体（官方最小示例）

```javascript
import * as THREE from 'three';

const width = window.innerWidth, height = window.innerHeight;

const camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 10);
camera.position.z = 1;

const scene = new THREE.Scene();
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.2, 0.2, 0.2),
  new THREE.MeshNormalMaterial()
);
scene.add(mesh);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
renderer.setAnimationLoop(animate);
document.body.appendChild(renderer.domElement);

function animate(time) {
  mesh.rotation.x = time / 2000;
  mesh.rotation.y = time / 1000;
  renderer.render(scene, camera);
}
```

**逐部分解释**：

- `BoxGeometry` 定义立方体顶点，`MeshNormalMaterial` 用顶点法线着色（不用灯光也能看见立体）
- `camera.position.z = 1` 把相机往后拉，否则和立方体重叠
- `setAnimationLoop` 替代手写 `requestAnimationFrame`，浏览器 tab 不可见时会自动暂停

### 案例 2：加载 glTF 模型并拖拽观察

```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(5, 5, 5);
scene.add(dir);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

new GLTFLoader().load('/models/robot.glb', (gltf) => {
  scene.add(gltf.scene);
});

function animate() {
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
```

关键点：`enableDamping = true` 之后**必须**在每帧调用 `controls.update()`，阻尼才会生效；忘了写这行是拖拽感觉没有惯性的最常见原因。

### 案例 3：挂进 Vite + 处理 resize 与清理

```javascript
import * as THREE from 'three';

const container = document.getElementById('canvas-host');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
const renderer = new THREE.WebGLRenderer();
container.appendChild(renderer.domElement);

const geometry = new THREE.TorusKnotGeometry(0.5, 0.15, 128, 32);
const material = new THREE.MeshStandardMaterial({ color: 0x44aa88 });
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

function animate(t) {
  mesh.rotation.y = t * 0.001;
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// SPA 路由离开时务必清理
export function dispose() {
  renderer.setAnimationLoop(null);
  geometry.dispose();
  material.dispose();
  renderer.dispose();
}
```

**逐部分解释**：

- `resize` 里必须同时改 `camera.aspect` 和 `renderer.setSize`，否则画面拉伸
- `dispose()` 释放 GPU 缓冲——React/Vue 组件 unmount 时调用，否则内存只涨不降
- `TorusKnotGeometry` 只是换了个有趣形状，流程和立方体完全一样

## 踩过的坑

1. **忘设 devicePixelRatio**：`renderer.setPixelRatio(window.devicePixelRatio)` 不写，Retina/HiDPI 屏下渲染分辨率只有显示分辨率的一半，边缘锯齿、文字发虚。这行几乎零成本，但忘了视觉折损显著——Retina Mac 和 iPhone 都是高 DPI 设备。

2. **不 dispose 资源**：反复进入/离开 3D 页面，GPU 内存泄漏直到 tab 崩溃。geometry、material、texture、renderer 都要 dispose。

3. **坐标系 Y-up vs Z-up**：three.js 默认 Y 轴向上，Blender 导出 glTF 通常没问题，但 CAD 模型可能躺倒——用 `model.rotation.x = -Math.PI / 2` 或导出时改轴向。

4. **几千个独立 Mesh**：每个 Mesh 一次 drawCall，移动端帧率暴跌。改用 `InstancedMesh` 或 `BufferGeometryUtils.mergeGeometries` 合并几何体。

## 适用 vs 不适用场景

**适用**：

- 浏览器里的 3D 产品展示、数据可视化地球/网络图、轻量 Web 游戏原型
- 需要快速出效果、团队以 JavaScript/TypeScript 为主
- 教程/示例生态丰富——threejs.org/examples 几乎覆盖所有常见 3D 技巧

**不适用**：

- 主机级 3A 游戏 → 用 Unity / Unreal / Godot，three.js 没有完整物理/动画/关卡编辑器
- 纯 2D 大量精灵 → [[pixi]] 批处理更高效，three.js 的 3D 管线是负担
- 全球尺度 GIS 地球 → [[cesium]] 专门优化了 WGS84 坐标与流式地形
- 需要 Rust 原生性能的游戏 → [[bevy]] 等原生引擎更合适

## 历史小故事（可跳过）

- **2010 年前后**：Flash 衰落、WebGL 1.0 标准化，mrdoob 发布 three.js，最初还有 CanvasRenderer 兜底不支持 WebGL 的老浏览器。
- **2010s 中期**：Examples 站点和 Manual 写成，成为图形课和前端工程师自学的默认教材；glTF 格式出现后 Loader 生态迅速对齐工业标准。
- **2020s**：npm 周下载量持续走高；加入 WebGPURenderer，同一份 Scene API 可以跑下一代 GPU API。
- **社区**：Discourse 论坛 + Discord 活跃，Stack Overflow `three.js` 标签问题量巨大——踩坑文档化程度极高。

## 学到什么

1. **Scene Graph 是 Web 3D 的核心抽象**——不管底层 WebGL 还是 WebGPU，"场景里有什么"这层不变
2. **每帧 = 改状态 + render**——动画不是 CSS transition，是你自己在 loop 里改 transform
3. **GPU 资源要手动释放**——浏览器不会帮你垃圾回收显存
4. **先 three.js 再 WebGL**——学会场景图后再下潜着色器，比一上来写 GLSL 容易得多

## 延伸阅读

- 官方 Manual：[threejs.org/manual](https://threejs.org/manual/)（零基础友好，带交互示例）
- 官方 Examples：[threejs.org/examples](https://threejs.org/examples/)（搜 glTF、postprocessing、physics）
- 迁移指南：[Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)（大版本升级必看）
- [[catmull-1974-zbuffer]] —— 深度缓冲是 3D 渲染"谁挡谁"的数学基础
- [[blinn-1977]] —— 经典光照模型，理解 MeshStandardMaterial 在算什么

## 关联

- [[pixi]] —— 浏览器 2D GPU 引擎；纯 2D 场景 Pixi 更轻，three.js 专攻 3D
- [[cesium]] —— 全球 GIS 3D 地球；地理坐标与流式地形是 cesium 的强项
- [[phaser]] —— 2D 游戏框架；要做完整 2D 游戏选 Phaser，3D 原型选 three.js
- [[catmull-1974-zbuffer]] —— Z-buffer 算法让多个 3D 物体正确遮挡
- [[panda3d]] —— Python 系 3D 引擎；桌面/VR 场景替代，Web 仍选 three.js
- [[bevy]] —— Rust ECS 游戏引擎；原生性能需求高时升级方向
- [[blinn-1977]] —— Blinn-Phong 光照；three.js 材质背后的图形学源头

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[babylonjs]] —— Babylon.js — 微软开源的企业级 Web 3D 引擎
- [[bevy]] —— Bevy — Rust 数据驱动 ECS 游戏引擎
- [[blinn-1977]] —— Blinn 1977 — 用半角向量 H 把高光算量减半
- [[catmull-1974-zbuffer]] —— Catmull 1974 Z-buffer — 用一张深度图解决谁挡谁的问题
- [[filament]] —— Filament — Google 跨平台 PBR 渲染引擎
- [[panda3d]] —— Panda3D — Disney/CMU 出品的开源 3D 游戏引擎
- [[phaser]] —— Phaser — 在浏览器里写 2D 游戏的完整工具箱
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[playcanvas]] —— PlayCanvas — 浏览器里跑的 3D 游戏引擎

