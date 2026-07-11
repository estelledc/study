---
title: Babylon.js — 浏览器里的 3D 游戏和可视化引擎
来源: https://github.com/BabylonJS/Babylon.js
日期: 2026-07-08
分类: graphics
难度: 初级
---

## 是什么

Babylon.js 是一个用 JavaScript / TypeScript 写的 **Web 3D 引擎**。它让浏览器不只显示网页文字和按钮，还能显示会动的 3D 场景、游戏、产品展示、数字孪生和 WebXR 体验。

日常类比：普通网页像一张海报，CSS 负责排版；Babylon.js 像一个小型摄影棚，帮你放相机、灯光、模型、材质和动画，最后把画面拍到 `<canvas>` 上。

它底层使用 WebGL，也支持 WebGPU 路线；你写的是更接近“搭场景”的代码，而不是直接和 GPU 指令打交道。

## 为什么重要

不理解 Babylon.js，下面这些事会很难解释：

- 为什么一个浏览器页面能跑 3D 游戏，而不需要安装 Unity 或 Unreal 客户端
- 为什么产品官网可以让用户旋转汽车、鞋子、家具模型，而不是只看几张图片
- 为什么 WebXR 可以在同一套 Web 技术上进入 VR / AR 设备
- 为什么 3D 工程里总会同时出现 engine、scene、camera、light、mesh、material 这些词

Babylon.js 的价值是把“和显卡打交道”包成“搭一个可运行的舞台”。初学者先会搭舞台，再慢慢理解渲染管线。

## 核心要点

1. **Scene 是舞台**：所有模型、灯光、相机都放进同一个 Scene。类比：拍电影前先有片场，演员和道具才知道自己在哪里。

2. **Camera 决定你从哪里看**：没有相机，场景里有东西也看不到。类比：同一个房间，从门口看和从天花板看，画面完全不同。

3. **Mesh + Material 组成看得见的物体**：Mesh 是形状，Material 是表面颜色、金属感、透明度。类比：纸箱的盒子形状和外面贴的包装纸是两回事。

## 实践案例

### 案例 1：最小 3D 盒子

下面这段代码在网页里创建一个可渲染的 Babylon.js 场景：

```html
<canvas id="renderCanvas"></canvas>
<script type="module">
import { Engine, Scene, FreeCamera, HemisphericLight, MeshBuilder, Vector3 } from "https://cdn.babylonjs.com/babylon.module.js";

const canvas = document.getElementById("renderCanvas");
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

const camera = new FreeCamera("camera", new Vector3(0, 2, -6), scene);
camera.setTarget(Vector3.Zero());
camera.attachControl(canvas, true);

new HemisphericLight("light", new Vector3(0, 1, 0), scene);
MeshBuilder.CreateBox("box", { size: 2 }, scene);

engine.runRenderLoop(() => scene.render());
</script>
```

**逐部分解释**：

- `Engine`：连接浏览器 canvas 和底层 WebGL / WebGPU，相当于摄影棚的电源和机器。
- `Scene`：装所有 3D 对象的容器，相当于舞台。
- `FreeCamera`：决定观察位置，`attachControl` 让鼠标键盘能控制视角。
- `MeshBuilder.CreateBox`：快速造一个立方体，先不用自己写顶点数据。

### 案例 2：加载一个 glTF 模型

真实项目不会全靠代码造盒子，通常会从 Blender、Maya 或设计工具导出 `.glb` / `.gltf`：

```ts
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";

await SceneLoader.AppendAsync("/assets/", "robot.glb", scene);
```

**逐部分解释**：

- `SceneLoader`：负责把外部模型读进当前场景。
- `@babylonjs/loaders/glTF`：注册 glTF 加载器；少了这行，项目里可能只会报“不知道怎么读 glb”。
- `AppendAsync`：异步加载，模型没下载完之前不能假装它已经在场景里。

### 案例 3：进入 WebXR

Babylon.js 把 WebXR 的很多浏览器差异包起来，常见入口是：

```ts
const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
const xr = await scene.createDefaultXRExperienceAsync({
  floorMeshes: [ground],
});
```

**逐部分解释**：

- `CreateGround`：给 VR / AR 体验一个地面参考，否则用户不知道脚下在哪里。
- `createDefaultXRExperienceAsync`：创建默认 XR 按钮、会话和控制器支持。
- `floorMeshes`：告诉引擎哪些物体可当作地面，便于传送和边界判断。

## 踩过的坑

1. **canvas 没设宽高**：3D 代码没错，但 `<canvas>` 在 CSS 里只有 0 高度，结果页面一片空白。

2. **忘了导入 loader**：能创建盒子，却加载不了 `.glb`，通常是没有导入 `@babylonjs/loaders/glTF`。

3. **异步加载当同步用**：模型还在下载就去找它的 mesh，会拿到空结果。要 `await` 或监听加载完成。

4. **坐标单位不统一**：美术模型按厘米导出，代码按米摆放，进场景后不是巨大就是小到看不见。

5. **移动端性能预算很小**：高面数模型、4K 贴图、实时阴影一起开，桌面能跑，手机会掉帧或发热。

## 适用 vs 不适用场景

**适用**：

- 浏览器里的 3D 展示、轻量游戏、数据可视化和教学 demo
- 电商产品预览、建筑漫游、工业设备数字孪生
- 需要 WebXR，但希望保持 Web 技术栈的项目
- 想用 TypeScript 写 3D，而不是直接写 WebGL shader 的团队

**不适用**：

- 大型 3A 游戏或极重资产项目 → Unity / Unreal 更成熟
- 对原生性能、主机平台、复杂编辑器流水线要求极高的项目
- 只需要二维图表或普通动画 → Canvas / SVG / CSS 动画更轻
- 完全不想处理模型压缩、贴图、灯光和性能预算的简单网页

## 历史小故事（可跳过）

- **2013 年前后**：Microsoft 工程师 David Catuhe 发起 Babylon.js，目标是让 WebGL 开发更接近引擎体验。
- **2015 年后**：项目逐步形成 playground、文档、材质库、加载器和 GUI 组件，降低入门门槛。
- **WebXR 普及期**：Babylon.js 把 VR / AR 会话、控制器和传送能力做成默认体验入口。
- **WebGPU 时代**：项目继续兼容 WebGL，同时跟进 WebGPU，让浏览器 3D 有更长的性能上限。

## 学到什么

- Babylon.js 不是建站框架，而是浏览器 3D 引擎；核心工作是管理场景、相机、灯光、模型和渲染循环。
- 初学 3D 先记住“舞台、摄影机、灯光、道具”这条线，比直接学 shader 更稳。
- 工程上最常见的问题不是“能不能画”，而是模型加载、坐标单位、贴图大小和移动端性能。
- Web 3D 的优势是分发简单：用户打开链接就能体验；代价是浏览器兼容和性能预算要认真测。

## 延伸阅读

- 官方网站：[Babylon.js](https://www.babylonjs.com/)
- 官方文档：[Babylon.js Documentation](https://doc.babylonjs.com/)
- 官方 playground：[Babylon.js Playground](https://playground.babylonjs.com/)
- 仓库：[BabylonJS/Babylon.js](https://github.com/BabylonJS/Babylon.js)
- [[threejs]] —— 同是浏览器 3D 生态，API 更底层一些
- [[webgpu]] —— 新一代浏览器 GPU API，Babylon.js 正在支持它

## 关联

- [[threejs]] —— 对比 Web 3D 库和完整引擎的取舍
- [[webgl]] —— Babylon.js 早期主要依赖的浏览器 3D API
- [[webgpu]] —— Babylon.js 面向未来性能上限的重要方向
- [[gltf]] —— 3D 模型交换格式，Babylon.js 项目最常加载的资产之一
- [[unity]] —— 原生/多平台游戏引擎，适合比较工作流和发布方式
- [[react-three-fiber]] —— React 生态里另一条浏览器 3D 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hydra-synth]] —— Hydra — 实时视觉合成 livecoding
- [[luxcorerender]] —— LuxCoreRender — 物理光线追踪
- [[playcanvas]] —— PlayCanvas — Web 3D 引擎与可视化应用
- [[spectorjs]] —— Spector.js — WebGL/WebGPU 调试器
