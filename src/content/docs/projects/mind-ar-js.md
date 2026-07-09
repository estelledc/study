---
title: MindAR — 不装原生 SDK 的浏览器图像/人脸 AR
来源: 'https://github.com/hiukim/mind-ar-js'
日期: 2026-07-09
分类: graphics
难度: 初级
---

## 是什么

MindAR 是一个用纯 JavaScript 写的 Web AR 库，主打 **图像追踪** 和 **人脸追踪**。

日常类比：像给浏览器装了一副“认照片和认脸”的眼镜。你把相机对准一张卡片，它知道卡片在画面里的位置；你把脸对准摄像头，它知道鼻梁、眼睛、耳朵这些锚点大概在哪里。

它和 ARKit / ARCore 最大区别是：不要求你写 iOS / Android 原生应用。一个普通网页，加上摄像头权限、WebGL、A-Frame 或 three.js，就能做出“对准图片出现 3D 模型”或“脸上试戴眼镜”的效果。

最小例子可以压到这样：

```html
<script src="https://aframe.io/releases/1.5.0/aframe.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js"></script>
<a-scene mindar-image="imageTargetSrc: ./targets.mind;">
  <a-camera look-controls="enabled: false"></a-camera>
  <a-entity mindar-image-target="targetIndex: 0">
    <a-plane color="blue" width="1" height="0.55"></a-plane>
  </a-entity>
</a-scene>
```
这里 `targets.mind` 是提前编译好的目标图特征文件。MindAR 负责看摄像头画面、找目标图、更新 `<a-entity>` 的位置；你只负责把要显示的内容挂到这个实体下面。

## 为什么重要

不理解 MindAR，下面这些事会很难解释：

- 为什么一个静态 HTML 文件也能做 AR，因为相机、WebGL、Web Worker 和模型文件都可以在浏览器里跑。
- 为什么图像 AR 不是“贴一张图上去”，而是先提取特征点，再在视频帧里反复匹配和估计姿态。
- 为什么人脸试戴不一定需要 App，浏览器里也能通过 MediaPipe Face Mesh 一类模型拿到脸部锚点。
- 为什么 Web AR 的瓶颈常常不是 UI，而是目标图质量、光照、摄像头权限、移动端性能和资源加载。

## 核心要点

MindAR 可以拆成 **三件事**：

1. **目标先编译**：像考试前先做索引卡。图片追踪不能每次打开网页都重新分析目标图，所以官方工具会把图片特征打包成 `.mind` 文件。

2. **引擎只更新锚点**：像舞台灯光师只负责告诉演员“站在哪里”。MindAR 不关心你挂的是蓝色平面、GLTF 模型还是按钮，它主要更新目标实体的位置、旋转、显隐。

3. **渲染交给生态**：像厨房只管识别菜单，真正做菜可交给不同厨具。A-Frame 适合零基础快速搭页面，three.js 适合需要更细控制的工程项目。

这三个点合起来，就是它的价值：把计算机视觉里最难的追踪部分封成浏览器可用的组件，同时尽量沿用 Web 前端熟悉的 HTML / JS 写法。

## 实践案例

### 案例 1：名片或海报扫出来一个 3D 物体

官方 Image Tracking Quick Start 展示的是最典型的“扫一张卡片，叠一个模型”。真实落地可以换成名片、展板、包装盒或课本插图。

```bash
mkdir mindar-card-demo
cd mindar-card-demo
python3 -m http.server 8000
```

```html
<a-scene
  mindar-image="imageTargetSrc: ./targets.mind;"
  vr-mode-ui="enabled: false"
  device-orientation-permission-ui="enabled: false">
  <a-assets>
    <a-asset-item id="model" src="./product.gltf"></a-asset-item>
  </a-assets>
  <a-camera look-controls="enabled: false"></a-camera>
  <a-entity mindar-image-target="targetIndex: 0">
    <a-gltf-model src="#model" position="0 0 0.1" scale="0.02 0.02 0.02"></a-gltf-model>
  </a-entity>
</a-scene>
```

**逐部分解释**：

- `python3 -m http.server 8000`：摄像头页面不能可靠地直接双击打开，先用本地服务器跑起来。
- `imageTargetSrc: ./targets.mind`：指向编译后的图片特征文件，不是原始 JPG / PNG。
- `targetIndex: 0`：如果 `.mind` 里只有一张图，就追踪第 0 个目标。
- `a-gltf-model`：真正显示的 3D 物体；追踪稳定后，它会跟着目标图移动。

### 案例 2：脸上试戴眼镜、帽子或耳饰

官方 Face Tracking Try-On 示例展示了一个真实电商/活动页会用到的交互：用户点选不同配件，模型跟着脸部锚点移动。

```html
<script src="https://aframe.io/releases/1.5.0/aframe.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-face-aframe.prod.js"></script>
<a-scene mindar-face embedded>
  <a-assets>
    <a-asset-item id="glasses" src="./glasses/scene.gltf"></a-asset-item>
  </a-assets>
  <a-camera active="false" position="0 0 0"></a-camera>
  <a-entity mindar-face-target="anchorIndex: 168">
    <a-gltf-model src="#glasses" scale="0.01 0.01 0.01"></a-gltf-model>
  </a-entity>
</a-scene>
```

**逐部分解释**：

- `mindar-face`：切到人脸追踪版本，不再需要 `.mind` 图像文件。
- `anchorIndex: 168`：选择脸上的一个锚点，官方教程用它放眼镜比较自然。
- `scale="0.01 ..."`：模型原始尺寸通常不适合脸部，需要反复调小。
- `embedded`：让 AR 场景像普通网页元素一样嵌入页面，方便外面放商品选择按钮。

### 案例 3：用 three.js 控制启动、停止和渲染循环

官方 ThreeJS Image 示例适合已经在项目里使用 three.js 的团队。你可以直接拿到 renderer、scene、camera，再决定按钮、加载和动画怎么组织。

```html
<script type="module">
import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

const mindarThree = new MindARThree({
  container: document.querySelector('#container'),
  imageTargetSrc: './targets.mind'
});
const {renderer, scene, camera} = mindarThree;
const anchor = mindarThree.addAnchor(0);
anchor.group.add(new THREE.Mesh(
  new THREE.PlaneGeometry(1, 0.55),
  new THREE.MeshBasicMaterial({color: 0x00ffff, transparent: true})
));
await mindarThree.start();
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
```

**逐部分解释**：

- `MindARThree`：three.js 版本的入口，适合已经有 WebGL 场景管理经验的人。
- `addAnchor(0)`：拿到第 0 个目标图的锚点组，把 Mesh 加进去。
- `start()`：异步启动摄像头和追踪器，最好放在用户点击按钮后触发。
- `setAnimationLoop`：每帧渲染 three.js 场景；停止 AR 时也要停止这个循环。

## 踩过的坑

1. **直接打开本地 HTML**：摄像头权限和资源加载会出问题，至少用 localhost，移动端演示最好用 HTTPS。
2. **目标图太干净**：大块纯色、重复纹理、反光包装都不利于特征点分布，编译工具里看到点太少就要换图。
3. **把 `maxTrack` 开太大**：多目标同时追踪会明显吃性能，官方示例也提醒它对性能影响很大。
4. **模型比例照搬示例**：GLTF 模型单位不统一，人脸试戴常常要反复调 `position`、`rotation`、`scale`。

## 适用 vs 不适用场景

**适用**：

- 营销页、展览页、教材页：扫固定图片后弹出 3D 内容。
- 轻量试戴：眼镜、帽子、滤镜、贴纸这类脸部锚点效果。
- 教学原型：想让新人理解图像追踪、人脸锚点和 WebGL 场景如何接在一起。
- 纯 Web 发布：希望一个链接就能打开，不想维护 iOS / Android 双端 SDK。

**不适用**：

- 需要平面检测、空间理解、遮挡深度、真实世界尺度测量的重 AR 应用。
- 需要长期稳定商业 SDK 支持和 SLA 的业务，个人维护开源库风险更高。
- 低端机大量 3D 模型、粒子、后处理同时跑的场景，浏览器性能余量不够。
- 追踪任意物体或低纹理物体，MindAR 更适合“提前准备好的图像目标”和“人脸”。

## 历史小故事（可跳过）

- **2020 年左右**：HiuKim Yuen 开始维护 MindAR，目标是把 Web AR 做到比旧 marker 方案更像现代产品。
- **早期取材**：图像追踪思路借鉴 ARToolKit 系列，脸部能力则站在 MediaPipe Face Mesh 这类模型之上。
- **v1.2 以后**：项目迁到 ES Module，并把 Image / Face、A-Frame / three.js 分成独立构建，避免一次加载所有能力。
- **官方生态**：README 里出现 MindAR Studio、Pictarize、Unity WebAR Foundation，说明核心库旁边逐渐长出无代码和托管工具。

## 学到什么

1. **Web AR 的入口是普通网页**：摄像头、WebGL、模型文件和事件系统组合起来，就能做一个轻量 AR 体验。
2. **追踪和渲染要分开想**：MindAR 找位置，A-Frame / three.js 负责把内容画出来。
3. **预处理能换启动速度**：`.mind` 文件把特征提取提前做掉，用户打开页面时只做匹配和姿态估计。
4. **视觉效果先服从稳定性**：目标图、光照、模型大小和设备性能，比多加一个酷炫 shader 更影响用户是否觉得“能用”。

## 延伸阅读

- 官方仓库：[hiukim/mind-ar-js](https://github.com/hiukim/mind-ar-js)
- 官方文档：[MindAR Documentation](https://hiukim.github.io/mind-ar-js-doc/)
- 图像入门：[Image Tracking Quick Start](https://hiukim.github.io/mind-ar-js-doc/quick-start/overview/)
- 编译工具：[Image Targets Compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile/)
- 人脸试戴：[Virtual Try-On Example](https://hiukim.github.io/mind-ar-js-doc/face-tracking-examples/tryon/)
- three.js 示例：[ThreeJS Image Tracking](https://hiukim.github.io/mind-ar-js-doc/more-examples/threejs-image/)

## 关联

- [[aframe]] —— MindAR 对零基础最友好的入口就是 A-Frame 组件写法。
- [[threejs]] —— 需要自定义渲染循环和复杂 3D 场景时，MindAR 可以接 three.js。
- [[tensorflow]] —— README 提到图像追踪底层借用 TensorFlow.js 的 WebGL 后端做通用 GPU 计算。
- [[spectorjs]] —— Web AR 黑屏或贴图错位时，可以用它拆 WebGL draw call。
- [[gltf-transform]] —— AR 里常要压缩和清理 GLTF 模型，否则移动端加载慢。
- [[pixi]] —— Pixi 代表 2D WebGL 交互；MindAR 则把摄像头追踪和 3D/AR 场景接起来。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
